# catalog/__init__.py
# O ScriptFactory importa este pacote via pkgutil.walk_packages
# e auto-registra todas as subclasses de BaseScript encontradas.

from . import (
    familia_01_dados,
    familia_02_preprocessamento,
    familia_03_exploratoria,
    familia_04_regressao_1d,
    familia_05_classificacao_1d,
    familia_06_deep_learning,
    familia_07_multiway_decomp,
    familia_08_multiway_regression,
    familia_09_multiway_classif,
    familia_10_calibracao_ordem_superior,
    familia_11_selecao_variaveis,
    familia_12_validacao_modelos,
    familia_13_transferencia_aprendizado,
    familia_14_sinais_espectrais,
    familia_15_imagens_hiperespectrais,
    familia_16_dados_faltantes,
    familia_17_fusao_dados,
    familia_18_quimiometria_processo,
    familia_19_interpretabilidade,
    familia_20_utilitarios,
)
