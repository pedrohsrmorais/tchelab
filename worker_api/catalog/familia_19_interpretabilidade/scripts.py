from __future__ import annotations


# ================================================================
# explainability.py
# ================================================================
"""Interpretabilidade de Modelos — Família 19"""
import numpy as np
from catalog.base import BaseScript


class PermutationImportance(BaseScript):
    slug = "permutation_importance"
    nome = "Permutation Feature Importance"
    familia = "19_interpretabilidade"
    descricao = "Importância por permutação: mede queda de performance ao embaralhar cada variável."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm tamanhos diferentes.")

    def execute(self, inputs, params):
        from sklearn.inspection import permutation_importance
        from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        method = params.get("method", "rf")
        n_repeats = params.get("n_repeats", 10)
        random_state = params.get("random_state", 42)

        if method == "pls":
            nc = min(params.get("n_components", 5), X.shape[0] - 1, X.shape[1])
            model = PLSRegression(n_components=nc)
        elif task == "classification":
            model = RandomForestClassifier(n_estimators=100, random_state=random_state)
        else:
            model = RandomForestRegressor(n_estimators=100, random_state=random_state)

        model.fit(X, y)
        result = permutation_importance(
            model, X, y, n_repeats=n_repeats, random_state=random_state
        )

        wavenumbers = inputs.get("wavenumbers", list(range(X.shape[1])))
        importances = result.importances_mean.tolist()
        std = result.importances_std.tolist()
        ranking = np.argsort(result.importances_mean)[::-1].tolist()

        return {
            "model": {"type": f"permutation_importance_{method}", "n_repeats": n_repeats},
            "importances_mean": importances,
            "importances_std": std,
            "ranking": ranking,
            "top_features": [{"index": int(r), "position": wavenumbers[r] if hasattr(wavenumbers, '__getitem__') else r,
                               "importance": importances[r]} for r in ranking[:20]],
        }


class PartialDependencePlot(BaseScript):
    slug = "partial_dependence"
    nome = "Partial Dependence Plot (PDP)"
    familia = "19_interpretabilidade"
    descricao = "Efeito marginal de variáveis selecionadas na predição do modelo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.inspection import partial_dependence

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        feature_indices = params.get("feature_indices", [0, 1, 2])
        n_grid_points = params.get("n_grid_points", 50)

        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X, y)

        pdp_results = []
        for fi in feature_indices:
            if fi >= X.shape[1]:
                continue
            pd_result = partial_dependence(
                model, X, features=[fi], grid_resolution=n_grid_points, kind="average"
            )
            pdp_results.append({
                "feature_index": fi,
                "grid_values": pd_result["grid_values"][0].tolist(),
                "average": pd_result["average"][0].tolist(),
            })

        return {
            "model": {"type": "pdp_random_forest"},
            "pdp": pdp_results,
        }


class SensitivityAnalysis(BaseScript):
    slug = "sensitivity_analysis"
    nome = "Sensitivity Analysis (local / global)"
    familia = "19_interpretabilidade"
    descricao = "Análise de sensibilidade: gradiente local e Morris screening global."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        method = params.get("method", "local")  # local or morris
        n_trajectories = params.get("n_trajectories", 10)
        nc = min(params.get("n_components", 5), X.shape[0] - 1, X.shape[1])

        pls = PLSRegression(n_components=nc)
        pls.fit(X, y)

        if method == "local":
            # Numerical gradient around mean
            x0 = X.mean(axis=0)
            h = np.std(X, axis=0) * 0.01 + 1e-8
            grad = np.zeros(X.shape[1])
            y0 = float(pls.predict(x0[np.newaxis, :]).ravel()[0])
            for j in range(X.shape[1]):
                xp = x0.copy()
                xp[j] += h[j]
                yp = float(pls.predict(xp[np.newaxis, :]).ravel()[0])
                grad[j] = (yp - y0) / h[j]
            sensitivity = np.abs(grad)
        else:
            # Morris screening: random one-at-a-time
            rng = np.random.default_rng(42)
            p = X.shape[1]
            delta = 0.1
            ees = np.zeros((n_trajectories, p))
            x_base = X.mean(axis=0)
            x_std = np.std(X, axis=0) + 1e-8
            for t in range(n_trajectories):
                x = x_base.copy()
                perm = rng.permutation(p)
                for j in perm:
                    xd = x.copy()
                    xd[j] += delta * x_std[j]
                    y1 = float(pls.predict(x[np.newaxis, :]).ravel()[0])
                    y2 = float(pls.predict(xd[np.newaxis, :]).ravel()[0])
                    ees[t, j] = abs((y2 - y1) / (delta * x_std[j]))
                    x = xd
            sensitivity = ees.mean(axis=0)

        ranking = np.argsort(sensitivity)[::-1].tolist()
        return {
            "model": {"type": f"sensitivity_{method}", "n_components_pls": nc},
            "sensitivity": sensitivity.tolist(),
            "ranking": ranking,
            "top_features": [{"index": int(r), "sensitivity": float(sensitivity[r])} for r in ranking[:20]],
        }


class VIPInterpretation(BaseScript):
    slug = "vip_interpretation"
    nome = "VIP Scores Interpretation"
    familia = "19_interpretabilidade"
    descricao = "VIP do modelo PLS com análise de regiões mais importantes."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        threshold = params.get("vip_threshold", 1.0)
        wavenumbers = inputs.get("wavenumbers", list(range(X.shape[1])))

        nc = min(n_comp, X.shape[0] - 1, X.shape[1])
        pls = PLSRegression(n_components=nc)
        pls.fit(X, y)

        T = pls.x_scores_    # (n, nc)
        W = pls.x_weights_   # (p, nc)
        Q = pls.y_loadings_  # (q, nc)

        SS = np.diag(T.T @ T) * (Q ** 2).sum(axis=0)
        SS_total = SS.sum()
        p = X.shape[1]
        VIP = np.sqrt(p * (W ** 2 @ SS) / SS_total)

        important = np.where(VIP > threshold)[0].tolist()
        ranking = np.argsort(VIP)[::-1].tolist()

        return {
            "model": {"type": "vip_interpretation", "n_components": nc, "threshold": threshold},
            "vip": VIP.tolist(),
            "important_indices": important,
            "ranking": ranking,
            "n_important": len(important),
            "top_features": [{"index": int(r),
                               "position": wavenumbers[r] if hasattr(wavenumbers, '__getitem__') else r,
                               "vip": float(VIP[r])} for r in ranking[:20]],
        }


class LIMEExplanation(BaseScript):
    slug = "lime_explanation"
    nome = "LIME — Local Interpretable Model-agnostic Explanations"
    familia = "19_interpretabilidade"
    descricao = "Explicações locais por aproximação linear em torno de amostras individuais."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.linear_model import Ridge

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        sample_indices = params.get("sample_indices", [0])
        n_perturbations = params.get("n_perturbations", 100)
        sigma = params.get("sigma", 0.1)

        nc = min(params.get("n_components", 5), X.shape[0] - 1, X.shape[1])
        pls = PLSRegression(n_components=nc)
        pls.fit(X, y)

        x_std = np.std(X, axis=0) + 1e-8
        rng = np.random.default_rng(42)
        explanations = []

        for idx in sample_indices:
            if idx >= len(X):
                continue
            x0 = X[idx]
            # Perturb around x0
            noise = rng.normal(0, sigma, size=(n_perturbations, X.shape[1])) * x_std
            X_pert = x0 + noise
            y_pert = pls.predict(X_pert).ravel()

            # Kernel weights: RBF
            dists = np.sqrt(np.sum(noise ** 2, axis=1))
            kern_width = np.median(dists)
            weights_lime = np.exp(-dists ** 2 / (2 * kern_width ** 2 + 1e-12))

            # Fit local linear model
            ridge = Ridge(alpha=1.0)
            ridge.fit(noise, y_pert, sample_weight=weights_lime)

            coef = ridge.coef_
            ranking = np.argsort(np.abs(coef))[::-1].tolist()
            explanations.append({
                "sample_index": idx,
                "coefficients": coef.tolist(),
                "ranking": ranking,
                "top_features": [{"index": int(r), "coefficient": float(coef[r])} for r in ranking[:10]],
            })

        return {
            "model": {"type": "lime", "n_components_pls": nc},
            "explanations": explanations,
        }

