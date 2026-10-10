# TcheLab — Catálogo de Scripts

> Referência dos blocos executáveis pelo worker Python.  
> Cada entrada descreve um script do catálogo: o que faz, o que recebe, o que retorna e quais restrições matemáticas aplica.  
> O worker nunca executa código arbitrário. Apenas scripts declarados aqui podem ser instanciados em um nó de workflow.

---

## Contrato geral

Todo script expõe:

```
slug              identificador único (snake_case)
nome              nome legível
família           grupo do catálogo (01_dados, 02_preprocessamento, …)
descrição         o que o script faz
inputs            portas de entrada com tipo e restrições
parâmetros        configurações ajustáveis pelo usuário
outputs           portas de saída com tipo e shape esperado
restrições        regras matemáticas que o validate() verifica antes de executar
```

O `validate()` verifica tipo, shape, dtype, ordem analítica, eixo de amostras e compatibilidade entre entradas antes de qualquer execução. O `execute()` só roda em entradas já validadas.

---

## Famílias

| Código | Família | `familia =` no worker |
|--------|---------|----------------------|
| 01 | Dados e Operações | `01_dados` |
| 02 | Pré-processamento | `02_preprocessamento` |
| 03 | Análise Exploratória | `03_exploratoria` |
| 04 | Regressão 1D | `04_regressao_1d` |
| 05 | Classificação 1D | `05_classificacao_1d` |
| 06 | Deep Learning | `06_deep_learning` |
| 07 | Decomposição Multiway | `07_multiway_decomp` |
| 08 | Regressão Multiway | `08_multiway_regression` |
| 09 | Classificação Multiway | `09_multiway_classif` |
| 10 | Calibração de Ordem Superior | `10_calibracao_ordem_superior` |
| 11 | Seleção de Variáveis | `11_selecao_variaveis` |
| 12 | Validação de Modelos | `12_validacao_modelos` |
| 13 | Transferência de Aprendizado | `13_transferencia_aprendizado` |
| 14 | Sinais Espectrais | `14_sinais_espectrais` |
| 15 | Imagens Hiperespectrais | `15_imagens_hiperespectrais` |
| 16 | Dados Faltantes | `16_dados_faltantes` |
| 17 | Fusão de Dados | `17_fusao_dados` |
| 18 | Quimiometria de Processo | `18_quimiometria_processo` |
| 19 | Interpretabilidade de Modelos | `19_interpretabilidade` |
| 20 | Utilitários | `20_utilitarios` |

---

# Família 01 — Dados e Operações (`01_dados`)

Scripts de manipulação estrutural e matemática sobre arrays. Não assumem contexto quimiométrico — operam sobre qualquer array N-dimensional.

---

## `importacao`

Lê um arquivo externo e registra o dataset no sistema.

**Inputs:** arquivo (XLSX, CSV, NumPy, HDF5, Zarr)  
**Parâmetros:** `file_path`, `format`, `sample_axis`, `mode_labels`, `dtype`  
**Outputs:** `dataset` (tensor ou matrix)  
**Restrições:** formato deve ser suportado; shape detectado automaticamente se não declarado

---

## `limpeza`

Remove amostras ou variáveis com critérios definidos pelo usuário.

**Inputs:** `X` (matrix ou tensor)  
**Parâmetros:** `remove_nan`, `remove_inf`, `threshold_zero_variance` (float), `axis`  
**Outputs:** `X_clean` (matrix ou tensor), `removed_indices` (vector)  
**Restrições:** axis deve ser válido para o shape de X

---

## `tratamento_missing`

Preenche ou remove valores ausentes.

**Inputs:** `X` (matrix ou tensor)  
**Parâmetros:** `strategy` (mean | median | zero | interpolate | drop), `axis`  
**Outputs:** `X_filled` (matrix ou tensor)  
**Restrições:** strategy `interpolate` disponível apenas para axis com significado espectral

---

## `selecao_amostras`

Seleciona subconjunto de amostras por índice ou máscara booleana.

**Inputs:** `X` (matrix ou tensor com sample_axis definido)  
**Parâmetros:** `indices` (lista de inteiros) ou `mask` (vetor booleano)  
**Outputs:** `X_sel` (matrix ou tensor)  
**Restrições:** exige sample_axis declarado

---

## `selecao_variaveis`

Seleciona subconjunto de variáveis por índice, range ou máscara.

**Inputs:** `X` (matrix ou tensor)  
**Parâmetros:** `indices` ou `range` [start, stop, step], `mode` (eixo a selecionar)  
**Outputs:** `X_sel` (matrix ou tensor)

---

## `kennard_stone`

Divide as amostras em calibração (treino), teste e, opcionalmente, validação, via algoritmo de Kennard-Stone (RW Kennard & LA Stone, 1969): seleciona iterativamente a amostra mais distante (distância Euclidiana) das já escolhidas, maximizando a cobertura da variabilidade multivariada do conjunto de calibração em vez de uma divisão aleatória. Determinístico — a mesma entrada sempre produz a mesma divisão (sem `random_state`).

**Inputs:** `X` (matrix ou tensor com sample_axis definido)  
**Parâmetros:**
- `sample_axis` (int, default `0`) — eixo de amostras
- `n_train` (int) ou `train_size` (float em (0,1), default `0.7`) — tamanho do conjunto de treino/calibração. `n_train` tem prioridade sobre `train_size` quando ambos são informados
- `n_validation` (int) ou `validation_size` (float em (0,1), default `0`) — tamanho do conjunto de validação (opcional). Quando `0`, nenhum conjunto de validação é gerado e tudo que não for treino vira teste

**Outputs:**
- `train`, `test` (matrix ou tensor — mesmo shape de `X` exceto no eixo de amostras)
- `validation` (presente apenas quando `n_validation`/`validation_size` > 0)
- `train_indices`, `test_indices`, `validation_indices` (listas de índices originais em `X`, ordenadas)

**Restrições:**
- exige ao menos 3 amostras no `sample_axis`
- `n_train` ≥ 2 (o algoritmo precisa de um par inicial)
- `n_train + n_validation` < número total de amostras (sempre sobra ao menos 1 amostra de teste)

**Algoritmo:**
1. Calcula a matriz de distâncias Euclidianas entre todas as amostras (sobre `X` achatado em todos os eixos exceto `sample_axis`).
2. Seleciona o par de amostras mais distante entre si como ponto de partida.
3. Itera: a cada passo, escolhe entre as amostras restantes a que tem a MAIOR distância mínima até o conjunto já selecionado (farthest-point / max-min distance) — amostras "isoladas" em relação ao que já foi coberto entram primeiro.
4. As primeiras `n_train` amostras dessa ordem formam o conjunto de treino.
5. Se `n_validation` > 0, o mesmo algoritmo é reaplicado sobre as amostras restantes, para que a validação também cubra bem a variabilidade do que sobrou (em vez de simplesmente pegar as próximas da ordem global, o que tenderia a concentrar a validação perto do conjunto de treino). O restante final vira o conjunto de teste.

**Exemplo:** 100 espectros NIR de azeite → `{n_train: 70}` seleciona os 70 espectros que melhor cobrem a variabilidade espectral do conjunto para calibração, em vez de uma amostragem aleatória 70/30.

---

## `transpose`

Permuta os eixos do array.

**Inputs:** `X` (array N-dimensional)  
**Parâmetros:** `axes` (permutação dos índices dos eixos)  
**Outputs:** `X_T` com shape reordenado  
**Restrições:** `len(axes) == ndim(X)`; axes deve ser permutação válida  
**Transformação de shape:** `shape_out = tuple(shape_in[a] for a in axes)`

---

## `reshape`

Altera a forma do array sem alterar a ordem dos elementos.

**Inputs:** `X` (array N-dimensional)  
**Parâmetros:** `new_shape` (tupla)  
**Outputs:** `X_r` com shape novo  
**Restrições:** `prod(shape_in) == prod(new_shape)`

---

## `slice`

Seleciona parte de um ou mais eixos por range.

**Inputs:** `X` (array N-dimensional)  
**Parâmetros:** `ranges` — dict `{eixo: [start, stop, step]}`  
**Outputs:** `X_sl` (array N-dimensional, mesma ordem)

---

## `squeeze`

Remove eixos de tamanho 1.

**Inputs:** `X` (array N-dimensional)  
**Parâmetros:** `axis` (opcional)  
**Outputs:** `X_sq`  
**Restrições:** eixo especificado deve ter tamanho 1

---

## `expand_dims`

Insere um eixo de tamanho 1.

**Inputs:** `X` (array N-dimensional)  
**Parâmetros:** `axis` (posição do novo eixo)  
**Outputs:** `X_exp`

---

## `unfolding`

Transforma tensor N-way em matriz 2D ao longo de um modo.

**Inputs:** `X` (tensor, ndim ≥ 2)  
**Parâmetros:** `mode` (índice do eixo a desdobrar), `ordering` (C ou F)  
**Outputs:** `X_unf` (matrix)  
**Restrições:** mode deve ser índice válido  
**Transformação de shape:** eixo `mode` vira linhas; produto dos demais vira colunas

---

## `folding`

Operação inversa do unfolding. Reconstrói tensor a partir de matriz.

**Inputs:** `X_unf` (matrix)  
**Parâmetros:** `original_shape` (tupla), `mode`, `ordering`  
**Outputs:** `X` (tensor)  
**Restrições:** `prod(original_shape) == prod(X_unf.shape)`

---

## `concatenacao`

Concatena dois ou mais arrays ao longo de um eixo existente.

**Inputs:** `A`, `B` (arrays — pode receber lista)  
**Parâmetros:** `axis`  
**Outputs:** `result`  
**Restrições:** mesmo ndim; eixos exceto `axis` com mesmo tamanho  
**Transformação de shape:** tamanho do eixo `axis` é somado

---

## `stack`

Empilha arrays adicionando um novo eixo.

**Inputs:** `A`, `B` (arrays com shapes idênticos)  
**Parâmetros:** `axis`  
**Outputs:** `result`  
**Restrições:** shapes de A e B idênticos

---

## `split`

Divide array em partes ao longo de um eixo.

**Inputs:** `X`  
**Parâmetros:** `indices_or_sections` (int ou lista), `axis`  
**Outputs:** `part_1`, `part_2`, …

---

## `soma`

Adição elemento a elemento.

**Inputs:** `A`, `B`  
**Outputs:** `result`  
**Restrições:** shapes compatíveis

---

## `subtracao`

**Inputs:** `A`, `B`  
**Outputs:** `result` = A − B  
**Restrições:** shapes compatíveis

---

## `multiplicacao_elementwise`

**Inputs:** `A`, `B`  
**Outputs:** `result` = A × B  
**Restrições:** shapes compatíveis

---

## `divisao_elementwise`

**Inputs:** `A` (numerador), `B` (denominador)  
**Outputs:** `result` = A / B  
**Restrições:** shapes compatíveis; avisa se B contiver zeros

---

## `produto_matricial`

Multiplicação matricial A @ B.

**Inputs:** `A` (matrix), `B` (matrix)  
**Outputs:** `result` (matrix)  
**Restrições:** `A.shape[-1] == B.shape[-2]`  
**Transformação de shape:** `(m, k) @ (k, n) → (m, n)`

---

## `inversa`

Calcula A⁻¹.

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `A_inv` (matrix)  
**Restrições:** A deve ser quadrada (n × n)

---

## `pseudo_inversa`

Calcula a pseudoinversa de Moore-Penrose A⁺.

**Inputs:** `A` (matrix)  
**Outputs:** `A_pinv` (matrix)

---

## `determinante`

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `det` (scalar)  
**Restrições:** A deve ser quadrada

---

## `autovalores`

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `eigenvalues` (vector)

---

## `autovetores`

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `eigenvalues` (vector), `eigenvectors` (matrix)

---

## `eig`

Decomposição espectral completa.

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `eigenvalues`, `eigenvectors`

---

## `svd`

Decomposição em valores singulares.

**Inputs:** `A` (matrix)  
**Parâmetros:** `full_matrices` (bool), `n_components`  
**Outputs:** `U`, `s`, `Vt`

---

## `norma`

**Inputs:** `X`  
**Parâmetros:** `ord` (tipo de norma), `axis`  
**Outputs:** `norm` (scalar ou vector)

---

## `trace`

**Inputs:** `A` (matrix quadrada)  
**Outputs:** `trace` (scalar)

---

## `rank`

Posto da matriz.

**Inputs:** `A` (matrix)  
**Outputs:** `rank` (scalar inteiro)

---

## `mean`

**Inputs:** `X`  
**Parâmetros:** `axis`, `keepdims`  
**Outputs:** `result`

---

## `median`

**Inputs:** `X`  
**Parâmetros:** `axis`, `keepdims`  
**Outputs:** `result`

---

## `std`

**Inputs:** `X`  
**Parâmetros:** `axis`, `ddof`, `keepdims`  
**Outputs:** `result`

---

## `min`

**Inputs:** `X`  
**Parâmetros:** `axis`, `keepdims`  
**Outputs:** `result`

---

## `max`

**Inputs:** `X`  
**Parâmetros:** `axis`, `keepdims`  
**Outputs:** `result`

---

## `sum`

**Inputs:** `X`  
**Parâmetros:** `axis`, `keepdims`  
**Outputs:** `result`

---

## `formula_customizada`

Avalia expressão matemática customizada de forma segura via AST.

**Inputs:** quaisquer arrays (referenciados pelo nome na expressão)  
**Parâmetros:** `formula` (string, ex: `"2 * A + B"`)  
**Outputs:** `result`  
**Restrições de segurança:** parser AST com whitelist de nós permitidos (`Num`, `BinOp`, `Call`, etc.); whitelist de funções permitidas (`np.mean`, `np.std`, `np.sum`, `np.sqrt`, etc.); lista negra de nomes proibidos (`__builtins__`, `exec`, `eval`, `import`, etc.). Nunca usa `eval()` direto.

---

# Família 02 — Pré-processamento (`02_preprocessamento`)

Scripts de transformação espectral. Operações sem modelo — apenas transformam X.

---

## `snv`

Standard Normal Variate. Normaliza cada espectro individualmente pela média e desvio padrão.

**Inputs:** `X` (matrix: n_samples × n_vars)  
**Outputs:** `X_snv`

---

## `msc`

Multiplicative Scatter Correction. Corrige efeitos de espalhamento usando espectro de referência.

**Inputs:** `X` (matrix)  
**Parâmetros:** `reference` ("mean" ou vetor explícito)  
**Outputs:** `X_msc`, `reference_spectrum`

---

## `savitzky_golay`

Suavização e derivadas via filtro Savitzky-Golay.

**Inputs:** `X` (matrix ou vector)  
**Parâmetros:** `window_length`, `polyorder`, `deriv` (0=suavização, 1=1ª derivada, 2=2ª derivada)  
**Outputs:** `X_sg`  
**Restrições:** `window_length` deve ser ímpar e maior que `polyorder`

---

## `mean_center`

Centraliza na média (subtrai média das colunas).

**Inputs:** `X`  
**Parâmetros:** `axis` (0=amostras, 1=variáveis)  
**Outputs:** `X_mc`, `mean`

---

## `autoscaling`

Centraliza na média e escala pelo desvio padrão (z-score).

**Inputs:** `X`  
**Outputs:** `X_as`, `mean`, `std`

---

## `normalizacao`

Normalização por norma L1, L2 ou máximo.

**Inputs:** `X`  
**Parâmetros:** `norm` (l1 | l2 | max)  
**Outputs:** `X_norm`

---

## `baseline_correction`

Subtrai linha de base por polinômio ou rubberband.

**Inputs:** `X`  
**Parâmetros:** `method` (polynomial | rubberband), `degree`  
**Outputs:** `X_bc`

---

## `detrend`

Remove tendência linear ou polinomial.

**Inputs:** `X`  
**Parâmetros:** `type` (linear | constant)  
**Outputs:** `X_dt`

---

## `emsc`

Extended Multiplicative Scatter Correction.

**Inputs:** `X`, `reference`  
**Parâmetros:** `degree` (grau polinomial)  
**Outputs:** `X_emsc`

---

## `osc`

Orthogonal Signal Correction. Remove variação ortogonal à variável resposta.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`  
**Outputs:** `X_osc`, `scores`, `loadings`

---

# Família 03 — Análise Exploratória (`03_exploratoria`)

---

## `pca`

Principal Component Analysis.

**Inputs:** `X` (matrix: n_samples × n_vars)  
**Parâmetros:** `n_components`, `scale` (bool)  
**Outputs:** `scores` (T), `loadings` (P), `explained_variance`, `eigenvalues`

---

## `hca`

Hierarchical Cluster Analysis.

**Inputs:** `X`  
**Parâmetros:** `linkage` (ward | complete | average | single), `metric`, `n_clusters`  
**Outputs:** `dendrogram`, `labels`, `linkage_matrix`

---

## `kmeans`

K-Means Clustering.

**Inputs:** `X`  
**Parâmetros:** `n_clusters`, `n_init`, `random_state`  
**Outputs:** `labels`, `centroids`, `inertia`

---

## `outlier_detection`

Detecção de outliers por Hotelling T² e SPE.

**Inputs:** `X`  
**Parâmetros:** `method` (pca_t2 | pca_spe | isolation_forest), `n_components`, `alpha`  
**Outputs:** `outlier_flags`, `scores`, `threshold`

---

# Família 04 — Regressão 1D (`04_regressao_1d`)

Modelos de regressão para X 2D (n_amostras × n_variáveis) e y 1D.

---

## `ols`

Ordinary Least Squares.

**Inputs:** `X` (matrix), `y` (vector)  
**Outputs:** `model`, `coefficients`, `metrics` (RMSEC, R², bias)

---

## `ridge`

Regressão Ridge (regularização L2).

**Inputs:** `X`, `y`  
**Parâmetros:** `alpha`  
**Outputs:** `model`, `coefficients`, `metrics`

---

## `lasso`

Regressão LASSO (regularização L1).

**Inputs:** `X`, `y`  
**Parâmetros:** `alpha`  
**Outputs:** `model`, `coefficients`, `metrics`

---

## `elastic_net`

Elastic Net (L1 + L2).

**Inputs:** `X`, `y`  
**Parâmetros:** `alpha`, `l1_ratio`  
**Outputs:** `model`, `coefficients`, `metrics`

---

## `pcr`

Principal Component Regression.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `scores`, `loadings`, `metrics`

---

## `pls`

Partial Least Squares Regression (PLS1/PLS2).

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `x_scores`, `x_loadings`, `y_loadings`, `vip`, `metrics`

---

## `nonlinear_regression`

Regressão não-linear com núcleos (SVR, GP, Neural Net).

**Inputs:** `X`, `y`  
**Parâmetros:** `method` (svr | gp | mlp), parâmetros específicos do método  
**Outputs:** `model`, `metrics`

---

# Família 05 — Classificação 1D (`05_classificacao_1d`)

---

## `lda`

Linear Discriminant Analysis.

**Inputs:** `X`, `y` (labels)  
**Outputs:** `model`, `scores`, `metrics` (accuracy, balanced_accuracy)

---

## `qda`

Quadratic Discriminant Analysis.

**Inputs:** `X`, `y`  
**Outputs:** `model`, `metrics`

---

## `knn`

K-Nearest Neighbors Classifier.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_neighbors`, `metric`, `weights`  
**Outputs:** `model`, `metrics`

---

## `svm`

Support Vector Machine Classifier.

**Inputs:** `X`, `y`  
**Parâmetros:** `kernel`, `C`, `gamma`  
**Outputs:** `model`, `support_vectors`, `metrics`

---

## `pls_da`

PLS Discriminant Analysis.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `threshold`  
**Outputs:** `model`, `scores`, `vip`, `metrics`

---

## `random_forest`

Random Forest Classifier.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_estimators`, `max_depth`, `random_state`  
**Outputs:** `model`, `feature_importances`, `metrics`

---

## `simca`

Soft Independent Modelling of Class Analogy.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `alpha`  
**Outputs:** `model`, `class_models`, `metrics`

---

# Família 06 — Deep Learning (`06_deep_learning`)

---

## `mlp`

Multi-Layer Perceptron (regressão ou classificação).

**Inputs:** `X`, `y`  
**Parâmetros:** `hidden_layers` (lista de inteiros), `activation`, `epochs`, `learning_rate`, `task` (regression | classification)  
**Outputs:** `model`, `history`, `metrics`

---

## `cnn1d`

Convolutional Neural Network 1D.

**Inputs:** `X` (n_samples × n_vars), `y`  
**Parâmetros:** `filters`, `kernel_size`, `epochs`, `task`  
**Outputs:** `model`, `history`, `metrics`

---

## `rnn`

Recurrent Neural Network (LSTM/GRU).

**Inputs:** `X` (n_samples × n_timesteps × n_features), `y`  
**Parâmetros:** `units`, `cell_type` (lstm | gru), `epochs`, `task`  
**Outputs:** `model`, `history`, `metrics`  
**Restrições:** X deve ser 3D

---

# Família 07 — Decomposição Multiway (`07_multiway_decomp`)

---

## `parafac`

PARAFAC / CP Decomposition.

**Inputs:** `X` (tensor, ndim ≥ 3)  
**Parâmetros:** `rank`, `n_iter_max`, `tol`, `init`  
**Outputs:** `factors` (lista de matrizes por modo), `reconstruction_error`  
**Restrições:** ndim ≥ 3

---

## `tucker3`

Tucker3 Decomposition.

**Inputs:** `X` (tensor, ndim ≥ 3)  
**Parâmetros:** `ranks` (lista de ranks por modo)  
**Outputs:** `core`, `factors`, `reconstruction_error`

---

## `mcr_als`

Multivariate Curve Resolution — Alternating Least Squares.

**Inputs:** `X` (matrix ou tensor desdobrado)  
**Parâmetros:** `n_components`, `constraints` (non_negativity, closure, unimodality)  
**Outputs:** `C` (concentrações), `St` (espectros puros), `residuals`

---

## `npls`

N-way PLS (NPLS).

**Inputs:** `X` (tensor, ndim ≥ 3), `y`  
**Parâmetros:** `n_components`  
**Outputs:** `scores`, `loadings`, `metrics`

---

## `hosvd`

Higher-Order SVD.

**Inputs:** `X` (tensor)  
**Parâmetros:** `ranks`  
**Outputs:** `core`, `factors`, `explained_variance`

---

# Família 08 — Regressão Multiway (`08_multiway_regression`)

---

## `npls_regression`

N-PLS para regressão com dados de ordem superior.

**Inputs:** `X` (tensor, ndim ≥ 3), `y`  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `scores`, `weights`, `metrics`

---

## `upls`

Unfolded PLS (U-PLS).

**Inputs:** `X` (tensor), `y`  
**Parâmetros:** `n_components`, `unfold_mode`  
**Outputs:** `model`, `metrics`

---

# Família 09 — Classificação Multiway (`09_multiway_classif`)

---

## `multilinear_lda`

LDA após redução multilinear do tensor.

**Inputs:** `X` (tensor), `y`  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `scores`, `metrics`

---

## `tensor_svm`

SVM sobre features extraídas de tensor via Tucker.

**Inputs:** `X` (tensor), `y`  
**Parâmetros:** `ranks`, `kernel`, `C`  
**Outputs:** `model`, `metrics`

---

# Família 10 — Calibração de Ordem Superior (`10_calibracao_ordem_superior`)

---

## `segunda_ordem`

Calibração de segunda ordem — segunda geração analítica.

**Inputs:** `X` (tensor 3-way: amostras × modo1 × modo2), `y`  
**Parâmetros:** `n_components`, `method` (npls | tucker_pls)  
**Outputs:** `model`, `metrics`

---

## `terceira_ordem`

Calibração de terceira ordem — terceira geração analítica.

**Inputs:** `X` (tensor 4-way), `y`  
**Parâmetros:** `n_components`, `method`  
**Outputs:** `model`, `metrics`

---

# Família 11 — Seleção de Variáveis (`11_selecao_variaveis`)

---

## `uve`

Uninformative Variable Elimination.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `threshold`  
**Outputs:** `selected_indices`, `stability`

---

## `ipls`

Interval PLS.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_intervals`, `n_components`  
**Outputs:** `best_interval`, `selected_indices`, `rmsecv_per_interval`

---

## `sipls`

Synergy Interval PLS.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_intervals`, `n_components`, `max_combinations`  
**Outputs:** `best_combination`, `selected_indices`, `rmsecv`

---

## `cars`

Competitive Adaptive Reweighted Sampling.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `n_sampling_runs`  
**Outputs:** `selected_indices`, `frequency`

---

## `vip`

Variable Importance in Projection (VIP do PLS).

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `threshold` (padrão 1.0)  
**Outputs:** `vip_scores`, `selected_indices`

---

## `ga_pls`

Genetic Algorithm for PLS Variable Selection.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `population_size`, `n_generations`  
**Outputs:** `selected_indices`, `fitness_history`

---

## `spa`

Successive Projections Algorithm.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_variables`, `n_components`  
**Outputs:** `selected_indices`, `projections`

---

## `rf_importance`

Seleção por importância de variáveis do Random Forest.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_estimators`, `threshold`, `task` (regression | classification)  
**Outputs:** `selected_indices`, `importances`

---

## `boruta`

Boruta — seleção por comparação com variáveis shadow.

**Inputs:** `X`, `y`  
**Parâmetros:** `n_estimators`, `max_iter`, `alpha`  
**Outputs:** `selected_indices`, `support`, `ranking`

---

## `lasso_selection`

Seleção de variáveis por regularização LASSO.

**Inputs:** `X`, `y`  
**Parâmetros:** `alpha`, `cv` (bool), `n_alphas`  
**Outputs:** `selected_indices`, `coefficients`, `alpha_used`

---

# Família 12 — Validação de Modelos (`12_validacao_modelos`)

Métodos de validação cruzada, bootstrap e diagnóstico estatístico de modelos.

---

## `cross_validation`

Cross-Validation K-Fold, LOO ou Monte Carlo.

**Inputs:** `X`, `y`  
**Parâmetros:** `method` (pls | ridge | lda | rf_reg | rf_cls), `cv_type` (kfold | loo | montecarlo), `n_folds`, `n_iter`, `test_size`, parâmetros do modelo  
**Outputs:** `model`, `metrics_cv` (RMSECV + R² para regressão; accuracy + balanced_accuracy para classificação), `n_splits`

---

## `bootstrap`

Bootstrap Validation (.632 / .632+).

**Inputs:** `X`, `y`  
**Parâmetros:** `method`, `n_bootstrap`, `variant` (.632)  
**Outputs:** `model`, `apparent_mse`, `bootstrap_mse`, `mse_632`, `rmse_632`

---

## `permutation_test`

Teste de permutação (y-scrambling).

**Inputs:** `X`, `y`  
**Parâmetros:** `n_components`, `n_permutations`, `n_folds`  
**Outputs:** `model`, `real_rmsecv`, `permutation_rmsecv_mean`, `permutation_rmsecv_std`, `pvalue`, `permutation_distribution`

---

## `leverage_influence`

Leverage e Influência (Hat Matrix + Distância de Cook).

**Inputs:** `X`, `y`  
**Parâmetros:** `threshold_leverage`  
**Outputs:** `model`, `leverage`, `cooks_distance`, `threshold_leverage`, `high_leverage_samples`, `n_high_leverage`

---

# Família 13 — Transferência de Aprendizado (`13_transferencia_aprendizado`)

Padronização de instrumentos, domain adaptation e fine-tuning de modelos espectrais.

---

## `pds`

Piecewise Direct Standardization.

**Inputs:** `X_secondary`, `X_primary`, `X_new` (opcional)  
**Parâmetros:** `window`, `n_components`  
**Outputs:** `model`, `X_corrected`  
**Restrições:** `X_primary` e `X_secondary` devem ter o mesmo shape

---

## `ds`

Direct Standardization.

**Inputs:** `X_secondary`, `X_primary`, `X_new` (opcional)  
**Outputs:** `model`, `F` (matriz de transformação), `X_corrected`  
**Restrições:** mesmas amostras em primário e secundário

---

## `domain_adaptation_pca`

Domain Adaptation via alinhamento de espaços PCA (Procrustes).

**Inputs:** `X_source`, `X_target`  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `source_scores`, `target_scores_aligned`, `rotation`, `source_explained_variance`  
**Restrições:** `X_source` e `X_target` devem ter o mesmo número de variáveis

---

## `fine_tuning_pls`

Fine-Tuning PLS: adapta modelo fonte com poucas amostras alvo.

**Inputs:** `X_source`, `y_source`, `X_target`, `y_target`  
**Parâmetros:** `n_components`, `weight_source`  
**Outputs:** `model`, `metrics_source_model`, `metrics_target_model`, `metrics_ensemble`, `y_pred_ensemble`

---

## `spectral_calibration_transfer`

Transferência de calibração espectral de instrumento mestre para escravo.

**Inputs:** `X_master`, `X_slave`, `X_slave_new` (opcional)  
**Parâmetros:** `method` (pds | ds), `window`, `n_components`  
**Outputs:** `model`, `X_corrected`  
**Restrições:** `X_master` e `X_slave` devem ter o mesmo shape

---

# Família 14 — Sinais Espectrais (`14_sinais_espectrais`)

Processamento de sinais: detecção de picos, alinhamento, decomposição, estimativa de ruído e análise de Fourier.

---

## `peak_detection`

Detecção de picos espectrais (scipy.signal.find_peaks).

**Inputs:** `X` (1D ou 2D), `wavenumbers` (opcional)  
**Parâmetros:** `height`, `prominence`, `distance`, `width`  
**Outputs:** `model`, `results` (peak_indices, peak_positions, peak_heights, prominences, widths)

---

## `peak_alignment`

Alinhamento de picos por correlação cruzada (COW simplificado).

**Inputs:** `X` (matrix: n_samples × n_vars)  
**Parâmetros:** `reference` ("mean" ou índice), `max_shift`  
**Outputs:** `model`, `X_aligned`, `shifts`  
**Restrições:** X deve ser 2D

---

## `spectrum_decomposition`

Decomposição de espectros em componentes puros via NMF, ICA ou PCA.

**Inputs:** `X` (matrix)  
**Parâmetros:** `method` (nmf | ica | pca), `n_components`  
**Outputs:** `model`, `scores`, `components`  
**Restrições:** X deve ser 2D; method deve ser nmf, ica ou pca

---

## `noise_estimation`

Estimativa de nível de ruído espectral.

**Inputs:** `X` (1D ou 2D)  
**Parâmetros:** `method` (derivative | swsc | std)  
**Outputs:** `model`, `noise_levels`, `mean_snr`

---

## `fourier_analysis`

FFT e filtragem por corte de frequência.

**Inputs:** `X` (1D ou 2D)  
**Parâmetros:** `mode` (transform | lowpass | highpass), `cutoff` (fração da frequência de Nyquist)  
**Outputs:** `model`, `frequencies`, `results` (magnitude e fase em modo transform; sinal filtrado em lowpass/highpass)

---

# Família 15 — Imagens Hiperespectrais (`15_imagens_hiperespectrais`)

---

## `hyperspectral_unmixing`

Desmistura hiperespectral: extrai endmembers e abundâncias.

**Inputs:** `X` (matrix: n_pixels × n_bands)  
**Parâmetros:** `n_endmembers`, `method` (vca | nfindr | fclsu), `lambda_constraint`  
**Outputs:** `model`, `endmember_indices`, `endmembers`, `abundances`, `reconstruction_rmse`  
**Restrições:** X deve ser 2D; method deve ser vca, nfindr ou fclsu

---

## `hyperspectral_classification`

Classificação pixel-a-pixel de imagem hiperespectral.

**Inputs:** `X` (n_pixels × n_bands), `y` (labels por pixel)  
**Parâmetros:** `method` (svm | rf), `n_components_pca`  
**Outputs:** `model`, `y_pred`, `accuracy`, `explained_variance`  
**Restrições:** X deve ser 2D; `X.shape[0] == len(y)`

---

## `hyperspectral_pca`

PCA de imagem hiperespectral.

**Inputs:** `X` (2D: n_pixels × n_bands ou 3D: H × W × n_bands)  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `scores`, `loadings`, `explained_variance_ratio`, `cumulative_variance`

---

## `spectral_angle_mapper`

SAM — Spectral Angle Mapper.

**Inputs:** `X` (n_pixels × n_bands), `references` (n_classes × n_bands), `class_names` (opcional)  
**Parâmetros:** `threshold_degrees`  
**Outputs:** `model`, `y_pred`, `minimum_angles_degrees`, `all_angles_degrees`  
**Restrições:** X e references devem ter o mesmo número de bandas

---

# Família 16 — Dados Faltantes (`16_dados_faltantes`)

Métodos de imputação para matrizes espectrais com valores ausentes (NaN).

---

## `knn_imputation`

Imputação por K vizinhos mais próximos.

**Inputs:** `X` (matrix 2D com NaN)  
**Parâmetros:** `n_neighbors`, `weights` (uniform | distance)  
**Outputs:** `model`, `X_imputed`, `n_missing`, `missing_fraction`

---

## `iterative_imputation`

Imputação iterativa multivariada (MICE).

**Inputs:** `X` (matrix 2D com NaN)  
**Parâmetros:** `max_iter`, `random_state`, `estimator` (bayesian_ridge | random_forest)  
**Outputs:** `model`, `X_imputed`, `n_missing`, `n_iterations`

---

## `matrix_completion`

Completamento de matriz via SVD truncado iterativo.

**Inputs:** `X` (matrix 2D com NaN)  
**Parâmetros:** `rank`, `max_iter`, `tol`  
**Outputs:** `model`, `X_imputed`, `n_missing`, `final_loss`

---

## `spectral_interpolation`

Interpolação 1D de regiões faltantes em espectros.

**Inputs:** `X` (1D ou 2D com NaN), `wavenumbers` (opcional)  
**Parâmetros:** `method` (linear | cubic | pchip)  
**Outputs:** `model`, `X_imputed`, `n_missing`

---

## `pca_imputation`

Imputação via PCA iterativa (algoritmo NIPALS).

**Inputs:** `X` (matrix 2D com NaN)  
**Parâmetros:** `n_components`, `max_iter`, `tol`  
**Outputs:** `model`, `X_imputed`, `n_missing`, `explained_variance_ratio`

---

# Família 17 — Fusão de Dados (`17_fusao_dados`)

Métodos de fusão de múltiplos blocos de dados espectrais ou de diferentes sensores.

---

## `low_level_fusion`

Fusão de baixo nível: concatenação de blocos (raw ou pré-processados).

**Inputs:** `blocks` (lista com ≥ 2 matrizes), `block_names` (opcional)  
**Parâmetros:** `scale_blocks` (bool)  
**Outputs:** `model`, `X_fused`, `block_info`, `total_variables`

---

## `mid_level_fusion`

Fusão de médio nível: extração de features por PCA de cada bloco, depois concatenação.

**Inputs:** `blocks` (lista com ≥ 2 matrizes), `block_names` (opcional)  
**Parâmetros:** `n_components_per_block`, `variance_threshold`  
**Outputs:** `model`, `X_fused`, `block_info`, `total_components`

---

## `high_level_fusion`

Fusão de alto nível: combinação de predições por voto ou média.

**Inputs:** `predictions` (lista com ≥ 2 vetores), `model_names` (opcional)  
**Parâmetros:** `strategy` (mean | vote | weighted_mean), `weights`, `task` (regression | classification)  
**Outputs:** `model`, `y_fused`, `model_names`, `weights_used`

---

## `kernel_fusion`

Kernel Fusion estilo MKL: combina kernels de múltiplos blocos com pesos iguais.

**Inputs:** `blocks` (lista com ≥ 2 matrizes), `y`  
**Parâmetros:** `kernel` (rbf | linear), `gamma`  
**Outputs:** `model`, `K_combined`, `y_pred`, `accuracy`

---

## `socofus`

SOCOFUS — Sequential/Orthogonalized PLS Fusion.

**Inputs:** `blocks` (lista com ≥ 2 matrizes), `y`, `block_names` (opcional)  
**Parâmetros:** `n_components`  
**Outputs:** `model`, `block_results`, `metrics`, `y_pred`

---

# Família 18 — Quimiometria de Processo (`18_quimiometria_processo`)

Controle estatístico de processo (SPC/MSPC) para monitoramento de processos industriais.

---

## `mspc`

MSPC — Multivariate Statistical Process Control (Hotelling T² e SPE/Q).

**Inputs:** `X` (calibração, matrix 2D), `X_new` (opcional, padrão = X)  
**Parâmetros:** `n_components`, `alpha`  
**Outputs:** `model`, `T2`, `SPE`, `T2_limit`, `SPE_limit`, `out_of_control_T2`, `out_of_control_SPE`, `explained_variance_ratio`

---

## `pca_control_chart`

Gráficos de controle T² e Q por componente principal (±3σ).

**Inputs:** `X` (calibração), `X_new` (opcional)  
**Parâmetros:** `n_components`, `alpha`  
**Outputs:** `model`, `scores_new`, `UCL_scores`, `LCL_scores`, `SPE`, `out_of_control`

---

## `ewma`

EWMA — Exponentially Weighted Moving Average (univariado ou multivariado).

**Inputs:** `X` (1D univariado ou 2D multivariado)  
**Parâmetros:** `lambda`, `L`  
**Outputs:** univariado: `model`, `Z`, `UCL`, `LCL`, `out_of_control`; multivariado: `model`, `T2_ewma`, `T2_limit`, `out_of_control`

---

## `batch_pca`

Batch PCA (MPCA) para dados de processo em batelada.

**Inputs:** `X` (tensor 3D: n_batches × n_time × n_vars)  
**Parâmetros:** `n_components`, `unfold_mode` (batch | variable)  
**Outputs:** `model`, `scores`, `SPE`, `explained_variance_ratio`, `loadings`  
**Restrições:** X deve ser 3D

---

## `cusum_chart`

CUSUM — Cumulative Sum Control Chart.

**Inputs:** `X` (vetor 1D)  
**Parâmetros:** `k` (slack value), `h` (decision interval), `mu0`, `sigma`  
**Outputs:** `model`, `C_plus`, `C_minus`, `UCL`, `out_of_control`, `n_alarms`  
**Restrições:** X deve ser 1D

---

# Família 19 — Interpretabilidade de Modelos (`19_interpretabilidade`)

Ferramentas para explicabilidade de modelos quimiométricos.

---

## `permutation_importance`

Importância por permutação: mede queda de performance ao embaralhar cada variável.

**Inputs:** `X`, `y`, `wavenumbers` (opcional)  
**Parâmetros:** `task` (regression | classification), `method` (pls | rf), `n_repeats`, `random_state`, `n_components`  
**Outputs:** `model`, `importances_mean`, `importances_std`, `ranking`, `top_features` (top 20)

---

## `partial_dependence`

Partial Dependence Plot (PDP) via Random Forest.

**Inputs:** `X`, `y`  
**Parâmetros:** `feature_indices`, `n_grid_points`  
**Outputs:** `model`, `pdp` (lista com grid_values e average por feature)

---

## `sensitivity_analysis`

Análise de sensibilidade local (gradiente numérico) ou global (Morris screening).

**Inputs:** `X`, `y`  
**Parâmetros:** `method` (local | morris), `n_trajectories`, `n_components`  
**Outputs:** `model`, `sensitivity`, `ranking`, `top_features` (top 20)

---

## `vip_interpretation`

VIP Scores do modelo PLS com análise das regiões mais importantes.

**Inputs:** `X`, `y`, `wavenumbers` (opcional)  
**Parâmetros:** `n_components`, `vip_threshold` (padrão 1.0)  
**Outputs:** `model`, `vip`, `important_indices`, `ranking`, `n_important`, `top_features` (top 20)

---

## `lime_explanation`

LIME — Local Interpretable Model-agnostic Explanations.

**Inputs:** `X`, `y`  
**Parâmetros:** `sample_indices`, `n_perturbations`, `sigma`, `n_components`  
**Outputs:** `model`, `explanations` (coeficientes e ranking das top 10 features por amostra)

---

# Família 20 — Utilitários (`20_utilitarios`)

Scripts utilitários de suporte a análises quimiométricas.

---

## `metrics_aggregation`

Consolidação e comparação de métricas de múltiplos experimentos.

**Inputs:** `results` (lista de dicts com métricas)  
**Parâmetros:** `metrics` (lista de chaves a comparar), `sort_by`  
**Outputs:** `model`, `summary` (mean, std, min, max por métrica), `n_experiments`, `sorted_results`, `best_experiment`

---

## `spectrum_simulator`

Geração de espectros sintéticos com picos gaussianos e ruído controlado.

**Inputs:** nenhum (completamente parametrizado)  
**Parâmetros:** `n_samples`, `n_vars`, `n_peaks`, `snr`, `seed`  
**Outputs:** `model`, `X`, `y`, `wavenumbers`, `peak_positions`, `snr_actual`

---

## `unit_converter`

Conversão entre unidades espectrais: nm, cm⁻¹, eV, THz, μm.

**Inputs:** `values`  
**Parâmetros:** `from_unit`, `to_unit` (nm | cm-1 | ev | thz | um)  
**Outputs:** `model`, `converted`, `original`  
**Restrições:** unidades devem pertencer ao conjunto suportado

---

## `outlier_detection_utility`

Detecção de amostras aberrantes por métodos clássicos.

**Inputs:** `X` (1D ou 2D)  
**Parâmetros:** `method` (mahalanobis | grubbs | iqr), `alpha`  
**Outputs:** `model`, `outlier_flags`, `scores`, `n_outliers`, `outlier_indices`, `threshold`

---

## `data_export_report`

Sumário estatístico de dataset: estatísticas descritivas, correlações, distribuições.

**Inputs:** `X` (matrix 2D), `y` (opcional), `wavenumbers` (opcional), `sample_names` (opcional)  
**Parâmetros:** `include_correlation` (bool; limitado a p ≤ 200)  
**Outputs:** `model`, `descriptive_statistics` (mean, std, min, max, missing), `wavenumbers`, `sample_names`, `y_statistics` (se y fornecido)

---

## `spectral_database_search`

Busca de espectros semelhantes em base de dados por similaridade cosseno ou SAM.

**Inputs:** `query` (1D ou 2D), `database` (n_refs × n_bands), `db_names` (opcional)  
**Parâmetros:** `metric` (cosine | sam), `top_k`  
**Outputs:** `model`, `results` (rank, index, name, score para top_k matches)  
**Restrições:** query e database devem ter o mesmo número de variáveis/bandas
