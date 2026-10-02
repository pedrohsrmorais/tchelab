from __future__ import annotations


# ================================================================
# cross_validation.py
# ================================================================
"""Cross-Validation / Bootstrap / Permutation / y-Randomization / Leverage — Família 12"""
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


def _build_model(method, params):
    """Factory for regression/classification model based on method string."""
    if method == "pls":
        from sklearn.cross_decomposition import PLSRegression
        nc = params.get("n_components", 5)
        return PLSRegression(n_components=nc), "regression"
    elif method == "ridge":
        from sklearn.linear_model import Ridge
        return Ridge(alpha=params.get("alpha", 1.0)), "regression"
    elif method == "lda":
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
        return LinearDiscriminantAnalysis(), "classification"
    elif method == "rf_reg":
        from sklearn.ensemble import RandomForestRegressor
        return RandomForestRegressor(n_estimators=params.get("n_estimators", 50), random_state=42), "regression"
    elif method == "rf_cls":
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(n_estimators=params.get("n_estimators", 50), random_state=42), "classification"
    else:
        from sklearn.cross_decomposition import PLSRegression
        return PLSRegression(n_components=params.get("n_components", 5)), "regression"


class CrossValidation(BaseScript):
    slug = "cross_validation"
    nome = "Cross-Validation (K-Fold / LOO / Monte Carlo)"
    familia = "12_validacao_modelos"
    descricao = "Valida modelo por K-Fold, LOO ou Monte Carlo CV."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        cv_type = params.get("cv_type", "kfold")
        if cv_type not in {"kfold", "loo", "montecarlo"}:
            raise ValueError("cv_type deve ser 'kfold', 'loo' ou 'montecarlo'.")

    def execute(self, inputs, params):
        from sklearn.model_selection import KFold, LeaveOneOut, ShuffleSplit
        from sklearn.metrics import accuracy_score

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        method = params.get("method", "pls")
        cv_type = params.get("cv_type", "kfold")
        n_folds = params.get("n_folds", 5)
        n_iter = params.get("n_iter", 20)
        test_size = params.get("test_size", 0.2)

        model, task = _build_model(method, params)
        if task == "regression":
            y = y.astype(float)

        if cv_type == "kfold":
            splitter = KFold(n_splits=min(n_folds, len(y)))
        elif cv_type == "loo":
            splitter = LeaveOneOut()
        else:
            splitter = ShuffleSplit(n_splits=n_iter, test_size=test_size, random_state=42)

        y_true_all, y_pred_all = [], []
        for tr, te in splitter.split(X):
            m = type(model)(**model.get_params())
            m.fit(X[tr], y[tr])
            pred = m.predict(X[te])
            if hasattr(pred, "ravel"):
                pred = pred.ravel()
            y_true_all.extend(y[te].tolist())
            y_pred_all.extend(pred.tolist())

        y_true_all = np.array(y_true_all)
        y_pred_all = np.array(y_pred_all)

        if task == "regression":
            metrics = _metrics_cal(y_true_all, y_pred_all)
            metrics_key = "metrics_cv"
        else:
            from sklearn.metrics import balanced_accuracy_score
            metrics = {
                "accuracy": float(accuracy_score(y_true_all, y_pred_all)),
                "balanced_accuracy": float(balanced_accuracy_score(y_true_all, y_pred_all)),
            }
            metrics_key = "metrics_cv"

        return {
            "model": {"type": f"cv_{cv_type}", "method": method},
            metrics_key: metrics,
            "n_splits": len(list(splitter.split(X))),
        }


class Bootstrap(BaseScript):
    slug = "bootstrap"
    nome = "Bootstrap Validation (.632 / .632+)"
    familia = "12_validacao_modelos"
    descricao = "Estimativa de erro por bootstrap .632 para regressão."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        method = params.get("method", "pls")
        n_boot = params.get("n_bootstrap", 100)
        variant = params.get("variant", ".632")

        rng = np.random.default_rng(42)
        n = len(y)

        model, _ = _build_model(method, params)
        model_class = type(model)
        model_params = model.get_params()

        # Apparent error
        m0 = model_class(**model_params)
        m0.fit(X, y)
        y_app = m0.predict(X).ravel()
        err_app = float(np.mean((y - y_app) ** 2))

        # Bootstrap error
        boot_errors = []
        for _ in range(n_boot):
            idx = rng.integers(0, n, n)
            oob = np.setdiff1d(np.arange(n), idx)
            if len(oob) == 0:
                continue
            mb = model_class(**model_params)
            mb.fit(X[idx], y[idx])
            err_oob = float(np.mean((y[oob] - mb.predict(X[oob]).ravel()) ** 2))
            boot_errors.append(err_oob)

        err_boot = float(np.mean(boot_errors))
        # .632 estimate
        err_632 = 0.368 * err_app + 0.632 * err_boot

        return {
            "model": {"type": f"bootstrap_{variant}", "n_bootstrap": n_boot},
            "apparent_mse": err_app,
            "bootstrap_mse": err_boot,
            "mse_632": err_632,
            "rmse_632": float(np.sqrt(err_632)),
        }


class PermutationTest(BaseScript):
    slug = "permutation_test"
    nome = "Permutation Test (y-scrambling)"
    familia = "12_validacao_modelos"
    descricao = "Teste de permutação: embaralha y e re-calcula RMSECV para avaliar acaso."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.model_selection import cross_val_predict

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        n_perm = params.get("n_permutations", 100)
        n_folds = params.get("n_folds", 5)

        nc = min(n_comp, X.shape[0] - 2, X.shape[1])
        rng = np.random.default_rng(42)

        # Real RMSECV
        pls = PLSRegression(n_components=nc)
        y_cv = cross_val_predict(pls, X, y, cv=min(n_folds, len(y) - 1))
        real_rmse = float(np.sqrt(np.mean((y - y_cv) ** 2)))

        # Permutation distribution
        perm_rmse = []
        for _ in range(n_perm):
            yp = rng.permutation(y)
            pls_p = PLSRegression(n_components=nc)
            yp_cv = cross_val_predict(pls_p, X, yp, cv=min(n_folds, len(yp) - 1))
            perm_rmse.append(float(np.sqrt(np.mean((yp - yp_cv) ** 2))))

        pvalue = float(np.mean(np.array(perm_rmse) <= real_rmse))

        return {
            "model": {"type": "permutation_test", "n_permutations": n_perm},
            "real_rmsecv": real_rmse,
            "permutation_rmsecv_mean": float(np.mean(perm_rmse)),
            "permutation_rmsecv_std": float(np.std(perm_rmse)),
            "pvalue": pvalue,
            "permutation_distribution": perm_rmse,
        }


class LeverageInfluence(BaseScript):
    slug = "leverage_influence"
    nome = "Leverage e Influência (Hat Matrix)"
    familia = "12_validacao_modelos"
    descricao = "Calcula leverage (hat matrix) e distância de Cook para diagnóstico de amostras."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        threshold_leverage = params.get("threshold_leverage", None)

        n, p = X.shape
        # Hat matrix H = X(X'X)^-1 X'
        try:
            XtX_inv = np.linalg.pinv(X.T @ X)
            H = X @ XtX_inv @ X.T
        except np.linalg.LinAlgError:
            H = np.eye(n) / n

        leverage = np.diag(H)
        residuals = y - X @ (np.linalg.pinv(X) @ y)

        # Cook's distance
        mse = float(np.mean(residuals ** 2))
        if mse > 0:
            cook_d = (residuals ** 2 * leverage) / (mse * p * (1 - leverage + 1e-12) ** 2)
        else:
            cook_d = np.zeros(n)

        thresh = threshold_leverage if threshold_leverage else (2 * p / n)
        high_leverage = np.where(leverage > thresh)[0].tolist()

        return {
            "model": {"type": "leverage_influence"},
            "leverage": leverage.tolist(),
            "cooks_distance": cook_d.tolist(),
            "threshold_leverage": float(thresh),
            "high_leverage_samples": high_leverage,
            "n_high_leverage": len(high_leverage),
        }

