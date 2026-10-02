from __future__ import annotations


# ================================================================
# fusion.py
# ================================================================
"""Fusão de Dados — Família 17"""
import numpy as np
from catalog.base import BaseScript


def _metrics_cal(y_true, y_pred):
    """Métricas de calibração: RMSEC, R2, bias."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float).ravel()
    residuals = y_true - y_pred
    rmsec = float(np.sqrt(np.mean(residuals ** 2)))
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    bias = float(np.mean(residuals))
    return {"RMSEC": rmsec, "R2": r2, "bias": bias, "n": len(y_true)}


class LowLevelFusion(BaseScript):
    slug = "low_level_fusion"
    nome = "Low-Level Data Fusion (concatenation)"
    familia = "17_fusao_dados"
    descricao = "Fusão de baixo nível: concatena blocos de dados (raw ou pré-processados)."

    def validate(self, inputs, params):
        blocks = self._require_key(inputs, "blocks")
        if not isinstance(blocks, list) or len(blocks) < 2:
            raise ValueError("'blocks' deve ser lista com ≥ 2 matrizes.")

    def execute(self, inputs, params):
        from sklearn.preprocessing import StandardScaler

        blocks = [np.asarray(b, dtype=float) for b in inputs["blocks"]]
        block_names = inputs.get("block_names", [f"block_{i}" for i in range(len(blocks))])
        scale_blocks = params.get("scale_blocks", True)

        n_samples = blocks[0].shape[0]
        for i, b in enumerate(blocks):
            if b.shape[0] != n_samples:
                raise ValueError(f"Bloco {i} tem número diferente de amostras.")

        block_info = []
        scaled = []
        for i, b in enumerate(blocks):
            if scale_blocks:
                sc = StandardScaler()
                b_sc = sc.fit_transform(b)
            else:
                b_sc = b
            scaled.append(b_sc)
            block_info.append({"name": block_names[i], "n_vars": b.shape[1]})

        X_fused = np.hstack(scaled)
        return {
            "model": {"type": "low_level_fusion", "n_blocks": len(blocks), "scale_blocks": scale_blocks},
            "X_fused": X_fused.tolist(),
            "block_info": block_info,
            "total_variables": X_fused.shape[1],
        }


class MidLevelFusion(BaseScript):
    slug = "mid_level_fusion"
    nome = "Mid-Level Data Fusion (feature extraction + concatenation)"
    familia = "17_fusao_dados"
    descricao = "Fusão de médio nível: extrai features por PCA de cada bloco, depois concatena."

    def validate(self, inputs, params):
        blocks = self._require_key(inputs, "blocks")
        if not isinstance(blocks, list) or len(blocks) < 2:
            raise ValueError("'blocks' deve ser lista com ≥ 2 matrizes.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from sklearn.preprocessing import StandardScaler

        blocks = [np.asarray(b, dtype=float) for b in inputs["blocks"]]
        block_names = inputs.get("block_names", [f"block_{i}" for i in range(len(blocks))])
        n_comp_per_block = params.get("n_components_per_block", 5)
        variance_threshold = params.get("variance_threshold", None)

        n_samples = blocks[0].shape[0]
        scores_list = []
        block_info = []

        for i, b in enumerate(blocks):
            sc = StandardScaler()
            b_sc = sc.fit_transform(b)
            nc = min(n_comp_per_block, b.shape[0] - 1, b.shape[1])
            pca = PCA(n_components=nc)
            T = pca.fit_transform(b_sc)

            if variance_threshold is not None:
                cumvar = np.cumsum(pca.explained_variance_ratio_)
                keep = int(np.searchsorted(cumvar, variance_threshold)) + 1
                keep = min(keep, nc)
                T = T[:, :keep]

            scores_list.append(T)
            block_info.append({
                "name": block_names[i],
                "n_vars_original": b.shape[1],
                "n_components_kept": T.shape[1],
                "explained_variance": pca.explained_variance_ratio_[:T.shape[1]].tolist(),
            })

        X_fused = np.hstack(scores_list)
        return {
            "model": {"type": "mid_level_fusion", "n_blocks": len(blocks)},
            "X_fused": X_fused.tolist(),
            "block_info": block_info,
            "total_components": X_fused.shape[1],
        }


class HighLevelFusion(BaseScript):
    slug = "high_level_fusion"
    nome = "High-Level Data Fusion (decision fusion)"
    familia = "17_fusao_dados"
    descricao = "Fusão de alto nível: combina predições de modelos individuais por voto ou média."

    def validate(self, inputs, params):
        predictions = self._require_key(inputs, "predictions")
        if not isinstance(predictions, list) or len(predictions) < 2:
            raise ValueError("'predictions' deve ser lista com ≥ 2 vetores de predição.")

    def execute(self, inputs, params):
        preds = [np.asarray(p) for p in inputs["predictions"]]
        model_names = inputs.get("model_names", [f"model_{i}" for i in range(len(preds))])
        strategy = params.get("strategy", "mean")  # mean, vote, weighted_mean
        weights = params.get("weights", None)
        task = params.get("task", "regression")  # regression or classification

        n = preds[0].shape[0]
        P = np.column_stack(preds)  # (n, n_models)

        if weights is not None:
            w = np.asarray(weights, dtype=float)
            w = w / w.sum()
        else:
            w = np.ones(len(preds)) / len(preds)

        if task == "classification" and strategy == "vote":
            from scipy import stats
            y_fused = stats.mode(P, axis=1).mode.ravel()
        elif strategy == "weighted_mean":
            y_fused = P @ w
        else:
            y_fused = P.mean(axis=1)

        return {
            "model": {"type": f"high_level_fusion_{strategy}", "n_models": len(preds)},
            "y_fused": y_fused.tolist(),
            "model_names": model_names,
            "weights_used": w.tolist(),
        }


class KernelFusion(BaseScript):
    slug = "kernel_fusion"
    nome = "Kernel Fusion (MKL-style)"
    familia = "17_fusao_dados"
    descricao = "Combina kernels de múltiplos blocos com pesos otimizados por SVM."

    def validate(self, inputs, params):
        blocks = self._require_key(inputs, "blocks")
        y = self._require_key(inputs, "y")
        if not isinstance(blocks, list) or len(blocks) < 2:
            raise ValueError("'blocks' deve ser lista com ≥ 2 matrizes.")

    def execute(self, inputs, params):
        from sklearn.svm import SVC
        from sklearn.metrics import accuracy_score
        from sklearn.preprocessing import StandardScaler

        blocks = [np.asarray(b, dtype=float) for b in inputs["blocks"]]
        y = np.asarray(inputs["y"])
        kernel_type = params.get("kernel", "rbf")
        gamma = params.get("gamma", 1.0)

        def rbf_kernel(X, gamma=1.0):
            sq_dists = np.sum(X ** 2, axis=1, keepdims=True) + np.sum(X ** 2, axis=1) - 2 * X @ X.T
            return np.exp(-gamma * np.clip(sq_dists, 0, None))

        def linear_kernel(X):
            return X @ X.T

        kernels = []
        for b in blocks:
            sc = StandardScaler()
            b_sc = sc.fit_transform(b)
            if kernel_type == "linear":
                K = linear_kernel(b_sc)
            else:
                K = rbf_kernel(b_sc, gamma=gamma)
            kernels.append(K)

        # Equal-weight combination
        n_blocks = len(blocks)
        K_combined = sum(kernels) / n_blocks

        clf = SVC(kernel="precomputed")
        clf.fit(K_combined, y)
        y_pred = clf.predict(K_combined)
        acc = float(accuracy_score(y, y_pred))

        return {
            "model": {"type": f"kernel_fusion_{kernel_type}", "n_blocks": n_blocks},
            "K_combined": K_combined.tolist(),
            "y_pred": y_pred.tolist(),
            "accuracy": acc,
        }


class SOCOFUSFusion(BaseScript):
    slug = "socofus"
    nome = "SOCOFUS — Sequential / Orthogonalized PLS Fusion"
    familia = "17_fusao_dados"
    descricao = "Fusão sequencial: modela cada bloco como resíduo após remoção de variância explicada."

    def validate(self, inputs, params):
        blocks = self._require_key(inputs, "blocks")
        y = self._require_key(inputs, "y")
        if not isinstance(blocks, list) or len(blocks) < 2:
            raise ValueError("'blocks' deve ser lista com ≥ 2 matrizes.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        blocks = [np.asarray(b, dtype=float) for b in inputs["blocks"]]
        y = np.asarray(inputs["y"], dtype=float)
        block_names = inputs.get("block_names", [f"block_{i}" for i in range(len(blocks))])
        n_comp = params.get("n_components", 3)

        n_samples = blocks[0].shape[0]
        y_residual = y - y.mean()
        block_results = []
        T_all = []

        for i, b in enumerate(blocks):
            nc = min(n_comp, b.shape[0] - 1, b.shape[1])
            pls = PLSRegression(n_components=nc)
            pls.fit(b, y_residual)
            T = pls.transform(b)
            y_hat = pls.predict(b).ravel()
            y_residual = y_residual - y_hat
            T_all.append(T)
            block_results.append({
                "name": block_names[i],
                "n_components": nc,
                "y_hat": y_hat.tolist(),
            })

        T_fused = np.hstack(T_all)
        nc_total = min(n_comp, T_fused.shape[1])
        pls_final = PLSRegression(n_components=nc_total)
        pls_final.fit(T_fused, y)
        y_pred = pls_final.predict(T_fused).ravel()
        metrics = _metrics_cal(y, y_pred)

        return {
            "model": {"type": "socofus", "n_blocks": len(blocks)},
            "block_results": block_results,
            "metrics": metrics,
            "y_pred": y_pred.tolist(),
        }

