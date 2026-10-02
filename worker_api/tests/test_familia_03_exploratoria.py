"""
Smoke tests — Família 03: Análise Exploratória (PCA, HCA, KMeans, Outlier)
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, key_equals, list_len, list_len_ge


def _X(n=30, p=15):
    rng = np.random.default_rng(2)
    return rng.normal(0, 1, (n, p)).tolist()


# ─── PCA: pedir 3 componentes → scores deve ter 3 colunas ────────────────────

def test_pca_n_components():
    """Solicita 3 componentes → scores retorna shape (n, 3)."""
    X = _X(n=30, p=15)
    return smoke("pca", {"X": X}, {"n_components": 3},
        [has_keys("scores", "loadings", "explained_variance_ratio"),
         list_len("explained_variance_ratio", 3),
         lambda out: (
             None if len(out["scores"]) == 30 and len(out["scores"][0]) == 3
             else (_ for _ in ()).throw(AssertionError(
                 f"scores shape should be (30,3), got ({len(out['scores'])},{len(out['scores'][0])})"
             ))
         )])


def test_pca_explained_variance():
    """Variância explicada soma ≤ 1 e cada valor ≥ 0."""
    X = _X()
    return smoke("pca", {"X": X}, {"n_components": 5},
        [has_keys("explained_variance_ratio"),
         lambda out: None if (
             all(v >= 0 for v in out["explained_variance_ratio"])
             and sum(out["explained_variance_ratio"]) <= 1.0 + 1e-9
         ) else (_ for _ in ()).throw(AssertionError("Invalid explained_variance_ratio"))])


def test_hca():
    X = _X(n=20, p=10)
    return smoke("hca", {"X": X}, {"n_clusters": 3, "linkage": "ward"},
        [has_keys("linkage_matrix", "dendrogram_data")])


def test_kmeans():
    """KMeans com k=4 → exatamente 4 centroids e 4 labels únicos."""
    X = _X(n=40, p=8)
    return smoke("kmeans", {"X": X}, {"n_clusters": 4},
        [has_keys("labels", "centroids", "inertia"),
         list_len("centroids", 4),
         lambda out: None if len(set(out["labels"])) == 4
             else (_ for _ in ()).throw(AssertionError(
                 f"Expected 4 unique labels, got {len(set(out['labels']))}"))])


def test_outlier_detection():
    X = _X(n=30, p=10)
    return smoke("outlier_detection", {"X": X},
        {"method": "mahalanobis", "threshold": 3.0},
        [has_keys("outlier_mask", "scores_"),
         list_len("outlier_mask", 30)])


def run():
    results = [
        test_pca_n_components(),
        test_pca_explained_variance(),
        test_hca(),
        test_kmeans(),
        test_outlier_detection(),
    ]
    return run_suite(results, "Família 03 — Análise Exploratória")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
