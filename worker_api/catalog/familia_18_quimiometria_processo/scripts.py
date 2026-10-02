from __future__ import annotations


# ================================================================
# spc.py
# ================================================================
"""Quimiometria de Processo — Família 18"""
import numpy as np
from catalog.base import BaseScript


class MSPC(BaseScript):
    slug = "mspc"
    nome = "MSPC — Multivariate Statistical Process Control"
    familia = "18_quimiometria_processo"
    descricao = "Controle estatístico de processo multivariado: Hotelling T² e SPE/Q."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_samples, n_vars).")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from scipy import stats

        X = np.asarray(inputs["X"], dtype=float)
        X_new = np.asarray(inputs.get("X_new", X), dtype=float)
        n_components = params.get("n_components", 3)
        alpha = params.get("alpha", 0.05)

        n, p = X.shape
        nc = min(n_components, n - 1, p)

        pca = PCA(n_components=nc)
        T_cal = pca.fit_transform(X)
        X_cal_rec = pca.inverse_transform(T_cal)

        # Hotelling T² limits (chi2 approximation)
        cov_T = np.cov(T_cal.T)
        if nc == 1:
            cov_T = np.array([[cov_T]])
        cov_inv = np.linalg.pinv(cov_T)

        T2_cal = np.array([t @ cov_inv @ t for t in T_cal])
        T2_limit = float(stats.chi2.ppf(1 - alpha, df=nc))

        # SPE (Q statistic)
        E_cal = X - X_cal_rec
        SPE_cal = np.sum(E_cal ** 2, axis=1)
        SPE_mean = float(SPE_cal.mean())
        SPE_var = float(SPE_cal.var())
        g = SPE_var / (2 * SPE_mean) if SPE_mean > 0 else 1.0
        h = 2 * SPE_mean ** 2 / SPE_var if SPE_var > 0 else 1.0
        SPE_limit = float(g * stats.chi2.ppf(1 - alpha, df=h))

        # New samples
        T_new = pca.transform(X_new)
        X_new_rec = pca.inverse_transform(T_new)
        T2_new = np.array([t @ cov_inv @ t for t in T_new])
        E_new = X_new - X_new_rec
        SPE_new = np.sum(E_new ** 2, axis=1)

        out_of_control_T2 = (T2_new > T2_limit).tolist()
        out_of_control_SPE = (SPE_new > SPE_limit).tolist()

        return {
            "model": {"type": "mspc", "n_components": nc, "alpha": alpha},
            "T2": T2_new.tolist(),
            "SPE": SPE_new.tolist(),
            "T2_limit": T2_limit,
            "SPE_limit": SPE_limit,
            "out_of_control_T2": out_of_control_T2,
            "out_of_control_SPE": out_of_control_SPE,
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        }


class PCAControlChart(BaseScript):
    slug = "pca_control_chart"
    nome = "PCA Control Chart (T² e Q por componente)"
    familia = "18_quimiometria_processo"
    descricao = "Gráficos de controle T² e Q por componente principal."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from scipy import stats

        X = np.asarray(inputs["X"], dtype=float)
        X_new = np.asarray(inputs.get("X_new", X), dtype=float)
        n_components = params.get("n_components", 3)
        alpha = params.get("alpha", 0.05)

        n, p = X.shape
        nc = min(n_components, n - 1, p)
        pca = PCA(n_components=nc)
        T_cal = pca.fit_transform(X)

        # Per-component control limits (±3σ)
        comp_means = T_cal.mean(axis=0)
        comp_stds = T_cal.std(axis=0)
        ucl = (comp_means + 3 * comp_stds).tolist()
        lcl = (comp_means - 3 * comp_stds).tolist()

        T_new = pca.transform(X_new)
        X_new_rec = pca.inverse_transform(T_new)
        SPE = np.sum((X_new - X_new_rec) ** 2, axis=1)

        return {
            "model": {"type": "pca_control_chart", "n_components": nc},
            "scores_new": T_new.tolist(),
            "UCL_scores": ucl,
            "LCL_scores": lcl,
            "SPE": SPE.tolist(),
            "out_of_control": [
                any(T_new[i, k] > ucl[k] or T_new[i, k] < lcl[k] for k in range(nc))
                for i in range(len(X_new))
            ],
        }


class EWMA(BaseScript):
    slug = "ewma"
    nome = "EWMA — Exponentially Weighted Moving Average"
    familia = "18_quimiometria_processo"
    descricao = "Gráfico EWMA univariado ou multivariado para detecção de pequenos desvios."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser 1D ou 2D.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        lam = params.get("lambda", 0.2)
        L = params.get("L", 3.0)  # sigma multiplier for control limits

        if X.ndim == 1:
            mu = float(X.mean())
            sigma = float(X.std())
            Z = np.zeros(len(X))
            Z[0] = lam * X[0] + (1 - lam) * mu
            for i in range(1, len(X)):
                Z[i] = lam * X[i] + (1 - lam) * Z[i - 1]
            sigma_z = sigma * np.sqrt(lam / (2 - lam) * (1 - (1 - lam) ** (2 * np.arange(1, len(X) + 1))))
            UCL = (mu + L * sigma_z).tolist()
            LCL = (mu - L * sigma_z).tolist()
            out_of_control = [z > u or z < l for z, u, l in zip(Z, UCL, LCL)]
            return {
                "model": {"type": "ewma_univariate", "lambda": lam, "L": L},
                "Z": Z.tolist(), "UCL": UCL, "LCL": LCL,
                "out_of_control": out_of_control,
            }
        else:
            n, p = X.shape
            mu = X.mean(axis=0)
            Sigma = np.cov(X.T)
            Sigma_inv = np.linalg.pinv(Sigma)
            Z = np.zeros_like(X)
            Z[0] = lam * X[0] + (1 - lam) * mu
            for i in range(1, n):
                Z[i] = lam * X[i] + (1 - lam) * Z[i - 1]
            T2 = np.array([z @ Sigma_inv @ z for z in Z - mu])
            limit = float((lam / (2 - lam)) * p * (1 + 1 / n))  # approximate
            return {
                "model": {"type": "ewma_multivariate", "lambda": lam},
                "T2_ewma": T2.tolist(),
                "T2_limit": limit,
                "out_of_control": (T2 > limit).tolist(),
            }


class BatchPCA(BaseScript):
    slug = "batch_pca"
    nome = "Batch PCA (MPCA for batch processes)"
    familia = "18_quimiometria_processo"
    descricao = "PCA para dados de processo em batelada: desdobra tensor (batch, tempo, variáveis)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 3:
            raise ValueError("X deve ser 3D (n_batches, n_time, n_vars).")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        n_components = params.get("n_components", 3)
        unfold_mode = params.get("unfold_mode", "batch")  # batch or variable

        I, J, K = X.shape  # batches, time, variables
        if unfold_mode == "variable":
            # Unfold: (I, J*K) — batch-wise unfolding
            X2D = X.reshape(I, J * K)
        else:
            # Unfold: (I*J, K) — observation-wise
            X2D = X.reshape(I * J, K)

        nc = min(n_components, X2D.shape[0] - 1, X2D.shape[1])
        pca = PCA(n_components=nc)
        T = pca.fit_transform(X2D)
        X_rec = pca.inverse_transform(T)
        SPE = np.sum((X2D - X_rec) ** 2, axis=1)

        return {
            "model": {"type": "batch_pca", "n_components": nc, "unfold_mode": unfold_mode,
                      "original_shape": list(X.shape)},
            "scores": T.tolist(),
            "SPE": SPE.tolist(),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
            "loadings": pca.components_.tolist(),
        }


class CUSUMChart(BaseScript):
    slug = "cusum_chart"
    nome = "CUSUM — Cumulative Sum Control Chart"
    familia = "18_quimiometria_processo"
    descricao = "Gráfico CUSUM para detecção de pequenas mudanças na média do processo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 1:
            raise ValueError("X deve ser vetor 1D.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        k = params.get("k", 0.5)   # allowance (slack value)
        h = params.get("h", 4.0)   # decision interval
        mu0 = params.get("mu0", float(X.mean()))
        sigma = params.get("sigma", float(X.std()))

        n = len(X)
        C_plus = np.zeros(n)
        C_minus = np.zeros(n)

        for i in range(1, n):
            xi_std = (X[i] - mu0) / (sigma + 1e-12)
            C_plus[i] = max(0, C_plus[i - 1] + xi_std - k)
            C_minus[i] = max(0, C_minus[i - 1] - xi_std - k)

        out_of_control = ((C_plus > h) | (C_minus > h)).tolist()

        return {
            "model": {"type": "cusum", "k": k, "h": h, "mu0": mu0, "sigma": sigma},
            "C_plus": C_plus.tolist(),
            "C_minus": C_minus.tolist(),
            "UCL": h,
            "out_of_control": out_of_control,
            "n_alarms": int(sum(out_of_control)),
        }

