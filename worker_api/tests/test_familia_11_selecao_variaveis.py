"""
Smoke tests — Família 11: Seleção de Variáveis
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, list_len_ge


def _Xy(n=30, p=40):
    rng = np.random.default_rng(16)
    X = rng.normal(0, 1, (n, p))
    y = X[:, :5].sum(axis=1) + rng.normal(0, 0.1, n)
    return X.tolist(), y.tolist()


def _base_checks():
    return [has_keys("selected_indices", "n_selected"),
            lambda out: None if out["n_selected"] >= 1
                else (_ for _ in ()).throw(AssertionError("No variables selected"))]


def test_uve():
    X, y = _Xy()
    return smoke("uve", {"X": X, "y": y}, {"n_components": 3}, _base_checks())


def test_ipls():
    """iPLS deve selecionar um intervalo e retornar its índices."""
    X, y = _Xy(n=30, p=50)
    return smoke("ipls", {"X": X, "y": y},
        {"n_intervals": 5, "n_components": 3},
        [has_keys("best_interval", "selected_indices", "all_intervals"),
         list_len_ge("selected_indices", 1)])


def test_sipls():
    X, y = _Xy(n=30, p=50)
    return smoke("sipls", {"X": X, "y": y},
        {"n_intervals": 5, "n_combine": 2, "n_components": 2},
        [has_keys("selected_indices", "best_rmsecv"),
         list_len_ge("selected_indices", 1)])


def test_cars():
    X, y = _Xy()
    return smoke("cars", {"X": X, "y": y},
        {"n_components": 3, "n_runs": 10},
        [has_keys("selected_indices", "best_rmsecv")] + _base_checks())


def test_vip():
    """VIP com threshold=1.0 → pelo menos algumas variáveis acima do limiar."""
    X, y = _Xy()
    return smoke("vip", {"X": X, "y": y},
        {"n_components": 3, "threshold": 1.0},
        [has_keys("vip_scores", "selected_indices"),
         list_len_ge("vip_scores", 40)])


def test_ga_pls():
    X, y = _Xy(n=25, p=20)
    return smoke("ga_pls", {"X": X, "y": y},
        {"n_components": 2, "n_population": 10, "n_generations": 5},
        _base_checks())


def test_spa():
    X, y = _Xy()
    return smoke("spa", {"X": X, "y": y}, {"n_select": 8},
        [has_keys("selected_indices"),
         lambda out: None if len(out["selected_indices"]) == 8
             else (_ for _ in ()).throw(AssertionError(
                 f"Expected 8 selected, got {len(out['selected_indices'])}"))])


def test_rf_importance():
    X, y = _Xy()
    return smoke("rf_importance", {"X": X, "y": y},
        {"n_estimators": 20, "n_select": 10},
        [has_keys("importances", "selected_indices"),
         lambda out: None if len(out["selected_indices"]) == 10
             else (_ for _ in ()).throw(AssertionError(
                 f"Expected 10 selected, got {len(out['selected_indices'])}"))])


def test_boruta():
    X, y = _Xy()
    return smoke("boruta", {"X": X, "y": y},
        {"n_estimators": 10, "n_trials": 5},
        [has_keys("selected_indices", "pvalues")])


def test_lasso_selection():
    X, y = _Xy()
    return smoke("lasso_selection", {"X": X, "y": y}, {},
        [has_keys("selected_indices", "best_alpha")])


def run():
    results = [
        test_uve(),
        test_ipls(),
        test_sipls(),
        test_cars(),
        test_vip(),
        test_ga_pls(),
        test_spa(),
        test_rf_importance(),
        test_boruta(),
        test_lasso_selection(),
    ]
    return run_suite(results, "Família 11 — Seleção de Variáveis")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
