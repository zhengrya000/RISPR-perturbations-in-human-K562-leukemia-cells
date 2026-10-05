"""Small scientific-equivalence tests; no dataset download or training run."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gears_runtime import FastGEARSModel, vectorized_gears_loss, clear_loss_cache

import numpy as np
import torch
from torch_geometric.data import Batch, Data
from gears.model import GEARS_Model
from gears.utils import loss_fct


def config(uncertainty=False):
    # Nontrivial weighted graphs; isolated-node behavior alone would hide the bug.
    return dict(num_genes=5, num_perts=4, hidden_size=6,
                num_go_gnn_layers=2, num_gene_gnn_layers=2,
                decoder_hidden_size=4, uncertainty=uncertainty,
                no_perturb=False, device="cpu",
                G_coexpress=torch.tensor([[0, 1, 2, 3, 4, 1, 0],
                                           [1, 2, 3, 4, 0, 0, 2]]),
                G_coexpress_weight=torch.tensor([0.3, 0.8, 0.6, 0.2, 0.7, 0.4, 0.5]),
                G_go=torch.tensor([[0, 1, 2, 3, 1], [1, 2, 3, 0, 0]]),
                G_go_weight=torch.tensor([0.4, 0.7, 0.9, 0.5, 0.6]))


def batch(indices, x=None):
    if x is None:
        x = torch.linspace(0.2, 2.0, len(indices) * 5).reshape(len(indices), 5)
    return Batch.from_data_list([Data(x=row[:, None], pert_idx=list(pert))
                                 for row, pert in zip(x, indices)])


class LossTests(unittest.TestCase):
    def tearDown(self):
        clear_loss_cache()

    def compare(self, labels, direction_lambda):
        torch.manual_seed(102)
        pred = torch.randn(len(labels), 5, dtype=torch.float64, requires_grad=True)
        y = torch.randn_like(pred)
        ctrl = torch.tensor([0.5, 0.0, -0.5, 1.0, -1.0], dtype=pred.dtype)
        filters = {"A+ctrl": np.array([0, 2, 4]), "A+B": [1, 2, 3, 4],
                   "B+ctrl": torch.tensor([0, 1])}
        expected = loss_fct(pred, y, labels, ctrl=ctrl, dict_filter=filters,
                            direction_lambda=direction_lambda)
        actual = vectorized_gears_loss(pred, y, labels, ctrl=ctrl, dict_filter=filters,
                                       direction_lambda=direction_lambda)
        torch.testing.assert_close(actual, expected, rtol=1e-12, atol=1e-12)
        grad_expected = torch.autograd.grad(expected, pred, retain_graph=True)[0]
        grad_actual = torch.autograd.grad(actual, pred)[0]
        torch.testing.assert_close(grad_actual, grad_expected, rtol=1e-12, atol=1e-12)

    def test_duplicate_conditions_and_controls(self):
        for coefficient in (0.0, 0.1, 1.0):
            self.compare(["A+ctrl", "ctrl", "A+B", "A+ctrl", "B+ctrl",
                          "ctrl", "A+ctrl"], coefficient)

    def test_all_controls(self):
        self.compare(["ctrl"] * 4, 0.1)
        pred = torch.tensor([[1.0, 2.0]], requires_grad=True)
        actual = vectorized_gears_loss(pred, torch.zeros_like(pred), ["ctrl"],
                                       ctrl=torch.zeros(2))
        expected = loss_fct(pred, torch.zeros_like(pred), ["ctrl"], ctrl=torch.zeros(2))
        torch.testing.assert_close(actual, expected)

    def test_repeated_gene_indices_keep_official_weighting(self):
        pred = torch.tensor([[1., 2., 3.], [4., 5., 6.]], requires_grad=True)
        y = torch.zeros_like(pred)
        filters = {"A": [0, 0, -1]}
        kwargs = dict(ctrl=torch.zeros(3), dict_filter=filters, direction_lambda=0.2)
        expected = loss_fct(pred, y, ["A", "A"], **kwargs)
        actual = vectorized_gears_loss(pred, y, ["A", "A"], **kwargs)
        torch.testing.assert_close(actual, expected)
        torch.testing.assert_close(torch.autograd.grad(actual, pred, retain_graph=True)[0],
                                    torch.autograd.grad(expected, pred)[0])


class ForwardTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(27)
        torch.set_num_threads(1)

    def models(self, uncertainty=False):
        cfg = config(uncertainty)
        official = GEARS_Model(deepcopy(cfg))
        optimized = FastGEARSModel(deepcopy(cfg))
        optimized.load_state_dict(official.state_dict(), strict=True)
        self.assertEqual(set(official.state_dict()), set(optimized.state_dict()))
        return official, optimized

    def assert_outputs_close(self, actual, expected, **kwargs):
        if isinstance(actual, tuple):
            for a, b in zip(actual, expected):
                torch.testing.assert_close(a, b, **kwargs)
        else:
            torch.testing.assert_close(actual, expected, **kwargs)

    def test_batch_one_matches_upstream(self):
        for indices in ([[0]], [[0, 2]], [[-1]]):
            for uncertainty in (False, True):
                official, optimized = self.models(uncertainty)
                official.eval()
                optimized.eval()
                data = batch(indices)
                self.assert_outputs_close(optimized(data), official(data),
                                          rtol=1e-5, atol=1e-6)

    def test_eval_permutation_and_batch_composition_invariance(self):
        _, optimized = self.models()
        optimized.eval()
        indices = [[0, 2], [-1], [1], [2, 3]]
        inputs = batch(indices).x.reshape(4, 5)
        original = optimized(batch(indices, inputs))
        permutation = [3, 1, 0, 2]
        reordered = optimized(batch([indices[i] for i in permutation], inputs[permutation]))
        torch.testing.assert_close(reordered, original[permutation], rtol=1e-5, atol=1e-6)
        singleton = torch.cat([optimized(batch([pert], inputs[i:i+1]))
                               for i, pert in enumerate(indices)])
        torch.testing.assert_close(singleton, original, rtol=1e-5, atol=1e-6)

    def test_corrected_block_diagonal_reference_gradients_and_bn(self):
        for indices in ([[0, 2], [-1], [1], [2, 3]],
                        [[-1], [-1], [1], [-1]],
                        [[-1], [-1], [-1], [-1]]):
            official, optimized = self.models(uncertainty=True)
            num_graphs = len(indices)
            edges = official.G_coexpress
            official.G_coexpress = torch.cat([edges + i * official.num_genes
                                               for i in range(num_graphs)], dim=1)
            official.G_coexpress_weight = official.G_coexpress_weight.repeat(num_graphs)
            data = batch(indices)
            actual, expected = optimized(data), official(data)
            self.assert_outputs_close(actual, expected, rtol=2e-5, atol=2e-6)
            sum(out.square().mean() for out in actual).backward()
            sum(out.square().mean() for out in expected).backward()
            for (name_a, param_a), (name_b, param_b) in zip(
                    optimized.named_parameters(), official.named_parameters()):
                self.assertEqual(name_a, name_b)
                if param_a.grad is None or param_b.grad is None:
                    self.assertIs(param_a.grad, param_b.grad)
                else:
                    torch.testing.assert_close(param_a.grad, param_b.grad,
                                                rtol=2e-4, atol=2e-5, msg=name_a)
            for name, actual_buffer in optimized.named_buffers():
                expected_buffer = dict(official.named_buffers())[name]
                torch.testing.assert_close(actual_buffer, expected_buffer,
                                            rtol=1e-5, atol=1e-6, msg=name)

    def test_tensor_indices_match_python_indices(self):
        _, optimized = self.models()
        optimized.eval()
        data = batch([[0, 2], [-1], [1]])
        expected = optimized(data)
        data.pert_idx = torch.tensor([[0, 2], [-1, -1], [1, -1]])
        torch.testing.assert_close(optimized(data), expected)
        data.pert_idx = [torch.tensor([0, 2]), torch.tensor([-1]), torch.tensor([1])]
        torch.testing.assert_close(optimized(data), expected)

    def test_no_perturbation_mode_returns_input(self):
        cfg = config(uncertainty=True)
        cfg["no_perturb"] = True
        optimized = FastGEARSModel(cfg)
        data = batch([[0], [-1]])
        torch.testing.assert_close(optimized(data), data.x.reshape(2, 5))


if __name__ == "__main__":
    unittest.main()
