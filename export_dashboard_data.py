"""Export measured, compact dashboard data from the completed sampled experiment.

Only the 20 test pairs and their 20 evaluation genes are published. Source
arrays, cell observations, and model weights remain outside the web bundle.
Run --check to verify an existing export without changing any files.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"
RUN = RESULTS / "gears_medium"
CSV_FIELDS = ["pair", "geneA", "geneB", "condition", "cells", "controlMse",
              "additiveMse", "gearsMse", "improvement"]


def read_json(path):
    return json.loads(path.read_text())


def read_csv(path):
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def close(actual, expected, context):
    require(np.isfinite(actual) and np.isfinite(expected), f"Nonfinite value: {context}")
    require(abs(actual - expected) <= 1e-6,
            f"Metric mismatch for {context}: recomputed {actual!r}, saved {expected!r}")


def canonical_genes(label):
    return sorted(gene for gene in label.split("+") if gene != "ctrl")


def build_export():
    summary = read_json(RUN / "run_summary.json")
    config = read_json(RUN / "run_config.json")
    splits = read_json(RESULTS / "condition_split.json")
    de_genes = read_json(RESULTS / "evaluation_de20_genes.json")
    split_rows = {row["split"]: row for row in read_csv(RESULTS / "split_summary.csv")}
    checkpoint = read_json(RUN / "checkpoint_verification.json")
    dataset = read_json(RESULTS / "dataset_summary.json")
    saved_pairs = {row["pair"]: row for row in read_csv(RUN / "test_pair_comparison.csv")}
    gears_rows = {row["pair"]: row for row in read_csv(RUN / "gears_per_pair.csv")
                  if row["split"] == "test"}
    require(summary["status"] == "complete", "Dashboard export requires a completed experiment.")
    split_hash = hashlib.sha256((RESULTS / "condition_split.json").read_bytes()).hexdigest()
    require(summary["split_sha256"] == config["split_sha256"] == split_hash,
            "Run and source split fingerprints differ.")
    model_name = summary["model"]

    with np.load(RESULTS / "training_reference_means.npz", allow_pickle=False) as source:
        control = source["control"]
        gene_ids = source["gene_ids"].tolist()
        gene_names = source["gene_names"].tolist()
    gene_index = {gene: i for i, gene in enumerate(gene_ids)}
    require(len(gene_index) == len(gene_ids) == int(dataset["measured_genes"]),
            "Measured gene identifiers are duplicated or incomplete.")
    with np.load(RUN / "condition_means.npz", allow_pickle=False) as source:
        require(source["split_sha256"].item() == split_hash, "Mean-cache split fingerprint differs.")
        mean_labels = source["labels"].tolist()
        observed = dict(zip(mean_labels, source["means"]))
        cell_counts = dict(zip(mean_labels, source["counts"].tolist()))
    with np.load(RUN / "gears_predictions.npz", allow_pickle=False) as source:
        require(source["gene_ids"].tolist() == gene_ids, "GEARS prediction gene order differs.")
        predictions = dict(zip(source["labels"].tolist(), source["predictions"]))
    with np.load(RESULTS / "additive_predictions.npz", allow_pickle=False) as source:
        require(source["gene_ids"].tolist() == gene_ids, "Additive prediction gene order differs.")
        np.testing.assert_array_equal(source["control"], control)
        additive = {pair: values for pair, split, values in
                    zip(source["pairs"].tolist(), source["splits"].tolist(), source["additive"])
                    if split == "test"}

    labels_by_pair = {}
    for condition in splits["test"]:
        genes = canonical_genes(condition)
        require(len(genes) == 2 and genes[0] != genes[1], f"Invalid test pair: {condition}")
        labels_by_pair.setdefault("+".join(genes), []).append(condition)
    require(len(labels_by_pair) == 20 == int(split_rows["test"]["gene_pairs"]),
            "Expected exactly 20 saved test pairs.")
    require(set(labels_by_pair) == set(saved_pairs) == set(gears_rows) == set(additive),
            "Test-pair identifiers differ between source artifacts.")

    pairs = []
    for pair_id, labels in sorted(labels_by_pair.items()):
        # A single displayed profile cannot represent alias-averaged scores if
        # aliases use different DE gene lists. Fail rather than silently merge.
        require(len(labels) == 1,
                f"Pair {pair_id} has multiple original labels; export needs an explicit alias policy.")
        condition = labels[0]
        selected_genes = de_genes[condition]
        require(len(selected_genes) == len(set(selected_genes)) == 20,
                f"Expected 20 distinct evaluation genes for {condition}.")
        require(condition in observed and condition in predictions,
                f"Missing measured profile or prediction for {condition}.")
        indices = np.array([gene_index[gene] for gene in selected_genes], dtype=int)
        row = saved_pairs[pair_id]
        metrics = {"controlMse": float(row["control"]),
                   "additiveMse": float(row["additive"]),
                   "gearsMse": float(row[model_name])}
        for key, values in [("controlMse", control), ("additiveMse", additive[pair_id]),
                            ("gearsMse", predictions[condition])]:
            recomputed = float(np.square(values.astype(np.float64) - observed[condition])[indices].mean())
            close(recomputed, metrics[key], f"{pair_id}/{key}")
        close(metrics["gearsMse"], float(gears_rows[pair_id]["mse_de20"]),
              f"{pair_id}/GEARS per-pair CSV")
        cells = int(cell_counts[condition])
        require(cells == int(gears_rows[pair_id]["cells"]), f"Cell count differs for {pair_id}.")
        improvement = metrics["additiveMse"] - metrics["gearsMse"]
        close(improvement, float(row["gears_improvement_over_additive"]), f"{pair_id}/improvement")
        features = [dict(geneId=gene_ids[i], geneName=gene_names[i],
                         control=float(control[i]), observed=float(observed[condition][i]),
                         additive=float(additive[pair_id][i]), gears=float(predictions[condition][i]))
                    for i in indices]
        pairs.append(dict(id=pair_id, genes=canonical_genes(condition), condition=condition,
                          cells=cells, **metrics, improvement=improvement, features=features))

    scores = {row["model"]: row for row in summary["model_scores"] if row["split"] == "test"}
    control_mse = float(scores["control"]["mse_de20"])
    additive_mse = float(scores["additive"]["mse_de20"])
    gears_mse = float(scores[model_name]["mse_de20"])
    for key, value in [("controlMse", control_mse), ("additiveMse", additive_mse), ("gearsMse", gears_mse)]:
        close(float(np.mean([pair[key] for pair in pairs])), value, f"summary/{key}")
    mean_improvement = float(summary["additive_minus_gears_mean"])
    close(float(np.mean([pair["improvement"] for pair in pairs])), mean_improvement,
          "summary/meanImprovement")
    wins = sum(pair["improvement"] > 0 for pair in pairs)
    require(wins == int(summary["gears_beats_additive_pairs"]), "Saved win count differs.")
    require(sum(pair["cells"] for pair in pairs) == int(split_rows["test"]["cells"]),
            "Test-pair cell counts do not cover the saved test split.")
    nodes = [dict(id=gene, label=gene) for gene in sorted({gene for pair in pairs for gene in pair["genes"]})]
    result = dict(
        schemaVersion=1,
        dataStatus="measured",
        run=dict(trainingCells=int(summary["training_cells"]), cellCap=int(summary["training_cell_cap"]),
                 seed=int(config["seed"]), hiddenSize=int(summary["hidden_size"]),
                 bestEpoch=int(summary["best_epoch"]), epochsCompleted=int(summary["epochs_completed"]),
                 trainingSeconds=float(summary["training_seconds"]), device=summary["device"],
                 measuredGenes=len(gene_ids), trainPairs=int(split_rows["train"]["gene_pairs"]),
                 valPairs=int(split_rows["val"]["gene_pairs"]), testPairs=len(pairs),
                 availableTrainingCells=int(split_rows["train"]["cells"]),
                 validationCells=int(split_rows["val"]["cells"]), testCells=int(split_rows["test"]["cells"]),
                 runtimeVariant=summary["runtime_variant"]),
        summary=dict(controlMse=control_mse, additiveMse=additive_mse, gearsMse=gears_mse,
                     wins=wins, total=len(pairs), meanImprovement=mean_improvement,
                     bootstrap95=[float(value) for value in summary["additive_minus_gears_bootstrap95"]],
                     checkpointVerified=bool(checkpoint["checkpoint_reload_passed"])),
        nodes=nodes,
        pairs=pairs,
        provenance=dict(runSummary="results/gears_medium/run_summary.json",
                        evaluationGenes="results/evaluation_de20_genes.json", splitSha256=split_hash,
                        sourceHashes=summary["training_source_hashes"]),
    )
    # Reject NaN/Infinity before writing a browser-facing JSON document.
    json.dumps(result, allow_nan=False)
    return result


def csv_text(result):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for pair in result["pairs"]:
        writer.writerow(dict(pair=pair["id"], geneA=pair["genes"][0], geneB=pair["genes"][1],
                             **{key: pair[key] for key in CSV_FIELDS if key not in {"pair", "geneA", "geneB"}}))
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "web/public/data")
    parser.add_argument("--check", action="store_true", help="Verify existing exports without writing them.")
    args = parser.parse_args()
    result = build_export()
    directory = args.output_dir.resolve()
    json_path, csv_path = directory / "results.json", directory / "pair-results.csv"
    expected_csv = csv_text(result)
    if args.check:
        require(read_json(json_path) == result, "Dashboard JSON differs from measured source artifacts.")
        require(csv_path.read_text() == expected_csv, "Dashboard CSV differs from measured source artifacts.")
        action = "Verified"
    else:
        directory.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
        csv_path.write_text(expected_csv)
        action = "Exported"
    print(f"{action} measured dashboard data: {len(result['pairs'])} test pairs, "
          f"{len(result['nodes'])} gene nodes, 20 evaluation genes per pair; "
          f"GEARS wins {result['summary']['wins']}/{result['summary']['total']}. "
          "Metric recomputation passed (absolute tolerance 1e-6).")


if __name__ == "__main__":
    main()
