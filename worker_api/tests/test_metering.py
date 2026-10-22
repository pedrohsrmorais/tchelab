"""Testes do medidor de consumo por job (metering.py). Uso: python -m tests.test_metering"""
from __future__ import annotations

import os
import sys
import threading
import time

import numpy as np

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from metering import Meter  # noqa: E402


def _burn(n=1100, reps=3):
    a = np.random.rand(n, n)
    for _ in range(reps):
        a @ a


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f" {extra}" if extra and not cond else ""))
    return bool(cond)


def main() -> int:
    ok = True
    m = Meter()
    t = time.process_time()
    m.start("solo")
    _burn()
    r = m.finish("solo")
    real = time.process_time() - t
    ok &= check("job sozinho: CPU medida ≈ CPU real do processo", abs(r["cpu_seconds"] - real) <= 0.05 + 0.1 * real, f"{r['cpu_seconds']} vs {real:.3f}")
    ok &= check("pico de RSS e memória atribuível preenchidos", r["peak_rss_bytes"] > 0 and r["mem_bytes"] > 0 and r["concurrent_max"] == 1, str(r))
    ok &= check("wall_ms positivo", r["wall_ms"] > 0)

    res = {}

    def job(name):
        m.start(name)
        _burn(1000, 2)
        res[name] = m.finish(name)

    t = time.process_time()
    ths = [threading.Thread(target=job, args=(n,)) for n in ("a", "b", "c")]
    [x.start() for x in ths]
    [x.join() for x in ths]
    real = time.process_time() - t
    total = sum(v["cpu_seconds"] for v in res.values())
    ok &= check("3 jobs simultâneos: soma das CPUs ≈ CPU do processo", abs(total - real) <= 0.05 + 0.1 * real, f"{total:.3f} vs {real:.3f}")
    ok &= check("simultaneidade registrada", max(v["concurrent_max"] for v in res.values()) >= 2)

    r = m.finish("nao_existe")
    ok &= check("finish de job desconhecido não quebra", r == {})
    r = (m.start("curto"), m.finish("curto"))[1]
    ok &= check("job curtíssimo mede zero sem erro", r["cpu_seconds"] >= 0 and r["wall_ms"] >= 0)
    print("OK" if ok else "FALHOU")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
