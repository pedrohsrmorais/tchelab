"""
Smoke tests — Família 06: Deep Learning
These tests use very small models and very few epochs to stay fast.
Automatically skipped when TensorFlow is not installed.
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _has_tensorflow():
    try:
        import tensorflow  # noqa
        return True
    except ImportError:
        return False


def _skip(slug):
    return type("R", (), {
        "passed": True, "slug": slug, "duration_ms": 0, "error": None,
        "__repr__": lambda s: f"[SKIP] {slug} (tensorflow not installed)"
    })()


def _Xy_reg(n=50, p=10):
    rng = np.random.default_rng(7)
    X = rng.normal(0, 1, (n, p))
    y = X[:, 0] * 2 + rng.normal(0, 0.1, n)
    return X.tolist(), y.tolist()


def _Xy_clf(n=50, p=10, n_classes=2):
    rng = np.random.default_rng(8)
    X = rng.normal(0, 1, (n, p))
    y = (rng.integers(0, n_classes, n)).tolist()
    return X.tolist(), y


def test_mlp_regression():
    if not _has_tensorflow():
        return _skip("mlp_regression")
    X, y = _Xy_reg()
    return smoke("mlp", {"X": X, "y": y},
        {"task": "regression", "hidden_layers": [16], "epochs": 3, "batch_size": 16},
        [has_keys("y_pred", "history"),
         list_len("y_pred", 50)])


def test_mlp_classification():
    if not _has_tensorflow():
        return _skip("mlp_classification")
    X, y = _Xy_clf()
    return smoke("mlp", {"X": X, "y": y},
        {"task": "classification", "n_classes": 2, "hidden_layers": [16],
         "epochs": 3, "batch_size": 16},
        [has_keys("y_pred", "history"),
         list_len("y_pred", 50)])


def test_cnn1d():
    if not _has_tensorflow():
        return _skip("cnn1d")
    X, y = _Xy_reg()
    return smoke("cnn_1d", {"X": X, "y": y},
        {"task": "regression", "filters": [8], "epochs": 2, "batch_size": 16},
        [has_keys("y_pred", "history")])


def test_autoencoder():
    if not _has_tensorflow():
        return _skip("autoencoder")
    X, _ = _Xy_reg()
    return smoke("autoencoder", {"X": X},
        {"latent_dim": 4, "epochs": 3, "batch_size": 16},
        [has_keys("encoded", "reconstructed"),
         list_len("encoded", 50)])


def run():
    results = [
        test_mlp_regression(),
        test_mlp_classification(),
        test_cnn1d(),
        test_autoencoder(),
    ]
    return run_suite(results, "Família 06 — Deep Learning")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
