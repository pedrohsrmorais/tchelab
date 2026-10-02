"""
Smoke tests — Família 02: Pré-processamento
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, key_equals, shape_check


def _spectra(n=20, p=100):
    rng = np.random.default_rng(1)
    return (rng.normal(0, 1, (n, p)) + np.linspace(0, 1, p)).tolist()


def test_snv():
    X = _spectra()
    out, _ = __import__("tests.helpers", fromlist=["run_script"]).run_script(
        "snv", {"X": X}, {})
    arr = np.array(out["X_processed"])
    # SNV: each row should have mean≈0, std≈1
    means = arr.mean(axis=1)
    stds = arr.std(axis=1)
    assert np.allclose(means, 0, atol=1e-6), "SNV row means not zero"
    assert np.allclose(stds, 1, atol=1e-6), "SNV row stds not one"
    return type("R", (), {"passed": True, "slug": "snv", "duration_ms": 0,
                          "error": None, "__repr__": lambda s: "[PASS] snv"})()


def test_snv_smoke():
    return smoke("snv", {"X": _spectra()}, {},
        [has_keys("X_snv")])


def test_msc():
    return smoke("msc", {"X": _spectra()}, {},
        [has_keys("X_msc", "reference_used")])


def test_detrend():
    return smoke("detrend", {"X": _spectra()}, {"poly_order": 1},
        [has_keys("X_dt")])


def test_baseline():
    return smoke("baseline", {"X": _spectra()}, {"method": "als"},
        [has_keys("X_bl")])


def test_savitzky_golay():
    return smoke("savitzky_golay", {"X": _spectra()},
        {"window_length": 11, "polyorder": 2, "deriv": 0},
        [has_keys("X_sg")])


def test_normalizacao():
    return smoke("normalizacao", {"X": _spectra()}, {"method": "l2"},
        [has_keys("X_norm")])


def test_centering():
    X = _spectra()
    return smoke("centering", {"X": X}, {},
        [has_keys("X_c", "mean_")])


def test_autoscaling():
    return smoke("autoscaling", {"X": _spectra()}, {},
        [has_keys("X_as", "mean_", "std_")])


def test_pareto():
    return smoke("pareto", {"X": _spectra()}, {},
        [has_keys("X_p")])


def test_robust_scaling():
    return smoke("robust_scaling", {"X": _spectra()}, {},
        [has_keys("X_rs")])


def test_pqn():
    return smoke("pqn", {"X": _spectra()}, {},
        [has_keys("X_pqn")])


def test_eilers_smoothing():
    return smoke("eilers_smoothing", {"X": _spectra()}, {"lam": 1e3},
        [has_keys("X_smooth")])


def test_wavelet_transform():
    try:
        import pywt  # noqa
    except ImportError:
        # pywt not installed; mark as skipped
        return type("R", (), {"passed": True, "slug": "wavelet_transform", "duration_ms": 0,
                              "error": None,
                              "__repr__": lambda s: "[SKIP] wavelet_transform (pywt not installed)"})()
    return smoke("wavelet_transform", {"X": _spectra()},
        {"wavelet": "db4", "level": 2},
        [has_keys("X_denoised")])


def run():
    results = [
        test_snv_smoke(),
        test_msc(),
        test_detrend(),
        test_baseline(),
        test_savitzky_golay(),
        test_normalizacao(),
        test_centering(),
        test_autoscaling(),
        test_pareto(),
        test_robust_scaling(),
        test_pqn(),
        test_eilers_smoothing(),
        test_wavelet_transform(),
    ]
    return run_suite(results, "Família 02 — Pré-processamento")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
