"""
TcheLab — Interface com Redis (enqueue / dequeue / publish result).

NOTA: este arquivo se chama redis_queue.py (não queue.py) para evitar
conflito com o módulo stdlib 'queue' do Python.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import redis

from config import Config
from schemas import JobPayload, JobResult

logger = logging.getLogger(__name__)


def get_redis() -> redis.Redis:
    return redis.from_url(Config.REDIS_URL, decode_responses=True)


def enqueue_job(payload: JobPayload, r: Optional[redis.Redis] = None) -> None:
    """Publica um job na fila Redis (usado pelo backend/testes)."""
    client = r or get_redis()
    client.rpush(Config.JOB_QUEUE, payload.model_dump_json())
    logger.debug("Job enfileirado: %s (slug=%s)", payload.job_id, payload.slug)


def dequeue_job(r: redis.Redis, timeout: float = 1.0) -> Optional[JobPayload]:
    """
    Tenta retirar um job da fila.
    Usa BLPOP para bloquear até `timeout` segundos.
    Retorna None se a fila estiver vazia.
    """
    result = r.blpop(Config.JOB_QUEUE, timeout=timeout)
    if result is None:
        return None
    _, raw = result
    try:
        data = json.loads(raw)
        return JobPayload(**data)
    except Exception as exc:
        logger.error("Job inválido descartado: %s — %s", raw[:200], exc)
        return None


def publish_result(result: JobResult, r: Optional[redis.Redis] = None) -> None:
    """Publica o resultado num canal Pub/Sub e também como chave expiável."""
    client = r or get_redis()
    payload = result.model_dump_json()
    client.publish(Config.RESULT_CHANNEL, payload)
    # Mantém o resultado disponível por 1 hora para polling
    key = f"tchelab:result:{result.job_id}"
    client.setex(key, 3600, payload)
    logger.debug(
        "Resultado publicado: %s status=%s", result.job_id, result.status
    )