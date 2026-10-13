# -*- coding: utf-8 -*-
"""
Fase 2 — preenche parameter_schema para as 36 técnicas ativas que não
tinham NENHUM schema no banco (painel mostrava "sem parâmetros
configuráveis" mesmo o Python aceitando parâmetros reais).

Cada entrada foi conferida lendo o execute()/validate() real da classe
Python correspondente (não é inferência só pelo nome do parâmetro).
"""
import json

SCHEMAS = {
    "concatenacao": {
        "axis": {"type": "integer", "default": 0, "description": "Eixo ao longo do qual concatenar os arrays."},
    },
    "importacao": {
        "file_path": {"type": "string", "description": "Caminho/referência do arquivo a importar."},
        "format": {"type": "string", "default": "auto", "enum": ["auto", "xlsx", "csv", "npy", "npz", "hdf5", "h5", "zarr"],
                    "description": "Formato do arquivo. 'auto' detecta pela extensão."},
        "sample_axis": {"type": "integer", "default": 0, "description": "Eixo de amostras no array importado."},
        "dtype": {"type": "string", "default": "float64", "description": "Tipo numérico dos dados importados."},
    },
    "formula_customizada": {
        "expression": {"type": "string", "description": "Expressão matemática (ex: '2*A + B'), usando os nomes das portas de entrada conectadas como variáveis."},
    },
    "limpeza": {
        "axis": {"type": "integer", "default": 0, "description": "Eixo a considerar para remoção (0=amostras, 1=variáveis)."},
        "remove_nan": {"type": "boolean", "default": True, "description": "Remover linhas/colunas com valores NaN."},
        "remove_inf": {"type": "boolean", "default": True, "description": "Remover linhas/colunas com valores infinitos."},
        "threshold_zero_variance": {"type": "number", "default": 0.0, "minimum": 0,
                                      "description": "Remove variáveis com variância menor ou igual a este limiar."},
    },
    "selecao_amostras": {
        "sample_axis": {"type": "integer", "default": 0, "description": "Eixo de amostras."},
        "indices": {"type": "array", "items": {"type": "integer"}, "description": "Lista de índices de amostras a manter (alternativa a 'mask')."},
        "mask": {"type": "array", "items": {"type": "boolean"}, "description": "Máscara booleana de amostras a manter (alternativa a 'indices')."},
    },
    "selecao_variaveis": {
        "mode": {"type": "integer", "default": 1, "description": "Eixo de variáveis a selecionar."},
        "indices": {"type": "array", "items": {"type": "integer"}, "description": "Lista de índices de variáveis a manter."},
        "range": {"type": "array", "items": {"type": "integer"}, "description": "Faixa [start, stop, step] de variáveis a manter."},
        "mask": {"type": "array", "items": {"type": "boolean"}, "description": "Máscara booleana de variáveis a manter."},
    },
    "slice": {
        "ranges": {"type": "object", "default": {}, "description": "Dict {eixo: [start, stop, step]} com o range a selecionar em cada eixo."},
    },
    "split": {
        "axis": {"type": "integer", "default": 0, "description": "Eixo ao longo do qual dividir."},
        "indices_or_sections": {"type": "integer", "description": "Número de partes iguais, ou lista de índices de corte."},
    },
    "stack": {
        "axis": {"type": "integer", "default": 0, "description": "Posição do novo eixo criado ao empilhar."},
    },
    "tratamento_missing": {
        "strategy": {"type": "string", "default": "mean", "enum": ["mean", "median", "zero", "interpolate", "drop"],
                      "description": "Estratégia de preenchimento/remoção de valores ausentes."},
    },
    "baseline": {
        "method": {"type": "string", "default": "linear", "enum": ["linear", "polynomial", "rubberband", "als"],
                    "description": "Método de estimativa da linha de base."},
        "degree": {"type": "integer", "default": 2, "minimum": 1, "description": "Grau do polinômio (usado quando method=polynomial)."},
        "lambda_": {"type": "number", "default": 10000.0, "minimum": 0, "description": "Peso de suavização (usado quando method=als)."},
        "spectral_axis": {"type": "integer", "default": 1, "description": "Eixo espectral."},
    },
    "centering": {
        "axis": {"type": "integer", "default": 0, "description": "Eixo a centrar (0=amostras → centra colunas na média)."},
    },
    "msc": {
        "reference": {"type": "string", "default": "mean", "description": "Espectro de referência: 'mean' (média do conjunto) ou um vetor explícito."},
    },
    "snv": {
        "spectral_axis": {"type": "integer", "default": 1, "description": "Eixo espectral (ao longo do qual normalizar cada amostra)."},
    },
    "hca": {
        "method": {"type": "string", "default": "ward", "enum": ["ward", "complete", "average", "single"],
                    "description": "Método de linkage. Ward exige metric='euclidean'."},
        "metric": {"type": "string", "default": "euclidean", "enum": ["euclidean", "cityblock", "cosine", "correlation"],
                    "description": "Métrica de distância entre amostras."},
    },
    "outlier_detection": {
        "method": {"type": "string", "default": "hotelling", "enum": ["hotelling", "mahalanobis", "isolation_forest"],
                    "description": "Método de detecção de outliers."},
        "alpha": {"type": "number", "default": 0.05, "minimum": 0.001, "maximum": 0.5,
                   "description": "Nível de significância do limiar estatístico."},
    },
    "simca": {
        "n_components": {"type": "integer", "default": 2, "minimum": 1, "description": "Número de componentes principais do modelo de classe."},
        "alpha": {"type": "number", "default": 0.05, "minimum": 0.001, "maximum": 0.5, "description": "Nível de significância do limiar de classe."},
    },
    "ipls": {
        "n_intervals": {"type": "integer", "default": 10, "minimum": 2, "description": "Número de intervalos em que o espectro é dividido."},
        "n_components": {"type": "integer", "default": 5, "minimum": 1, "description": "Número de componentes PLS por intervalo."},
        "n_folds": {"type": "integer", "default": 5, "minimum": 2, "description": "Número de folds da validação cruzada usada pra escolher o melhor intervalo."},
    },
    "pcr": {
        "n_components": {"type": "integer", "default": 5, "minimum": 1, "description": "Número de componentes principais usados na regressão."},
    },
    "knn": {
        "n_neighbors": {"type": "integer", "default": 5, "minimum": 1, "description": "Número de vizinhos considerados."},
        "metric": {"type": "string", "default": "euclidean", "enum": ["euclidean", "manhattan", "chebyshev", "minkowski", "cosine"],
                    "description": "Métrica de distância."},
        "weights": {"type": "string", "default": "uniform", "enum": ["uniform", "distance"],
                     "description": "Peso dos vizinhos: uniforme ou pelo inverso da distância."},
    },
    "lda": {
        "n_components": {"type": "integer", "default": None, "minimum": 1, "description": "Número de componentes discriminantes. Deixe em branco para o máximo possível (n_classes - 1)."},
    },
    "pls_oc": {
        "target_class": {"type": "string", "default": None, "description": "Classe alvo a modelar (one-class). Deixe em branco para usar a primeira classe encontrada."},
        "n_components": {"type": "integer", "default": 3, "minimum": 1, "description": "Número de componentes PLS."},
        "alpha": {"type": "number", "default": 0.05, "minimum": 0.001, "maximum": 0.5, "description": "Nível de significância do limiar de aceitação."},
        "random_state": {"type": "integer", "default": 42, "description": "Semente aleatória."},
    },
    "svm": {
        "kernel": {"type": "string", "default": "rbf", "enum": ["linear", "poly", "rbf", "sigmoid"], "description": "Função de kernel."},
        "C": {"type": "number", "default": 1.0, "minimum": 0.0001, "description": "Parâmetro de regularização (quanto maior, menos tolerante a erro de classificação)."},
        "gamma": {"type": "string", "default": "scale", "description": "Coeficiente do kernel: 'scale', 'auto', ou um número."},
    },
    "autoencoder": {
        "variant": {"type": "string", "default": "standard", "enum": ["standard", "variational"], "description": "Tipo de autoencoder."},
        "latent_dim": {"type": "integer", "default": 8, "minimum": 1, "description": "Dimensão do espaço latente (gargalo)."},
        "encoder_layers": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [64, 32],
                             "description": "Unidades de cada camada do encoder (o decoder espelha essas camadas)."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1, "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1, "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001, "description": "Taxa de aprendizado."},
    },
    "cnn_1d": {
        "task": {"type": "string", "default": "regression", "enum": ["regression", "classification"], "description": "Tipo de tarefa."},
        "filters": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [32, 64],
                     "description": "Número de filtros de cada camada convolucional."},
        "kernel_size": {"type": "integer", "default": 5, "minimum": 1, "description": "Tamanho do filtro convolucional."},
        "pool_size": {"type": "integer", "default": 2, "minimum": 1, "description": "Tamanho do max-pooling."},
        "dense_units": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [64], "description": "Unidades das camadas densas finais."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1, "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1, "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001, "description": "Taxa de aprendizado."},
    },
    "diffusion": {
        "task": {"type": "string", "default": "denoise", "enum": ["denoise", "augment"], "description": "Uso do modelo: remover ruído de espectros reais, ou gerar espectros sintéticos."},
        "T": {"type": "integer", "default": 100, "minimum": 1, "description": "Número de passos de difusão."},
        "hidden_units": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [128, 128], "description": "Unidades das camadas da rede de denoising."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1, "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1, "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001, "description": "Taxa de aprendizado."},
        "n_augment": {"type": "integer", "description": "Número de amostras sintéticas a gerar (usado quando task=augment; padrão = mesmo tamanho do conjunto de entrada)."},
    },
    "mlp": {
        "task": {"type": "string", "default": "regression", "enum": ["regression", "classification"], "description": "Tipo de tarefa."},
        "hidden_layers": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [64, 32],
                            "description": "Unidades de cada camada oculta — o comprimento da lista é o número de camadas ocultas (ex: [64, 32] = 2 camadas)."},
        "activation": {"type": "string", "default": "relu", "enum": ["relu", "tanh", "sigmoid"], "description": "Função de ativação das camadas ocultas."},
        "dropout": {"type": "number", "default": 0.0, "minimum": 0, "maximum": 0.9, "description": "Taxa de dropout."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1, "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1, "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001, "description": "Taxa de aprendizado."},
    },
    "transformer": {
        "task": {"type": "string", "default": "regression", "enum": ["regression", "classification"], "description": "Tipo de tarefa."},
        "n_heads": {"type": "integer", "default": 4, "minimum": 1, "description": "Número de cabeças de atenção."},
        "d_model": {"type": "integer", "default": 32, "minimum": 1, "description": "Dimensão interna do modelo."},
        "ff_dim": {"type": "integer", "default": 64, "minimum": 1, "description": "Dimensão da camada feed-forward."},
        "n_blocks": {"type": "integer", "default": 2, "minimum": 1, "description": "Número de blocos Transformer empilhados."},
        "dense_units": {"type": "array", "items": {"type": "integer", "minimum": 1}, "default": [64], "description": "Unidades das camadas densas finais."},
        "dropout": {"type": "number", "default": 0.1, "minimum": 0, "maximum": 0.9, "description": "Taxa de dropout."},
        "epochs": {"type": "integer", "default": 50, "minimum": 1, "description": "Número de épocas de treino."},
        "batch_size": {"type": "integer", "default": 32, "minimum": 1, "description": "Tamanho do lote de treino."},
        "learning_rate": {"type": "number", "default": 0.001, "minimum": 0.0000001, "description": "Taxa de aprendizado."},
    },
    "mcr_als": {
        "n_components": {"type": "integer", "default": 2, "minimum": 1, "description": "Número de componentes (espécies químicas) a resolver."},
        "n_iter": {"type": "integer", "default": 200, "minimum": 1, "description": "Número máximo de iterações do ALS."},
        "tol": {"type": "number", "default": 0.000001, "minimum": 0, "description": "Tolerância de convergência."},
        "non_neg_C": {"type": "boolean", "default": True, "description": "Restringir as concentrações (C) a valores não-negativos."},
        "non_neg_S": {"type": "boolean", "default": True, "description": "Restringir os espectros puros (S) a valores não-negativos."},
    },
    "n_pls": {
        "n_components": {"type": "integer", "default": 3, "minimum": 1, "description": "Número de variáveis latentes."},
    },
    "u_pls": {
        "n_components": {"type": "integer", "default": 3, "minimum": 1, "description": "Número de variáveis latentes."},
    },
    "multiway_pls_da": {
        "n_components": {"type": "integer", "default": 3, "minimum": 1, "description": "Número de variáveis latentes."},
    },
    "vip": {
        "n_components": {"type": "integer", "default": 5, "minimum": 1, "description": "Número de componentes PLS usados para calcular o VIP."},
        "threshold": {"type": "number", "default": 1.0, "minimum": 0, "description": "Limiar de VIP acima do qual a variável é considerada importante (padrão: 1.0)."},
    },
    "leverage_influence": {
        "threshold_leverage": {"type": "number", "description": "Limiar de leverage acima do qual a amostra é considerada de alta influência. Deixe em branco para o limiar automático (2p/n)."},
    },
    "pds": {
        "window": {"type": "integer", "default": 5, "minimum": 1, "description": "Tamanho da janela ao redor de cada variável usada na padronização local."},
        "n_components": {"type": "integer", "default": 3, "minimum": 1, "description": "Número de componentes PLS usados em cada regressão local."},
    },
    "metrics_aggregation": {
        "metrics": {"type": "array", "items": {"type": "string"}, "description": "Lista de chaves de métrica a comparar entre os experimentos. Deixe em branco para usar todas as encontradas."},
        "sort_by": {"type": "string", "description": "Chave de métrica usada para ordenar os experimentos."},
    },
}

def esc(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

lines = []
lines.append("-- TcheLab — Fase 2: preenche parameter_schema para as 36 técnicas ativas")
lines.append("-- que não tinham NENHUM schema no banco (achado na auditoria de")
lines.append("-- hiperparâmetros, 2026-10-13). Cada parâmetro foi conferido lendo o")
lines.append("-- execute()/validate() real da classe Python. Idempotente.")
lines.append("SET NAMES utf8mb4;")
lines.append("")
for slug, schema in SCHEMAS.items():
    json_str = json.dumps(schema, ensure_ascii=False)
    lines.append(f"UPDATE techniques SET parameter_schema = {esc(json_str)} WHERE slug = {esc(slug)};")

sql = "\n".join(lines) + "\n"
open("fill_missing_schema.sql", "w", encoding="utf-8").write(sql)
print(f"Gerado fill_missing_schema.sql com {len(SCHEMAS)} UPDATEs.")
