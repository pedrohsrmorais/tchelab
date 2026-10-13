# -*- coding: utf-8 -*-
"""
Fase 1 — corrige os 9 parameter_schema com bug de nome de chave (schema no
banco não bate com o que o Python realmente lê via params.get(...)).

Gera um UPDATE ... SET parameter_schema = JSON_OBJECT(...) completo (não
merge — substitui inteiro, já que o schema antigo está errado e não deve
sobreviver) por técnica, idempotente.
"""
import json

SCHEMAS = {
    "rnn": {
        "task": {"type": "string", "default": "regression", "enum": ["regression", "classification"],
                  "description": "Tipo de tarefa."},
        "cell": {"type": "string", "default": "lstm", "enum": ["lstm", "gru"],
                  "description": "Tipo de célula recorrente."},
        "units": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [64],
                   "description": "Número de unidades por camada recorrente — o comprimento da lista é o número de camadas ocultas (ex: [64, 32] = 2 camadas)."},
        "dense_units": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [32],
                         "description": "Unidades das camadas densas finais, após a parte recorrente."},
        "dropout": {"type": "number", "default": 0.0, "minimum": 0, "maximum": 0.9,
                     "description": "Taxa de dropout aplicada nas camadas recorrentes."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1,
                    "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1,
                        "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001,
                            "description": "Taxa de aprendizado do otimizador."},
    },
    "tucker3": {
        "ranks": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [2, 2, 2],
                   "description": "Rank (número de componentes) em cada um dos 3 modos do tensor — deve ter exatamente 3 valores."},
        "n_iter_max": {"type": "integer", "default": 100, "minimum": 1,
                        "description": "Número máximo de iterações do algoritmo de otimização."},
        "tol": {"type": "number", "default": 1e-8, "minimum": 0,
                 "description": "Tolerância de convergência."},
    },
    "pca": {
        "n_components": {"type": "integer", "default": None, "minimum": 1,
                           "description": "Número de componentes principais a reter. Deixe em branco para manter todos."},
        "center": {"type": "boolean", "default": True,
                    "description": "Centrar os dados na média antes de decompor (recomendado quase sempre)."},
        "scale": {"type": "boolean", "default": False,
                   "description": "Escalar cada variável pelo desvio padrão antes de decompor (autoscaling)."},
    },
    "pls": {
        "n_components": {"type": "integer", "default": 5, "minimum": 1,
                           "description": "Número de variáveis latentes (componentes PLS)."},
        "scale": {"type": "boolean", "default": False,
                   "description": "Escalar X e Y antes do ajuste."},
    },
    "pls_da": {
        "n_components": {"type": "integer", "default": 2, "minimum": 1,
                           "description": "Número de variáveis latentes (componentes PLS)."},
        "threshold": {"type": "number", "default": 0.5, "minimum": 0, "maximum": 1,
                       "description": "Limiar de decisão sobre a resposta dummy para atribuir a classe."},
    },
    "random_forest": {
        "n_estimators": {"type": "integer", "default": 100, "minimum": 1,
                           "description": "Número de árvores na floresta."},
        "max_depth": {"type": "integer", "default": None, "minimum": 1,
                       "description": "Profundidade máxima de cada árvore. Deixe em branco para sem limite."},
        "min_samples_split": {"type": "integer", "default": 2, "minimum": 2,
                                "description": "Número mínimo de amostras para dividir um nó interno."},
        "random_state": {"type": "integer", "default": 42,
                           "description": "Semente aleatória, para resultados reprodutíveis."},
    },
    "parafac": {
        "rank": {"type": "integer", "default": 2, "minimum": 1,
                  "description": "Número de componentes (fatores) da decomposição trilinear."},
        "n_iter_max": {"type": "integer", "default": 200, "minimum": 1,
                        "description": "Número máximo de iterações do ALS."},
        "tol": {"type": "number", "default": 1e-8, "minimum": 0,
                 "description": "Tolerância de convergência."},
        "random_state": {"type": "integer", "default": 42,
                           "description": "Semente aleatória para a inicialização."},
        "non_negative": {"type": "boolean", "default": False,
                           "description": "Restringir os fatores a valores não-negativos (Non-negative PARAFAC)."},
        "normalize_factors": {"type": "boolean", "default": True,
                                "description": "Normalizar os fatores (só se non_negative=false)."},
    },
    "cross_validation": {
        "method": {"type": "string", "default": "pls", "enum": ["pls", "ridge", "lda", "rf_reg", "rf_cls"],
                    "description": "Modelo a validar."},
        "cv_type": {"type": "string", "default": "kfold", "enum": ["kfold", "loo", "montecarlo"],
                     "description": "Estratégia de validação cruzada."},
        "n_folds": {"type": "integer", "default": 5, "minimum": 2,
                     "description": "Número de folds (usado quando cv_type=kfold)."},
        "n_iter": {"type": "integer", "default": 20, "minimum": 1,
                    "description": "Número de repetições (usado quando cv_type=montecarlo)."},
        "test_size": {"type": "number", "default": 0.2, "minimum": 0.05, "maximum": 0.9,
                       "description": "Fração de teste em cada repetição Monte Carlo."},
    },
    "savitzky_golay": {
        "window_length": {"type": "integer", "default": 11, "minimum": 3,
                            "description": "Tamanho da janela — deve ser ímpar e maior que polyorder."},
        "polyorder": {"type": "integer", "default": 2, "minimum": 1,
                       "description": "Grau do polinômio ajustado em cada janela."},
        "deriv": {"type": "integer", "default": 0, "minimum": 0, "maximum": 2,
                   "description": "Ordem da derivada: 0=suavização, 1=1ª derivada, 2=2ª derivada."},
        "spectral_axis": {"type": "integer", "default": 1,
                            "description": "Eixo espectral (ao longo do qual o filtro é aplicado)."},
    },
}

def esc(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

lines = []
lines.append("-- TcheLab — Fase 1: corrige 9 parameter_schema cujo nome de chave não batia")
lines.append("-- com o que o script Python de fato lê (achado na auditoria de hiperparâmetros,")
lines.append("-- 2026-10-13). Substitui o schema inteiro (não merge) porque o antigo estava")
lines.append("-- errado e não deve sobreviver. Idempotente.")
lines.append("SET NAMES utf8mb4;")
lines.append("")
for slug, schema in SCHEMAS.items():
    json_str = json.dumps(schema, ensure_ascii=False)
    lines.append(f"UPDATE techniques SET parameter_schema = {esc(json_str)} WHERE slug = {esc(slug)};")

sql = "\n".join(lines) + "\n"
open("fix_bugs_schema.sql", "w", encoding="utf-8").write(sql)
print(f"Gerado fix_bugs_schema.sql com {len(SCHEMAS)} UPDATEs.")
