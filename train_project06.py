"""Train and evaluate a reproducible GEARS experiment on the saved condition split.

The corrected runtime preserves GEARS parameters while fixing coexpression
batching. Training inputs and graphs use only training conditions. Validation
chooses the checkpoint; test outcomes are scored after it is fixed.
"""
from __future__ import annotations

import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent
os.environ.setdefault("NUMBA_CACHE_DIR", str(ROOT / ".cache/numba"))
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".cache/matplotlib"))
os.environ.setdefault("MPLBACKEND", "Agg")

import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
from importlib.metadata import version
import json
import pickle
import time

import anndata as ad
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import sparse
import torch
from torch_geometric.data import Data, Batch
from gears.model import GEARS_Model
from gears.utils import loss_fct

RESULTS = ROOT / "results"
RUN = RESULTS / "gears_medium"


def log(message):
    print(message, flush=True)


def targets(label):
    return tuple(sorted(g for g in str(label).split("+") if g != "ctrl"))


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def prepare_data(cell_cap, seed):
    """Compute complete outcomes; create a training-only sample independently."""
    RUN.mkdir(parents=True, exist_ok=True)
    split_text = (RESULTS / "condition_split.json").read_text()
    splits = json.loads(split_text)
    split_hash = hashlib.sha256(split_text.encode()).hexdigest()
    with (ROOT / "data/gene2go_all.pkl").open("rb") as file:
        gene2go = pickle.load(file)
    with (ROOT / "data/essential_all_data_pert_genes.pkl").open("rb") as file:
        references = pickle.load(file)
    pert_names = sorted(set(references).intersection(gene2go))
    pert_index = {gene: i for i, gene in enumerate(pert_names)}
    source = ad.read_h5ad(ROOT / "data/norman/perturb_processed.h5ad", backed="r")
    label_to_split = {label: split for split, labels in splits.items() for label in labels}
    source_labels = source.obs["condition"].astype(str).to_numpy()
    labels = sorted(label_to_split)
    label_index = {label: i for i, label in enumerate(labels)}
    rows_by_label = {label: np.flatnonzero(source_labels == label) for label in labels}
    canonical_splits = defaultdict(set)
    for label, split in label_to_split.items():
        canonical_splits[targets(label)].add(split)
    assert all(len(s) == 1 for s in canonical_splits.values())
    assert all(label_to_split[label] == "train" for label in labels if len(targets(label)) < 2)
    assert len(source.var_names) == 5045

    # Cache complete outcomes with a fingerprint of the exact saved split.
    mean_file = RUN / "condition_means.npz"
    if mean_file.exists():
        with np.load(mean_file) as cached:
            assert cached["split_sha256"].item() == split_hash
            assert cached["labels"].tolist() == labels
            means = cached["means"]
            counts = cached["counts"]
    else:
        codes = source.obs["condition"].astype(str).map(label_index).fillna(-1).to_numpy(dtype=int)
        sums = np.zeros((len(labels), source.n_vars), dtype=np.float64)
        counts = np.bincount(codes[codes >= 0], minlength=len(labels))
        for start in range(0, source.n_obs, 2048):
            end = min(start + 2048, source.n_obs)
            valid = codes[start:end] >= 0
            block = source.X[start:end][valid].astype(np.float64)
            block_codes = codes[start:end][valid]
            membership = sparse.csr_matrix((
                np.ones(len(block_codes)), (block_codes, np.arange(len(block_codes)))
            ), shape=(len(labels), len(block_codes)))
            addition = membership @ block
            sums += addition.toarray() if sparse.issparse(addition) else addition
        means = sums / counts[:, None]
        np.savez_compressed(mean_file, labels=np.array(labels), means=means,
                            counts=counts, split_sha256=split_hash)
    assert int(counts.sum()) == 89357

    rng = np.random.default_rng(seed)
    train_rows = []
    for label in sorted(splits["train"]):
        available = rows_by_label[label]
        selected = (available if cell_cap == 0 else
                    rng.choice(available, size=min(cell_cap, len(available)), replace=False))
        train_rows.extend(selected.tolist())
    train_rows = np.array(sorted(train_rows))
    train_labels = source_labels[train_rows]
    assert all(label_to_split[label] == "train" for label in train_labels)
    train_targets = {targets(label) for label in train_labels}
    for label in splits["val"] + splits["test"]:
        assert targets(label) not in train_targets
        assert all((gene,) in train_targets for gene in targets(label))

    # Approximately 150 MB at cap=32, instead of reloading cached cell graphs.
    train_y = source.X[train_rows].toarray().astype(np.float32)
    control_rows = rows_by_label["ctrl"]
    # Control samples are training observations; they provide the input profile.
    control_cells = source.X[control_rows].toarray().astype(np.float32)
    control_mean = means[label_index["ctrl"]].astype(np.float32)
    name_map = dict(source.obs[["condition", "condition_name"]].drop_duplicates()
                    .itertuples(index=False, name=None))
    de_genes = json.loads((RESULTS / "evaluation_de20_genes.json").read_text())
    gene_ids = source.var_names.to_numpy(dtype=str)
    gene_index = {gene: i for i, gene in enumerate(gene_ids)}
    for label, genes in de_genes.items():
        assert list(source.uns["rank_genes_groups_cov_all"][name_map[label]][:20]) == genes
        assert len(set(genes)) == 20
    de_indices = {label: np.array([gene_index[gene] for gene in genes])
                  for label, genes in de_genes.items()}
    gene_names = source.var["gene_name"].to_numpy(dtype=str)
    barcodes = source.obs_names[train_rows].to_numpy(dtype=str)
    source.file.close()
    pd.DataFrame({"cell_barcode": barcodes, "condition": train_labels,
                  "split": "train"}).to_csv(RUN / "training_cells.csv", index=False)
    # Loss masks are estimated from the selected training cells only.
    loss_masks = {}
    for label in sorted(set(train_labels)):
        loss_masks[label] = np.flatnonzero((train_y[train_labels == label] != 0).any(axis=0))
        assert len(loss_masks[label]) > 0
    log(f"Training sample: {len(train_rows):,} cells, {len(set(train_labels))} labels; cap={'all' if cell_cap == 0 else cell_cap}.")
    log(f"Validation/test outcomes use all {sum(counts[label_index[p]] for p in splits['val']+splits['test']):,} cells.")
    return dict(splits=splits, split_hash=split_hash, gene2go=gene2go,
                pert_names=pert_names, pert_index=pert_index, labels=labels,
                label_index=label_index, means=means, counts=counts,
                train_y=train_y, train_labels=train_labels, control_cells=control_cells,
                control_mean=control_mean, loss_masks=loss_masks, de_indices=de_indices,
                gene_ids=gene_ids, gene_names=gene_names)


def ontology_graph(data, neighbors=20, threshold=0.1):
    """Exact Jaccard top-k graph from the existing GEARS ontology reference."""
    cached = RUN / f"ontology_top{neighbors}.npz"
    names = data["pert_names"]
    reference_hash = hashlib.sha256((ROOT / "data/gene2go_all.pkl").read_bytes()).hexdigest()
    fingerprint = json.dumps(dict(neighbors=neighbors, threshold=threshold,
                                  reference_sha256=reference_hash, version=2), sort_keys=True)
    if cached.exists():
        with np.load(cached) as graph:
            if (graph["names"].tolist() == names and "fingerprint" in graph and
                    graph["fingerprint"].item() == fingerprint):
                return torch.from_numpy(graph["edges"]), torch.from_numpy(graph["weights"])
    terms = sorted(set().union(*(data["gene2go"][name] for name in names)))
    term_index = {term: i for i, term in enumerate(terms)}
    rows, cols = [], []
    for i, name in enumerate(names):
        for term in data["gene2go"][name]:
            rows.append(i)
            cols.append(term_index[term])
    incidence = sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)),
                                  shape=(len(names), len(terms)))
    sizes = np.asarray(incidence.sum(axis=1)).ravel()
    sources, destinations, weights = [], [], []
    for start in range(0, len(names), 128):
        stop = min(start + 128, len(names))
        intersection = (incidence[start:stop] @ incidence.T).toarray()
        denominator = sizes[start:stop, None] + sizes[None, :] - intersection
        scores = np.divide(intersection, denominator, out=np.zeros_like(intersection),
                           where=denominator != 0)
        for offset, row in enumerate(scores):
            # Self-edge + up to 20 other ontology neighbors, as in GEARS.
            candidates = np.flatnonzero(row > threshold)
            # Higher scores first; ties resolved by stable reference-gene order.
            selected = candidates[np.lexsort((candidates, -row[candidates]))[:neighbors + 1]]
            sources.extend(selected.tolist())
            destinations.extend([start + offset] * len(selected))
            weights.extend(row[selected].tolist())
        if start % 1280 == 0 or stop == len(names):
            log(f"Ontology graph: {stop:,} / {len(names):,} genes")
    edges = np.array([sources, destinations], dtype=np.int64)
    weights = np.array(weights, dtype=np.float32)
    assert np.all(weights > threshold)
    np.savez_compressed(cached, names=np.array(names), edges=edges, weights=weights,
                        fingerprint=fingerprint)
    return torch.from_numpy(edges), torch.from_numpy(weights)


def coexpression_graph(data, neighbors=20, threshold=0.4):
    cached = RUN / "coexpression_graph.npz"
    training_hash = hashlib.sha256(memoryview(data["train_y"])).hexdigest()
    fingerprint = json.dumps(dict(training_sha256=training_hash, neighbors=neighbors,
                                  threshold=threshold, split=data["split_hash"]), sort_keys=True)
    if cached.exists():
        with np.load(cached) as graph:
            if "fingerprint" in graph and graph["fingerprint"].item() == fingerprint:
                return torch.from_numpy(graph["edges"]), torch.from_numpy(graph["weights"])
    # Match GEARS's co-expression data selection: training singles and controls.
    selection = np.array(["ctrl" in label for label in data["train_labels"]])
    x = data["train_y"][selection].astype(np.float32)
    x -= x.mean(axis=0)
    sum_squares = np.square(x).sum(axis=0)
    denominator = np.sqrt(np.outer(sum_squares, sum_squares))
    covariance = x.T @ x
    correlations = np.divide(covariance, denominator, out=np.zeros_like(covariance),
                             where=denominator > 0)
    correlations = np.abs(np.clip(correlations, -1, 1))
    sources, destinations, weights = [], [], []
    for target, row in enumerate(correlations):
        selected = np.argpartition(row, -(neighbors + 1))[-(neighbors + 1):]
        selected = selected[row[selected] > threshold]
        sources.extend(selected.tolist())
        destinations.extend([target] * len(selected))
        weights.extend(row[selected].tolist())
    edges = np.array([sources, destinations], dtype=np.int64)
    weights = np.array(weights, dtype=np.float32)
    np.savez_compressed(cached, edges=edges, weights=weights,
                        training_sha256=training_hash, fingerprint=fingerprint)
    log(f"Co-expression graph: {len(weights):,} edges from {len(x):,} sampled training single/control cells.")
    return torch.from_numpy(edges), torch.from_numpy(weights)


def model_config(data, device, hidden_size, runtime_variant="batch-corrected"):
    go, go_weights = ontology_graph(data)
    expression, expression_weights = coexpression_graph(data)
    return dict(hidden_size=hidden_size, num_go_gnn_layers=1, num_gene_gnn_layers=1,
                decoder_hidden_size=16, uncertainty=False, uncertainty_reg=1,
                direction_lambda=0.1, G_go=go, G_go_weight=go_weights,
                G_coexpress=expression, G_coexpress_weight=expression_weights,
                num_similar_genes_go_graph=20, num_similar_genes_co_express_graph=20,
                coexpress_threshold=0.4, device=device,
                num_genes=len(data["gene_ids"]), num_perts=len(data["pert_names"]),
                no_perturb=False, runtime_variant=runtime_variant)


def make_model(config):
    if config.get("runtime_variant", "official") == "batch-corrected":
        from gears_runtime import FastGEARSModel
        return FastGEARSModel(config)
    return GEARS_Model(config)


def training_loss(pred, batch, control, masks, implementation):
    if implementation == "vectorized":
        from gears_runtime import vectorized_gears_loss
        function = vectorized_gears_loss
    else:
        function = loss_fct
    return function(pred, batch.y, batch.pert, ctrl=control,
                    dict_filter=masks, direction_lambda=0.1)


def make_batch(data, selected, rng, device):
    graphs = []
    for i in selected:
        label = data["train_labels"][i]
        pert_indices = [data["pert_index"][gene] for gene in targets(label)] or [-1]
        y = torch.from_numpy(data["train_y"][i:i+1])
        if label == "ctrl":
            x = y.reshape(-1, 1)
        else:
            control = data["control_cells"][rng.integers(len(data["control_cells"]))]
            x = torch.from_numpy(control).reshape(-1, 1)
        graphs.append(Data(x=x, y=y, pert_idx=pert_indices, pert=label))
    return Batch.from_data_list(graphs).to(device)


@torch.no_grad()
def predict_conditions(model, data, labels, device, replicates=32):
    """Average a fixed batch of mean-control profiles for each condition.

The shipped model adds control expression only at the output. Mean-control
inputs provide a deterministic expectation, rather than sampling noisy controls.
    """
    model.eval()
    predictions = {}
    for label in labels:
        pert_indices = [data["pert_index"][gene] for gene in targets(label)] or [-1]
        graphs = [Data(x=torch.from_numpy(data["control_mean"]).reshape(-1, 1),
                       pert_idx=pert_indices, pert=label) for _ in range(replicates)]
        batch = Batch.from_data_list(graphs).to(device)
        prediction = model(batch).mean(dim=0).detach().cpu().numpy()
        assert np.isfinite(prediction).all()
        predictions[label] = prediction
    return predictions


def score_predictions(data, predictions, split):
    rows = []
    for label in data["splits"][split]:
        observed = data["means"][data["label_index"][label]]
        error = np.square(predictions[label].astype(np.float64) - observed)
        rows.append(dict(split=split, condition=label, pair="+".join(targets(label)),
                         model=data.get("model_label", "gears_local"), mse_de20=float(error[data["de_indices"][label]].mean()),
                         mse_all_genes=float(error.mean()),
                         cells=int(data["counts"][data["label_index"][label]])))
    per_condition = pd.DataFrame(rows)
    per_pair = per_condition.groupby(["split", "pair", "model"], as_index=False).agg(
        mse_de20=("mse_de20", "mean"), mse_all_genes=("mse_all_genes", "mean"),
        cells=("cells", "sum"))
    return per_condition, per_pair


def train(data, config, args):
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    model = make_model(config).to(args.device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=5e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=args.lr_step_size, gamma=args.lr_gamma)
    rng = np.random.default_rng(args.seed)
    control = torch.tensor(data["control_mean"], device=args.device)
    history = []
    best = np.inf
    best_epoch = 0
    elapsed_start = time.monotonic()
    n = len(data["train_y"])
    best_file = RUN / "model.pt"

    log(f"Device={args.device}; hidden size={args.hidden_size}; maximum epochs={args.epochs}.")
    if args.smoke_only:
        model.train()
        elapsed = time.monotonic()
        measured = []
        for step in range(8):
            batch_start = time.monotonic()
            batch = make_batch(data, np.arange(step * args.batch_size, (step+1) * args.batch_size), rng, args.device)
            optimizer.zero_grad()
            prediction = model(batch)
            loss = training_loss(prediction, batch, control, data["loss_masks"], args.loss_implementation)
            if not torch.isfinite(loss):
                raise RuntimeError("Nonfinite smoke-test loss")
            loss.backward()
            torch.nn.utils.clip_grad_value_(model.parameters(), 1.0)
            optimizer.step()
            if args.device == "mps":
                torch.mps.synchronize()
            if step >= 3:
                measured.append(time.monotonic() - batch_start)
            log(f"Smoke batch {step+1}: loss={loss.item():.5f}")
        seconds_per_batch = float(np.mean(measured))
        val_predictions = predict_conditions(model, data, data["splits"]["val"][:2], args.device)
        assert len(val_predictions) == 2
        report = dict(seconds_per_batch=seconds_per_batch,
                      estimated_seconds_per_epoch=seconds_per_batch * n / args.batch_size,
                      sampled_training_cells=n, device=args.device,
                      forward_backward_inference_passed=True)
        save_json(RUN / f"smoke_check_{args.device}.json", report)
        log(json.dumps(report, indent=2))
        return None, None

    for epoch in range(1, args.epochs+1):
        model.train()
        epoch_start = time.monotonic()
        order = rng.permutation(n)
        losses = []
        for step, start in enumerate(range(0, n-1, args.batch_size)):
            selected = order[start:start+args.batch_size]
            if len(selected) < 2:
                continue
            batch = make_batch(data, selected, rng, args.device)
            optimizer.zero_grad()
            prediction = model(batch)
            loss = training_loss(prediction, batch, control, data["loss_masks"], args.loss_implementation)
            if not torch.isfinite(loss):
                raise RuntimeError(f"Nonfinite loss at epoch {epoch}, step {step}")
            loss.backward()
            torch.nn.utils.clip_grad_value_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.item()))
            if step % 100 == 0:
                log(f"Epoch {epoch}, batch {step+1}: loss={losses[-1]:.5f}")
        scheduler.step()
        validation_predictions = predict_conditions(model, data, data["splits"]["val"], args.device)
        _, validation_scores = score_predictions(data, validation_predictions, "val")
        value = float(validation_scores["mse_de20"].mean())
        improved = value < best
        if improved:
            best, best_epoch = value, epoch
            # CPU state makes the checkpoint portable between CPU and Apple GPU.
            torch.save({key: tensor.detach().cpu() for key, tensor in model.state_dict().items()}, best_file)
        history.append(dict(epoch=epoch, mean_training_loss=float(np.mean(losses)),
                            validation_mse_de20=value, learning_rate=optimizer.param_groups[0]["lr"],
                            seconds=time.monotonic()-epoch_start, best_so_far=improved))
        pd.DataFrame(history).to_csv(RUN / "training_history.csv", index=False)
        status = dict(status="training", epoch=epoch, maximum_epochs=args.epochs,
                      best_epoch=best_epoch, best_validation_mse_de20=best,
                      elapsed_seconds=time.monotonic()-elapsed_start)
        save_json(RUN / "status.json", status)
        log(f"Epoch {epoch}: validation DE20 MSE={value:.6f}; best epoch={best_epoch}; {history[-1]['seconds']:.1f}s.")
        if epoch - best_epoch >= args.patience:
            log(f"Validation early stopping after {args.patience} epochs without improvement.")
            break

    model.load_state_dict(torch.load(best_file, map_location="cpu", weights_only=True))
    return model, dict(best_epoch=best_epoch, epochs_completed=len(history),
                       best_validation_mse_de20=best,
                       training_seconds=time.monotonic()-elapsed_start)


def export_results(data, config, model, training_info, args):
    # Test outcomes are scored only after the validation-selected checkpoint is fixed.
    scores = []
    pair_scores = []
    prediction_arrays = []
    prediction_labels = []
    for split in ["val", "test"]:
        predictions = predict_conditions(model, data, data["splits"][split], args.device)
        conditions, pairs = score_predictions(data, predictions, split)
        scores.append(conditions)
        pair_scores.append(pairs)
        for label in data["splits"][split]:
            prediction_labels.append(label)
            prediction_arrays.append(predictions[label])
    condition_results = pd.concat(scores, ignore_index=True)
    gears_pairs = pd.concat(pair_scores, ignore_index=True)
    condition_results.to_csv(RUN / "gears_per_condition.csv", index=False)
    gears_pairs.to_csv(RUN / "gears_per_pair.csv", index=False)
    np.savez_compressed(RUN / "gears_predictions.npz", labels=np.array(prediction_labels),
                        predictions=np.stack(prediction_arrays), gene_ids=data["gene_ids"])

    baselines = pd.read_csv(RESULTS / "baseline_per_pair.csv")
    assert set(gears_pairs["pair"]) == set(baselines["pair"])
    all_pairs = pd.concat([baselines, gears_pairs], ignore_index=True)
    summary = all_pairs.groupby(["split", "model"], as_index=False).agg(
        pairs=("pair", "size"), mse_de20=("mse_de20", "mean"),
        mse_all_genes=("mse_all_genes", "mean"))
    summary.to_csv(RUN / "model_comparison.csv", index=False)
    test = all_pairs[all_pairs["split"] == "test"].pivot(index="pair", columns="model", values="mse_de20")
    model_label = data["model_label"]
    test["gears_improvement_over_additive"] = test["additive"] - test[model_label]
    test.to_csv(RUN / "test_pair_comparison.csv")
    rng = np.random.default_rng(args.seed)
    differences = test["gears_improvement_over_additive"].to_numpy()
    boot = rng.choice(differences, size=(2000, len(differences)), replace=True).mean(axis=1)
    interval = np.quantile(boot, [0.025, 0.975]).tolist()

    report = dict(training_info, status="complete", device=args.device,
                  split_sha256=data["split_hash"], training_cell_cap=args.cell_cap,
                  training_cells=len(data["train_y"]), full_training_cells=79170,
                  hidden_size=args.hidden_size, model=model_label,
                  runtime_variant=args.runtime_variant,
                  loss_implementation=args.loss_implementation,
                  learning_rate=args.lr, lr_step_size=args.lr_step_size, lr_gamma=args.lr_gamma,
                  training_source_hashes=data["source_hashes"],
                  training_objective="GEARS quartic error and direction term",
                  checkpoint_selection="validation pair-macro top20 DE MSE only",
                  inference="mean of 32 repeated training-control-mean profiles per condition",
                  coexpression_data="training single-gene and control cells only",
                  ontology_data="local GEARS reference; Jaccard >0.1, top21 per target, deterministic ties",
                  test_status="exploratory: this test set was previously inspected in the pilot",
                  test_gene_pairs=20, model_scores=summary.to_dict(orient="records"),
                  gears_beats_additive_pairs=int((differences > 0).sum()),
                  additive_minus_gears_mean=float(differences.mean()),
                  additive_minus_gears_bootstrap95=interval,
                  packages={name: version(name) for name in ["torch", "torch_geometric", "cell-gears", "numpy", "scipy"]})
    save_json(RUN / "run_summary.json", report)
    save_json(RUN / "status.json", dict(status="complete", **training_info))
    portable_config = dict(config)
    portable_config["device"] = "cpu"
    for key in ["G_go", "G_go_weight", "G_coexpress", "G_coexpress_weight"]:
        portable_config[key] = portable_config[key].cpu()
    with (RUN / "config.pkl").open("wb") as file:
        pickle.dump(portable_config, file)
    save_json(RUN / "run_config.json", dict(seed=args.seed, cell_cap=args.cell_cap,
              hidden_size=args.hidden_size, batch_size=args.batch_size, epochs=args.epochs,
              patience=args.patience, split_sha256=data["split_hash"],
              learning_rate=args.lr, lr_step_size=args.lr_step_size, lr_gamma=args.lr_gamma,
              runtime_variant=args.runtime_variant, loss_implementation=args.loss_implementation,
              run_name=model_label))

    log(summary.to_string(index=False))
    log(f"GEARS beats additive on {int((differences > 0).sum())}/20 test pairs.")
    create_notebook_and_plots(data, report, summary, test, condition_results)


def create_notebook_and_plots(data, report, summary, test, condition_results):
    # A run-specific report preserves the historical pilot notebook.
    from report_project06 import render_run_report
    render_run_report(RUN)


def verify_checkpoint():
    """Independently restore the saved model and check representative predictions."""
    with (RUN / "config.pkl").open("rb") as file:
        config = pickle.load(file)
    config["device"] = "cpu"
    model = make_model(config)
    model.load_state_dict(torch.load(RUN / "model.pt", map_location="cpu", weights_only=True))
    model.eval()
    with np.load(RESULTS / "training_reference_means.npz") as references:
        control = references["control"].astype(np.float32)
    with np.load(RUN / "ontology_top20.npz") as ontology:
        names = ontology["names"].tolist()
    index = {gene: i for i, gene in enumerate(names)}
    checked = []
    comparison = []
    saved_device = json.loads((RUN / "run_summary.json").read_text()).get("device", "cpu")
    # Float32 graph reductions differ slightly between Apple GPU and CPU.
    # These tolerances were checked using predictions alone, before final scoring.
    rtol, atol = (1e-4, 1e-5) if saved_device == "mps" else (1e-5, 1e-6)
    with np.load(RUN / "gears_predictions.npz") as saved:
        labels = saved["labels"].tolist()
        expected = saved["predictions"]
        for i in [0, 20, 39]:
            label = labels[i]
            graphs = [Data(x=torch.from_numpy(control).reshape(-1, 1),
                           pert_idx=[index[gene] for gene in targets(label)], pert=label)
                      for _ in range(32)]
            batch = Batch.from_data_list(graphs)
            with torch.no_grad():
                actual = model(batch).mean(dim=0).numpy()
            np.testing.assert_allclose(actual, expected[i], rtol=rtol, atol=atol)
            checked.append(label)
            difference = np.abs(actual - expected[i])
            comparison.append(dict(condition=label, max_absolute_difference=float(difference.max()),
                                   mean_absolute_difference=float(difference.mean())))
            log(f"Restored checkpoint reproduces: {label}")
    save_json(RUN / "checkpoint_verification.json", dict(
        checkpoint_reload_passed=True, checked_conditions=checked,
        saved_prediction_device=saved_device, reload_device="cpu", comparison=comparison,
        relative_tolerance=rtol, absolute_tolerance=atol))
    log("Checkpoint reload and inference checks passed.")


def main():
    global RUN
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--cell-cap", type=int, default=128, help="Maximum cells per condition; 0 uses all training cells")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--lr-step-size", type=int, default=5)
    parser.add_argument("--lr-gamma", type=float, default=0.5)
    parser.add_argument("--runtime-variant", choices=["batch-corrected", "official"], default="batch-corrected")
    parser.add_argument("--loss-implementation", choices=["vectorized", "reference"], default="vectorized")
    parser.add_argument("--run-name")
    parser.add_argument("--device", choices=["mps", "cpu"], default="cpu")
    parser.add_argument("--output-dir", default=str(RUN))
    parser.add_argument("--verify-checkpoint", action="store_true")
    parser.add_argument("--smoke-only", action="store_true")
    args = parser.parse_args()
    RUN = Path(args.output_dir)
    if not RUN.is_absolute():
        RUN = ROOT / RUN
    torch.set_num_threads(4)
    if args.verify_checkpoint:
        verify_checkpoint()
        return
    if args.cell_cap < 0 or min(args.epochs, args.batch_size, args.hidden_size, args.patience, args.lr_step_size) < 1:
        parser.error("cell-cap must be nonnegative; epoch, batch, hidden, patience and LR step values must be positive")
    if args.batch_size < 2 or args.lr <= 0 or not 0 < args.lr_gamma <= 1:
        parser.error("batch-size must be at least 2; LR must be positive and gamma in (0,1]")
    if args.device == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("Apple GPU unavailable in this process; run with GPU access or --device cpu.")
    data = prepare_data(args.cell_cap, args.seed)
    data["model_label"] = args.run_name or RUN.name
    data["source_hashes"] = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in ["train_project06.py", "gears_runtime.py"]
    }
    save_json(RUN / "experiment_plan.json", dict(
        arguments=vars(args), split_sha256=data["split_hash"],
        training_cells=len(data["train_y"]), source_hashes=data["source_hashes"],
        selection="validation MSE only; no configuration search on test outcomes"))
    config = model_config(data, args.device, args.hidden_size, args.runtime_variant)
    model, training_info = train(data, config, args)
    if model is not None:
        export_results(data, config, model, training_info, args)


if __name__ == "__main__":
    main()
