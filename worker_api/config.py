"""
TcheLab — Configuração do worker via variáveis de ambiente.
"""

from __future__ import annotations

import os


class Config:
    # Redis
    # DB=1 para não colidir com outros workers que usam DB=0 na mesma VPS.
    # Sobrescreva com REDIS_URL=redis://localhost:6379/1 no .env do worker_api.
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/1")
    JOB_QUEUE: str = os.getenv("JOB_QUEUE", "tchelab_fila")
    RESULT_CHANNEL: str = os.getenv("RESULT_CHANNEL", "tchelab_resultados")

    # Worker
    WORKER_CONCURRENCY: int = int(os.getenv("WORKER_CONCURRENCY", "4"))
    JOB_TIMEOUT_SECONDS: int = int(os.getenv("JOB_TIMEOUT_SECONDS", "300"))
    POLL_INTERVAL_SECONDS: float = float(os.getenv("POLL_INTERVAL_SECONDS", "0.5"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv(
        "LOG_FORMAT",
        "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )