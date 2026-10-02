"""
Smoke tests — Família 09: Classificação Multiway
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _tensor_y_clf(n=30, shape=(8, 6), n_classes=2, string_labels=False):
    rng = np.random.default_rng(13)
    X = rng.normal(0, 1, (n,) + shape).tolist()
    if string_labels:
        labels = [f"class_{i}" for i in range(n_classes)]
        y = [labels[i % n_classes] for i in range(n)]
    else:
        y = rng.integers(0, n_classes, n).tolist()
    return X, y


def _base_checks():
    """All multiway classifiers return metrics_cal with accuracy."""
    return [
        has_keys("metrics_cal"),
        lambda out: None if "accuracy" in out["metrics_cal"]
            else (_ for _ in ()).throw(AssertionError(
                f"metrics_cal missing accuracy, got: {list(out['metrics_cal'].keys())}")),
    ]


def test_multilinear_lda():
    X, y = _tensor_y_clf()
    return smoke("multilinear_lda", {"X": X, "y": y}, {"n_components": 2},
        _base_checks() + [has_keys("scores", "loadings")])


def test_tensor_svm():
    X, y = _tensor_y_clf()
    return smoke("tensor_svm", {"X": X, "y": y}, {"kernel": "rbf"},
        _base_checks())


def test_tensor_knn():
    X, y = _tensor_y_clf()
    return smoke("tensor_knn", {"X": X, "y": y}, {"n_neighbors": 3},
        _base_checks())


def test_tensor_random_forest():
    X, y = _tensor_y_clf()
    return smoke("tensor_random_forest", {"X": X, "y": y},
        {"n_estimators": 10},
        _base_checks() + [has_keys("feature_importances")])


def test_multiway_plsda():
    """Slug is 'multiway_pls_da' (with underscore)."""
    X, y = _tensor_y_clf(n_classes=2)
    return smoke("multiway_pls_da", {"X": X, "y": y}, {"n_components": 2},
        _base_checks())


def test_multiway_simca():
    """multiway_simca requires string class labels."""
    X, y = _tensor_y_clf(n_classes=2, string_labels=True)
    return smoke("multiway_simca", {"X": X, "y": y}, {"n_components": 2},
        _base_checks())


def run():
    results = [
        test_multilinear_lda(),
        test_tensor_svm(),
        test_tensor_knn(),
        test_tensor_random_forest(),
        test_multiway_plsda(),
        test_multiway_simca(),
    ]
    return run_suite(results, "Família 09 — Classificação Multiway")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
