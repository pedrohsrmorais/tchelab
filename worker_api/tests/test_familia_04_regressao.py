"""
Smoke tests — Família 04: Regressão 1D
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _Xy(n=40, p=20):
    rng = np.random.default_rng(3)
    X = rng.normal(0, 1, (n, p))
    w = rng.normal(0, 1, p)
    y = X @ w + rng.normal(0, 0.1, n)
    return X.tolist(), y.tolist()


def _base_checks():
    """All regression scripts return metrics_cal with RMSEC."""
    return [
        has_keys("metrics_cal"),
        lambda out: None if "RMSEC" in out["metrics_cal"]
            else (_ for _ in ()).throw(AssertionError(
                f"metrics_cal missing RMSEC, got: {list(out['metrics_cal'].keys())}")),
    ]


def test_ols():
    X, y = _Xy()
    return smoke("ols", {"X": X, "y": y}, {},
        _base_checks() + [has_keys("coefficients", "intercept")])


def test_pls():
    """PLS com 3 componentes → verifica loadings e n_components."""
    X, y = _Xy()
    return smoke("pls", {"X": X, "Y": y}, {"n_components": 3},
        _base_checks() + [
            has_keys("x_loadings"),
            lambda out: None if out["model"]["n_components"] == 3
                else (_ for _ in ()).throw(AssertionError(
                    f"Expected n_components=3, got {out['model']['n_components']}"))])


def test_pcr():
    X, y = _Xy()
    return smoke("pcr", {"X": X, "y": y}, {"n_components": 5},
        _base_checks() + [has_keys("scores", "loadings")])


def test_ridge():
    X, y = _Xy()
    return smoke("ridge", {"X": X, "y": y}, {"alpha": 1.0},
        _base_checks() + [has_keys("coefficients")])


def test_lasso():
    X, y = _Xy()
    return smoke("lasso", {"X": X, "y": y}, {"alpha": 0.01},
        _base_checks() + [has_keys("coefficients")])


def test_elastic_net():
    X, y = _Xy()
    return smoke("elastic_net", {"X": X, "y": y},
        {"alpha": 0.01, "l1_ratio": 0.5},
        _base_checks() + [has_keys("coefficients")])


def test_cls():
    """CLS — Classical Least Squares.
    X (n×K spectra), S (J×K pure-component matrix) where validate requires J==K
    (the script checks X.shape[1] == S.shape[0]). We use a small square case.
    execute: C = X @ pinv(S) → (n,J);  X_rec = C @ S.T → (n,K).
    """
    rng = np.random.default_rng(99)
    n, K = 20, 10
    S = rng.normal(0, 1, (K, K))         # J=K (square, satisfies validate)
    C_true = np.abs(rng.normal(0, 1, (n, K)))
    X = (C_true @ S) + rng.normal(0, 0.01, (n, K))
    return smoke("cls", {"X": X.tolist(), "S": S.tolist()}, {},
        [has_keys("C", "X_reconstructed", "metrics_cal")])


def test_ils():
    X, y = _Xy()
    return smoke("ils", {"X": X, "y": y}, {},
        _base_checks() + [has_keys("coefficients")])


def test_nonlinear_regression():
    rng = np.random.default_rng(3)
    X = rng.normal(0, 1, (30, 5))
    w = rng.normal(0, 1, 5)
    y = (X @ w + rng.normal(0, 0.1, 30)).tolist()
    return smoke("nonlinear_regression", {"X": X.tolist(), "y": y},
        {"kernel": "rbf"}, _base_checks())


def run():
    results = [
        test_ols(),
        test_pls(),
        test_pcr(),
        test_ridge(),
        test_lasso(),
        test_elastic_net(),
        test_cls(),
        test_ils(),
        test_nonlinear_regression(),
    ]
    return run_suite(results, "Família 04 — Regressão 1D")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
