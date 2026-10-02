"""
Smoke tests — Família 05: Classificação 1D
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _Xy_clf(n=60, p=10, n_classes=3):
    rng = np.random.default_rng(4)
    X = rng.normal(0, 1, (n, p))
    y = rng.integers(0, n_classes, n).tolist()
    return X.tolist(), y


def _Xy_clf_str(n=60, p=10, n_classes=3):
    """String labels version (required by some scripts)."""
    rng = np.random.default_rng(4)
    X = rng.normal(0, 1, (n, p))
    labels = [f"class_{i}" for i in range(n_classes)]
    y = [labels[v % n_classes] for v in range(n)]
    return X.tolist(), y


def _base_checks():
    """All classifiers return metrics_cal with accuracy."""
    return [
        has_keys("metrics_cal"),
        lambda out: None if "accuracy" in out["metrics_cal"]
            else (_ for _ in ()).throw(AssertionError(
                f"metrics_cal missing accuracy, got: {list(out['metrics_cal'].keys())}")),
    ]


def test_lda():
    X, y = _Xy_clf()
    return smoke("lda", {"X": X, "y": y}, {},
        _base_checks() + [has_keys("scores", "loadings")])


def test_qda():
    X, y = _Xy_clf()
    return smoke("qda", {"X": X, "y": y}, {}, _base_checks())


def test_knn():
    X, y = _Xy_clf()
    return smoke("knn", {"X": X, "y": y}, {"n_neighbors": 5}, _base_checks())


def test_svm():
    X, y = _Xy_clf()
    return smoke("svm", {"X": X, "y": y}, {"kernel": "rbf"}, _base_checks())


def test_simca():
    """SIMCA requires string class labels."""
    rng = np.random.default_rng(5)
    X = rng.normal(0, 1, (30, 10)).tolist()
    y = ["A"] * 15 + ["B"] * 15
    return smoke("simca", {"X": X, "y": y}, {"n_components": 3},
        [has_keys("model", "thresholds", "classes", "metrics_cal")])


def test_plsda():
    """PLS-DA — slug is 'pls_da', accepts integer labels."""
    X, y = _Xy_clf(n_classes=2)
    return smoke("pls_da", {"X": X, "y": y}, {"n_components": 3},
        _base_checks() + [has_keys("scores", "classes")])


def test_random_forest():
    X, y = _Xy_clf()
    return smoke("random_forest", {"X": X, "y": y},
        {"n_estimators": 20},
        _base_checks() + [has_keys("feature_importances")])


def test_one_class_svm():
    """one_class_svm requires y with string labels (uses unique[0] as target)."""
    rng = np.random.default_rng(6)
    X = rng.normal(0, 1, (40, 10)).tolist()
    y = ["target"] * 20 + ["other"] * 20
    return smoke("one_class_svm", {"X": X, "y": y}, {"nu": 0.1},
        [has_keys("model", "decision_scores", "metrics_cal"),
         list_len("decision_scores", 40)])


def run():
    results = [
        test_lda(),
        test_qda(),
        test_knn(),
        test_svm(),
        test_simca(),
        test_plsda(),
        test_random_forest(),
        test_one_class_svm(),
    ]
    return run_suite(results, "Família 05 — Classificação 1D")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
