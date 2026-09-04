# jobs/factory.py

from __future__ import annotations

from .handlers.base import BaseHandler

from .handlers.knn    import KNNHandler
from .handlers.plsoc  import PLSOCHandler
from .handlers.simca  import SIMCAHandler
from .handlers.pls    import PLSHandler
from .handlers.pca    import PCAHandler

_REGISTRY: dict[str, dict] = {
    "KNN": {
        "handler":    KNNHandler,
        "model_type": "classification",
        "label":      "K-Nearest Neighbors (KNN)",
        "description": (
            "Classifica uma amostra com base nas k amostras de treino mais "
            "próximas no espaço espectral. Simples e interpretável."
        ),
        "hyperparameters": {
            "n_neighbors": {
                "type":    "int",
                "label":   "Número de vizinhos (k)",
                "default": 5,
                "min":     1,
                "max":     50,
            },
            "metric": {
                "type":    "select",
                "label":   "Métrica de distância",
                "default": "euclidean",
                "options": ["euclidean", "mahalanobis", "cosine", "cityblock"],
            },
            "weights": {
                "type":    "select",
                "label":   "Ponderação dos vizinhos",
                "default": "uniform",
                "options": ["uniform", "distance"],
            },
        },
    },

    "PLS-OC": {
        "handler":    PLSOCHandler,
        "model_type": "classification",
        "label":      "PLS One-Class (PLS-OC)",
        "description": (
            "Modelo one-class baseado em PLS: modela apenas a classe de "
            "interesse e rejeita amostras fora do espaço definido."
        ),
        "hyperparameters": {
            "n_components": {
                "type":    "int",
                "label":   "Número de componentes latentes",
                "default": 3,
                "min":     1,
                "max":     20,
            },
            "threshold": {
                "type":    "float",
                "label":   "Limiar de aceitação (α)",
                "default": 0.05,
                "min":     0.01,
                "max":     0.20,
                "step":    0.01,
            },
        },
    },

    "SIMCA": {
        "handler":    SIMCAHandler,
        "model_type": "classification",
        "label":      "SIMCA",
        "description": (
            "Soft Independent Modelling of Class Analogy. Constrói um modelo "
            "PCA por classe e avalia pertencimento via distância de Hotelling T² "
            "e resíduo Q."
        ),
        "hyperparameters": {
            "n_components": {
                "type":    "int",
                "label":   "Componentes PCA por classe",
                "default": 3,
                "min":     1,
                "max":     20,
            },
            "alpha": {
                "type":    "float",
                "label":   "Nível de significância (α)",
                "default": 0.05,
                "min":     0.01,
                "max":     0.20,
                "step":    0.01,
            },
        },
    },

    "PLS": {
        "handler":    PLSHandler,
        "model_type": "regression",
        "label":      "Partial Least Squares (PLS)",
        "description": (
            "Regressão PLS para predição de propriedades contínuas. "
            "O algoritmo de regressão mais usado em NIR e FTIR."
        ),
        "hyperparameters": {
            "n_components": {
                "type":    "int",
                "label":   "Componentes latentes",
                "default": 3,
                "min":     1,
                "max":     20,
            },
            "scale": {
                "type":    "bool",
                "label":   "Centrar e escalar X",
                "default": False,
            },
        },
    },

    "PCA": {
        "handler":    PCAHandler,
        "model_type": "exploratory",
        "label":      "Principal Component Analysis (PCA)",
        "description": (
            "Análise exploratória: reduz dimensionalidade e revela agrupamentos, "
            "tendências e outliers no espaço espectral."
        ),
        "hyperparameters": {
            "n_components": {
                "type":    "int",
                "label":   "Número de componentes principais",
                "default": 3,
                "min":     1,
                "max":     20,
            },
        },
    },
}


# ─── API pública ──────────────────────────────────────────────────────────────

def get_handler(algorithm: str) -> BaseHandler:
    """Retorna uma instância do handler para o algoritmo solicitado."""
    entry = _REGISTRY.get(algorithm)
    if not entry:
        raise NotImplementedError(
            f"Algoritmo '{algorithm}' desconhecido. "
            f"Disponíveis: {available_algorithm_names()}"
        )
    if entry["handler"] is None:
        raise NotImplementedError(
            f"Algoritmo '{algorithm}' ainda não implementado."
        )
    return entry["handler"]()


def available_algorithms() -> list[dict]:
    """
    Retorna a lista de algoritmos prontos para uso, com metadados completos.
    Usado pelo endpoint GET /models/algorithms.
    """
    return [
        {
            "algorithm":       key,
            "label":           val["label"],
            "description":     val["description"],
            "model_type":      val["model_type"],
            "hyperparameters": val["hyperparameters"],
        }
        for key, val in _REGISTRY.items()
        if val["handler"] is not None
    ]


def available_algorithm_names() -> list[str]:
    """Lista só os nomes — útil para mensagens de erro."""
    return [k for k, v in _REGISTRY.items() if v["handler"] is not None]