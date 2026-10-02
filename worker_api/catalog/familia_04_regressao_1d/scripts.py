"""Regressão 1D — Família 04"""
from __future__ import annotations
from typing import Any
import numpy as np
from catalog.base import BaseScript


def _metrics_cal(y_true, y_pred):
    from sklearn.metrics import r2_score, mean_squared_error
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    bias = float(np.mean(y_pred - y_true))
    return {"RMSEC": rmse, "R2C": r2, "bias": bias}


class OLS(BaseScript):
    slug = "ols"
    nome = "OLS — Mínimos Quadrados Ordinários"
    familia = "04_regressao_1d"
    descricao = "Regressão linear por mínimos quadrados ordinários."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from sklearn.linear_model import LinearRegression
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        model = LinearRegression()
        model.fit(X, y)
        y_pred = model.predict(X)
        return {
            "model": {"type": "ols", "coef": model.coef_.tolist(), "intercept": float(model.intercept_)},
            "coefficients": model.coef_.tolist(),
            "intercept": float(model.intercept_),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class PLS(BaseScript):
    slug = "pls"
    nome = "PLS — Partial Least Squares Regression"
    familia = "04_regressao_1d"
    descricao = "PLS1 ou PLS2 conforme shape de Y."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        Y = np.asarray(self._require_key(inputs, "Y"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        if X.shape[0] != (Y.shape[0] if Y.ndim > 1 else len(Y)):
            raise ValueError("X e Y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        X = np.asarray(inputs["X"], dtype=float)
        Y = np.asarray(inputs["Y"], dtype=float)
        n_comp = params.get("n_components", 5)
        n_comp = min(n_comp, X.shape[1], X.shape[0] - 1)
        scale = params.get("scale", False)

        pls = PLSRegression(n_components=n_comp, scale=scale)
        pls.fit(X, Y)
        Y_pred = pls.predict(X)

        # Regression vector (PLS1): b = W(P'W)^-1 q
        reg_vec = pls.coef_.squeeze().tolist()

        return {
            "model": {
                "type": "pls",
                "n_components": n_comp,
                "x_weights": pls.x_weights_.tolist(),
                "x_loadings": pls.x_loadings_.tolist(),
                "y_loadings": pls.y_loadings_.tolist(),
            },
            "x_scores": pls.x_scores_,
            "x_loadings": pls.x_loadings_,
            "y_loadings": pls.y_loadings_,
            "x_weights": pls.x_weights_,
            "regression_vector": reg_vec,
            "metrics_cal": _metrics_cal(Y.ravel(), Y_pred.ravel()),
        }


class PCR(BaseScript):
    slug = "pcr"
    nome = "PCR — Regressão por Componentes Principais"
    familia = "04_regressao_1d"
    descricao = "PCA + regressão linear nos scores."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from sklearn.linear_model import LinearRegression
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        n_comp = min(n_comp, X.shape[1], X.shape[0] - 1)

        pca = PCA(n_components=n_comp)
        scores = pca.fit_transform(X)
        reg = LinearRegression()
        reg.fit(scores, y)
        y_pred = reg.predict(scores)

        return {
            "model": {"type": "pcr", "n_components": n_comp},
            "scores": scores,
            "loadings": pca.components_.T,
            "coefficients": reg.coef_.tolist(),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class Ridge(BaseScript):
    slug = "ridge"
    nome = "Ridge Regression"
    familia = "04_regressao_1d"
    descricao = "Regressão Ridge (regularização L2)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.linear_model import Ridge as SKRidge
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        alpha = params.get("alpha", 1.0)
        m = SKRidge(alpha=alpha)
        m.fit(X, y)
        y_pred = m.predict(X)
        return {
            "model": {"type": "ridge", "alpha": alpha, "coef": m.coef_.tolist()},
            "coefficients": m.coef_.tolist(),
            "intercept": float(m.intercept_),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class Lasso(BaseScript):
    slug = "lasso"
    nome = "Lasso Regression"
    familia = "04_regressao_1d"
    descricao = "Regressão Lasso (regularização L1)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.linear_model import Lasso as SKLasso
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        alpha = params.get("alpha", 1.0)
        m = SKLasso(alpha=alpha, max_iter=10000)
        m.fit(X, y)
        y_pred = m.predict(X)
        return {
            "model": {"type": "lasso", "alpha": alpha, "coef": m.coef_.tolist()},
            "coefficients": m.coef_.tolist(),
            "intercept": float(m.intercept_),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class ElasticNet(BaseScript):
    slug = "elastic_net"
    nome = "Elastic Net"
    familia = "04_regressao_1d"
    descricao = "Regularização mista L1+L2."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        l1 = params.get("l1_ratio", 0.5)
        if not (0 <= l1 <= 1):
            raise ValueError("l1_ratio deve estar em [0, 1].")

    def execute(self, inputs, params):
        from sklearn.linear_model import ElasticNet as SKEN
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        alpha = params.get("alpha", 1.0)
        l1_ratio = params.get("l1_ratio", 0.5)
        m = SKEN(alpha=alpha, l1_ratio=l1_ratio, max_iter=10000)
        m.fit(X, y)
        y_pred = m.predict(X)
        return {
            "model": {"type": "elastic_net", "alpha": alpha, "l1_ratio": l1_ratio},
            "coefficients": m.coef_.tolist(),
            "intercept": float(m.intercept_),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class CLS(BaseScript):
    slug = "cls"
    nome = "CLS — Classical Least Squares"
    familia = "04_regressao_1d"
    descricao = "X = C × Sᵀ. Resolve concentrações dado espectros puros S."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        S = np.asarray(self._require_key(inputs, "S"))
        if X.ndim != 2 or S.ndim != 2:
            raise ValueError("X e S devem ser matrizes 2D.")
        if X.shape[1] != S.shape[0]:
            raise ValueError(f"X.shape[1]={X.shape[1]} ≠ S.shape[0]={S.shape[0]} (variáveis).")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        S = np.asarray(inputs["S"], dtype=float)  # shape J×K
        non_neg = params.get("non_negativity", False)

        if non_neg:
            from scipy.optimize import nnls
            C = np.zeros((X.shape[0], S.shape[1]))
            for i in range(X.shape[0]):
                C[i], _ = nnls(S, X[i])
        else:
            C = X @ np.linalg.pinv(S)

        X_reconstructed = C @ S.T
        residuals = X - X_reconstructed

        return {
            "C": C,
            "X_reconstructed": X_reconstructed,
            "residuals": residuals,
            "metrics_cal": {
                "RMSE_reconstructed": float(np.sqrt(np.mean(residuals ** 2)))
            },
        }


class ILS(BaseScript):
    slug = "ils"
    nome = "ILS — Inverse Least Squares"
    familia = "04_regressao_1d"
    descricao = "Modela y = X × b diretamente. Requer n_samples > n_variables."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        reg = params.get("regularization", "none")
        if reg not in {"none", "ridge", "lasso"}:
            raise ValueError("regularization deve ser 'none', 'ridge' ou 'lasso'.")
        if reg == "none" and X.shape[0] <= X.shape[1]:
            raise ValueError(
                "ILS sem regularização requer n_samples > n_variables. "
                "Use ridge/lasso ou selecione variáveis primeiro."
            )

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        reg = params.get("regularization", "none")
        alpha = params.get("alpha", 1.0)

        if reg == "none":
            from sklearn.linear_model import LinearRegression
            m = LinearRegression()
        elif reg == "ridge":
            from sklearn.linear_model import Ridge
            m = Ridge(alpha=alpha)
        elif reg == "lasso":
            from sklearn.linear_model import Lasso
            m = Lasso(alpha=alpha, max_iter=10000)

        m.fit(X, y)
        y_pred = m.predict(X)

        return {
            "model": {"type": f"ils_{reg}"},
            "coefficients": m.coef_.tolist(),
            "intercept": float(m.intercept_),
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class NonlinearRegression(BaseScript):
    slug = "nonlinear_regression"
    nome = "Regressão Não Linear (SVR / Kernel PLS)"
    familia = "04_regressao_1d"
    descricao = "Regressão não linear por SVR ou kernel PLS."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        m = params.get("method", "svr")
        if m not in {"svr", "kernel_pls"}:
            raise ValueError("method deve ser 'svr' ou 'kernel_pls'.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        method = params.get("method", "svr")

        if method == "svr":
            from sklearn.svm import SVR
            kernel = params.get("kernel", "rbf")
            C = params.get("C", 1.0)
            epsilon = params.get("epsilon", 0.1)
            gamma = params.get("gamma", "scale")
            m = SVR(kernel=kernel, C=C, epsilon=epsilon, gamma=gamma)
            m.fit(X, y)
            y_pred = m.predict(X)
            model_info = {"type": "svr", "kernel": kernel, "C": C}
        else:
            # Kernel PLS via sklearn's KernelPLS (not available) — use PLSRegression with RBF features
            from sklearn.kernel_approximation import RBFSampler
            from sklearn.cross_decomposition import PLSRegression
            gamma = params.get("gamma", 0.1)
            n_comp = params.get("n_components", 5)
            rbf = RBFSampler(gamma=gamma, random_state=42)
            X_rbf = rbf.fit_transform(X)
            n_comp = min(n_comp, X_rbf.shape[1], X_rbf.shape[0] - 1)
            m = PLSRegression(n_components=n_comp)
            m.fit(X_rbf, y)
            y_pred = m.predict(X_rbf).ravel()
            model_info = {"type": "kernel_pls", "gamma": gamma}

        return {
            "model": model_info,
            "metrics_cal": _metrics_cal(y, y_pred),
        }
