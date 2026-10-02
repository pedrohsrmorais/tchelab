from __future__ import annotations


# ================================================================
# imputation.py
# ================================================================
"""Dados Faltantes / Imputação — Família 16"""
import numpy as np
from catalog.base import BaseScript


class KNNImputation(BaseScript):
    slug = "knn_imputation"
    nome = "KNN Imputation"
    familia = "16_dados_faltantes"
    descricao = "Imputa valores faltantes por K vizinhos mais próximos."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=object)
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.impute import KNNImputer

        X = np.asarray(inputs["X"], dtype=float)
        n_neighbors = params.get("n_neighbors", 5)
        weights = params.get("weights", "uniform")

        imputer = KNNImputer(n_neighbors=n_neighbors, weights=weights)
        X_imputed = imputer.fit_transform(X)
        missing_mask = np.isnan(np.asarray(inputs["X"], dtype=float))

        return {
            "model": {"type": "knn_imputation", "n_neighbors": n_neighbors},
            "X_imputed": X_imputed.tolist(),
            "n_missing": int(missing_mask.sum()),
            "missing_fraction": float(missing_mask.mean()),
        }


class IterativeImputation(BaseScript):
    slug = "iterative_imputation"
    nome = "Iterative Imputation (MICE)"
    familia = "16_dados_faltantes"
    descricao = "Imputação iterativa multivariada (MICE) via IterativeImputer."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=object)
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.experimental import enable_iterative_imputer  # noqa
        from sklearn.impute import IterativeImputer

        X = np.asarray(inputs["X"], dtype=float)
        max_iter = params.get("max_iter", 10)
        random_state = params.get("random_state", 42)
        estimator_type = params.get("estimator", "bayesian_ridge")

        if estimator_type == "random_forest":
            from sklearn.ensemble import RandomForestRegressor
            estimator = RandomForestRegressor(n_estimators=50, random_state=random_state)
        else:
            from sklearn.linear_model import BayesianRidge
            estimator = BayesianRidge()

        imputer = IterativeImputer(
            estimator=estimator, max_iter=max_iter, random_state=random_state
        )
        X_imputed = imputer.fit_transform(X)
        missing_mask = np.isnan(np.asarray(inputs["X"], dtype=float))

        return {
            "model": {"type": f"iterative_imputation_{estimator_type}", "max_iter": max_iter},
            "X_imputed": X_imputed.tolist(),
            "n_missing": int(missing_mask.sum()),
            "n_iterations": imputer.n_iter_,
        }


class MatrixCompletion(BaseScript):
    slug = "matrix_completion"
    nome = "Matrix Completion (SVD / Nuclear Norm)"
    familia = "16_dados_faltantes"
    descricao = "Completa matriz com valores faltantes por SVD truncado iterativo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=object)
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        X_raw = np.asarray(inputs["X"], dtype=float)
        missing_mask = np.isnan(X_raw)
        rank = params.get("rank", 3)
        max_iter = params.get("max_iter", 100)
        tol = params.get("tol", 1e-4)

        # Initialize: fill NaN with column means
        col_means = np.nanmean(X_raw, axis=0)
        col_means = np.where(np.isnan(col_means), 0.0, col_means)
        X_filled = X_raw.copy()
        for j in range(X_filled.shape[1]):
            X_filled[np.isnan(X_filled[:, j]), j] = col_means[j]

        r = min(rank, min(X_raw.shape) - 1)
        prev_loss = np.inf

        for _ in range(max_iter):
            U, s, Vt = np.linalg.svd(X_filled, full_matrices=False)
            X_approx = (U[:, :r] * s[:r]) @ Vt[:r, :]
            X_filled[missing_mask] = X_approx[missing_mask]
            loss = float(np.mean((X_filled[~missing_mask] - X_approx[~missing_mask]) ** 2))
            if abs(prev_loss - loss) < tol:
                break
            prev_loss = loss

        return {
            "model": {"type": "matrix_completion_svd", "rank": r},
            "X_imputed": X_filled.tolist(),
            "n_missing": int(missing_mask.sum()),
            "final_loss": loss,
        }


class SpectralInterpolation(BaseScript):
    slug = "spectral_interpolation"
    nome = "Spectral Interpolation (linear / cubic / pchip)"
    familia = "16_dados_faltantes"
    descricao = "Interpola regiões faltantes em espectros por interpolação 1D."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=object)
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser 1D ou 2D (n_samples, n_vars).")

    def execute(self, inputs, params):
        from scipy.interpolate import interp1d, PchipInterpolator

        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "linear")  # linear, cubic, pchip
        wavenumbers = inputs.get("wavenumbers", None)

        if X.ndim == 1:
            spectra = X[np.newaxis, :]
        else:
            spectra = X

        n, p = spectra.shape
        wn = np.asarray(wavenumbers) if wavenumbers is not None else np.arange(p, dtype=float)
        X_interp = np.zeros_like(spectra)

        for i, row in enumerate(spectra):
            mask = ~np.isnan(row)
            if mask.sum() < 2:
                X_interp[i] = row
                continue
            if method == "pchip":
                f = PchipInterpolator(wn[mask], row[mask])
                X_interp[i] = f(wn)
            else:
                kind = "linear" if method == "linear" else "cubic"
                f = interp1d(wn[mask], row[mask], kind=kind,
                             bounds_error=False, fill_value="extrapolate")
                X_interp[i] = f(wn)

        missing_mask = np.isnan(spectra)
        return {
            "model": {"type": f"spectral_interpolation_{method}"},
            "X_imputed": X_interp.tolist() if X.ndim == 2 else X_interp[0].tolist(),
            "n_missing": int(missing_mask.sum()),
        }


class PCAImputation(BaseScript):
    slug = "pca_imputation"
    nome = "PCA-Based Imputation (NIPALS)"
    familia = "16_dados_faltantes"
    descricao = "Imputa valores faltantes via PCA iterativa (algoritmo NIPALS)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=object)
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        X_raw = np.asarray(inputs["X"], dtype=float)
        missing_mask = np.isnan(X_raw)
        n_components = params.get("n_components", 3)
        max_iter = params.get("max_iter", 50)
        tol = params.get("tol", 1e-4)

        # Initialize missing with column means
        col_means = np.nanmean(X_raw, axis=0)
        col_means = np.where(np.isnan(col_means), 0.0, col_means)
        X_filled = X_raw.copy()
        for j in range(X_filled.shape[1]):
            X_filled[np.isnan(X_filled[:, j]), j] = col_means[j]

        nc = min(n_components, X_raw.shape[0] - 1, X_raw.shape[1])
        prev_loss = np.inf

        for _ in range(max_iter):
            from sklearn.decomposition import PCA
            pca = PCA(n_components=nc)
            scores = pca.fit_transform(X_filled)
            X_approx = pca.inverse_transform(scores)
            X_filled[missing_mask] = X_approx[missing_mask]
            obs_mask = ~missing_mask
            loss = float(np.mean((X_filled[obs_mask] - X_approx[obs_mask]) ** 2))
            if abs(prev_loss - loss) < tol:
                break
            prev_loss = loss

        return {
            "model": {"type": "pca_imputation", "n_components": nc},
            "X_imputed": X_filled.tolist(),
            "n_missing": int(missing_mask.sum()),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        }

