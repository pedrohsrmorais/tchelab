"""
TcheLab — BaseScript
Classe abstrata que todo script do catálogo deve herdar.
"""

from __future__ import annotations

import abc
from typing import Any


class BaseScript(abc.ABC):
    """
    Contrato mínimo de cada script do catálogo TcheLab.

    Subclasses devem declarar atributos de classe:
        slug    : str   — identificador único snake_case
        nome    : str   — nome legível
        familia : str   — código da família (ex: '01_dados')
        descricao: str  — o que o script faz

    E implementar os métodos abstratos validate() e execute().
    """

    # ------------------------------------------------------------------ #
    # Metadados (obrigatórios na subclasse)
    # ------------------------------------------------------------------ #
    slug: str = ""
    nome: str = ""
    familia: str = ""
    descricao: str = ""

    # ------------------------------------------------------------------ #
    # Interface pública
    # ------------------------------------------------------------------ #

    @abc.abstractmethod
    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        """
        Valida tipo, shape, dtype, ordem analítica e compatibilidade entre
        entradas ANTES de qualquer computação.

        Levanta ValueError com mensagem descritiva em caso de falha.
        Não deve ter efeitos colaterais.
        """

    @abc.abstractmethod
    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        """
        Executa o script sobre entradas já validadas.

        Retorna dicionário com as saídas declaradas no catálogo.
        Não chama validate() internamente — o worker já o fez.
        """

    # ------------------------------------------------------------------ #
    # Helpers compartilhados
    # ------------------------------------------------------------------ #

    @staticmethod
    def _require_key(d: dict, key: str, label: str = "input") -> Any:
        if key not in d or d[key] is None:
            raise ValueError(f"Campo obrigatório ausente: {label}['{key}']")
        return d[key]

    @staticmethod
    def _require_ndim(arr: Any, ndim: int, name: str) -> None:
        import numpy as np
        a = np.asarray(arr)
        if a.ndim != ndim:
            raise ValueError(
                f"'{name}' deve ter {ndim} dimensão(ões), mas tem {a.ndim}."
            )

    @staticmethod
    def _require_ndim_range(arr: Any, min_ndim: int, max_ndim: int, name: str) -> None:
        import numpy as np
        a = np.asarray(arr)
        if not (min_ndim <= a.ndim <= max_ndim):
            raise ValueError(
                f"'{name}' deve ter entre {min_ndim} e {max_ndim} dimensões, "
                f"mas tem {a.ndim}."
            )

    @staticmethod
    def _require_shapes_match(a: Any, b: Any, axis: int, name_a: str, name_b: str) -> None:
        import numpy as np
        sa = np.asarray(a).shape[axis]
        sb = np.asarray(b).shape[axis]
        if sa != sb:
            raise ValueError(
                f"Eixo {axis} de '{name_a}' ({sa}) ≠ '{name_b}' ({sb})."
            )

    @staticmethod
    def _require_dtype_float(arr: Any, name: str) -> None:
        import numpy as np
        a = np.asarray(arr)
        if not np.issubdtype(a.dtype, np.floating):
            raise ValueError(
                f"'{name}' deve ter dtype float, mas tem {a.dtype}."
            )

    def to_dict(self) -> dict:
        return {
            "slug": self.slug,
            "nome": self.nome,
            "familia": self.familia,
            "descricao": self.descricao,
        }
