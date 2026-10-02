#!/usr/bin/env python3
"""
TcheLab — Suite de Testes Completa
Executa smoke tests para todas as 20 famílias.

Uso:
    cd worker_api
    python -m tests.run_all               # todos
    python -m tests.run_all --familia 04  # só família 04
    python -m tests.run_all --familia 06  # pula deep learning por padrão; use --all
    python -m tests.run_all --skip-dl     # pula deep learning (default: incluído)
"""
from __future__ import annotations

import sys
import argparse
import time

# Allow running from the worker_api directory
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)


def main():
    parser = argparse.ArgumentParser(description="TcheLab smoke test runner")
    parser.add_argument("--familia", type=str, default=None,
                        help="Run only this family number (e.g. '04', '11')")
    parser.add_argument("--skip-dl", action="store_true",
                        help="Skip família 06 (Deep Learning) — faster CI")
    parser.add_argument("--list", action="store_true",
                        help="List available test modules and exit")
    args = parser.parse_args()

    # All test modules in order
    suites = [
        ("01", "tests.test_familia_01_dados"),
        ("02", "tests.test_familia_02_preprocess"),
        ("03", "tests.test_familia_03_exploratoria"),
        ("04", "tests.test_familia_04_regressao"),
        ("05", "tests.test_familia_05_classificacao"),
        ("06", "tests.test_familia_06_deep_learning"),
        ("07", "tests.test_familia_07_multiway"),
        ("08", "tests.test_familia_08_multiway_reg"),
        ("09", "tests.test_familia_09_multiway_clf"),
        ("10", "tests.test_familia_10_ordem_superior"),
        ("11", "tests.test_familia_11_selecao_variaveis"),
        ("12-20", "tests.test_familias_12_20"),
    ]

    if args.list:
        print("\nDisponível:")
        for fam, mod in suites:
            print(f"  --familia {fam:>5}  →  {mod}")
        return

    # Filter
    if args.familia:
        suites = [(f, m) for f, m in suites if args.familia in f]
        if not suites:
            print(f"Família '{args.familia}' não encontrada.")
            sys.exit(1)

    if args.skip_dl:
        suites = [(f, m) for f, m in suites if f != "06"]

    # Bootstrap factory once
    print("\nIniciando ScriptFactory…")
    t0 = time.perf_counter()
    from tests.helpers import _ensure_factory
    _ensure_factory()
    print(f"Factory pronta em {(time.perf_counter()-t0)*1000:.0f}ms\n")

    # Run
    all_ok = True
    for fam, modname in suites:
        import importlib
        try:
            mod = importlib.import_module(modname)
        except ImportError as e:
            print(f"[ERRO] Não foi possível importar {modname}: {e}")
            all_ok = False
            continue
        ok = mod.run()
        if not ok:
            all_ok = False

    if all_ok:
        print("✅  Todos os testes passaram.\n")
        sys.exit(0)
    else:
        print("❌  Alguns testes falharam.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
