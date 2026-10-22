"""
TcheLab — Medição de consumo por job (CPU e memória).

Por que existe: para saber o custo exato de cada usuário (licença de laboratório) é preciso medir o que cada job
consumiu. O worker executa vários jobs em threads do MESMO processo, então `getrusage` sozinho mistura tudo. Aqui:

- CPU: `time.process_time()` é do processo inteiro (inclui threads do BLAS/NumPy). A cada evento (início/fim de job e a
  cada ~50 ms) o delta de CPU desde a última leitura é repartido em partes iguais entre os jobs ativos naquele
  intervalo. Com 1 job ativo, o valor é exato; com N simultâneos, é a divisão justa do que o processo gastou.
- Memória: RSS do processo (/proc/self/statm). `peak_rss_bytes` = pico absoluto do processo durante o job (serve para
  dimensionar o servidor); `mem_bytes` = quanto esse pico passou do RSS ocioso, dividido pelos jobs simultâneos
  (estimativa do que é atribuível ao job — exata com WORKER_CONCURRENCY=1).

O resultado vai em `JobResult.metrics` e o backend grava em `jobs` e `usage_monthly`.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

_PAGE = os.sysconf("SC_PAGE_SIZE") if hasattr(os, "sysconf") else 4096
_TICK_SECONDS = 0.05


def _rss_bytes() -> int:
    try:
        with open("/proc/self/statm", "rb") as f:
            return int(f.read().split()[1]) * _PAGE
    except Exception:  # fora do Linux: melhor esforço (pico do processo)
        try:
            import resource
            return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024
        except Exception:
            return 0


@dataclass
class _Acc:
    started_wall: float
    cpu_seconds: float = 0.0
    peak_rss_bytes: int = 0
    mem_bytes: int = 0
    concurrent_max: int = 1


@dataclass
class Meter:
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _active: dict = field(default_factory=dict)
    _last_cpu: float = field(default_factory=time.process_time)
    _baseline_rss: int = 0
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: Optional[threading.Thread] = None

    def _advance_locked(self) -> None:
        now = time.process_time()
        delta = max(0.0, now - self._last_cpu)
        self._last_cpu = now
        n = len(self._active)
        if not n:
            return
        rss = _rss_bytes()
        share = delta / n
        over = max(0, rss - self._baseline_rss) // n
        for acc in self._active.values():
            acc.cpu_seconds += share
            acc.peak_rss_bytes = max(acc.peak_rss_bytes, rss)
            acc.mem_bytes = max(acc.mem_bytes, over)
            acc.concurrent_max = max(acc.concurrent_max, n)

    def _loop(self) -> None:
        while not self._stop.wait(_TICK_SECONDS):
            with self._lock:
                self._advance_locked()

    def _ensure_thread(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, name="tchelab-meter", daemon=True)
            self._thread.start()

    def start(self, job_id: str) -> None:
        with self._lock:
            self._advance_locked()  # fecha o intervalo anterior antes de mudar quem está ativo
            if not self._active:
                self._baseline_rss = _rss_bytes()  # RSS ocioso: referência para "memória atribuível"
                self._last_cpu = time.process_time()
            acc = _Acc(started_wall=time.perf_counter())
            self._active[job_id] = acc
            for a in self._active.values():
                a.concurrent_max = max(a.concurrent_max, len(self._active))
        self._ensure_thread()

    def finish(self, job_id: str) -> dict:
        with self._lock:
            self._advance_locked()
            acc = self._active.pop(job_id, None)
        if acc is None:
            return {}
        return {
            "cpu_seconds": round(acc.cpu_seconds, 4),
            "wall_ms": round((time.perf_counter() - acc.started_wall) * 1000, 1),
            "peak_rss_bytes": int(acc.peak_rss_bytes),
            "mem_bytes": int(acc.mem_bytes),
            "concurrent_max": int(acc.concurrent_max),
        }


METER = Meter()
