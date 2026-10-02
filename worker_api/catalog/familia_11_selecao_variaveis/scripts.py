"""Seleção de Variáveis — Família 11"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript
from catalog.familia_04_regressao_1d.scripts import _metrics_cal  # noqa: F401


# ─── shared helper ────────────────────────────────────────────────────────────

def _pls_cv_rmse(X, y, n_comp, n_folds=5):
    """Leave-N-out CV RMSE for PLSRegression."""
    from sklearn.cross_decomposition import PLSRegression
    from sklearn.model_selection import KFold
    nc = min(n_comp, X.shape[0] - 2, X.shape[1])
    if nc < 1:
        return np.inf
    kf = KFold(n_splits=min(n_folds, len(y)))
    errors = []
    for tr, te in kf.split(X):
        pls = PLSRegression(n_components=nc)
        pls.fit(X[tr], y[tr])
        errors.extend((y[te] - pls.predict(X[te]).ravel()) ** 2)
    return float(np.sqrt(np.mean(errors)))


# ─── UVE ──────────────────────────────────────────────────────────────────────

class UVE(BaseScript):
    slug = "uve"
    nome = "UVE — Uninformative Variable Elimination"
    familia = "11_selecao_variaveis"
    descricao = "Elimina variáveis não-informativas comparando coeficientes PLS com ruído."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        threshold = params.get("threshold", 0.0)   # 0 = auto (mean of noise coefficients)

        n, p = X.shape
        nc = min(n_comp, n - 1, p)

        # Augment X with noise columns
        rng = np.random.default_rng(42)
        X_noise = rng.normal(0, X.std(), size=(n, p))
        X_aug = np.hstack([X, X_noise])

        pls = PLSRegression(n_components=nc)
        pls.fit(X_aug, y)

        coefs = pls.coef_.ravel()   # shape (2p,)
        coefs_signal = coefs[:p]
        coefs_noise = coefs[p:]

        noise_std = np.std(np.abs(coefs_noise))
        noise_mean = np.mean(np.abs(coefs_noise))
        thresh = threshold if threshold > 0 else noise_mean + noise_std

        selected = np.where(np.abs(coefs_signal) > thresh)[0].tolist()

        return {
            "model": {"type": "uve", "n_components": nc},
            "selected_indices": selected,
            "n_selected": len(selected),
            "coefficients": coefs_signal.tolist(),
            "noise_threshold": float(thresh),
        }


# ─── iPLS ─────────────────────────────────────────────────────────────────────

class IPLS(BaseScript):
    slug = "ipls"
    nome = "iPLS — Interval Partial Least Squares"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona o melhor intervalo espectral por CV-RMSECV mínimo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_intervals = params.get("n_intervals", 10)
        n_comp = params.get("n_components", 5)
        n_folds = params.get("n_folds", 5)

        p = X.shape[1]
        interval_size = max(1, p // n_intervals)
        results = []

        for i in range(n_intervals):
            start = i * interval_size
            end = min(start + interval_size, p)
            Xi = X[:, start:end]
            rmse = _pls_cv_rmse(Xi, y, n_comp, n_folds)
            results.append({"interval": i, "start": start, "end": end, "rmsecv": rmse})

        best = min(results, key=lambda r: r["rmsecv"])

        return {
            "model": {"type": "ipls", "n_intervals": n_intervals},
            "best_interval": best,
            "all_intervals": results,
            "selected_indices": list(range(best["start"], best["end"])),
        }


# ─── siPLS ────────────────────────────────────────────────────────────────────

class SiPLS(BaseScript):
    slug = "sipls"
    nome = "siPLS — Synergy iPLS"
    familia = "11_selecao_variaveis"
    descricao = "Combina sinergicamente múltiplos intervalos espectrais via iPLS."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from itertools import combinations

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_intervals = params.get("n_intervals", 10)
        n_comp = params.get("n_components", 5)
        n_combine = params.get("n_combine", 2)
        n_folds = params.get("n_folds", 5)

        p = X.shape[1]
        interval_size = max(1, p // n_intervals)
        intervals = []
        for i in range(n_intervals):
            start = i * interval_size
            end = min(start + interval_size, p)
            intervals.append((start, end))

        best_rmse = np.inf
        best_combo = None
        best_indices = []

        for combo in combinations(range(len(intervals)), min(n_combine, len(intervals))):
            cols = []
            for idx in combo:
                cols.extend(range(intervals[idx][0], intervals[idx][1]))
            Xi = X[:, cols]
            rmse = _pls_cv_rmse(Xi, y, n_comp, n_folds)
            if rmse < best_rmse:
                best_rmse = rmse
                best_combo = combo
                best_indices = cols

        return {
            "model": {"type": "sipls", "n_intervals": n_intervals, "n_combine": n_combine},
            "best_combination": list(best_combo) if best_combo else [],
            "best_rmsecv": float(best_rmse),
            "selected_indices": best_indices,
            "n_selected": len(best_indices),
        }


# ─── CARS ─────────────────────────────────────────────────────────────────────

class CARS(BaseScript):
    slug = "cars"
    nome = "CARS — Competitive Adaptive Reweighted Sampling"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona variáveis PLS por amostragem competitiva adaptativa."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        n_runs = params.get("n_runs", 50)
        n_folds = params.get("n_folds", 5)

        n, p = X.shape
        nc = min(n_comp, n - 1, p)

        var_mask = np.ones(p, dtype=bool)
        best_rmse = np.inf
        best_mask = var_mask.copy()
        rmsecv_history = []

        rng = np.random.default_rng(42)
        ratio = np.exp(-np.log(p) / n_runs)

        for run in range(n_runs):
            n_keep = max(nc + 1, int(p * (ratio ** run)))
            idx = np.where(var_mask)[0]
            if len(idx) <= nc:
                break
            chosen = rng.choice(idx, size=min(n_keep, len(idx)), replace=False)
            chosen.sort()

            Xi = X[:, chosen]
            rmse = _pls_cv_rmse(Xi, y, nc, n_folds)
            rmsecv_history.append(float(rmse))

            if rmse < best_rmse:
                best_rmse = rmse
                best_mask = np.zeros(p, dtype=bool)
                best_mask[chosen] = True

            pls = PLSRegression(n_components=min(nc, len(chosen) - 1, Xi.shape[0] - 1))
            pls.fit(Xi, y)
            coef_abs = np.abs(pls.coef_.ravel())
            keep_n = max(nc + 1, int(len(chosen) * 0.9))
            top_local = np.argsort(coef_abs)[::-1][:keep_n]
            new_mask = np.zeros(p, dtype=bool)
            new_mask[chosen[top_local]] = True
            var_mask = new_mask

        selected = np.where(best_mask)[0].tolist()
        return {
            "model": {"type": "cars", "n_runs": n_runs, "n_components": nc},
            "selected_indices": selected,
            "n_selected": len(selected),
            "best_rmsecv": float(best_rmse),
            "rmsecv_history": rmsecv_history,
        }


# ─── VIP ──────────────────────────────────────────────────────────────────────

class VIP(BaseScript):
    slug = "vip"
    nome = "VIP — Variable Importance in Projection (PLS)"
    familia = "11_selecao_variaveis"
    descricao = "Calcula importância VIP de variáveis no modelo PLS."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        threshold = params.get("threshold", 1.0)

        n, p = X.shape
        nc = min(n_comp, n - 1, p)

        pls = PLSRegression(n_components=nc)
        pls.fit(X, y)

        T = pls.x_scores_
        W = pls.x_weights_
        Q = pls.y_loadings_

        SS = np.sum(T ** 2, axis=0) * (Q ** 2).sum(axis=0)
        W_norm = W / np.linalg.norm(W, axis=0)
        vip = np.sqrt(p * (W_norm ** 2 @ SS) / SS.sum())

        selected = np.where(vip >= threshold)[0].tolist()

        return {
            "model": {"type": "vip", "n_components": nc},
            "vip_scores": vip.tolist(),
            "selected_indices": selected,
            "n_selected": len(selected),
            "threshold": float(threshold),
        }


# ─── GA-PLS ───────────────────────────────────────────────────────────────────

class GAPLS(BaseScript):
    slug = "ga_pls"
    nome = "GA-PLS — Genetic Algorithm PLS Variable Selection"
    familia = "11_selecao_variaveis"
    descricao = "Seleção de variáveis PLS por algoritmo genético."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_comp = params.get("n_components", 5)
        n_pop = params.get("n_population", 20)
        n_gen = params.get("n_generations", 30)
        mutation_rate = params.get("mutation_rate", 0.01)
        n_folds = params.get("n_folds", 5)

        n, p = X.shape
        nc = min(n_comp, n - 1, p)
        rng = np.random.default_rng(42)

        pop = rng.integers(0, 2, size=(n_pop, p)).astype(bool)
        for i in range(n_pop):
            if pop[i].sum() <= nc:
                extra = rng.choice(p, nc + 1, replace=False)
                pop[i, extra] = True

        best_fitness = np.inf
        best_chrom = pop[0].copy()

        for gen in range(n_gen):
            fitness = []
            for chrom in pop:
                cols = np.where(chrom)[0]
                if len(cols) <= nc:
                    fitness.append(np.inf)
                    continue
                rmse = _pls_cv_rmse(X[:, cols], y, nc, n_folds)
                fitness.append(rmse)
                if rmse < best_fitness:
                    best_fitness = rmse
                    best_chrom = chrom.copy()

            fitness = np.array(fitness)
            new_pop = []
            for _ in range(n_pop):
                a, b = rng.choice(n_pop, 2, replace=False)
                winner = a if fitness[a] <= fitness[b] else b
                new_pop.append(pop[winner].copy())

            for i in range(0, n_pop - 1, 2):
                pt = rng.integers(1, p)
                c1 = np.concatenate([new_pop[i][:pt], new_pop[i+1][pt:]])
                c2 = np.concatenate([new_pop[i+1][:pt], new_pop[i][pt:]])
                new_pop[i] = c1
                new_pop[i+1] = c2

            for chrom in new_pop:
                mask = rng.random(p) < mutation_rate
                chrom[mask] = ~chrom[mask]
                if chrom.sum() <= nc:
                    extra = rng.choice(p, nc + 1, replace=False)
                    chrom[extra] = True

            pop = np.array(new_pop)

        selected = np.where(best_chrom)[0].tolist()
        return {
            "model": {"type": "ga_pls", "n_generations": n_gen, "n_population": n_pop},
            "selected_indices": selected,
            "n_selected": len(selected),
            "best_rmsecv": float(best_fitness),
        }


# ─── SPA ──────────────────────────────────────────────────────────────────────

class SPA(BaseScript):
    slug = "spa"
    nome = "SPA — Successive Projections Algorithm"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona variáveis com mínima colinearidade por projeções sucessivas."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_select = params.get("n_select", 10)

        n, p = X.shape
        n_select = min(n_select, p, n - 1)

        norms = np.linalg.norm(X, axis=0)
        norms[norms == 0] = 1.0
        Xn = X / norms

        selected = []
        start = int(np.argmax(np.linalg.norm(Xn, axis=0)))
        selected.append(start)
        remaining = list(range(p))
        remaining.remove(start)

        for _ in range(n_select - 1):
            s_mat = Xn[:, selected]
            projections = []
            for j in remaining:
                xj = Xn[:, j]
                proj = xj - s_mat @ (np.linalg.pinv(s_mat) @ xj)
                projections.append(np.linalg.norm(proj))
            best = remaining[int(np.argmax(projections))]
            selected.append(best)
            remaining.remove(best)

        return {
            "model": {"type": "spa", "n_select": n_select},
            "selected_indices": selected,
            "n_selected": len(selected),
        }


# ─── RF Importance ────────────────────────────────────────────────────────────

class RFImportance(BaseScript):
    slug = "rf_importance"
    nome = "RF Importance — Random Forest Variable Importance"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona variáveis pelo impurity-based importance do Random Forest."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        n_estimators = params.get("n_estimators", 100)
        threshold = params.get("threshold", None)
        n_select = params.get("n_select", None)

        if task == "regression":
            y = y.astype(float)
            clf = RandomForestRegressor(n_estimators=n_estimators, random_state=42)
        else:
            clf = RandomForestClassifier(n_estimators=n_estimators, random_state=42)

        clf.fit(X, y)
        importances = clf.feature_importances_

        if n_select is not None:
            selected = np.argsort(importances)[::-1][:n_select].tolist()
        else:
            thresh = threshold if threshold is not None else importances.mean()
            selected = np.where(importances >= thresh)[0].tolist()

        return {
            "model": {"type": "rf_importance", "task": task},
            "importances": importances.tolist(),
            "selected_indices": selected,
            "n_selected": len(selected),
        }


# ─── Boruta ───────────────────────────────────────────────────────────────────

class BorutaSelection(BaseScript):
    slug = "boruta"
    nome = "Boruta — All-Relevant Feature Selection"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona todas as variáveis relevantes via Boruta (shadow features)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
        from scipy.stats import binom

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        n_estimators = params.get("n_estimators", 50)
        n_trials = params.get("n_trials", 20)
        alpha = params.get("alpha", 0.05)

        n, p = X.shape
        hit_counts = np.zeros(p)
        rng = np.random.default_rng(42)

        for trial in range(n_trials):
            X_shadow = rng.permutation(X.T).T
            X_aug = np.hstack([X, X_shadow])

            if task == "regression":
                clf = RandomForestRegressor(n_estimators=n_estimators, random_state=trial)
                clf.fit(X_aug, y.astype(float))
            else:
                clf = RandomForestClassifier(n_estimators=n_estimators, random_state=trial)
                clf.fit(X_aug, y)

            imp = clf.feature_importances_
            real_imp = imp[:p]
            shadow_max = imp[p:].max()
            hit_counts += (real_imp > shadow_max)

        pvalues = np.array([1 - binom.cdf(int(h) - 1, n_trials, 0.5) for h in hit_counts])
        selected = np.where(pvalues < alpha)[0].tolist()
        tentative = np.where((pvalues >= alpha) & (pvalues < alpha * 2))[0].tolist()

        return {
            "model": {"type": "boruta", "n_trials": n_trials, "alpha": alpha},
            "hit_counts": hit_counts.tolist(),
            "pvalues": pvalues.tolist(),
            "selected_indices": selected,
            "tentative_indices": tentative,
            "n_selected": len(selected),
        }


# ─── Lasso Selection ──────────────────────────────────────────────────────────

class LassoSelection(BaseScript):
    slug = "lasso_selection"
    nome = "Lasso Selection — Regularização Lasso para Seleção de Variáveis"
    familia = "11_selecao_variaveis"
    descricao = "Seleciona variáveis com coeficiente Lasso não-zero via cross-validation."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.linear_model import LassoCV
        from sklearn.preprocessing import StandardScaler

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        n_folds = params.get("n_folds", 5)
        max_iter = params.get("max_iter", 10000)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        lasso = LassoCV(cv=min(n_folds, len(y) - 1), max_iter=max_iter, random_state=42)
        lasso.fit(X_scaled, y)

        selected = np.where(lasso.coef_ != 0)[0].tolist()

        return {
            "model": {"type": "lasso_selection", "alpha": float(lasso.alpha_)},
            "coefficients": lasso.coef_.tolist(),
            "selected_indices": selected,
            "n_selected": len(selected),
            "best_alpha": float(lasso.alpha_),
        }
