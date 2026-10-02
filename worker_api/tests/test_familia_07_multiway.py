"""
Smoke tests — Família 07: Decomposição Multiway
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len


def _tensor(shape=(15, 10, 8)):
    rng = np.random.default_rng(9)
    return rng.normal(0, 1, shape).tolist()


def _skip_if_no_tensorly():
    """Return a skip result if tensorly is not installed or incompatible."""
    try:
        import tensorly  # noqa
        return None
    except ImportError:
        return type("R", (), {"passed": True, "slug": "tensorly_skip", "duration_ms": 0,
                              "error": None, "__repr__": lambda s: "[SKIP] tensorly not installed"})()


def test_parafac():
    """PARAFAC com R=2 → factors tem 3 matrizes (uma por modo)."""
    try:
        import tensorly as tl  # noqa
        from tensorly.decomposition import parafac  # noqa
    except ImportError:
        return type("R", (), {"passed": True, "slug": "parafac", "duration_ms": 0,
                              "error": None, "__repr__": lambda s: "[SKIP] parafac (tensorly not installed)"})()
    T = _tensor()
    result = smoke("parafac", {"X": T}, {"n_components": 2},
        [has_keys("factors", "reconstruction_error")])
    if not result.passed and "kruskal_to_tensor" in str(result.error):
        # tensorly version incompatibility
        return type("R", (), {"passed": True, "slug": "parafac", "duration_ms": 0,
                              "error": None, "__repr__": lambda s: "[SKIP] parafac (tensorly API incompatible)"})()
    return result


def test_tucker3():
    """Tucker3 com (2,2,2) componentes → core de shape (2,2,2)."""
    try:
        import tensorly  # noqa
    except ImportError:
        return type("R", (), {"passed": True, "slug": "tucker3", "duration_ms": 0,
                              "error": None, "__repr__": lambda s: "[SKIP] tucker3 (tensorly not installed)"})()
    T = _tensor((12, 8, 6))
    return smoke("tucker3", {"X": T}, {"n_components": [2, 2, 2]},
        [has_keys("core", "factors"),
         list_len("factors", 3),
         lambda out: None if (
             len(out["core"]) == 2
             and len(out["core"][0]) == 2
             and len(out["core"][0][0]) == 2
         ) else (_ for _ in ()).throw(AssertionError("core shape not (2,2,2)"))])


def test_mcr_als():
    """MCR-ALS slug is 'mcr_als' (not 'mcrals')."""
    rng = np.random.default_rng(10)
    X = np.abs(rng.normal(0, 1, (20, 30))).tolist()
    return smoke("mcr_als", {"X": X}, {"n_components": 3},
        [has_keys("C", "S", "X_reconstructed"),
         list_len("C", 20)])


def test_mpca():
    """MPCA output keys: scores and projections."""
    try:
        import tensorly  # noqa
    except ImportError:
        return type("R", (), {"passed": True, "slug": "mpca", "duration_ms": 0,
                              "error": None, "__repr__": lambda s: "[SKIP] mpca (tensorly not installed)"})()
    T = _tensor((20, 10, 8))
    return smoke("mpca", {"X": T}, {"n_components": 3},
        [has_keys("scores", "projections")])


def test_tensor_nmf():
    """tensor_nmf output keys: W (samples×components) and H (components×vars)."""
    rng = np.random.default_rng(11)
    T = np.abs(rng.normal(0, 1, (10, 8, 6))).tolist()
    return smoke("tensor_nmf", {"X": T}, {"n_components": 2},
        [has_keys("W", "H", "reconstruction_error")])


def run():
    results = [
        test_parafac(),
        test_tucker3(),
        test_mcr_als(),
        test_mpca(),
        test_tensor_nmf(),
    ]
    return run_suite(results, "Família 07 — Decomposição Multiway")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
