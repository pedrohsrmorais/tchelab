"""
Smoke tests — Família 08: Regressão Multiway
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _tensor_y(n=20, shape=(10, 8)):
    rng = np.random.default_rng(12)
    X = rng.normal(0, 1, (n,) + shape).tolist()
    y = rng.normal(0, 1, n).tolist()
    return X, y


def _base_checks():
    """All multiway regressors return metrics_cal with RMSEC."""
    return [
        has_keys("metrics_cal"),
        lambda out: None if "RMSEC" in out["metrics_cal"]
            else (_ for _ in ()).throw(AssertionError(
                f"metrics_cal missing RMSEC, got: {list(out['metrics_cal'].keys())}")),
    ]


def test_npls():
    """Slug: n_pls"""
    X, y = _tensor_y()
    return smoke("n_pls", {"X": X, "y": y}, {"n_components": 2},
        _base_checks() + [has_keys("scores", "x_loadings")])


def test_upls():
    """Slug: u_pls"""
    X, y = _tensor_y()
    return smoke("u_pls", {"X": X, "y": y}, {"n_components": 2},
        _base_checks() + [has_keys("scores")])


def test_nway_pcr():
    """Slug: n_way_pcr"""
    X, y = _tensor_y()
    return smoke("n_way_pcr", {"X": X, "y": y}, {"n_components": 2},
        _base_checks() + [has_keys("scores", "explained_variance_ratio")])


def test_upca():
    """Slug: u_pca — unsupervised (no y). Outputs: scores, loadings, explained_variance_ratio."""
    X, _ = _tensor_y()
    return smoke("u_pca", {"X": X}, {"n_components": 3},
        [has_keys("scores", "loadings", "explained_variance_ratio")])


def test_parafac_regression():
    """parafac_regression outputs: sample_scores, factors, metrics_cal."""
    X, y = _tensor_y()
    return smoke("parafac_regression", {"X": X, "y": y},
        {"n_components": 2},
        _base_checks() + [has_keys("sample_scores", "factors")])


def test_tucker_regression():
    """tucker_regression outputs: sample_loadings, core_shape, metrics_cal."""
    X, y = _tensor_y()
    return smoke("tucker_regression", {"X": X, "y": y},
        {"n_components": [2, 2]},
        _base_checks() + [has_keys("sample_loadings", "core_shape")])


def test_hpls():
    """HPLS takes 'blocks' (list of 2D matrices) instead of a 3D tensor."""
    rng = np.random.default_rng(12)
    n = 20
    X1 = rng.normal(0, 1, (n, 10)).tolist()
    X2 = rng.normal(0, 1, (n, 8)).tolist()
    y = rng.normal(0, 1, n).tolist()
    return smoke("hpls", {"blocks": [X1, X2], "y": y}, {"n_components": 2},
        _base_checks() + [has_keys("block_models", "meta_scores")])


def run():
    results = [
        test_npls(),
        test_upls(),
        test_nway_pcr(),
        test_upca(),
        test_parafac_regression(),
        test_tucker_regression(),
        test_hpls(),
    ]
    return run_suite(results, "Família 08 — Regressão Multiway")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
