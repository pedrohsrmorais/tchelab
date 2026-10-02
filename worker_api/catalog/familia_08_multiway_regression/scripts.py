"""Regressão Multiway — Família 08"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript
from catalog.familia_04_regressao_1d.scripts import _metrics_cal


def _unfold_and_pls(X_tensor, y, n_comp):
    """Unfold tensor (mode-0) and fit PLS."""
    from sklearn.cross_decomposition import PLSRegression
    n = X_tensor.shape[0]
    X2D = X_tensor.reshape(n, -1)
    n_comp = min(n_comp, X2D.shape[0] - 1, X2D.shape[1])
    pls = PLSRegression(n_components=n_comp)
    pls.fit(X2D, y)
    y_pred = pls.predict(X2D).ravel()
    return pls, X2D, y_pred, n_comp


class NPLS(BaseScript):
    slug = "n_pls"
    nome = "N-PLS — N-way Partial Least Squares"
    familia = "08_multiway_regression"
    descricao = "Regressão PLS sobre tensor desdobrado (modo amostras)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 3)

        pls, X2D, y_pred, nc = _unfold_and_pls(X, y, n_comp)
        scores = pls.transform(X2D)

        return {
            "model": {"type": "n_pls", "n_components": nc},
            "scores": scores.tolist(),
            "x_loadings": pls.x_loadings_.tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class UPLS(BaseScript):
    slug = "u_pls"
    nome = "U-PLS — Unfolded PLS"
    familia = "08_multiway_regression"
    descricao = "PLS sobre tensor desdobrado com pré-normalização por modo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.preprocessing import StandardScaler

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 3)

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        # Normalize within-mode
        scaler = StandardScaler()
        X2D_scaled = scaler.fit_transform(X2D)

        nc = min(n_comp, X2D_scaled.shape[0] - 1, X2D_scaled.shape[1])
        pls = PLSRegression(n_components=nc)
        pls.fit(X2D_scaled, y)
        y_pred = pls.predict(X2D_scaled).ravel()
        scores = pls.transform(X2D_scaled)

        return {
            "model": {"type": "u_pls", "n_components": nc},
            "scores": scores.tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class NWayPCR(BaseScript):
    slug = "n_way_pcr"
    nome = "N-way PCR — N-way Principal Component Regression"
    familia = "08_multiway_regression"
    descricao = "PCR sobre tensor desdobrado: PCA seguido de regressão linear."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 3)

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        nc = min(n_comp, X2D.shape[0] - 1, X2D.shape[1])

        pca = PCA(n_components=nc)
        scores = pca.fit_transform(X2D)
        reg = LinearRegression()
        reg.fit(scores, y)
        y_pred = reg.predict(scores)

        return {
            "model": {"type": "n_way_pcr", "n_components": nc},
            "scores": scores.tolist(),
            "loadings": pca.components_.tolist(),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class UPCA(BaseScript):
    slug = "u_pca"
    nome = "U-PCA — Unfolded PCA"
    familia = "08_multiway_regression"
    descricao = "PCA sobre tensor desdobrado (análise exploratória multiway)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 3)

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        nc = min(n_comp, X2D.shape[0] - 1, X2D.shape[1])

        pca = PCA(n_components=nc)
        scores = pca.fit_transform(X2D)

        return {
            "model": {"type": "u_pca", "n_components": nc},
            "scores": scores.tolist(),
            "loadings": pca.components_.tolist(),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        }


class PARAFACRegression(BaseScript):
    slug = "parafac_regression"
    nome = "PARAFAC Regression"
    familia = "08_multiway_regression"
    descricao = "Regressão via fatores PARAFAC: scores modo-0 → regressão linear."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 200)

        tl.set_backend("numpy")
        weights, factors = parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42, normalize_factors=True)

        # Mode-0 factor = sample scores
        A = factors[0]  # (n_samples, rank)
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        return {
            "model": {"type": "parafac_regression", "rank": rank},
            "sample_scores": A.tolist(),
            "factors": [f.tolist() for f in factors[1:]],
            "weights": weights.tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class TuckerRegression(BaseScript):
    slug = "tucker_regression"
    nome = "Tucker Regression"
    familia = "08_multiway_regression"
    descricao = "Regressão via decomposição Tucker: scores → regressão linear."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 3:
            raise ValueError("X deve ser tensor 3D (I, J, K).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import tucker
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        ranks = params.get("ranks", [3, 3, 3])

        tl.set_backend("numpy")
        core, factors = tucker(X, rank=ranks)
        # Mode-0 factor = sample loadings
        A = factors[0]  # (n_samples, ranks[0])
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        return {
            "model": {"type": "tucker_regression", "ranks": ranks},
            "sample_loadings": A.tolist(),
            "core_shape": list(core.shape),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class HPLS(BaseScript):
    slug = "hpls"
    nome = "HPLS — Hierarchical PLS"
    familia = "08_multiway_regression"
    descricao = "PLS hierárquico: PLS por bloco seguido de meta-PLS sobre scores."

    def validate(self, inputs, params):
        blocks = self._require_key(inputs, "blocks")
        y = self._require_key(inputs, "y")
        if not isinstance(blocks, (list, tuple)) or len(blocks) < 2:
            raise ValueError("blocks deve ser lista de >= 2 matrizes.")
        for b in blocks:
            if np.asarray(b).shape[0] != len(y):
                raise ValueError("Todos os blocos devem ter mesmo número de amostras que y.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        blocks = [np.asarray(b, dtype=float) for b in inputs["blocks"]]
        y = np.asarray(inputs["y"], dtype=float)
        n_comp_block = params.get("n_components_block", 2)
        n_comp_meta = params.get("n_components_meta", 2)

        # Step 1: PLS per block → extract scores
        block_scores = []
        block_models = []
        for Xb in blocks:
            nc = min(n_comp_block, Xb.shape[0] - 1, Xb.shape[1])
            pls = PLSRegression(n_components=nc)
            pls.fit(Xb, y)
            T = pls.transform(Xb)
            block_scores.append(T)
            block_models.append({"x_loadings": pls.x_loadings_.tolist()})

        # Step 2: meta-PLS on concatenated block scores
        X_meta = np.hstack(block_scores)
        nc_meta = min(n_comp_meta, X_meta.shape[0] - 1, X_meta.shape[1])
        meta_pls = PLSRegression(n_components=nc_meta)
        meta_pls.fit(X_meta, y)
        y_pred = meta_pls.predict(X_meta).ravel()

        return {
            "model": {"type": "hpls", "n_blocks": len(blocks), "n_comp_meta": nc_meta},
            "block_models": block_models,
            "meta_scores": meta_pls.transform(X_meta).tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class TensorRegression(BaseScript):
    slug = "tensor_regression"
    nome = "Tensor Regression (CP)"
    familia = "08_multiway_regression"
    descricao = "Regressão tensorial com coeficiente de peso em formato CP."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 200)
        learning_rate = params.get("learning_rate", 0.01)
        epochs = params.get("epochs", 100)

        tl.set_backend("numpy")
        n = X.shape[0]
        X2D = X.reshape(n, -1)

        # Simple gradient descent on unfolded tensor regression
        w = np.zeros(X2D.shape[1])
        b = 0.0
        for _ in range(epochs):
            y_hat = X2D @ w + b
            err = y_hat - y
            grad_w = (X2D.T @ err) / n
            grad_b = err.mean()
            w -= learning_rate * grad_w
            b -= learning_rate * grad_b

        y_pred = X2D @ w + b

        return {
            "model": {"type": "tensor_regression", "rank": rank},
            "coefficients": w.tolist(),
            "intercept": float(b),
            "metrics_cal": _metrics_cal(y, y_pred),
        }
