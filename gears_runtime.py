"""Corrected, vectorized runtime for the installed GEARS architecture.

The installed GEARS forward propagates a batched position-embedding matrix on
one unbatched coexpression graph. Only its first cell therefore receives the
intended graph propagation. FastGEARSModel applies the graph to the gene
embedding once and repeats that result for every cell. This is a deliberate
batching correction, not an exact reproduction of the shipped batched forward.
Parameters, state_dict names, decoder, and BatchNorm populations are unchanged.
"""
from __future__ import annotations

import os
from pathlib import Path
import tempfile

# Set writable caches before importing GEARS, which imports Scanpy/Numba.
_CACHE = Path(tempfile.gettempdir()) / "biotech-project06-runtime"
os.environ.setdefault("NUMBA_CACHE_DIR", str(_CACHE / "numba"))
os.environ.setdefault("MPLCONFIGDIR", str(_CACHE / "matplotlib"))
os.environ.setdefault("MPLBACKEND", "Agg")

from collections import Counter, OrderedDict
from collections.abc import Mapping

import torch
from gears.model import GEARS_Model


class FastGEARSModel(GEARS_Model):
    """GEARS_Model with corrected position batching and vectorized aggregation.

    ``Batch.pert_idx`` can contain ordinary ragged Python lists (the GEARS
    convention), tensor rows, or a rectangular tensor with -1 padding.
    """

    def _perturbation_sums(self, pert_idx, embeddings, num_graphs):
        device = embeddings.device
        if isinstance(pert_idx, torch.Tensor):
            indices = pert_idx.to(device=device, dtype=torch.long)
            if indices.ndim == 1:
                indices = indices.reshape(num_graphs, -1)
            if indices.shape[0] != num_graphs:
                raise ValueError("pert_idx must have one row per cell")
            valid = indices >= 0
            sums = (embeddings[indices.clamp_min(0)] * valid.unsqueeze(-1)).sum(dim=1)
            active = torch.nonzero(valid.any(dim=1), as_tuple=False).flatten()
            return sums[active], active

        if len(pert_idx) != num_graphs:
            raise ValueError("pert_idx must have one row per cell")
        if any(isinstance(row, torch.Tensor) for row in pert_idx):
            # Stack tensors without pulling individual GPU indices into Python.
            rows = [torch.as_tensor(row, dtype=torch.long, device=device).flatten()
                    for row in pert_idx]
            padded = torch.nn.utils.rnn.pad_sequence(rows, batch_first=True,
                                                     padding_value=-1)
            return self._perturbation_sums(padded, embeddings, num_graphs)

        # GEARS normally retains these indices as Python lists. Build the mapping
        # there, then transfer just two small tensors instead of synchronizing
        # the accelerator for every perturbation index.
        indices, destinations, active_cells = [], [], []
        for cell, row in enumerate(pert_idx):
            valid_indices = [int(index) for index in row if index >= 0]
            if valid_indices:
                slot = len(active_cells)
                active_cells.append(cell)
                indices.extend(valid_indices)
                destinations.extend([slot] * len(valid_indices))
        active = torch.tensor(active_cells, dtype=torch.long, device=device)
        sums = embeddings.new_zeros((len(active_cells), embeddings.shape[1]))
        if indices:
            index = torch.tensor(indices, dtype=torch.long, device=device)
            slots = torch.tensor(destinations, dtype=torch.long, device=device)
            sums.index_add_(0, slots, embeddings[index])
        return sums, active

    def forward(self, data):
        x = data.x
        if self.no_perturb:
            return x.reshape(-1, self.num_genes)

        num_graphs = int(data.num_graphs)
        device = self.gene_emb.weight.device
        gene_indices = torch.arange(self.num_genes, device=device)
        # Preserve BatchNorm on B*G rows; computing this BN only on G rows would
        # change its running variance during training.
        emb = self.gene_emb(gene_indices).repeat(num_graphs, 1)
        base_emb = self.emb_trans(self.bn_emb(emb))

        # Correct batching: every cell shares the same propagated position
        # embedding, equivalent to B copies of a block-diagonal gene graph.
        pos_emb = self.emb_pos(gene_indices)
        for idx, layer in enumerate(self.layers_emb_pos):
            pos_emb = layer(pos_emb, self.G_coexpress, self.G_coexpress_weight)
            if idx < len(self.layers_emb_pos) - 1:
                pos_emb = pos_emb.relu()
        base_emb = self.emb_trans_v2(base_emb + 0.2 * pos_emb.repeat(num_graphs, 1))

        pert_indices = torch.arange(self.num_perts, device=device)
        pert_global_emb = self.pert_emb(pert_indices)
        for idx, layer in enumerate(self.sim_layers):
            pert_global_emb = layer(pert_global_emb, self.G_sim, self.G_sim_weight)
            if idx < self.num_layers - 1:
                pert_global_emb = pert_global_emb.relu()

        sums, active = self._perturbation_sums(data.pert_idx, pert_global_emb,
                                               num_graphs)
        base_emb = base_emb.reshape(num_graphs, self.num_genes, -1)
        if active.numel():
            # Preserve upstream perturbation-fusion BN: controls are excluded,
            # and one active row is duplicated so training BN remains defined.
            fuse_input = sums.repeat(2, 1) if active.numel() == 1 else sums
            fused = self.pert_fuse(fuse_input)[:active.numel()]
            updates = fused.new_zeros((num_graphs, fused.shape[1]))
            updates.index_add_(0, active, fused)
            base_emb = base_emb + updates[:, None, :]

        base_emb = self.transform(self.bn_pert_base(
            base_emb.reshape(num_graphs * self.num_genes, -1)))
        out = self.recovery_w(base_emb).reshape(num_graphs, self.num_genes, -1)
        out = (out.unsqueeze(-1) * self.indv_w1).sum(dim=2) + self.indv_b1
        cross_gene = self.cross_gene_state(out.squeeze(2))
        cross_gene = cross_gene[:, None, :].expand(-1, self.num_genes, -1)
        cross_gene_out = torch.cat((out, cross_gene), dim=2)
        prediction = (cross_gene_out * self.indv_w2).sum(dim=2) + self.indv_b2
        prediction = prediction + x.reshape(num_graphs, self.num_genes)
        if self.uncertainty:
            logvar = self.uncertainty_w(base_emb).reshape(num_graphs, self.num_genes)
            return prediction, logvar
        return prediction


# Cache the training-only masks once per dictionary/device rather than copying
# each condition mask individually on every batch. Retaining the dictionary
# prevents Python object-id reuse from producing an incorrect cache hit.
_LOSS_MASK_CACHE = OrderedDict()


def clear_loss_cache():
    """Release cached loss masks, for example after an experiment completes."""
    _LOSS_MASK_CACHE.clear()


def _loss_masks(dict_filter, num_genes, device):
    key = (id(dict_filter), num_genes, str(device))
    cached = _LOSS_MASK_CACHE.get(key)
    if cached is not None:
        _LOSS_MASK_CACHE.move_to_end(key)
        return cached[1:]
    labels = ["ctrl"] + [label for label in dict_filter if label != "ctrl"]
    codes = {label: i for i, label in enumerate(labels)}
    # Integer multiplicities also reproduce advanced-indexing loss behavior if
    # a caller supplies the same retained gene more than once.
    masks = torch.zeros((len(labels), num_genes), dtype=torch.int32)
    masks[0] = 1
    for label, indices in dict_filter.items():
        if label != "ctrl":
            indices = torch.as_tensor(indices, dtype=torch.long, device="cpu")
            indices = torch.where(indices < 0, indices + num_genes, indices)
            masks[codes[label]] = torch.bincount(indices, minlength=num_genes).to(torch.int32)
    masks = masks.to(device)
    counts = masks.sum(dim=1)
    _LOSS_MASK_CACHE[key] = (dict_filter, codes, masks, counts)
    while len(_LOSS_MASK_CACHE) > 4:
        _LOSS_MASK_CACHE.popitem(last=False)
    return codes, masks, counts


def vectorized_gears_loss(pred, y, perts, ctrl=None, dict_filter=None,
                          direction_lambda=1e-3):
    """Official GEARS condition-weighted quartic + direction loss, vectorized.

    Each unique condition has equal weight, regardless of its cell count. A
    noncontrol condition uses only its supplied training-derived gene mask;
    control uses all genes. The direction term is direction_lambda multiplied
    by the squared sign difference, exactly as in the installed implementation.
    Sign has zero derivative almost everywhere, matching upstream gradients.
    The filter dictionary must be treated as immutable while cached.
    """
    if pred.ndim != 2 or pred.shape != y.shape:
        raise ValueError("pred and y must have the same [cells, genes] shape")
    labels = [str(label) for label in perts]
    if len(labels) != pred.shape[0] or not labels:
        raise ValueError("perts must contain one label per cell in a nonempty batch")
    if dict_filter is None:
        if any(label != "ctrl" for label in labels):
            raise ValueError("Noncontrol conditions require dict_filter")
        dict_filter = _CONTROL_ONLY_FILTER
    if ctrl is None:
        raise ValueError("The direction term requires the control expression vector")
    codes, masks, gene_counts = _loss_masks(dict_filter, pred.shape[1], pred.device)
    counts = Counter(labels)
    row_codes = torch.tensor([codes[label] for label in labels], dtype=torch.long,
                             device=pred.device)
    row_counts = pred.new_tensor([counts[label] for label in labels])
    mask = masks[row_codes]
    denominator = row_counts * gene_counts[row_codes].to(pred.dtype) * len(counts)
    control = torch.as_tensor(ctrl, dtype=pred.dtype, device=pred.device)
    difference = pred - y
    sign_difference = torch.sign(y - control) - torch.sign(pred - control)
    element_loss = difference.square().square() + direction_lambda * sign_difference.square()
    return ((element_loss * mask).sum(dim=1) / denominator).sum()


_CONTROL_ONLY_FILTER: Mapping = {}


def _benchmark_main():
    """Reproducible throughput probe using a saved, trusted local config."""
    import argparse
    import json
    import pickle
    import statistics
    import time
    from gears.utils import loss_fct
    from torch_geometric.data import Batch, Data

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True,
                        help="Saved local GEARS config.pkl")
    parser.add_argument("--device", choices=("cpu", "mps"), default="cpu")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.manual_seed(123)
    if args.device == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("Apple MPS GPU is unavailable in this process")
    with args.benchmark.open("rb") as handle:
        cfg = pickle.load(handle)
    cfg["device"] = args.device
    genes = cfg["num_genes"]
    labels = ["ctrl" if i == 0 else f"condition_{i}" for i in range(args.batch_size)]
    graphs = [Data(x=torch.rand(genes, 1), y=torch.rand(1, genes),
                   pert_idx=[-1] if i == 0 else [i % cfg["num_perts"],
                                                (i + 1) % cfg["num_perts"]], pert=label)
              for i, label in enumerate(labels)]
    data = Batch.from_data_list(graphs).to(args.device)
    ctrl = torch.zeros(genes, device=args.device)
    filters = {label: list(range(genes)) for label in labels if label != "ctrl"}
    summary = dict(device=args.device, batch_size=args.batch_size,
                   num_genes=genes, num_perts=cfg["num_perts"],
                   unique_conditions=len(set(labels)), threads=args.threads,
                   includes="forward + loss + backward; excludes optimizer/data assembly")
    def synchronize():
        if args.device == "mps":
            torch.mps.synchronize()
    for cls, loss_fn in ((GEARS_Model, loss_fct),
                         (FastGEARSModel, vectorized_gears_loss)):
        model = cls(cfg).to(args.device).train()
        durations = []
        for repeat in range(args.repeats + 1):
            model.zero_grad(set_to_none=True)
            synchronize()
            start = time.perf_counter()
            prediction = model(data)
            loss = loss_fn(prediction, data.y, labels, ctrl=ctrl,
                           dict_filter=filters, direction_lambda=0.1)
            loss.backward()
            synchronize()
            elapsed = time.perf_counter() - start
            if repeat:
                durations.append(elapsed)
        summary[cls.__name__] = dict(median_seconds=statistics.median(durations),
                                    samples=durations)
        del model
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    _benchmark_main()
