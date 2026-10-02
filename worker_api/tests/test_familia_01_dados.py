"""
Smoke tests — Família 01: Dados e Operações
"""
from __future__ import annotations
import numpy as np
from tests.helpers import smoke, run_suite, has_keys, key_equals, list_len, shape_check, list_len_ge


def _X():
    rng = np.random.default_rng(0)
    return rng.normal(0, 1, (20, 10)).tolist()


def test_importacao():
    # Importacao reads from a file_path; skip actual execution, just test validate catches missing path
    from tests.helpers import run_script
    try:
        run_script("importacao", {}, {})
        return type("R", (), {"passed": False, "slug": "importacao", "duration_ms": 0,
                              "error": "Expected ValueError", "__repr__": lambda s: "[FAIL] importacao"})()
    except ValueError as e:
        if "file_path" in str(e):
            return type("R", (), {"passed": True, "slug": "importacao", "duration_ms": 0,
                                  "error": None, "__repr__": lambda s: "[PASS] importacao"})()
        raise


def test_limpeza():
    X = [[1.0, 2.0, None], [None, 4.0, 5.0], [6.0, 7.0, 8.0]]
    return smoke("limpeza", {"X": X}, {"strategy": "mean"},
        [has_keys("X_clean", "removed_indices")])


def test_tratamento_missing():
    X = [[1.0, np.nan], [2.0, 3.0], [np.nan, 4.0]]
    return smoke("tratamento_missing", {"X": X}, {"strategy": "mean"},
        [has_keys("X_filled")])


def test_selecao_amostras():
    X = _X()
    indices = [0, 3, 7, 11, 15]
    return smoke("selecao_amostras", {"X": X},
        {"indices": indices},
        [has_keys("X_sel")])


def test_selecao_variaveis():
    X = _X()
    return smoke("selecao_variaveis", {"X": X},
        {"indices": [0, 2, 4, 6]},
        [has_keys("X_sel")])


def test_transpose():
    X = [[1, 2, 3], [4, 5, 6]]
    return smoke("transpose", {"X": X}, {},
        [has_keys("X_T")])


def test_reshape():
    X = [[1, 2, 3, 4, 5, 6]]
    return smoke("reshape", {"X": X}, {"new_shape": [2, 3]},
        [has_keys("X_r")])


def test_soma():
    A = [[1, 2], [3, 4]]
    B = [[10, 20], [30, 40]]
    return smoke("soma", {"A": A, "B": B}, {},
        [has_keys("result"),
         shape_check("result", (2, 2))])


def test_subtracao():
    A = [[10, 20], [30, 40]]
    B = [[1, 2], [3, 4]]
    return smoke("subtracao", {"A": A, "B": B}, {},
        [has_keys("result")])


def test_multiplicacao_elementwise():
    A = [[1, 2], [3, 4]]
    B = [[2, 3], [4, 5]]
    return smoke("multiplicacao_elementwise", {"A": A, "B": B}, {},
        [has_keys("result")])


def test_divisao_elementwise():
    A = [[2.0, 4.0], [6.0, 8.0]]
    B = [[2.0, 2.0], [2.0, 2.0]]
    return smoke("divisao_elementwise", {"A": A, "B": B}, {},
        [has_keys("result")])


def test_produto_matricial():
    A = [[1, 2], [3, 4]]
    B = [[5, 6], [7, 8]]
    return smoke("produto_matricial", {"A": A, "B": B}, {},
        [has_keys("result"),
         shape_check("result", (2, 2))])


def test_inversa():
    A = [[2.0, 1.0], [1.0, 3.0]]
    return smoke("inversa", {"A": A}, {},
        [has_keys("A_inv")])


def test_determinante():
    A = [[3.0, 8.0], [4.0, 6.0]]
    return smoke("determinante", {"A": A}, {},
        [has_keys("det")])


def test_autovalores():
    A = [[4.0, 1.0], [2.0, 3.0]]
    return smoke("autovalores", {"A": A}, {},
        [has_keys("eigenvalues"),
         list_len("eigenvalues", 2)])


def test_svd():
    X = _X()
    return smoke("svd", {"A": X}, {},
        [has_keys("U", "S", "Vt"),
         list_len("S", 10)])  # min(20,10)


def test_norma():
    X = [[3.0, 4.0]]
    return smoke("norma", {"X": X}, {"axis": 1},
        [has_keys("result")])


def test_mean():
    X = [[1.0, 2.0], [3.0, 4.0]]
    return smoke("mean", {"X": X}, {"axis": 0},
        [has_keys("result"),
         list_len("result", 2)])


def test_std():
    X = _X()
    return smoke("std", {"X": X}, {"axis": 0},
        [has_keys("result")])


def test_min():
    X = [[5.0, 3.0], [1.0, 7.0]]
    return smoke("min", {"X": X}, {"axis": 0},
        [has_keys("result")])


def test_max():
    X = [[5.0, 3.0], [1.0, 7.0]]
    return smoke("max", {"X": X}, {"axis": 0},
        [has_keys("result")])


def test_sum():
    X = [[1.0, 2.0], [3.0, 4.0]]
    return smoke("sum", {"X": X}, {"axis": 0},
        [has_keys("result")])


def test_formula_customizada():
    X = [[1.0, 2.0, 3.0]]
    return smoke("formula_customizada",
        {"X": X},
        {"expression": "X * 2 + 1"},
        [has_keys("result")])


def run():
    results = [
        test_importacao(),
        test_limpeza(),
        test_tratamento_missing(),
        test_selecao_amostras(),
        test_selecao_variaveis(),
        test_transpose(),
        test_reshape(),
        test_soma(),
        test_subtracao(),
        test_multiplicacao_elementwise(),
        test_divisao_elementwise(),
        test_produto_matricial(),
        test_inversa(),
        test_determinante(),
        test_autovalores(),
        test_svd(),
        test_norma(),
        test_mean(),
        test_std(),
        test_min(),
        test_max(),
        test_sum(),
        test_formula_customizada(),
    ]
    return run_suite(results, "Família 01 — Dados e Operações")


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
