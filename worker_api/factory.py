"""
TcheLab — ScriptFactory
Registra automaticamente todas as subclasses de BaseScript e permite
instanciação por slug.  O worker NUNCA executa código arbitrário: apenas
scripts declarados no catálogo podem ser instanciados.
"""

from __future__ import annotations

import importlib
import pkgutil
import logging
from typing import Type

from catalog.base import BaseScript

logger = logging.getLogger(__name__)


class ScriptFactory:
    """Registro central de scripts do catálogo."""

    _registry: dict[str, Type[BaseScript]] = {}

    # ------------------------------------------------------------------ #
    # Auto-discovery
    # ------------------------------------------------------------------ #

    @classmethod
    def autodiscover(cls) -> None:
        """
        Importa recursivamente todos os módulos dentro de `catalog/`
        para que as subclasses de BaseScript se registrem via
        ScriptFactory.register() (chamado no __init_subclass__).
        """
        import catalog  # noqa: F401

        catalog_pkg = importlib.import_module("catalog")
        for finder, name, ispkg in pkgutil.walk_packages(
            path=catalog_pkg.__path__,
            prefix=catalog_pkg.__name__ + ".",
            onerror=lambda n: logger.warning("Erro ao importar módulo %s", n),
        ):
            try:
                importlib.import_module(name)
            except Exception as exc:
                logger.warning("Não foi possível importar %s: %s", name, exc)

        # Fallback sweep: register any BaseScript subclass that was loaded
        # before the __init_subclass__ hook was installed (e.g. modules
        # already in sys.modules that pkgutil skipped).
        def _sweep(klass):
            for sub in klass.__subclasses__():
                if sub.slug:
                    cls.register(sub)
                _sweep(sub)

        _sweep(BaseScript)

        logger.info(
            "ScriptFactory: %d scripts registrados.", len(cls._registry)
        )

    # ------------------------------------------------------------------ #
    # Registro
    # ------------------------------------------------------------------ #

    @classmethod
    def register(cls, script_cls: Type[BaseScript]) -> None:
        slug = script_cls.slug
        if not slug:
            return  # classe abstrata intermediária — ignora
        if slug in cls._registry:
            logger.debug("Slug '%s' já registrado — sobrescrevendo.", slug)
        cls._registry[slug] = script_cls
        logger.debug("Registrado: %s (%s)", slug, script_cls.__name__)

    # ------------------------------------------------------------------ #
    # Instanciação
    # ------------------------------------------------------------------ #

    @classmethod
    def get(cls, slug: str) -> BaseScript:
        """
        Retorna uma instância nova do script identificado por `slug`.
        Levanta KeyError se o slug não for encontrado no catálogo.
        """
        if slug not in cls._registry:
            available = sorted(cls._registry.keys())
            raise KeyError(
                f"Script '{slug}' não encontrado no catálogo. "
                f"Disponíveis: {available}"
            )
        return cls._registry[slug]()

    @classmethod
    def list_all(cls) -> list[dict]:
        """Retorna metadados de todos os scripts registrados."""
        return [cls._registry[s]().to_dict() for s in sorted(cls._registry)]

    @classmethod
    def list_by_family(cls, familia: str) -> list[dict]:
        return [
            cls._registry[s]().to_dict()
            for s in sorted(cls._registry)
            if cls._registry[s].familia == familia
        ]


# ------------------------------------------------------------------ #
# Hook de auto-registro via __init_subclass__
# ------------------------------------------------------------------ #

_original_init_subclass = BaseScript.__init_subclass__


def _auto_register_subclass(cls, **kwargs):
    _original_init_subclass(**kwargs)
    ScriptFactory.register(cls)


BaseScript.__init_subclass__ = classmethod(_auto_register_subclass)  # type: ignore
