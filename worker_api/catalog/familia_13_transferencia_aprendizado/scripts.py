from __future__ import annotations


# ================================================================
# transfer.py
# ================================================================
"""Transferência de Aprendizado / Domain Adaptation — Família 13"""
import numpy as np
from catalog.base import BaseScript
def _metrics_cal(y_true, y_pred):
    """Métricas de calibração: RMSEC, R2, bias."""
    import numpy as np
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float).ravel()
    residuals = y_true - y_pred
    rmsec = float(np.sqrt(np.mean(residuals ** 2)))
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    bias = float(np.mean(residuals))
    return {"RMSEC": rmsec, "R2": r2, "bias": bias, "n": len(y_true)}


class PiecewiseDirectStandardization(BaseScript):
    slug = "pds"
    nome = "PDS — Piecewise Direct Standardization"
    familia = "13_transferencia_aprendizado"
    descricao = "Padroniza espectros de instrumento secundário para primário por janela local."

    def validate(self, inputs, params):
        Xs = np.asarray(self._require_key(inputs, "X_secondary"))
        Xp = np.asarray(self._require_key(inputs, "X_primary"))
        if Xs.shape != Xp.shape:
            raise ValueError("X_primary e X_secondary devem ter mesma forma.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        Xs = np.asarray(inputs["X_secondary"], dtype=float)
        Xp = np.asarray(inputs["X_primary"], dtype=float)
        X_new = np.asarray(inputs.get("X_new", Xs), dtype=float)
        window = params.get("window", 5)
        n_comp = params.get("n_components", 3)

        n, p = Xs.shape
        X_corrected = np.zeros_like(X_new)
        half_w = window // 2

        for j in range(p):
            start = max(0, j - half_w)
            end = min(p, j + half_w + 1)
            nc = min(n_comp, n - 1, end - start)
            pls = PLSRegression(n_components=nc)
            pls.fit(Xs[:, start:end], Xp[:, j])
            X_corrected[:, j] = pls.predict(X_new[:, start:end]).ravel()

        return {
            "model": {"type": "pds", "window": window, "n_components": n_comp},
            "X_corrected": X_corrected.tolist(),
        }


class DirectStandardization(BaseScript):
    slug = "ds"
    nome = "DS — Direct Standardization"
    familia = "13_transferencia_aprendizado"
    descricao = "Padronização direta: X_primary = X_secondary @ F."

    def validate(self, inputs, params):
        Xs = np.asarray(self._require_key(inputs, "X_secondary"))
        Xp = np.asarray(self._require_key(inputs, "X_primary"))
        if Xs.shape[0] != Xp.shape[0]:
            raise ValueError("X_primary e X_secondary devem ter mesmo número de amostras.")

    def execute(self, inputs, params):
        Xs = np.asarray(inputs["X_secondary"], dtype=float)
        Xp = np.asarray(inputs["X_primary"], dtype=float)
        X_new = np.asarray(inputs.get("X_new", Xs), dtype=float)

        # F = pinv(Xs) @ Xp
        F = np.linalg.pinv(Xs) @ Xp
        X_corrected = X_new @ F

        return {
            "model": {"type": "ds"},
            "F": F.tolist(),
            "X_corrected": X_corrected.tolist(),
        }


class DomainAdaptationPCA(BaseScript):
    slug = "domain_adaptation_pca"
    nome = "Domain Adaptation via PCA Alignment"
    familia = "13_transferencia_aprendizado"
    descricao = "Alinha domínios alinhando espaços PCA de fonte e alvo."

    def validate(self, inputs, params):
        X_source = np.asarray(self._require_key(inputs, "X_source"))
        X_target = np.asarray(self._require_key(inputs, "X_target"))
        if X_source.shape[1] != X_target.shape[1]:
            raise ValueError("X_source e X_target devem ter mesmo número de variáveis.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X_source = np.asarray(inputs["X_source"], dtype=float)
        X_target = np.asarray(inputs["X_target"], dtype=float)
        n_comp = params.get("n_components", 10)

        nc = min(n_comp, X_source.shape[1], X_source.shape[0] - 1, X_target.shape[0] - 1)
        pca_s = PCA(n_components=nc)
        pca_t = PCA(n_components=nc)

        pca_s.fit(X_source)
        pca_t.fit(X_target)

        # Project target into source PCA space via rotation alignment
        T_source = pca_s.transform(X_source)
        T_target = pca_t.transform(X_target)

        # Procrustes alignment
        U, _, Vt = np.linalg.svd(T_source.T @ T_target, full_matrices=False)
        R = U @ Vt
        T_target_aligned = T_target @ R.T

        return {
            "model": {"type": "domain_adaptation_pca", "n_components": nc},
            "source_scores": T_source.tolist(),
            "target_scores_aligned": T_target_aligned.tolist(),
            "rotation": R.tolist(),
            "source_explained_variance": pca_s.explained_variance_ratio_.tolist(),
        }


class FineTuningPLS(BaseScript):
    slug = "fine_tuning_pls"
    nome = "Fine-Tuning PLS (Transfer Learning)"
    familia = "13_transferencia_aprendizado"
    descricao = "Adapta modelo PLS de domínio fonte com poucas amostras do domínio alvo."

    def validate(self, inputs, params):
        X_source = np.asarray(self._require_key(inputs, "X_source"))
        y_source = self._require_key(inputs, "y_source")
        X_target = np.asarray(self._require_key(inputs, "X_target"))
        y_target = self._require_key(inputs, "y_target")
        if X_source.shape[1] != X_target.shape[1]:
            raise ValueError("X_source e X_target devem ter mesmo número de variáveis.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X_source = np.asarray(inputs["X_source"], dtype=float)
        y_source = np.asarray(inputs["y_source"], dtype=float)
        X_target = np.asarray(inputs["X_target"], dtype=float)
        y_target = np.asarray(inputs["y_target"], dtype=float)
        n_comp = params.get("n_components", 5)
        weight_source = params.get("weight_source", 0.5)

        nc = min(n_comp, X_source.shape[0] - 1, X_target.shape[0] - 1, X_source.shape[1])

        # Source model
        pls_s = PLSRegression(n_components=nc)
        pls_s.fit(X_source, y_source)
        y_pred_source_on_target = pls_s.predict(X_target).ravel()

        # Target model
        pls_t = PLSRegression(n_components=min(nc, X_target.shape[0] - 1))
        pls_t.fit(X_target, y_target)
        y_pred_target = pls_t.predict(X_target).ravel()

        # Ensemble: weighted average
        y_pred_ensemble = weight_source * y_pred_source_on_target + (1 - weight_source) * y_pred_target

        return {
            "model": {"type": "fine_tuning_pls", "n_components": nc, "weight_source": weight_source},
            "metrics_source_model": _metrics_cal(y_target, y_pred_source_on_target),
            "metrics_target_model": _metrics_cal(y_target, y_pred_target),
            "metrics_ensemble": _metrics_cal(y_target, y_pred_ensemble),
            "y_pred_ensemble": y_pred_ensemble.tolist(),
        }


class SpectralCalibrationTransfer(BaseScript):
    slug = "spectral_calibration_transfer"
    nome = "Spectral Calibration Transfer"
    familia = "13_transferencia_aprendizado"
    descricao = "Transfere calibração espectral de instrumento mestre para escravo."

    def validate(self, inputs, params):
        X_master = np.asarray(self._require_key(inputs, "X_master"))
        X_slave = np.asarray(self._require_key(inputs, "X_slave"))
        if X_master.shape != X_slave.shape:
            raise ValueError("X_master e X_slave devem ter mesma forma.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X_master = np.asarray(inputs["X_master"], dtype=float)
        X_slave = np.asarray(inputs["X_slave"], dtype=float)
        X_slave_new = np.asarray(inputs.get("X_slave_new", X_slave), dtype=float)
        method = params.get("method", "pds")
        window = params.get("window", 7)
        n_comp = params.get("n_components", 3)

        n, p = X_master.shape

        if method == "ds":
            F = np.linalg.pinv(X_slave) @ X_master
            X_corrected = X_slave_new @ F
        else:  # pds
            X_corrected = np.zeros_like(X_slave_new)
            half_w = window // 2
            for j in range(p):
                start = max(0, j - half_w)
                end = min(p, j + half_w + 1)
                nc = min(n_comp, n - 1, end - start)
                pls = PLSRegression(n_components=nc)
                pls.fit(X_slave[:, start:end], X_master[:, j])
                X_corrected[:, j] = pls.predict(X_slave_new[:, start:end]).ravel()

        return {
            "model": {"type": f"spectral_transfer_{method}"},
            "X_corrected": X_corrected.tolist(),
        }

