"""Download Norman 2019, inspect it, and reproduce the saved split and baselines.

This reads expression in chunks and never builds GEARS's cell-graph cache.
Existing data files are preserved. The default outputs are the inputs consumed
by train_project06.py; use --output-dir for an independent preparation check.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path, PurePosixPath
import pickle
import shutil
import stat
import tempfile
import zipfile

os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "biotech-matplotlib"))
os.environ.setdefault("NUMBA_CACHE_DIR", str(Path(tempfile.gettempdir()) / "biotech-numba"))

import anndata as ad
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import numpy as np
import pandas as pd
from scipy import sparse

ROOT = Path(__file__).resolve().parent
ASSETS = {
    "gene2go_all.pkl": "https://dataverse.harvard.edu/api/access/datafile/6153417",
    "essential_all_data_pert_genes.pkl": "https://dataverse.harvard.edu/api/access/datafile/6934320",
    "norman.zip": "https://dataverse.harvard.edu/api/access/datafile/6154020",
}
EXTRACTED_FILES = {"norman/perturb_processed.h5ad", "norman/go.csv"}
PACKAGES = ["torch", "torch_geometric", "cell-gears", "scanpy", "anndata",
            "numpy", "pandas", "matplotlib", "scikit-learn", "scipy"]


def log(message):
    print(message, flush=True)


def save_json(path, value, *, sort_keys=False):
    path.write_text(json.dumps(value, indent=2, sort_keys=sort_keys) + "\n")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_if_missing(url, target, offline):
    if target.is_file():
        if target.stat().st_size == 0:
            raise ValueError(f"Existing data file is empty: {target}; replace it explicitly before retrying.")
        log(f"Using existing data: {target.name}")
        return
    if offline:
        raise FileNotFoundError(f"Missing {target}. Remove --offline to download it from {url}.")
    import requests

    log(f"Downloading {target.name} from Harvard Dataverse")
    target.parent.mkdir(parents=True, exist_ok=True)
    # A failed request never leaves a partial file at the expected data path.
    temporary_path = None
    try:
        with requests.get(url, stream=True, timeout=(30, 120)) as response:
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".part", delete=False) as temporary:
                temporary_path = Path(temporary.name)
                for block in response.iter_content(chunk_size=1024 * 1024):
                    temporary.write(block)
        if temporary_path.stat().st_size == 0:
            raise ValueError(f"The download was empty: {url}")
        temporary_path.replace(target)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def extract_missing_files(archive_path, data_dir):
    """Validate every archive entry and extract only the two published inputs."""
    with zipfile.ZipFile(archive_path) as archive:
        selected = {}
        for entry in archive.infolist():
            name = PurePosixPath(entry.filename)
            unix_mode = entry.external_attr >> 16
            if name.is_absolute() or ".." in name.parts or "\\" in entry.filename:
                raise ValueError(f"Unsafe archive path: {entry.filename!r}")
            if stat.S_ISLNK(unix_mode):
                raise ValueError(f"Archive contains a symbolic link: {entry.filename!r}")
            if entry.filename in EXTRACTED_FILES:
                if entry.filename in selected:
                    raise ValueError(f"Duplicate archive file: {entry.filename!r}")
                selected[entry.filename] = entry
        if set(selected) != EXTRACTED_FILES:
            raise ValueError(f"Archive inputs differ from the GEARS Norman dataset: {set(selected)}")
        for name, entry in selected.items():
            destination = (data_dir / name).resolve()
            if not destination.is_relative_to(data_dir.resolve()):
                raise ValueError(f"Archive path escapes the data folder: {name!r}")
            if destination.is_file():
                if destination.stat().st_size != entry.file_size:
                    raise ValueError(f"Existing input has an unexpected size: {destination}")
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = None
            try:
                with archive.open(entry) as source:
                    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".part", delete=False) as temporary:
                        temporary_path = Path(temporary.name)
                        shutil.copyfileobj(source, temporary, length=8 * 1024 * 1024)
                if temporary_path.stat().st_size != entry.file_size:
                    raise ValueError(f"Incomplete archive extraction: {name}")
                temporary_path.replace(destination)
                log(f"Extracted {name}")
            finally:
                if temporary_path is not None and temporary_path.exists():
                    temporary_path.unlink()


def prepare_sources(data_dir, output_dir, offline):
    for filename, url in ASSETS.items():
        download_if_missing(url, data_dir / filename, offline)
    extract_missing_files(data_dir / "norman.zip", data_dir)
    source_files = []
    for filename in list(ASSETS) + sorted(EXTRACTED_FILES):
        path = data_dir / filename
        url = ASSETS.get(filename, ASSETS["norman.zip"])
        source_files.append(dict(path=filename, source_url=url,
                                 bytes=path.stat().st_size, sha256=sha256(path),
                                 archive_member=filename if filename in EXTRACTED_FILES else None))
    manifest = dict(dataset="GEARS processed Norman 2019", perturbation_method="CRISPR activation",
                    provider="Harvard Dataverse; URLs from cell-gears PertData",
                    reference_loader="https://github.com/snap-stanford/GEARS/blob/master/gears/pertdata.py",
                    cell_gears_version=version("cell-gears"), files=source_files,
                    cell_graph_cache_created=False)
    save_json(output_dir / "data_sources.json", manifest)
    return manifest


def canonical_targets(condition):
    return tuple(sorted(gene for gene in str(condition).split("+") if gene != "ctrl"))


def canonical_name(targets):
    return "+".join(targets) if targets else "ctrl"


def inspect_and_split(source, data_dir, output_dir, seed):
    with (data_dir / "gene2go_all.pkl").open("rb") as file:
        gene2go = pickle.load(file)
    with (data_dir / "essential_all_data_pert_genes.pkl").open("rb") as file:
        reference_genes = pickle.load(file)
    supported_genes = set(reference_genes).intersection(gene2go)
    eligible = source.obs["condition"].map(
        lambda label: all(gene in supported_genes for gene in canonical_targets(label))
    ).to_numpy(dtype=bool)
    obs = source.obs.loc[eligible].copy()
    obs["canonical_condition"] = obs["condition"].map(lambda label: canonical_name(canonical_targets(label)))
    assert (len(obs), source.n_vars) == (89357, 5045), "Dataset differs from the project's frozen input."
    label_to_targets = {str(label): canonical_targets(label) for label in obs["condition"].unique()}
    labels_by_targets = defaultdict(list)
    for label, targets in sorted(label_to_targets.items()):
        labels_by_targets[targets].append(label)
    single_targets = {targets[0] for targets in labels_by_targets if len(targets) == 1}
    pair_targets = sorted(targets for targets in labels_by_targets if len(targets) == 2)
    assert all(set(pair).issubset(single_targets) and len(set(pair)) == 2 for pair in pair_targets)
    assert () in labels_by_targets
    order = np.random.default_rng(seed).permutation(len(pair_targets))
    n_test = n_val = int(np.ceil(0.15 * len(pair_targets)))
    target_splits = {
        "test": {pair_targets[i] for i in order[:n_test]},
        "val": {pair_targets[i] for i in order[n_test:n_test+n_val]},
        "train": {pair_targets[i] for i in order[n_test+n_val:]},
    }
    target_splits["train"].update(targets for targets in labels_by_targets if len(targets) < 2)
    splits = {split: sorted(label for label, targets in label_to_targets.items() if targets in groups)
              for split, groups in target_splits.items()}
    label_to_split = {label: split for split, labels in splits.items() for label in labels}
    obs["split"] = obs["condition"].map(label_to_split)

    # Validate actual cell assignments, including reversed target/guide labels.
    assert not obs["split"].isna().any()
    assert obs.groupby("canonical_condition", observed=True)["split"].nunique().max() == 1
    assert set(splits["train"]).isdisjoint(splits["val"])
    assert set(splits["train"]).isdisjoint(splits["test"])
    assert set(splits["val"]).isdisjoint(splits["test"])
    assert target_splits["train"].isdisjoint(target_splits["val"] | target_splits["test"])
    assert target_splits["val"].isdisjoint(target_splits["test"])
    for split in ["val", "test"]:
        for pair in target_splits[split]:
            assert all((gene,) in target_splits["train"] for gene in pair)
    assert all(label_to_split[label] == "train" for label in splits["train"] if len(canonical_targets(label)) < 2)

    rows = [dict(split=split, control_groups=sum(len(t) == 0 for t in target_splits[split]),
                 single_genes=sum(len(t) == 1 for t in target_splits[split]),
                 gene_pairs=sum(len(t) == 2 for t in target_splits[split]),
                 original_condition_labels=len(splits[split]), cells=int((obs["split"] == split).sum()))
            for split in ["train", "val", "test"]]
    split_text = json.dumps(splits, indent=2, sort_keys=True) + "\n"
    (output_dir / "condition_split.json").write_text(split_text)
    with (output_dir / "gears_custom_split.pkl").open("wb") as file:
        pickle.dump(splits, file)
    pd.DataFrame(rows).to_csv(output_dir / "split_summary.csv", index=False)
    obs[["condition", "canonical_condition", "split"]].to_csv(output_dir / "cell_split_assignments.csv", index_label="cell_barcode")
    audit = dict(seed=seed, split_sha256=hashlib.sha256(split_text.encode()).hexdigest(),
                 canonical_groups_crossing_splits=0, held_out_pairs_without_training_single_genes=0,
                 all_control_cells_in_training=True, split_counts=rows)
    save_json(output_dir / "split_audit.json", audit)

    counts = obs["condition"].value_counts().sort_values(ascending=False)
    condition_table = counts[counts > 0].rename_axis("condition").reset_index(name="cells")
    condition_table["type"] = condition_table["condition"].map(
        lambda label: {0: "control", 1: "single gene", 2: "gene pair"}[len(canonical_targets(label))])
    condition_table.to_csv(output_dir / "condition_counts.csv", index=False)
    excluded = sorted(source.obs.loc[~eligible, "condition"].unique().tolist())
    save_json(output_dir / "dataset_summary.json", dict(
        dataset="Norman 2019 (GEARS processed)", perturbation_method="CRISPR activation",
        downloaded_cells=int(source.n_obs), gears_eligible_cells=int(len(obs)),
        measured_genes=int(source.n_vars), condition_labels=len(condition_table),
        excluded_condition_labels=excluded, stage="data inspection and preparation"))
    (output_dir / "environment_versions.txt").write_text("\n".join(f"{name}=={version(name)}" for name in PACKAGES) + "\n")
    log(pd.DataFrame(rows).to_string(index=False))
    return dict(obs=obs, label_to_targets=label_to_targets, labels_by_targets=labels_by_targets,
                single_targets=single_targets, target_splits=target_splits, label_to_split=label_to_split,
                splits=splits, audit=audit, condition_table=condition_table)


def calculate_baselines(source, split, output_dir, seed):
    labels = sorted(split["label_to_targets"])
    label_index = {label: i for i, label in enumerate(labels)}
    row_codes = source.obs["condition"].astype(str).map(label_index).fillna(-1).to_numpy(dtype=int)
    counts = np.bincount(row_codes[row_codes >= 0], minlength=len(labels))
    sums = np.zeros((len(labels), source.n_vars), dtype=np.float64)
    for start in range(0, source.n_obs, 2048):
        stop = min(start + 2048, source.n_obs)
        codes = row_codes[start:stop]
        valid = codes >= 0
        if not valid.any():
            continue
        block = source.X[start:stop][valid].astype(np.float64)
        kept_codes = codes[valid]
        membership = sparse.csr_matrix((np.ones(len(kept_codes)), (kept_codes, np.arange(len(kept_codes)))),
                                       shape=(len(labels), len(kept_codes)))
        contribution = membership @ block
        sums += contribution.toarray() if sparse.issparse(contribution) else contribution
        if start == 0 or stop == source.n_obs or start // 2048 % 10 == 0:
            log(f"Processed {stop:,} / {source.n_obs:,} expression rows")
    assert np.all(counts > 0) and counts.sum() == len(split["obs"])
    means = sums / counts[:, None]
    assert np.isfinite(means).all()

    def training_mean(targets):
        group_labels = split["labels_by_targets"][targets]
        # This guard prevents validation/test pair outcomes entering predictions.
        if not all(split["label_to_split"][label] == "train" for label in group_labels):
            raise ValueError(f"Refusing to use held-out condition {targets} as a baseline input.")
        indices = [label_index[label] for label in group_labels]
        return sums[indices].sum(axis=0) / counts[indices].sum()

    # Exercise the leakage guard with real held-out conditions, rather than
    # trusting that callers remember which means are legal prediction inputs.
    blocked_requests = 0
    for partition in ["val", "test"]:
        for pair in sorted(split["target_splits"][partition]):
            try:
                training_mean(pair)
            except ValueError:
                blocked_requests += 1
            else:
                raise AssertionError(f"Held-out outcome was accepted as a prediction input: {pair}")
    input_labels = sorted(label for label, targets in split["label_to_targets"].items() if len(targets) < 2)
    input_cells = split["obs"].loc[split["obs"]["condition"].isin(input_labels)]
    assert input_cells["split"].eq("train").all()
    assert all(split["label_to_split"][label] == "train" for label in input_labels)
    alias_groups = [labels for labels in split["labels_by_targets"].values() if len(labels) > 1]
    assert all(len({split["label_to_split"][label] for label in labels}) == 1 for labels in alias_groups)
    save_json(output_dir / "baseline_input_audit.json", dict(
        baseline_inputs_are_training_only=True,
        input_condition_labels=input_labels,
        input_training_cells=len(input_cells),
        equivalent_label_groups_checked=len(alias_groups),
        cross_split_alias_groups=0,
        deliberately_requested_held_out_means=blocked_requests,
        held_out_mean_requests_rejected=blocked_requests,
        held_out_pairs_do_not_overlap_training=True))

    control = training_mean(())
    single_names = sorted(split["single_targets"])
    singles = {gene: training_mean((gene,)) for gene in single_names}
    gene_ids = source.var_names.to_numpy(dtype=str)
    gene_names = source.var["gene_name"].to_numpy(dtype=str)
    np.savez_compressed(output_dir / "training_reference_means.npz", control=control,
                        single_genes=np.array(single_names), single_means=np.stack([singles[g] for g in single_names]),
                        gene_ids=gene_ids, gene_names=gene_names)
    predictions, prediction_pairs, prediction_splits, prediction_matrix = {}, [], [], []
    for partition in ["val", "test"]:
        for pair in sorted(split["target_splits"][partition]):
            predictions[pair] = singles[pair[0]] + singles[pair[1]] - control
            assert np.isfinite(predictions[pair]).all()
            prediction_pairs.append(canonical_name(pair))
            prediction_splits.append(partition)
            prediction_matrix.append(predictions[pair])
    np.savez_compressed(output_dir / "additive_predictions.npz", pairs=np.array(prediction_pairs),
                        splits=np.array(prediction_splits), additive=np.stack(prediction_matrix),
                        control=control, gene_ids=gene_ids)

    # Score only after freezing all training-only predictions.
    gene_index = {gene: i for i, gene in enumerate(gene_ids)}
    name_table = split["obs"][["condition", "condition_name"]].drop_duplicates()
    assert name_table.groupby("condition", observed=True).size().max() == 1
    condition_names = dict(name_table.itertuples(index=False, name=None))
    de_ranking = source.uns["rank_genes_groups_cov_all"]
    score_rows, evaluation_genes = [], {}
    for partition in ["val", "test"]:
        for pair in sorted(split["target_splits"][partition]):
            for label in split["labels_by_targets"][pair]:
                genes = [str(gene) for gene in de_ranking[condition_names[label]][:20]]
                assert len(genes) == 20 and len(set(genes)) == 20
                de_indices = np.array([gene_index[gene] for gene in genes])
                evaluation_genes[label] = genes
                observed = means[label_index[label]]
                for model, prediction in [("control", control), ("additive", predictions[pair])]:
                    errors = np.square(prediction - observed)
                    score_rows.append(dict(split=partition, pair=canonical_name(pair), condition=label,
                                           model=model, cells=int(counts[label_index[label]]),
                                           mse_de20=float(errors[de_indices].mean()), mse_all_genes=float(errors.mean())))
    condition_scores = pd.DataFrame(score_rows)
    pair_scores = condition_scores.groupby(["split", "pair", "model"], as_index=False).agg(
        mse_de20=("mse_de20", "mean"), mse_all_genes=("mse_all_genes", "mean"),
        cells=("cells", "sum"), condition_labels=("condition", "size"))
    assert np.isfinite(pair_scores[["mse_de20", "mse_all_genes"]].to_numpy()).all()
    assert pair_scores.groupby(["split", "model"]).size().eq(20).all()
    bootstrap_rng = np.random.default_rng(seed)
    summary_rows = []
    for partition in ["val", "test"]:
        for model in ["control", "additive"]:
            subset = pair_scores[(pair_scores["split"] == partition) & (pair_scores["model"] == model)]
            values = subset["mse_de20"].to_numpy()
            samples = bootstrap_rng.choice(values, size=(2000, len(values)), replace=True).mean(axis=1)
            summary_rows.append(dict(split=partition, model=model, pairs=len(values), mse_de20=float(values.mean()),
                                     mse_de20_ci_low=float(np.quantile(samples, 0.025)),
                                     mse_de20_ci_high=float(np.quantile(samples, 0.975)),
                                     mse_all_genes=float(subset["mse_all_genes"].mean())))
    summary = pd.DataFrame(summary_rows)
    condition_scores.to_csv(output_dir / "baseline_per_condition.csv", index=False)
    pair_scores.to_csv(output_dir / "baseline_per_pair.csv", index=False)
    summary.to_csv(output_dir / "baseline_summary.csv", index=False)
    save_json(output_dir / "evaluation_de20_genes.json", evaluation_genes)
    test = pair_scores[pair_scores["split"] == "test"].pivot(index="pair", columns="model", values="mse_de20")
    test["additive_improvement"] = test["control"] - test["additive"]
    test.to_csv(output_dir / "test_pair_comparison.csv")
    test_summary = summary[summary["split"] == "test"].set_index("model")
    control_mse, additive_mse = (float(test_summary.loc[m, "mse_de20"]) for m in ["control", "additive"])
    save_json(output_dir / "baseline_run_summary.json", dict(
        seed=seed, split_sha256=split["audit"]["split_sha256"],
        split_type="custom: unseen gene pairs with both single-gene conditions in training",
        evaluation="mean expression MSE, per-label top20 DE genes; average labels within pair, then average pairs",
        test_pairs=len(test), test_control_mse_de20=control_mse, test_additive_mse_de20=additive_mse,
        relative_reduction_vs_control_percent=100 * (control_mse-additive_mse) / control_mse,
        test_pairs_additive_beats_control=int((test["additive_improvement"] > 0).sum()),
        stage="baseline evaluation; GEARS runs are stored separately"))
    log(summary.to_string(index=False))
    return dict(labels=labels, label_index=label_index, counts=counts, means=means, control=control,
                predictions=predictions, gene_index=gene_index, gene_names=gene_names,
                evaluation_genes=evaluation_genes, test=test)


def create_plots(split, baseline, output_dir):
    table = split["condition_table"].head(20)
    palette = {"control": "#64748b", "single gene": "#2563eb", "gene pair": "#059669"}
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.bar(table["condition"], table["cells"], color=table["type"].map(palette))
    ax.set(ylabel="Number of cells", xlabel="Perturbation condition", title="Norman 2019: the 20 most common conditions")
    ax.legend(handles=[Patch(color=color, label=label) for label, color in palette.items()])
    ax.tick_params(axis="x", labelrotation=70)
    fig.tight_layout()
    fig.savefig(output_dir / "cells_per_condition.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    test = baseline["test"].sort_values("additive")
    fig, ax = plt.subplots(figsize=(12, 5))
    positions = np.arange(len(test))
    ax.bar(positions - 0.2, test["control"], width=0.4, label="Predict control", color="#64748b")
    ax.bar(positions + 0.2, test["additive"], width=0.4, label="Additive", color="#2563eb")
    ax.set_xticks(positions, test.index, rotation=70, ha="right")
    ax.set(ylabel="MSE on top 20 DE genes (lower is better)", title="Held-out test pairs: additive vs control baseline")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_dir / "baseline_test_comparison.png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    examples = test.index.tolist()[:2] + test.index.tolist()[-2:]
    fig, axes = plt.subplots(2, 2, figsize=(15, 9))
    for ax, pair in zip(axes.flat, examples):
        targets = tuple(pair.split("+"))
        label = max(split["labels_by_targets"][targets], key=lambda name: baseline["counts"][baseline["label_index"][name]])
        indices = np.array([baseline["gene_index"][g] for g in baseline["evaluation_genes"][label]])
        observed = baseline["means"][baseline["label_index"][label]]
        for values, name, color in [(observed, "Observed", "#059669"), (baseline["predictions"][targets], "Additive", "#2563eb")]:
            ax.plot(np.arange(20), (values-baseline["control"])[indices], "o-", label=name, color=color)
        ax.axhline(0, color="#64748b", linewidth=0.8)
        ax.set_xticks(np.arange(20), baseline["gene_names"][indices], rotation=80)
        ax.set(title=f"{pair}: pair MSE = {test.loc[pair, 'additive']:.3f}", ylabel="Expression change vs control")
        ax.legend()
    fig.tight_layout()
    fig.savefig(output_dir / "baseline_test_examples.png", dpi=160, bbox_inches="tight")
    plt.close(fig)


def check_against(output_dir, reference_dir):
    """Compare regenerated scientific artifacts against the original experiment."""
    checked = []
    for name in ["condition_split.json", "evaluation_de20_genes.json", "split_audit.json"]:
        assert json.loads((output_dir / name).read_text()) == json.loads((reference_dir / name).read_text()), name
        checked.append(name)
    for name in ["split_summary.csv", "baseline_per_condition.csv", "baseline_per_pair.csv", "baseline_summary.csv"]:
        pd.testing.assert_frame_equal(pd.read_csv(output_dir / name), pd.read_csv(reference_dir / name), check_exact=False, rtol=1e-12, atol=1e-12)
        checked.append(name)
    for name in ["training_reference_means.npz", "additive_predictions.npz"]:
        with np.load(output_dir / name) as actual, np.load(reference_dir / name) as expected:
            assert set(actual.files) == set(expected.files), name
            for key in actual.files:
                if actual[key].dtype.kind in "fci":
                    np.testing.assert_allclose(actual[key], expected[key], rtol=1e-12, atol=1e-12)
                else:
                    np.testing.assert_array_equal(actual[key], expected[key])
        checked.append(name)
    save_json(output_dir / "reproduction_check.json", dict(passed=True, checked_artifacts=checked,
                                                          numeric_relative_tolerance=1e-12, numeric_absolute_tolerance=1e-12))
    log("Preparation reproduces the saved split, evaluation genes, predictions, reference means, and baseline scores.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "results")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--offline", action="store_true", help="Require already-downloaded inputs; make no network requests.")
    parser.add_argument("--download-only", action="store_true", help="Download/validate data and record its provenance, without evaluating.")
    parser.add_argument("--check-against", type=Path, help="Compare scientific artifacts against a previous results directory.")
    args = parser.parse_args()
    data_dir, output_dir = args.data_dir.resolve(), args.output_dir.resolve()
    if args.check_against and output_dir == args.check_against.resolve():
        parser.error("--check-against must use a different directory from --output-dir.")
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    prepare_sources(data_dir, output_dir, args.offline)
    if args.download_only:
        log("Published inputs are ready; no cell-graph cache was created.")
        return
    source = ad.read_h5ad(data_dir / "norman/perturb_processed.h5ad", backed="r")
    try:
        split = inspect_and_split(source, data_dir, output_dir, args.seed)
        baseline = calculate_baselines(source, split, output_dir, args.seed)
        create_plots(split, baseline, output_dir)
    finally:
        source.file.close()
    if args.check_against:
        check_against(output_dir, args.check_against.resolve())
    log(f"Preparation complete. Outputs: {output_dir}")


if __name__ == "__main__":
    main()
