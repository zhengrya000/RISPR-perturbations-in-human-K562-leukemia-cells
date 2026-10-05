# Project 06 training audit

Audit date: October 5, 2026. The original pilot is preserved in
`results/gears_local/`. This audit inspected the saved split, baseline notebook,
training script, checkpoint, and installed `cell-gears 0.1.2` source before the
larger experiment. Findings below do not establish why GEARS underperformed.

## Checks that passed

- The 89,357 eligible cells have 5,045 measured genes. The split has 79,170
  training, 5,026 validation, and 5,161 test cells, with 88/20/20 gene pairs.
- The split groups equivalent gene identities, including guide position and
  pair-order aliases, before assignment. No canonical perturbation crosses
  splits; every held-out pair has both single-gene identities in training.
- All controls and single-gene observations are training observations. Additive
  predictions use only training control and single-gene means.
- The pilot's coexpression graph and nonzero loss masks use its selected
  training outcomes. The ontology uses a fixed external reference. Held-out
  outcomes are not used to construct either graph or the loss masks.
- Checkpoints are selected by validation pair-average top-20 DE MSE. Test
  scoring occurs after selecting the checkpoint.
- The same saved DE gene lists and pair averaging are used for all models.
  These lists come from the benchmark's outcome-derived rankings; validation
  rankings serve validation scoring and test rankings serve final scoring.
  They are not prediction features or training loss masks.
- The saved checkpoint reproduces representative saved predictions after
  loading. Mean-control prediction inputs are appropriate here: the installed
  model uses the input expression only as an additive output offset.

Evidence: `results/split_audit.json`, `results/condition_split.json`,
`results/evaluation_de20_genes.json`,
`results/gears_local/checkpoint_verification.json`, the code cells in
`project06_baseline.ipynb`, and `train_project06.py`.

## Concrete implementation findings

### Ontology graph threshold differed from the reference implementation

The pilot selected the largest 21 Jaccard similarities per target and retained
every positive score (`ontology_graph` in the original training script,
lines 179–186). The installed GEARS graph-generation implementation filters
Jaccard scores to **greater than 0.1** before selecting the largest `k + 1`
scores (`gears/utils.py`, `get_GO_edge_list`, lines 194–205, and
`get_similarity_network`, lines 238–260).

The pilot graph contains 206,780 edges, of which 4,466 have scores at or below
0.1; its minimum weight is 0.00625. The local downloaded `data/norman/go.csv`
also has a minimum score above 0.1. That CSV has a different node universe and
should not be substituted without remapping.

The larger experiment should apply the reference threshold while preserving
the **9,853 reference gene names**, and save graph parameters with the cache.
The original claim that the pilot graph exactly matched the official default
graph needs this qualification. Filtering these edges is a compatibility
correction, not evidence that those edges caused its score.

### An inherited batch-position defect in the coexpression layer

In installed `gears/model.py`, lines 137–139, positional embeddings are
repeated for every cell in a batch, but coexpression edges still address only
the first 5,045 rows. Later cells receive different graph processing.

A minimal correction applies the coexpression layers to one copy of the gene
embeddings, then repeats the result for the batch. A local corrected model
variant should be explicitly identified; preserve the original checkpoint
and the installed package.

Read-only CPU verification with identical model weights found:

| Check | Maximum absolute difference |
| --- | ---: |
| Upstream positional embeddings, identical first/second cells | 0.287649 |
| Upstream saved pilot outputs, identical first/second cells, three conditions | 1.19e-7 to 4.77e-7 |
| Saved pilot, batch size 1 versus mean of batch size 32 | 1.79e-6 to 5.60e-6 |
| Corrected versus upstream output for batch size 1 | 2.98e-8 |
| Corrected output after reversing a two-condition batch | 0 |
| Corrected outputs for identical cells in a batch | 0 |

The effect on the inspected pilot predictions was numerically tiny. The
structural defect should be corrected and verified without attributing the
pilot's poor ranking to it.

### Efficient loss computation must retain condition weighting

The installed GEARS loss averages retained genes within each cell, cells
within each original condition label, then condition labels within the
batch (`gears/utils.py`, `loss_fct`, lines 388–430). A simple average across
all cells would change that weighting.

An equivalent vectorized implementation gives each cell weight
`1 / (number_of_conditions * cells_in_its_condition)`, with each row's
loss divided by its retained gene count. Controls retain all genes.
Mixed-condition/control/mask verification in float32 produced an absolute
loss difference of 9.54e-7 and a maximum prediction-gradient difference of
1.19e-7. The direction term uses `torch.sign`, as in GEARS; that term has zero
gradient almost everywhere. Preserve this behavior when claiming equivalent
GEARS loss, rather than silently introducing a new objective.

## Experimental limitations and justified next changes

- **Unequal training samples in the pilot.** Additive used all training
  single-gene observations, whereas GEARS used 7,584 sampled outcome cells,
  capped at 32 per original condition label. Its input control pool and
  control mean still used training controls. This comparison measures that
  particular local workflow; it does not isolate the effect of architecture
  under equal outcome sample sizes. Use all training outcomes for the larger
  experiment, or also report an additive baseline using the identical
  sampled single-gene outcomes if the larger experiment remains capped.
- **Rapid learning-rate decay.** The pilot used upstream's schedule:
  starting at 0.001 and halving after every epoch. After epoch 12 the next
  learning rate was 2.44e-7. This is not an implementation error, but later
  epochs made very small parameter updates. A slower schedule may be
  predeclared for the larger run and assessed using validation only. Record
  it as a protocol change; improvement is not guaranteed.
- **Loss and evaluation target different quantities.** GEARS uses a
  quartic single-cell error with unpaired training-control inputs; the
  evaluation measures squared error of condition mean expression. Additive
  directly uses empirical single-condition means. Additional training does
  not guarantee that the quartic objective wins this mean-expression metric.
- **The test set has already been inspected.** The new run can compare on
  the same 20 pairs, but its result remains exploratory on a reused test
  set. Do not choose epochs, hyperparameters, or which run to report using
  test scores. A later independent confirmation requires new held-out data
  or a separate untouched evaluation protocol.
- **Scope remains narrow.** One split, one model seed, one processed
  CRISPR-activation dataset, and pair averages do not establish
  generalization to unseen genes, new cell types, or biological replicates.
  Pair bootstrap intervals are descriptive and do not account for gene
  sharing between pairs. The supplied processed benchmark fixes the gene
  universe; this is not a reproduction of raw-data preprocessing.

Reference code: [GEARS model](https://github.com/snap-stanford/GEARS/blob/master/gears/model.py)
and [GEARS utilities](https://github.com/snap-stanford/GEARS/blob/master/gears/utils.py).
Exact audit line numbers refer to the installed `cell-gears 0.1.2` files under
`/Library/Frameworks/Python.framework/Versions/3.10/lib/python3.10/site-packages/gears/`;
remote repository revisions may differ.

## Revised protocol and implementation review

An initial larger attempt was planned with all **79,170 training outcome
cells** in `results/gears_full/experiment_plan.json`. The user then requested
that training not use all available cells. That process was stopped during
its fourth epoch, before final test scoring. Its partial checkpoint and
training history are historical artifacts, not a completed full-data result
or a candidate selected by test performance.

The replacement experiment is **`gears_medium`**, in
`results/gears_medium/`, with a cap of **128 outcome cells per original
training condition label**. Its saved plan and cell assignments confirm
**29,766 selected outcomes across 237 labels**, below the theoretical cap
of 30,336 because some conditions have fewer than 128 cells.
The requested protocol retains batch size **64**, hidden size **64**, seed
**1**, at most **20 epochs**, validation patience **5**, initial learning
rate **0.001**, halving every **5 epochs**, Apple's **MPS** accelerator, and
the corrected runtime and vectorized loss. Its own source hashes are recorded
before training. Final scores and checkpoint-verification measurements belong
to that run's exported artifacts.

The additive baseline continues to use all training single-gene outcome
cells, while this replacement GEARS experiment uses capped training outcomes.
Training-only control inputs and the control mean remain available. This
comparison describes the chosen local workflow; it does not establish which
architecture wins when fitted to identical outcome samples. Increasing the
sample cap also changes batching, ontology filtering, and the learning-rate
schedule compared with the pilot, so the difference cannot isolate the
effect of adding cells alone.

The revised code implements the graph threshold correction and fingerprints
graph caches. Read-only inspection of the stopped attempt confirmed
**202,314 ontology edges** over the preserved 9,853-name universe, all with
weights above 0.1, and confirmed that both training-source hashes matched
its saved plan at that time. The replacement run records its own hashes
after updating defaults; read-only checks confirmed both current source hashes
match that replacement plan. Its coexpression graph contains **6,258 edges**
derived from **19,034 sampled training single-gene/control outcomes**.
`gears_runtime.py` propagates gene positional embeddings before
repeating them, preserves the upstream BatchNorm populations, and vectorizes
perturbation aggregation and the condition-weighted GEARS loss. The explicit
runtime name is `batch-corrected`; it is a local corrected variant of GEARS,
not the unmodified upstream batched forward. The scientific equivalence tests
in `tests/test_gears_runtime.py` cover upstream agreement for one-cell
inference, permutation and batch-composition invariance, gradients against a
block-diagonal graph reference, BatchNorm buffers, and loss weighting.

The final code review found no new defect in the revised prediction, loss,
checkpoint selection, or pair-average scoring paths. Model weights are saved
on CPU and graph configuration is exported separately for portable inference.
MPS-to-CPU comparisons explicitly allow floating-point differences: the
replacement verifier uses relative tolerance **1e-4** and absolute tolerance
**1e-5** for saved MPS predictions; CPU-to-CPU verification retains **1e-5**
and **1e-6**, respectively. These thresholds were fixed before replacement
training began. A prediction-only probe of the stopped attempt's checkpoint
found maximum MPS-to-CPU differences of 5.81e-6, 7.15e-6, and 5.25e-6 across
three conditions, with mean differences between 1.35e-7 and 2.34e-7. The old
threshold rejected one or two near-zero genes despite these small numerical
differences. This adjustment was based on cross-device predictions without
reading observed outcomes or choosing thresholds from evaluation metrics.
The verifier records maximum and mean absolute differences per checked
condition; passing it means numerical agreement at the stated tolerances,
not bitwise equality.

Reporting is handled separately by `report_project06.py`. It executes the
report cells and saves genuine notebook outputs in a run-specific notebook.
Regenerate the report after checkpoint verification to embed the verification
result. Preparation and training commands are distinct; historical notebook
commands describe an older protocol and should not be treated as exact
reproduction commands for the revised default training script.

Small final batches can add noise to BatchNorm updates and validation curves.
The stopped full attempt would have ended each complete epoch with two
cells; the confirmed capped sample leaves six. The replacement protocol is
recorded separately from the stopped process. The reused-test-set and
single-seed limitations above continue to apply; neither this protocol
change nor extra training guarantees an improvement over additive.
