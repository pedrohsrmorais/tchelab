"""
Smoke tests — Famílias 12–20 (Validação, Transferência, Sinais, Hiperespectrais,
Dados Faltantes, Fusão, SPC, Interpretabilidade, Utilitários)
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len, list_len_ge


# ─── Fixtures comuns ──────────────────────────────────────────────────────────

def _Xy(n=40, p=20):
    rng = np.random.default_rng(17)
    X = rng.normal(0, 1, (n, p))
    y = X[:, 0] * 2 + rng.normal(0, 0.1, n)
    return X.tolist(), y.tolist()


def _spectra(n=20, p=100):
    rng = np.random.default_rng(18)
    return (rng.normal(0, 1, (n, p)) + np.linspace(0, 1, p)).tolist()


# ─── Família 12 — Validação de Modelos ───────────────────────────────────────

def test_cross_validation():
    X, y = _Xy()
    return smoke("cross_validation", {"X": X, "y": y},
        {"method": "kfold", "n_splits": 5,
         "model_slug": "pls", "model_params": {"n_components": 3}},
        [has_keys("metrics_cv", "n_splits")])


def test_bootstrap():
    X, y = _Xy()
    return smoke("bootstrap", {"X": X, "y": y},
        {"n_bootstrap": 10,
         "model_slug": "pls", "model_params": {"n_components": 3}},
        [has_keys("mse_632", "rmse_632", "apparent_mse", "bootstrap_mse")])


def test_permutation_test():
    X, y = _Xy()
    return smoke("permutation_test", {"X": X, "y": y},
        {"n_permutations": 20,
         "model_slug": "pls", "model_params": {"n_components": 3}},
        [has_keys("pvalue", "real_rmsecv", "permutation_distribution")])


# ─── Família 13 — Transferência de Aprendizado ────────────────────────────────

def test_pds():
    rng = np.random.default_rng(19)
    X_primary = rng.normal(0, 1, (30, 20)).tolist()
    X_secondary = (rng.normal(0, 1, (30, 20)) + 0.3).tolist()
    return smoke("pds", {"X_primary": X_primary, "X_secondary": X_secondary},
        {"window_size": 5},
        [has_keys("X_corrected")])


def test_ds():
    rng = np.random.default_rng(20)
    X_primary = rng.normal(0, 1, (25, 20)).tolist()
    X_secondary = (rng.normal(0, 1, (25, 20)) + 0.5).tolist()
    return smoke("ds", {"X_primary": X_primary, "X_secondary": X_secondary}, {},
        [has_keys("X_corrected")])


# ─── Família 14 — Sinais Espectrais ──────────────────────────────────────────

def test_peak_detection():
    """peak_detection takes X as matrix (n_samples, n_vars)."""
    rng = np.random.default_rng(21)
    spectrum = (np.sin(np.linspace(0, 4 * np.pi, 200)) + rng.normal(0, 0.05, 200)).tolist()
    X = [spectrum]  # single spectrum as 1-row matrix
    return smoke("peak_detection", {"X": X},
        {"min_height": 0.5, "min_distance": 10},
        [has_keys("model", "results")])


def test_fourier_analysis():
    t = np.linspace(0, 1, 256)
    signal = (np.sin(2 * np.pi * 10 * t) + np.sin(2 * np.pi * 50 * t)).tolist()
    X = [signal]  # single signal as 1-row matrix
    return smoke("fourier_analysis", {"X": X}, {"sample_rate": 256},
        [has_keys("frequencies", "results")])


def test_noise_estimation():
    X = _spectra()
    return smoke("noise_estimation", {"X": X}, {},
        [has_keys("noise_levels", "mean_snr")])


# ─── Família 15 — Imagens Hiperespectrais ────────────────────────────────────

def test_hyperspectral_pca():
    """hyperspectral_pca takes X as 3D cube (H×W×bands) or 2D (n_pixels×bands)."""
    rng = np.random.default_rng(22)
    cube = rng.normal(0, 1, (10, 10, 50)).tolist()   # H×W×bands
    return smoke("hyperspectral_pca", {"X": cube}, {"n_components": 3},
        [has_keys("scores", "loadings", "explained_variance_ratio")])


def test_spectral_angle_mapper():
    """SAM needs 2D X (n_pixels×bands) and 2D references (n_classes×bands)."""
    rng = np.random.default_rng(23)
    X_2d = np.abs(rng.normal(0, 1, (64, 30))).tolist()     # 8×8 pixels flattened
    references = np.abs(rng.normal(0, 1, (5, 30))).tolist()
    return smoke("spectral_angle_mapper",
        {"X": X_2d, "references": references}, {},
        [has_keys("y_pred", "minimum_angles_degrees")])


# ─── Família 16 — Dados Faltantes ────────────────────────────────────────────

def test_knn_imputation():
    rng = np.random.default_rng(24)
    X = rng.normal(0, 1, (30, 15)).tolist()
    for i in [2, 5, 10]:
        X[i][3] = None
    return smoke("knn_imputation", {"X": X}, {"n_neighbors": 3},
        [has_keys("X_imputed", "n_missing")])


def test_pca_imputation():
    rng = np.random.default_rng(25)
    X = rng.normal(0, 1, (25, 15)).tolist()
    X[3][2] = None
    X[8][7] = None
    return smoke("pca_imputation", {"X": X}, {"n_components": 3},
        [has_keys("X_imputed", "n_missing")])


def test_spectral_interpolation():
    """spectral_interpolation takes X as 2D matrix with NaN entries."""
    rng = np.random.default_rng(26)
    X = rng.normal(0, 1, (5, 100)).tolist()
    for i in [10, 11, 12, 50, 51]:
        X[0][i] = None
    return smoke("spectral_interpolation", {"X": X}, {},
        [has_keys("X_imputed", "n_missing")])


# ─── Família 17 — Fusão de Dados ──────────────────────────────────────────────

def test_low_level_fusion():
    rng = np.random.default_rng(27)
    X1 = rng.normal(0, 1, (20, 15)).tolist()
    X2 = rng.normal(0, 1, (20, 10)).tolist()
    return smoke("low_level_fusion", {"blocks": [X1, X2]}, {},
        [has_keys("X_fused"),
         lambda out: None if len(out["X_fused"][0]) == 25
             else (_ for _ in ()).throw(AssertionError(
                 f"Expected 25 columns (15+10), got {len(out['X_fused'][0])}"))])


def test_mid_level_fusion():
    rng = np.random.default_rng(28)
    X1 = rng.normal(0, 1, (20, 15)).tolist()
    X2 = rng.normal(0, 1, (20, 12)).tolist()
    y = rng.normal(0, 1, 20).tolist()
    return smoke("mid_level_fusion", {"blocks": [X1, X2], "y": y},
        {"n_components": 3},
        [has_keys("X_fused")])


# ─── Família 18 — Quimiometria de Processo / SPC ─────────────────────────────

def test_mspc():
    """mspc takes a single X matrix (builds PCA model and computes T2/SPE)."""
    rng = np.random.default_rng(29)
    X = rng.normal(0, 1, (50, 10)).tolist()
    return smoke("mspc", {"X": X},
        {"n_components": 3, "confidence": 0.95},
        [has_keys("T2", "SPE", "T2_limit", "SPE_limit")])


def test_pca_control_chart():
    """pca_control_chart also takes a single X matrix."""
    rng = np.random.default_rng(30)
    X = rng.normal(0, 1, (40, 8)).tolist()
    return smoke("pca_control_chart", {"X": X},
        {"n_components": 3, "confidence": 0.95},
        [has_keys("scores_new", "SPE", "out_of_control")])


def test_ewma():
    rng = np.random.default_rng(31)
    X = rng.normal(100, 5, (50, 5)).tolist()
    return smoke("ewma", {"X": X}, {"lambda_": 0.2},
        [has_keys("T2_ewma", "T2_limit", "out_of_control")])


# ─── Família 19 — Interpretabilidade ─────────────────────────────────────────

def test_permutation_importance():
    X, y = _Xy()
    return smoke("permutation_importance", {"X": X, "y": y},
        {"model_slug": "pls", "model_params": {"n_components": 3}, "n_repeats": 5},
        [has_keys("importances_mean", "importances_std", "ranking")])


def test_vip_interpretation():
    X, y = _Xy()
    return smoke("vip_interpretation", {"X": X, "y": y},
        {"n_components": 3},
        [has_keys("vip", "important_indices")])


# ─── Família 20 — Utilitários ─────────────────────────────────────────────────

def test_spectrum_simulator():
    """spectrum_simulator uses n_samples and n_vars params."""
    return smoke("spectrum_simulator", {},
        {"n_samples": 5, "n_vars": 100, "snr": 20.0},
        [has_keys("X", "wavenumbers"),
         list_len("X", 5)])


def test_metrics_aggregation():
    """metrics_aggregation input key is 'results' (not 'metrics_list')."""
    results_list = [
        {"RMSEC": 0.5, "R2C": 0.9},
        {"RMSEC": 0.6, "R2C": 0.85},
        {"RMSEC": 0.4, "R2C": 0.92},
    ]
    return smoke("metrics_aggregation", {"results": results_list}, {},
        [has_keys("summary", "n_experiments")])


def test_outlier_detection_utility():
    rng = np.random.default_rng(32)
    X = rng.normal(0, 1, (30, 10)).tolist()
    return smoke("outlier_detection_utility", {"X": X},
        {"method": "iqr"},
        [has_keys("outlier_flags", "scores", "n_outliers")])


# ─── Runner ───────────────────────────────────────────────────────────────────

def run():
    results = [
        # F12 Validação
        test_cross_validation(),
        test_bootstrap(),
        test_permutation_test(),
        # F13 Transferência
        test_pds(),
        test_ds(),
        # F14 Sinais
        test_peak_detection(),
        test_fourier_analysis(),
        test_noise_estimation(),
        # F15 Hiperespectrais
        test_hyperspectral_pca(),
        test_spectral_angle_mapper(),
        # F16 Dados Faltantes
        test_knn_imputation(),
        test_pca_imputation(),
        test_spectral_interpolation(),
        # F17 Fusão
        test_low_level_fusion(),
        test_mid_level_fusion(),
        # F18 SPC
        test_mspc(),
        test_pca_control_chart(),
        test_ewma(),
        # F19 Interpretabilidade
        test_permutation_importance(),
        test_vip_interpretation(),
        # F20 Utilitários
        test_spectrum_simulator(),
        test_metrics_aggregation(),
        test_outlier_detection_utility(),
    ]
    return run_suite(results, "Famílias 12–20 (Validação → Utilitários)")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
