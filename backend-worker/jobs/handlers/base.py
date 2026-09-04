from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np


class BaseHandler(ABC):
    """
    Contrato que todo handler de algoritmo deve implementar.

    Ciclo de vida de um job de treino:
        params = handler.validate_hyperparameters(raw_params)
        result = handler.train(X_train, y_train, params, preprocessing)
        # result salvo em models + job.result pelo workerUpdate

    Ciclo de vida de um job de predição:
        result = handler.predict(model_path, X)
        # result salvo em predictions + job.result pelo workerUpdate
    """

    # ── Treino ────────────────────────────────────────────────────────────────

    @abstractmethod
    def train(
        self,
        X: np.ndarray,
        y: np.ndarray | None,
        params: dict,
        preprocessing: dict | None = None,
    ) -> dict:
        """
        Treina o modelo e serializa em disco.

        Parâmetros
        ----------
        X : array (n_samples, n_features)
            Matriz espectral já interpolada / alinhada.
        y : array (n_samples,) ou None
            Rótulos de classe (classificação) ou valores contínuos (regressão).
            None apenas para algoritmos exploratórios (PCA, etc.).
        params : dict
            Hiperparâmetros já validados por validate_hyperparameters().
        preprocessing : dict | None
            Configuração de pré-processamento (SNV, MSC, derivada, etc.)
            a ser aplicada antes do treino e persistida junto ao modelo.

        Retorno esperado
        ----------------
        {
            "model_path":    str,          # caminho absoluto do .pkl/.joblib salvo
            "model_size_kb": int,
            "train_samples": int,
            "test_samples":  int,          # 0 se não houve split interno
            "metrics_cal":   dict,         # métricas no conjunto de calibração
            "metrics_cv":    dict,         # métricas de validação cruzada
            "metrics_ext":   dict | None,  # métricas de teste externo (opcional)
        }
        """
        ...

    # ── Predição ─────────────────────────────────────────────────────────────

    @abstractmethod
    def predict(
        self,
        model_path: str,
        X: np.ndarray,
        sample_names: list[str] | None = None,
    ) -> dict:
        """
        Carrega o modelo serializado e gera predições.

        Parâmetros
        ----------
        model_path : str
            Caminho do arquivo salvo pelo train().
        X : array (n_samples, n_features)
            Dados novos, já no mesmo espaço espectral do treino.
        sample_names : list[str] | None
            Nomes das amostras para incluir no resultado (opcional).

        Retorno esperado
        ----------------
        {
            "predictions": [
                {
                    "position":     int,
                    "sample_name":  str | None,
                    "predicted":    str | float,   # classe ou valor
                    "score":        float | None,  # probabilidade / distância
                }
            ],
            "sample_count": int,
        }
        """
        ...

    # ── Validação de hiperparâmetros ─────────────────────────────────────────

    def validate_hyperparameters(self, params: dict) -> dict:
        """
        Valida e completa os hiperparâmetros com os defaults do algoritmo.

        O comportamento padrão retorna params sem alteração.
        Handlers concretos devem sobrescrever para aplicar defaults,
        coerção de tipos e validação de intervalos.

        Exemplo de implementação em um handler concreto:

            def validate_hyperparameters(self, params):
                defaults = {"n_components": 3, "alpha": 0.05}
                merged   = {**defaults, **params}
                if not (1 <= merged["n_components"] <= 20):
                    raise ValueError("n_components deve estar entre 1 e 20.")
                return merged
        """
        return params

    # ── Utilitários protegidos ────────────────────────────────────────────────

    def _serialize(self, obj: Any, path: str) -> int:
        """
        Serializa `obj` em `path` com joblib e retorna o tamanho em KB.
        Helpers concretos podem chamar este método no train().
        """
        import joblib, os
        joblib.dump(obj, path, compress=3)
        return max(1, os.path.getsize(path) // 1024)

    def _load(self, path: str) -> Any:
        """Carrega um objeto serializado com joblib."""
        import joblib
        return joblib.load(path)