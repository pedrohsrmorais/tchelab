"""
preprocessing/pipeline.py
──────────────────────────
Pipeline de pré-processamento espectral serializável com joblib.

Uso típico num handler:

    from preprocessing.pipeline import SpectralPipeline

    # Treino
    pipe = SpectralPipeline.from_config(preprocessing_config)
    X_proc = pipe.fit_transform(X_train)
    result = {"pipeline": pipe, "model": trained_model}
    joblib.dump(result, model_path)

    # Predição
    obj = joblib.load(model_path)
    X_proc = obj["pipeline"].transform(X_new)
    preds  = obj["model"].predict(X_proc)

Adicionando um novo método
──────────────────────────
1. Implemente uma classe que herde de `BaseStep` e defina `fit` e `transform`.
2. Registre-a em `_STEP_REGISTRY` com uma chave string.
3. Pronto — o frontend só precisa mandar essa chave no JSON de preprocessing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np


# ══════════════════════════════════════════════════════════════════════════════
# Contrato base
# ══════════════════════════════════════════════════════════════════════════════

class BaseStep(ABC):
    """
    Um passo de pré-processamento serializável.
    Segue a API fit / transform do scikit-learn para compatibilidade,
    mas sem herdar dele (evita dependências desnecessárias).
    """

    def fit(self, X: np.ndarray) -> "BaseStep":
        """
        Calcula estatísticas a partir de X_train (média, std, referência MSC…).
        Para passos sem estado (SNV, derivadas) apenas retorna self.
        """
        return self

    @abstractmethod
    def transform(self, X: np.ndarray) -> np.ndarray:
        """Aplica o passo a X sem recalcular estatísticas."""
        ...

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return self.fit(X).transform(X)

    # Representação legível para logs / API
    @property
    @abstractmethod
    def name(self) -> str: ...

    def to_dict(self) -> dict:
        """Serializa parâmetros para exibição no frontend."""
        return {"step": self.name}


# ══════════════════════════════════════════════════════════════════════════════
# Implementações
# ══════════════════════════════════════════════════════════════════════════════

class NoopStep(BaseStep):
    """Sem pré-processamento — passa X inalterado."""

    name = "none"

    def transform(self, X: np.ndarray) -> np.ndarray:
        return X


class CenterStep(BaseStep):
    """Centralização: subtrai a média de cada variável calculada no treino."""

    name = "center"

    def __init__(self) -> None:
        self._mean: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> "CenterStep":
        self._mean = X.mean(axis=0)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self._mean is None:
            raise RuntimeError("CenterStep: chame fit() antes de transform().")
        return X - self._mean

    def to_dict(self) -> dict:
        return {"step": self.name}


class AutoscaleStep(BaseStep):
    """
    Autoescalonamento (UV): centraliza e divide pelo desvio padrão de cada variável.
    Variáveis com std ≈ 0 são mantidas como zero para evitar divisão por zero.
    """

    name = "autoscale"

    def __init__(self) -> None:
        self._mean: np.ndarray | None = None
        self._std:  np.ndarray | None = None

    def fit(self, X: np.ndarray) -> "AutoscaleStep":
        self._mean = X.mean(axis=0)
        self._std  = X.std(axis=0, ddof=1)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self._mean is None or self._std is None:
            raise RuntimeError("AutoscaleStep: chame fit() antes de transform().")
        std = np.where(self._std < 1e-10, 1.0, self._std)
        return (X - self._mean) / std

    def to_dict(self) -> dict:
        return {"step": self.name}


class SNVStep(BaseStep):
    """
    Standard Normal Variate.
    Opera por amostra (linha): subtrai a média e divide pelo desvio padrão.
    Não tem estado — fit() é identidade.
    """

    name = "snv"

    def transform(self, X: np.ndarray) -> np.ndarray:
        mean = X.mean(axis=1, keepdims=True)
        std  = X.std(axis=1, keepdims=True, ddof=1)
        std  = np.where(std < 1e-10, 1.0, std)
        return (X - mean) / std


class MSCStep(BaseStep):
    """
    Multiplicative Scatter Correction.
    No fit() calcula o espectro de referência (média do conjunto de treino).
    No transform() regride cada amostra contra a referência e corrige.
    """

    name = "msc"

    def __init__(self) -> None:
        self._reference: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> "MSCStep":
        self._reference = X.mean(axis=0)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self._reference is None:
            raise RuntimeError("MSCStep: chame fit() antes de transform().")
        ref = self._reference
        corrected = np.zeros_like(X)
        for i, spectrum in enumerate(X):
            # Regressão linear: spectrum ≈ a + b * reference
            coeffs = np.polyfit(ref, spectrum, deg=1)   # [b, a]
            b, a   = coeffs
            corrected[i] = (spectrum - a) / (b if abs(b) > 1e-10 else 1.0)
        return corrected

    def to_dict(self) -> dict:
        return {"step": self.name}


class SavitzkyGolayStep(BaseStep):
    """
    Suavização ou derivada de Savitzky-Golay.
    Usa scipy.signal.savgol_filter internamente.

    Parâmetros
    ----------
    window_length : int  (default 11, deve ser ímpar)
    polyorder     : int  (default 2)
    deriv         : int  (0 = suavização, 1 = 1ª derivada, 2 = 2ª derivada)
    delta         : float  espaçamento entre pontos (default 1.0)
    """

    def __init__(
        self,
        window_length: int = 11,
        polyorder:     int = 2,
        deriv:         int = 0,
        delta:         float = 1.0,
    ) -> None:
        if window_length % 2 == 0:
            window_length += 1          # garante ímpar
        self.window_length = window_length
        self.polyorder     = polyorder
        self.deriv         = deriv
        self.delta         = delta

    @property
    def name(self) -> str:
        if self.deriv == 0:
            return "sg_smooth"
        return f"sg_deriv{self.deriv}"

    def transform(self, X: np.ndarray) -> np.ndarray:
        from scipy.signal import savgol_filter
        return savgol_filter(
            X,
            window_length=self.window_length,
            polyorder=self.polyorder,
            deriv=self.deriv,
            delta=self.delta,
            axis=1,
        )

    def to_dict(self) -> dict:
        return {
            "step":          self.name,
            "window_length": self.window_length,
            "polyorder":     self.polyorder,
            "deriv":         self.deriv,
            "delta":         self.delta,
        }


class RangeCutStep(BaseStep):
    """
    Corte de região espectral.
    Mantém apenas as colunas cujo índice está dentro do intervalo [idx_min, idx_max].

    Geralmente aplicado primeiro no pipeline.
    O frontend envia índices de coluna (não valores de comprimento de onda) —
    a conversão wavenumber → índice deve ser feita antes de montar o pipeline.

    Parâmetros
    ----------
    idx_min : int  índice inicial (inclusivo)
    idx_max : int  índice final   (inclusivo)
    """

    name = "range_cut"

    def __init__(self, idx_min: int, idx_max: int) -> None:
        self.idx_min = int(idx_min)
        self.idx_max = int(idx_max)

    def transform(self, X: np.ndarray) -> np.ndarray:
        return X[:, self.idx_min : self.idx_max + 1]

    def to_dict(self) -> dict:
        return {"step": self.name, "idx_min": self.idx_min, "idx_max": self.idx_max}


# ══════════════════════════════════════════════════════════════════════════════
# Registry de passos
# ══════════════════════════════════════════════════════════════════════════════
#
# Para adicionar um novo método:
#   1. Implemente sua classe herdando de BaseStep.
#   2. Adicione uma entrada aqui.
#   3. Nada mais muda — SpectralPipeline.from_config() já vai reconhecê-lo.

_STEP_REGISTRY: dict[str, type[BaseStep]] = {
    "none":      NoopStep,
    "center":    CenterStep,
    "autoscale": AutoscaleStep,
    "snv":       SNVStep,
    "msc":       MSCStep,
    "sg_smooth": SavitzkyGolayStep,   # deriv=0
    "sg_deriv1": SavitzkyGolayStep,   # deriv=1
    "sg_deriv2": SavitzkyGolayStep,   # deriv=2
    "range_cut": RangeCutStep,
}

# Parâmetros default para variantes do SG que diferem só no `deriv`
_STEP_DEFAULTS: dict[str, dict] = {
    "sg_smooth": {"deriv": 0},
    "sg_deriv1": {"deriv": 1},
    "sg_deriv2": {"deriv": 2},
}


def available_steps() -> list[dict]:
    """
    Retorna metadados de cada passo para o frontend montar o seletor de
    pré-processamento. Chamado por GET /models/algorithms ou endpoint próprio.
    """
    return [
        {"step": key, "class": cls.__name__}
        for key, cls in _STEP_REGISTRY.items()
    ]


# ══════════════════════════════════════════════════════════════════════════════
# Pipeline
# ══════════════════════════════════════════════════════════════════════════════

class SpectralPipeline:
    """
    Sequência ordenada de BaseStep.
    Serializável com joblib — não herda de nenhuma classe externa.

    Config esperada pelo from_config() (vinda do campo `preprocessing` do banco):

        [
            {"step": "range_cut", "idx_min": 10, "idx_max": 950},
            {"step": "snv"},
            {"step": "sg_deriv1", "window_length": 11, "polyorder": 2}
        ]

    A ordem da lista é a ordem de aplicação.
    """

    def __init__(self, steps: list[BaseStep]) -> None:
        self.steps = steps

    # ── Construção ─────────────────────────────────────────────────────────

    @classmethod
    def from_config(cls, config: list[dict] | None) -> "SpectralPipeline":
        """
        Constrói o pipeline a partir de uma lista de dicts.
        Config None ou vazia → pipeline com NoopStep.
        """
        if not config:
            return cls([NoopStep()])

        steps: list[BaseStep] = []
        for entry in config:
            entry  = dict(entry)                        # cópia para não mutar
            key    = entry.pop("step")
            cls_   = _STEP_REGISTRY.get(key)
            if cls_ is None:
                raise ValueError(
                    f"Passo de pré-processamento desconhecido: '{key}'. "
                    f"Disponíveis: {list(_STEP_REGISTRY.keys())}"
                )
            # Merge com defaults do passo (ex: deriv=1 para sg_deriv1)
            kwargs = {**_STEP_DEFAULTS.get(key, {}), **entry}
            steps.append(cls_(**kwargs))

        return cls(steps)

    # ── Execução ───────────────────────────────────────────────────────────

    def fit(self, X: np.ndarray) -> "SpectralPipeline":
        for step in self.steps:
            X = step.fit_transform(X)
        # Refaz para que cada step.fit veja o X já transformado pelos anteriores
        # A linha acima já faz isso corretamente passo a passo.
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        for step in self.steps:
            X = step.transform(X)
        return X

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        """Fit em cada passo com o X já transformado pelos anteriores."""
        for step in self.steps:
            X = step.fit_transform(X)
        return X

    # ── Serialização / inspeção ────────────────────────────────────────────

    def to_config(self) -> list[dict]:
        """Exporta o pipeline de volta para lista de dicts (para o banco/frontend)."""
        return [step.to_dict() for step in self.steps]

    def __repr__(self) -> str:
        chain = " → ".join(s.name for s in self.steps)
        return f"SpectralPipeline([{chain}])"