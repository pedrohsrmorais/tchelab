"""
TcheLab — Schemas Pydantic para o worker.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"


class JobPayload(BaseModel):
    """Payload enviado pelo backend para o worker via Redis."""

    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    execution_id: str
    node_id: str
    slug: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class JobResult(BaseModel):
    """Resultado publicado pelo worker de volta ao backend."""

    job_id: str
    execution_id: str
    node_id: str
    slug: str
    status: JobStatus
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    duration_ms: float | None = None
    finished_at: datetime = Field(default_factory=datetime.utcnow)
