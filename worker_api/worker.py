"""
TcheLab — Worker principal.

Loop:
  1. Pega job da fila Redis (BLPOP)
  2. Instancia o script via ScriptFactory.get(slug)
  3. Chama script.validate(inputs, params)
  4. Chama script.execute(inputs, params)
  5. Publica JobResult (sucesso ou falha)

Concorrência via ThreadPoolExecutor.
"""

from __future__ import annotations

# ------------------------------------------------------------------ #
# Fix: worker_api/queue.py tem o mesmo nome que o stdlib 'queue'.
# Garantimos que o diretório do worker fique no FINAL do sys.path,
# para que imports como 'from queue import Empty' resolvam o stdlib.
# ------------------------------------------------------------------ #
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE in sys.path:
    sys.path.remove(_HERE)
sys.path.append(_HERE)

# ------------------------------------------------------------------ #
# Imports stdlib (agora resolvem corretamente)
# ------------------------------------------------------------------ #
import logging
import signal
import time
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Optional

# ------------------------------------------------------------------ #
# Imports locais (resolvem via _HERE no final do path)
# ------------------------------------------------------------------ #
from config import Config
from factory import ScriptFactory
from redis_queue import dequeue_job, get_redis, publish_result
from schemas import JobPayload, JobResult, JobStatus

# ------------------------------------------------------------------ #
# Logging
# ------------------------------------------------------------------ #
logging.basicConfig(level=Config.LOG_LEVEL, format=Config.LOG_FORMAT)
logger = logging.getLogger("tchelab.worker")


# ------------------------------------------------------------------ #
# Processamento de um único job
# ------------------------------------------------------------------ #

def process_job(payload: JobPayload) -> JobResult:
    t0 = time.perf_counter()
    logger.info(
        "Iniciando job %s | slug=%s | execution=%s | node=%s",
        payload.job_id, payload.slug, payload.execution_id, payload.node_id,
    )
    try:
        script = ScriptFactory.get(payload.slug)
        script.validate(payload.inputs, payload.params)
        outputs = script.execute(payload.inputs, payload.params)
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            "Job %s concluído em %.1f ms", payload.job_id, duration_ms
        )
        return JobResult(
            job_id=payload.job_id,
            execution_id=payload.execution_id,
            node_id=payload.node_id,
            slug=payload.slug,
            status=JobStatus.SUCCESS,
            outputs=outputs,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.error(
            "Job %s falhou em %.1f ms: %s", payload.job_id, duration_ms, exc,
            exc_info=True,
        )
        return JobResult(
            job_id=payload.job_id,
            execution_id=payload.execution_id,
            node_id=payload.node_id,
            slug=payload.slug,
            status=JobStatus.FAILURE,
            error=str(exc),
            duration_ms=duration_ms,
        )


# ------------------------------------------------------------------ #
# Worker loop
# ------------------------------------------------------------------ #

class Worker:
    def __init__(self) -> None:
        self._running = False
        self._executor: Optional[ThreadPoolExecutor] = None
        self._futures: list[Future] = []

    def start(self) -> None:
        logger.info(
            "TcheLab Worker iniciando | concurrency=%d | queue=%s",
            Config.WORKER_CONCURRENCY, Config.JOB_QUEUE,
        )
        ScriptFactory.autodiscover()

        self._running = True
        self._executor = ThreadPoolExecutor(
            max_workers=Config.WORKER_CONCURRENCY,
            thread_name_prefix="tchelab-worker",
        )

        r = get_redis()
        logger.info("Conectado ao Redis: %s", Config.REDIS_URL)

        try:
            while self._running:
                self._futures = [f for f in self._futures if not f.done()]
                payload = dequeue_job(r, timeout=Config.POLL_INTERVAL_SECONDS)
                if payload is None:
                    continue
                future = self._executor.submit(self._run_and_publish, payload, r)
                self._futures.append(future)
        except KeyboardInterrupt:
            logger.info("Worker interrompido pelo usuário.")
        finally:
            self.stop()

    def _run_and_publish(self, payload: JobPayload, r) -> None:
        result = process_job(payload)
        publish_result(result, r)

    def stop(self) -> None:
        self._running = False
        if self._executor:
            logger.info("Aguardando jobs em execução...")
            self._executor.shutdown(wait=True)
            logger.info("Worker parado.")


# ------------------------------------------------------------------ #
# Graceful shutdown
# ------------------------------------------------------------------ #

_worker_instance: Optional[Worker] = None


def _handle_signal(signum, frame):
    logger.info("Sinal %d recebido — encerrando...", signum)
    if _worker_instance:
        _worker_instance.stop()
    sys.exit(0)


# ------------------------------------------------------------------ #
# Entrypoint
# ------------------------------------------------------------------ #

if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    _worker_instance = Worker()
    _worker_instance.start()