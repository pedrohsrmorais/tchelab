"""
TcheLab — Normalização de outputs para tipos nativos serializáveis em JSON.

Achado ao implementar o Kennard-Stone: `JobResult.model_dump_json()` (Pydantic
v2) NÃO sabe serializar `numpy.ndarray`, `numpy.generic` (int64/float64/bool_)
nem `complex` — e a maioria dos scripts do catálogo (soma, subtracao, svd,
produto_matricial, o próprio kennard_stone etc.) retorna arrays numpy crus em
`execute()`. Sem essa normalização, `publish_result()` levanta
`PydanticSerializationError` e o resultado nunca chega ao backend — o job
fica para sempre em "pending/running" sem nenhum erro visível no banco.

Confirmado reproduzindo o erro diretamente:
    JobResult(..., outputs={"result": np.array([[1.0, 2.0]])}).model_dump_json()
    → PydanticSerializationError: Unable to serialize unknown type: <class 'numpy.ndarray'>

`to_jsonable()` é aplicado uma única vez, no limite entre `script.execute()`
e a construção do `JobResult` (em worker.py), para não precisar alterar os
~115 scripts do catálogo individualmente.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def to_jsonable(obj: Any) -> Any:
    """Converte recursivamente numpy/complex para tipos nativos do Python
    aceitos por json/Pydantic. Preserva a convenção já usada no catálogo
    para números complexos: {"real": [...], "imag": [...]}."""
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        if np.iscomplexobj(obj):
            return {"real": to_jsonable(obj.real.tolist()), "imag": to_jsonable(obj.imag.tolist())}
        return to_jsonable(obj.tolist())
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return _safe_float(float(obj))
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, complex):
        return {"real": _safe_float(obj.real), "imag": _safe_float(obj.imag)}
    if isinstance(obj, float):
        return _safe_float(obj)
    return obj


def _safe_float(v: float) -> float | None:
    """NaN/Inf não são JSON estritamente válidos (Pydantic v2 rejeita por
    padrão em model_dump_json). Normaliza para None, igual ao comportamento
    esperado por quem consome `output_data` como JSON puro no backend."""
    if math.isnan(v) or math.isinf(v):
        return None
    return v
