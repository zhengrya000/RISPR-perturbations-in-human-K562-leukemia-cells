"""Render saved experiment metrics and explanations without retraining a model."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".cache/matplotlib"))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def render_run_report(run_dir):
    run_dir = Path(run_dir).resolve()
    report = json.loads((run_dir / "run_summary.json").read_text())
    summary = pd.read_csv(run_dir / "model_comparison.csv")
    model_name, = set(summary["model"]) - {"control", "additive"}
    test = pd.read_csv(run_dir / "test_pair_comparison.csv", index_col="pair")
    difference = test["additive"] - test[model_name]
    wins = int((difference > 0).sum())
    history = pd.read_csv(run_dir / "training_history.csv")
    display_name = "GEARS full" if report["training_cells"] == report["full_training_cells"] else "GEARS sampled"

    test_summary = summary[summary["split"] == "test"].set_index("model")
    fig, ax = plt.subplots(figsize=(8, 4.5))
    values = test_summary.loc[["control", "additive", model_name], "mse_de20"].to_numpy()
    bars = ax.bar(["Control", "Additive", display_name], values,
                  color=["#64748b", "#2563eb", "#059669"])
    ax.bar_label(bars, labels=[f"{value:.4f}" for value in values], padding=4)
    ax.set_ylim(0, max(values) * 1.15)
    ax.set_ylabel("Test top-20 DE MSE (lower is better)")
    ax.set_title("Same 20 held-out gene pairs · custom evaluation")
    fig.tight_layout()
    fig.savefig(run_dir / "model_comparison.png", dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(history["epoch"], history["validation_mse_de20"], "o-", label="GEARS validation")
    additive_val = summary[(summary["split"] == "val") & (summary["model"] == "additive")]["mse_de20"].iloc[0]
    ax.axhline(additive_val, linestyle="--", color="#2563eb", label="Additive validation")
    ax.axvline(report["best_epoch"], linestyle=":", color="#059669", label="Selected checkpoint")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Validation top-20 DE MSE")
    ax.set_title("Checkpoint selection uses validation only")
    ax.legend()
    fig.tight_layout()
    fig.savefig(run_dir / "training_history.png", dpi=160)
    plt.close(fig)

    with np.load(run_dir / "gears_predictions.npz") as saved:
        predictions = dict(zip(saved["labels"].tolist(), saved["predictions"]))
    with np.load(run_dir / "condition_means.npz") as saved:
        means = dict(zip(saved["labels"].tolist(), saved["means"]))
    with np.load(ROOT / "results/additive_predictions.npz") as saved:
        additive = dict(zip(saved["pairs"].tolist(), saved["additive"]))
    with np.load(ROOT / "results/training_reference_means.npz") as saved:
        control = saved["control"]
        gene_ids = saved["gene_ids"].tolist()
        gene_names = saved["gene_names"]
    de_genes = json.loads((ROOT / "results/evaluation_de20_genes.json").read_text())
    gene_index = {gene: i for i, gene in enumerate(gene_ids)}
    # Greatest relative advantages/disadvantages, selected for explanation after scoring.
    example_pairs = difference.sort_values(ascending=False).index.tolist()[:2]
    example_pairs += [pair for pair in difference.sort_values().index if pair not in example_pairs][:2]
    examples = test.loc[example_pairs, ["additive", model_name]].copy()
    examples["additive_minus_gears"] = difference.loc[example_pairs]
    examples.to_csv(run_dir / "explanatory_examples.csv")

    fig, axes = plt.subplots(2, 2, figsize=(15, 9))
    for ax, pair in zip(axes.flat, example_pairs):
        labels = [label for label in predictions if "+".join(sorted(label.split("+"))) == pair]
        if not labels:
            raise ValueError(f"Missing prediction label for {pair}")
        label = sorted(labels)[0]
        indices = np.array([gene_index[gene] for gene in de_genes[label]])
        for values, name, color in [(means[label], "Observed", "#111827"),
                                    (additive[pair], "Additive", "#2563eb"),
                                    (predictions[label], "GEARS", "#059669")]:
            ax.plot(np.arange(20), (values-control)[indices], "o-", label=name,
                    color=color, markersize=3)
        ax.axhline(0, color="#64748b", linewidth=0.7)
        ax.set_xticks(np.arange(20), gene_names[indices], rotation=80)
        ax.set_title(f"{pair}\nAdditive={test.loc[pair, 'additive']:.3f}; GEARS={test.loc[pair, model_name]:.3f}")
        ax.set_ylabel("Expression change vs control")
        ax.legend()
    fig.tight_layout()
    fig.savefig(run_dir / "test_examples.png", dpi=160, bbox_inches="tight")
    plt.close(fig)

    try:
        relative_run = str(run_dir.relative_to(ROOT))
    except ValueError:
        relative_run = str(run_dir)
    all_cells = report["training_cells"] == report["full_training_cells"]
    scope = "all available training cells" if all_cells else f"up to {report['training_cell_cap']} cells per original condition"
    runtime = report.get("runtime_variant", "official (historical pilot)")
    lr_step = report.get("lr_step_size", 1)
    if runtime == "batch-corrected":
        runtime_detail = "The corrected runtime fixes coexpression graph batching while retaining GEARS parameter names and layer structure."
    else:
        runtime_detail = "This run uses the installed upstream GEARS model class. The historical pilot predates the revised batching and graph policies."
    if report.get("loss_implementation") == "vectorized":
        runtime_detail += " The vectorized loss is checked against the upstream loss and gradients."
    ontology_detail = report.get("ontology_data", "See the saved graph configuration.")
    introduction = f'''# Project 06: {display_name} experiment

GEARS trained on **{report['training_cells']:,} cells**, using {scope}. The split has **88 training, 20 validation, and 20 test gene pairs**; all single-gene identities and controls are in training. Equivalent guide labels remain in the same split.

The selected checkpoint is epoch **{report['best_epoch']}**, chosen from **{report['epochs_completed']} completed epochs using validation error only**. GEARS beats additive on **{wins}/20 test pairs**.

Runtime: **{runtime}**. {runtime_detail} Ontology graph: {ontology_detail}. The learning rate halves every **{lr_step} epochs**. The pilot and revised experiment have different sampling, graph construction and schedules; their comparison cannot isolate the effect of increasing data alone.

These are exploratory results on a test set already inspected in the pilot. Configuration choices were fixed from the audit and validation protocol before this run's test scoring. This is not a fresh confirmation set or a published-paper reproduction.
'''
    def md(text):
        return dict(cell_type="markdown", metadata={}, source=text.splitlines(True))
    def code(text):
        return dict(cell_type="code", metadata={}, source=text.splitlines(True),
                    execution_count=None, outputs=[])

    cells = [md(introduction), code(f'''from pathlib import Path
import json
import pandas as pd
from IPython.display import display, Image

run_dir = Path({relative_run!r})
display(pd.read_csv(run_dir / "model_comparison.csv"))
'''), md('''## Comparison

MSE is calculated on each condition's saved top 20 differentially expressed genes, using measured condition means. Errors are averaged within biological pairs, then across pairs. Gene lists that depend on held-out observations are used only to score predictions. Additive predictions and graph estimation use training information.
'''), code('display(Image(filename=str(run_dir / "model_comparison.png")))\n'),
        md("## Validation history\n\nTest error did not choose the checkpoint.\n"),
        code('display(Image(filename=str(run_dir / "training_history.png")))\n'),
        md("## Explanatory examples\n\nThese pairs have the largest relative advantages and disadvantages. They were selected after scoring for explanation, rather than tuning. If a pair has equivalent labels, its panel shows the first sorted label; table scores average all equivalent labels.\n"),
        code('display(pd.read_csv(run_dir / "explanatory_examples.csv"))\ndisplay(Image(filename=str(run_dir / "test_examples.png")))\n'),
        md("## Checkpoint verification\n\nThe selected model is saved with its graph configuration for portable CPU inference.\n"),
        code('''verification = run_dir / "checkpoint_verification.json"
print(verification.read_text() if verification.exists() else "Verification has not run yet.")
'''), md(f'''## Reproduction and limits

See `README.md`, `AUDIT.md`, and the run's `experiment_plan.json` for the exact protocol. Data download and baseline preparation are handled by `prepare_project06.py`; training is handled by `train_project06.py` and `gears_runtime.py`.

Rebuild this report without retraining:

```bash
python3 report_project06.py --run-dir {relative_run}
```

This experiment predicts expression changes after **CRISPR activation** in the processed Norman dataset. It tests unseen combinations of seen genes, on the existing normalized expression scale. It does not test new genes, another cell type, or independent biological replicates. One split and one seed do not establish broad model superiority. Pair bootstrap intervals describe variation across these held-out pairs, not biological reproducibility.
''')]

    # Execute the read-only report cells, so stored notebook outputs are real outputs.
    from IPython.core.interactiveshell import InteractiveShell
    from IPython.utils.capture import capture_output
    shell = InteractiveShell.instance()
    count = 0
    previous_dir = Path.cwd()
    try:
        os.chdir(ROOT)
        for cell in cells:
            if cell["cell_type"] != "code":
                continue
            count += 1
            with capture_output() as captured:
                outcome = shell.run_cell("".join(cell["source"]), store_history=False)
            if outcome.error_before_exec or outcome.error_in_exec:
                raise RuntimeError(f"Report cell {count} failed: {captured.stdout} {captured.stderr}")
            outputs = []
            for name, text in [("stdout", captured.stdout), ("stderr", captured.stderr)]:
                if text:
                    outputs.append(dict(output_type="stream", name=name, text=text.splitlines(True)))
            outputs.extend(dict(output_type="display_data", data=item.data, metadata=item.metadata)
                           for item in captured.outputs)
            cell["outputs"] = outputs
            cell["execution_count"] = count
    finally:
        os.chdir(previous_dir)
    for i, cell in enumerate(cells):
        cell["id"] = f"{run_dir.name}-{i:02d}"
    notebook = dict(cells=cells, metadata={
        "kernelspec": dict(display_name="Python 3", language="python", name="python3"),
        "language_info": dict(name="python", version="3.10.11")}, nbformat=4, nbformat_minor=5)
    notebook_path = ROOT / f"project06_{run_dir.name}.ipynb"
    notebook_path.write_text(json.dumps(notebook, indent=1) + "\n")
    print(f"Saved executed report: {notebook_path}", flush=True)
    return notebook_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", default="results/gears_medium")
    args = parser.parse_args()
    run_path = Path(args.run_dir)
    render_run_report(run_path if run_path.is_absolute() else ROOT / run_path)
