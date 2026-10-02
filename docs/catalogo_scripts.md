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
família           grupo do catálogo (01_dados, 02_pre_processamento, …)
descrição         o que o script faz
inputs            portas de entrada com tipo, ordem mínima/máxima e restrições
parâmetros        configurações ajustáveis pelo usuário
outputs           portas de saída com tipo e shape esperado
restrições        regras matemáticas que o validate() verifica antes de executar
```

O `validate()` verifica tipo, shape, dtype, ordem analítica, eixo de amostras e compatibilidade entre entradas antes de qualquer execução. O `execute()` só roda em entradas já validadas.

---

## Famílias

| Código | Família |
|--------|---------|
| 01 | Dados e Operações |
| 02 | Pré-processamento |
| 03 | Análise Exploratória |
| 04 | Regressão 1D |
| 05 | Classificação 1D |
| 06 | Deep Learning |
| 07 | Decomposição Multiway |
| 08 | Regressão Multiway |
| 09 | Classificação Multiway |
| 10 | Calibração de Ordem Superior |
| 11 | Interferentes e Vantagem Analítica |
| 12 | Seleção de Variáveis |
| 13 | Otimização |
| 14 | Validação |
| 15 | Métricas |
| 16 | Diagnósticos |
| 17 | Visualização |
| 18 | Dados Sintéticos |
| 19 | Transferência de Calibração |
| 20 | Fusão de Sensores |

---

# Família 01 — Dados e Operações

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

## `transpose`

Permuta os eixos do array.

**Inputs:** `X` (array N-dimensional)
**Parâmetros:** `axes` (permutação dos índices dos eixos)
**Outputs:** `X_T` com shape reordenado
**Restrições:** len(axes) deve ser igual ao ndim de X; axes deve ser permutação válida
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
**Parâmetros:** `ranges` — dict `{eixo: [start, stop, step]}` para cada eixo a recortar
**Outputs:** `X_sl` (array N-dimensional, mesma ordem)

---

## `squeeze`

Remove eixos de tamanho 1.

**Inputs:** `X` (array N-dimensional)
**Parâmetros:** `axis` (opcional — especifica qual eixo remover; se omitido, remove todos de tamanho 1)
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

**Inputs:** `X` (tensor, min_order=2)
**Parâmetros:** `mode` (índice do eixo a desdobrar), `ordering` (C ou F)
**Outputs:** `X_unf` (matrix)
**Restrições:** mode deve ser índice válido do tensor
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

**Inputs:** `A`, `B` (arrays — pode receber lista de arrays)
**Parâmetros:** `axis`
**Outputs:** `result`
**Restrições:** todos os inputs devem ter mesmo ndim; todos os eixos exceto `axis` devem ter mesmo tamanho
**Transformação de shape:** tamanho do eixo `axis` é somado

---

## `stack`

Empilha arrays adicionando um novo eixo.

**Inputs:** `A`, `B` (arrays com shapes idênticos)
**Parâmetros:** `axis` (posição do novo eixo)
**Outputs:** `result`
**Restrições:** shapes de A e B devem ser idênticos

---

## `split`

Divide array em partes ao longo de um eixo.

**Inputs:** `X`
**Parâmetros:** `indices_or_sections` (int ou lista de índices), `axis`
**Outputs:** `part_1`, `part_2`, … (múltiplos outputs nomeados)

---

## `soma`

Adição elemento a elemento.

**Inputs:** `A`, `B`
**Parâmetros:** nenhum (broadcasting permitido apenas se declarado explicitamente)
**Outputs:** `result`
**Restrições:** shapes devem ser compatíveis

---

## `subtracao`

**Inputs:** `A`, `B`
**Outputs:** `result` = A − B
**Restrições:** shapes compatíveis

---

## `multiplicacao_elementwise`

**Inputs:** `A`, `B`
**Outputs:** `result` = A × B (elemento a elemento)
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

**Inputs:** `A` (matrix)
**Outputs:** `A_inv` (matrix)
**Restrições:** A deve ser quadrada (n × n). Matrizes não quadradas são rejeitadas — não há conversão silenciosa para pseudo-inversa.

---

## `pseudo_inversa`

Calcula a pseudo-inversa de Moore-Penrose A⁺.

**Inputs:** `A` (matrix — quadrada ou retangular)
**Outputs:** `A_pinv` com shape transposto: (n, m) se A era (m, n)

---

## `determinante`

**Inputs:** `A` (matrix)
**Outputs:** `det` (scalar)
**Restrições:** A deve ser quadrada

---

## `autovalores`

**Inputs:** `A` (matrix)
**Outputs:** `eigenvalues` (vector, dtype complex128)
**Restrições:** A deve ser quadrada
**Representação JSON:** `{"real": [...], "imag": [...]}`

---

## `autovetores`

**Inputs:** `A` (matrix)
**Outputs:** `eigenvectors` (matrix — cada coluna é um autovetor)
**Restrições:** A deve ser quadrada

---

## `eig`

Bloco combinado que retorna autovalores e autovetores juntos.

**Inputs:** `A` (matrix)
**Outputs:** `eigenvalues` (vector), `eigenvectors` (matrix)
**Restrições:** A deve ser quadrada

---

## `svd`

Decomposição em valores singulares A = U Σ Vᵀ.

**Inputs:** `A` (matrix — quadrada ou retangular)
**Parâmetros:** `full_matrices` (bool, default false — SVD reduzida)
**Outputs:** `U` (matrix), `S` (vector de valores singulares), `Vt` (matrix)

---

## `norma`

Calcula norma do array.

**Inputs:** `X`
**Parâmetros:** `ord` (1, 2, inf, 'fro' etc.), `axis` (opcional)
**Outputs:** `result` (scalar ou array dependendo do axis)

---

## `trace`

**Inputs:** `A` (matrix)
**Outputs:** `result` (scalar)
**Restrições:** A deve ser quadrada

---

## `rank`

Posto numérico da matriz.

**Inputs:** `A` (matrix)
**Parâmetros:** `tol` (tolerância numérica, opcional)
**Outputs:** `result` (scalar inteiro)

---

## `mean`

**Inputs:** `X`
**Parâmetros:** `axis` (int ou lista), `keepdims` (bool)
**Outputs:** `result`
**Transformação de shape:** eixo(s) especificado(s) são removidos (ou reduzidos a 1 se keepdims=True)

---

## `median`

**Inputs:** `X`
**Parâmetros:** `axis`, `keepdims`
**Outputs:** `result`

---

## `std`

**Inputs:** `X`
**Parâmetros:** `axis`, `keepdims`, `ddof` (graus de liberdade, default 0)
**Outputs:** `result`

---

## `min` / `max` / `sum`

**Inputs:** `X`
**Parâmetros:** `axis`, `keepdims`
**Outputs:** `result`

---

## `formula_customizada`

Executa expressão matemática controlada definida pelo usuário.

**Inputs:** `X` e/ou `A`, `B` (dependendo das variáveis na fórmula)
**Parâmetros:** `expression` (string)
**Outputs:** `result`

**Operações permitidas:**
`+`, `-`, `*`, `/`, `**`, `@`, `sqrt()`, `log()`, `log10()`, `exp()`, `abs()`, `mean()`, `std()`, `min()`, `max()`, `sum()`, `transpose()`, `reshape()`, `norm()`

**Operações proibidas:** qualquer acesso a `os`, `sys`, `subprocess`, `open`, `exec`, `eval`, `import`, `__import__` ou qualquer módulo externo.

**Fluxo obrigatório:**
```
expressão (string)
    ↓
parser AST (ast.parse)
    ↓
validação por whitelist de nós AST permitidos
    ↓
executor matemático (NumPy/SciPy via mapeamento controlado)
    ↓
result
```

---

# Família 02 — Pré-processamento

Métodos de transformação espectral. Todos operam sobre o eixo espectral declarado explicitamente — nunca assumem silenciosamente qual eixo representa variáveis.

---

## `snv`

Standard Normal Variate. Centraliza e escala cada amostra individualmente.

**Inputs:** `X` (matrix, min_order=1, requires_sample_axis=1)
**Parâmetros:** `spectral_axis` (int, default 1)
**Outputs:** `X_snv`

---

## `msc`

Multiplicative Scatter Correction. Corrige efeitos de espalhamento.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `reference` (vetor de referência ou 'mean')
**Outputs:** `X_msc`, `reference_used`

---

## `detrend`

Remove tendência linear ou polinomial de cada amostra.

**Inputs:** `X` (matrix)
**Parâmetros:** `degree` (int, default 1), `spectral_axis`
**Outputs:** `X_dt`

---

## `baseline`

Correção de linha de base.

**Inputs:** `X` (matrix)
**Parâmetros:** `method` (linear | polynomial | rubberband | als), `degree`, `lambda_` (para ALS), `spectral_axis`
**Outputs:** `X_bl`

---

## `savitzky_golay`

Suavização e/ou derivação por filtro Savitzky-Golay.

**Inputs:** `X` (matrix)
**Parâmetros:** `window_length` (int ímpar), `polyorder` (int), `deriv` (0=suavização, 1=1ª derivada, 2=2ª derivada), `spectral_axis`
**Outputs:** `X_sg`
**Restrições:** `window_length > polyorder`; `window_length` deve ser ímpar

---

## `normalizacao`

Normalização por norma vetorial, área, máximo ou intervalo.

**Inputs:** `X` (matrix)
**Parâmetros:** `method` (l1 | l2 | max | area | range), `spectral_axis`
**Outputs:** `X_norm`

---

## `centering`

Subtrai a média de cada variável (mean centering).

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `axis` (eixo das variáveis, default 1)
**Outputs:** `X_c`, `mean_` (vetor de médias — necessário para aplicar a novos dados)

---

## `autoscaling`

Mean centering + divisão pelo desvio padrão (z-score por variável).

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Outputs:** `X_as`, `mean_`, `std_`

---

## `pareto`

Mean centering + divisão pela raiz quadrada do desvio padrão.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Outputs:** `X_p`, `mean_`, `scale_`

---

## `outros_scalings`

Bloco genérico para variações de escalonamento.

**Inputs:** `X`
**Parâmetros:** `method` (vast | level | range), `axis`
**Outputs:** `X_s`, `params_` (parâmetros salvos para aplicar a novos dados)

---

## `robust_scaling`

Escalonamento robusto a outliers. Centraliza pela mediana e divide pelo IQR (intervalo interquartil), tornando o método insensível a amostras atípicas. Especialmente útil em ATR-FTIR quando o conjunto de calibração pode conter outliers espectrais.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `spectral_axis` (int, default 1), `quantile_range` (tupla, default [25, 75])
**Outputs:** `X_rs`, `median_` (vetor de medianas), `iqr_` (vetor de IQRs — necessários para aplicar a novos dados)
**Nota de implementação:** `sklearn.preprocessing.RobustScaler`

---

## `osc`

Orthogonal Signal Correction. Remove da matriz X a variação ortogonal a y antes do PLS ou PLS-DA, reduzindo a interferência espectral não correlacionada com a variável alvo. Amplamente usado em NIR e ATR-FTIR antes de modelos de regressão e classificação.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y` (vector ou matrix)
**Parâmetros:** `n_components` (int, default 1), `max_iter` (int, default 100), `tolerance` (float, default 1e-6), `spectral_axis` (int, default 1)
**Outputs:** `X_osc`, `weights_` (vetores de peso OSC — necessários para aplicar a novos dados), `scores_osc`
**Restrições:** exige `y` sempre — OSC é supervisionado; sem `y` o bloco é rejeitado
**Nota de implementação:** implementação própria (scipy.linalg) — não disponível em scikit-learn

---

## `emsc`

Extended Multiplicative Scatter Correction. Extensão do MSC que modela e remove simultaneamente efeitos de espalhamento multiplicativo e aditivo, além de contribuições de interferentes conhecidos (ex: água, CO₂). Padrão para FTIR de tecidos biológicos e amostras com matriz complexa.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `reference` (vetor de referência ou 'mean'), `polynomial_order` (int, default 2 — corrige baseline polinomial junto com espalhamento), `interferents` (matrix opcional — espectros de interferentes conhecidos), `spectral_axis` (int, default 1)
**Outputs:** `X_emsc`, `coefficients_` (coeficientes por amostra: multiplicativo, aditivo, polinomial, interferentes), `reference_used`
**Nota de implementação:** implementação própria ou biblioteca `rampy` — não disponível em scikit-learn

---

## `mie_emsc`

RMie-EMSC (Resonance Mie Scatter Extended MSC). Correção de espalhamento físico baseada no modelo de Mie para amostras em que o tamanho das partículas/células causa distorção espectral ressonante. Usado principalmente em FTIR de células e tecidos. Computacionalmente intenso.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `reference` (vetor de referência — tipicamente espectro de Matrigel ou célula padrão), `n_components` (int, componentes PCA para estimar espectro verdadeiro, default 7), `n_iterations` (int, default 4), `wavenumbers` (vetor obrigatório — eixo espectral em cm⁻¹), `particle_size_range` ([min, max] em µm, default [2, 8]), `spectral_axis` (int, default 1)
**Outputs:** `X_corrected`, `mie_spectra_` (espectros de espalhamento estimados por amostra)
**Restrições:** `wavenumbers` é obrigatório — o modelo de Mie depende da frequência absoluta
**Nota de implementação:** implementação própria baseada em `rampy` ou código do grupo de Kohler (Oslo) — dependência externa de alta complexidade; marcar como `is_beta=true` até validação

---

## `pqn`

Probabilistic Quotient Normalization. Normaliza cada amostra dividindo pelo quociente mais provável (mediana dos quocientes variável a variável em relação a uma referência), sendo mais robusta que normalização por área ou norma quando há variações de diluição. Originalmente proposta para NMR, amplamente adotada em FTIR metabolômico.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `reference` ('mean' | 'median' | vetor externo), `spectral_axis` (int, default 1)
**Outputs:** `X_pqn`, `reference_used` (vetor de referência efetivamente usado), `quotients_` (matrix de quocientes por amostra × variável), `scaling_factors_` (vetor de fatores de escala por amostra — necessário para aplicar a novos dados)
**Nota de implementação:** implementação própria (~20 linhas NumPy)

---

## `eilers_smoothing`

Suavização por spline penalizada de Eilers (Whittaker smoother). Usa diferenças finitas de ordem `d` e parâmetro de regularização `lambda_` para controlar o trade-off entre fidelidade aos dados e suavidade. Diferente do Savitzky-Golay: é globalmente ótimo, não introduz artefatos nas bordas e admite dados irregularmente espaçados.

**Inputs:** `X` (matrix)
**Parâmetros:** `lambda_` (float — penalidade de suavização; valores típicos: 10–10⁵), `d` (int, ordem das diferenças, default 2), `spectral_axis` (int, default 1)
**Outputs:** `X_smooth`
**Restrições:** `lambda_ > 0`
**Nota de implementação:** implementação própria com `scipy.sparse` (~30 linhas) — sem dependências externas adicionais

---

## `wavelet_transform`

Transformada Wavelet discreta para decomposição, suavização ou extração de características espectrais. Permite separar componentes de diferentes escalas de frequência, sendo útil para remover ruído de alta frequência preservando picos espectrais, ou para usar os coeficientes wavelet como features em modelos subsequentes (wavelet + PLS, wavelet + SVM). Aparece repetidamente na literatura NIR e Raman 2022–2025.

**Inputs:** `X` (matrix)
**Parâmetros:** `wavelet` (string — nome da wavelet: 'db4', 'haar', 'sym5', 'coif3' etc., default 'db4'), `level` (int — nível de decomposição, default None = máximo possível), `mode` (denoise | decompose | features), `threshold_method` (soft | hard | None — apenas para mode=denoise), `spectral_axis` (int, default 1)
**Outputs:**
- `mode=denoise` → `X_denoised` (matrix com mesmo shape de X)
- `mode=decompose` → `approximation` (matrix), `details` (lista de matrizes por nível)
- `mode=features` → `X_features` (matrix com coeficientes como variáveis — shape diferente de X)
**Nota de implementação:** `pywavelets` (PyPI — `import pywt`)

---

## `automated_preprocessing`

Seleção automática de sequência de pré-processamento. Avalia combinações de métodos de pré-processamento e escolhe a sequência que minimiza o RMSECV de um modelo PLS de referência, com penalização opcional pela complexidade do pipeline. Inspirado no ProSpecTool (2024) e no framework de pré-processamento automatizado para NIR (2025). Especialmente útil quando o pesquisador não tem conhecimento prévio sobre qual combinação de pré-processamentos é adequada para os dados.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y` (vector)
**Parâmetros:** `methods_pool` (lista de slugs de pré-processamento a considerar, default ['snv','msc','baseline','savitzky_golay','centering','autoscaling','pareto']), `max_steps` (int — número máximo de etapas no pipeline, default 3), `n_components_pls` (int — componentes PLS para avaliação, default 5), `cv_folds` (int, default 5), `scoring_metric` (rmsecv | r2cv, default rmsecv), `penalize_complexity` (bool, default true — penaliza pipelines com mais etapas), `search_strategy` (exhaustive | random | bayesian, default bayesian quando pool > 5 métodos)
**Outputs:** `best_pipeline` (lista ordenada de slugs), `best_score` (float — RMSECV do melhor pipeline), `scores_all_combinations` (tabela de resultados), `X_preprocessed` (matrix — X após aplicação do melhor pipeline)
**Restrições:** combina apenas scripts da família 02; não inclui scripts supervisionados (OSC, EMSC com interferentes) na busca automática por padrão
**Nota de implementação:** implementação própria orquestrando chamadas aos scripts da família 02

---

# Família 03 — Análise Exploratória

---

## `pca`

Análise de Componentes Principais.

**Inputs:** `X` (matrix, requires_sample_axis=1, min_order=1, max_order=1)
**Parâmetros:** `n_components` (int ou 'auto'), `center` (bool, default true), `scale` (bool, default false)
**Outputs:** `scores` (matrix I×R), `loadings` (matrix J×R), `explained_variance` (vector), `explained_variance_ratio` (vector)

---

## `hca`

Análise de Agrupamento Hierárquico.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `method` (ward | complete | average | single), `metric` (euclidean | cosine | correlation)
**Outputs:** `linkage_matrix`, `dendrogram_data`

---

## `kmeans`

Agrupamento K-Means.

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `n_clusters` (int), `n_init` (int, default 10), `random_state`
**Outputs:** `labels` (vector), `centroids` (matrix), `inertia` (scalar)

---

## `outlier_detection`

Detecção de outliers por distância de Mahalanobis ou Hotelling T².

**Inputs:** `X` (matrix, requires_sample_axis=1)
**Parâmetros:** `method` (mahalanobis | hotelling | isolation_forest), `alpha` (nível de significância)
**Outputs:** `outlier_mask` (vector booleano), `scores_` (vector de scores por amostra), `threshold`

---

# Família 04 — Regressão 1D

Todos requerem `requires_sample_axis=1` e `min_order=1, max_order=1` (matriz X e vetor y).

---

## `ols`

Mínimos Quadrados Ordinários.

**Inputs:** `X` (matrix), `y` (vector)
**Parâmetros:** nenhum
**Outputs:** `model`, `coefficients` (vector), `intercept` (scalar), `metrics_cal`

---

## `ridge`

Regressão Ridge (regularização L2).

**Inputs:** `X`, `y`
**Parâmetros:** `alpha` (float, fator de regularização)
**Outputs:** `model`, `coefficients`, `intercept`, `metrics_cal`

---

## `lasso`

Regressão Lasso (regularização L1).

**Inputs:** `X`, `y`
**Parâmetros:** `alpha` (float)
**Outputs:** `model`, `coefficients`, `intercept`, `metrics_cal`

---

## `elastic_net`

Regularização mista L1+L2.

**Inputs:** `X`, `y`
**Parâmetros:** `alpha` (float), `l1_ratio` (float 0–1)
**Outputs:** `model`, `coefficients`, `intercept`, `metrics_cal`

---

## `pcr`

Regressão por Componentes Principais.

**Inputs:** `X`, `y`
**Parâmetros:** `n_components` (int)
**Outputs:** `model`, `scores`, `loadings`, `coefficients`, `metrics_cal`

---

## `pls`

Partial Least Squares Regression (PLS1 ou PLS2).

**Inputs:** `X` (matrix), `Y` (vector ou matrix)
**Parâmetros:** `n_components` (int), `scale` (bool)
**Outputs:** `model`, `x_scores`, `x_loadings`, `y_loadings`, `x_weights`, `regression_vector`, `metrics_cal`

---

## `nonlinear_regression`

Regressão não linear por SVR ou kernel PLS.

**Inputs:** `X`, `y`
**Parâmetros:** `method` (svr | kernel_pls), `kernel` (rbf | poly | linear), `C`, `epsilon`, `gamma`
**Outputs:** `model`, `metrics_cal`

---

## `cls`

Classical Least Squares (CLS). Modela o espectro medido como combinação linear de espectros puros de componentes conhecidos: `X = C × Sᵀ`. Resolve para as concentrações C dado que os espectros puros S são conhecidos a priori. Indicado quando a composição espectral dos componentes é conhecida (ex: misturas simples com espectros de referência disponíveis). Aparece em 2026 em análise de Raman e química complexa.

**Inputs:** `X` (matrix — espectros das amostras), `S` (matrix — espectros puros dos componentes, shape J×K onde K é o número de componentes)
**Parâmetros:** `non_negativity` (bool, default false — força concentrações ≥ 0), `spectral_axis` (int, default 1)
**Outputs:** `C` (matrix — concentrações estimadas, shape I×K), `X_reconstructed` (matrix — espectros reconstruídos), `residuals` (matrix), `metrics_cal`
**Restrições:** S deve ser conhecido a priori e ter o mesmo número de variáveis que X; não é um modelo de calibração — não usa y
**Diferença de MCR-ALS:** CLS exige S conhecido; MCR-ALS estima S e C simultaneamente a partir de restrições

---

## `ils`

Inverse Least Squares (ILS). Modela diretamente a relação y = X × b, estimando o vetor de coeficientes b por regressão linear sem redução de dimensionalidade. Precursor histórico do PCR e PLS; continua sendo útil como baseline de comparação. Indicado quando o número de variáveis é menor que o número de amostras (situação inversa do espectroscópico típico — por isso costuma ser usado após seleção de variáveis). Aparece em 2026 comparado com CLS, PCR e PLSR.

**Inputs:** `X` (matrix), `y` (vector ou matrix)
**Parâmetros:** `regularization` (none | ridge | lasso, default none)
**Outputs:** `model`, `coefficients` (vector), `intercept` (scalar), `metrics_cal`
**Restrições:** requer n_samples > n_variables; use após seleção de variáveis quando n_variables > n_samples
**Nota:** quando `regularization=ridge` equivale funcionalmente ao bloco `ridge`; mantido como bloco próprio por clareza semântica e rastreabilidade histórica

---

# Família 05 — Classificação 1D

Todos requerem `requires_sample_axis=1`, matrix X e vetor de classes y.

---

## `lda`

Linear Discriminant Analysis.

**Inputs:** `X`, `y`
**Parâmetros:** `n_components` (int ou None)
**Outputs:** `model`, `scores`, `loadings`, `metrics_cal`

---

## `qda`

Quadratic Discriminant Analysis.

**Inputs:** `X`, `y`
**Outputs:** `model`, `metrics_cal`

---

## `knn`

K-Nearest Neighbors.

**Inputs:** `X`, `y`
**Parâmetros:** `n_neighbors` (int), `metric` (euclidean | cosine | minkowski), `weights` (uniform | distance)
**Outputs:** `model`, `metrics_cal`

---

## `svm`

Support Vector Machine.

**Inputs:** `X`, `y`
**Parâmetros:** `kernel` (rbf | linear | poly), `C` (float), `gamma`
**Outputs:** `model`, `support_vectors`, `metrics_cal`

---

## `pls_da`

PLS-DA — PLS usado para discriminação.

**Inputs:** `X`, `y` (classes)
**Parâmetros:** `n_components` (int)
**Outputs:** `model`, `x_scores`, `predicted_classes`, `class_probabilities`, `metrics_cal`

---

## `random_forest`

Random Forest Classifier.

**Inputs:** `X`, `y`
**Parâmetros:** `n_estimators` (int), `max_depth`, `random_state`
**Outputs:** `model`, `feature_importances`, `metrics_cal`

---

## `simca`

Soft Independent Modelling of Class Analogies. Modelo de classe independente.

**Inputs:** `X` (dados de uma classe), `X_test` (dados de teste)
**Parâmetros:** `n_components` (int), `alpha` (significância)
**Outputs:** `model`, `class_membership`, `distances`, `metrics_cal`

---

## `pls_oc`

PLS One-Class — modelo de classe única baseado em PLS.

**Inputs:** `X` (dados da classe alvo)
**Parâmetros:** `n_components`, `alpha`
**Outputs:** `model`, `class_membership`, `metrics_cal`

---

## `one_class_svm`

One-Class SVM para detecção de novidades.

**Inputs:** `X`
**Parâmetros:** `kernel`, `nu` (float 0–1), `gamma`
**Outputs:** `model`, `decision_scores`, `metrics_cal`

---

## `dd_simca`

Data-Driven SIMCA (DD-SIMCA). Variante moderna do SIMCA clássico que usa distâncias de Mahalanobis no espaço PCA (score distance SD e orthogonal distance OD) para definir a fronteira de classe de forma estatisticamente fundamentada. Mais rigoroso que o SIMCA clássico: a fronteira é baseada em distribuição F, não em threshold empírico. Aparece consistentemente na literatura 2021–2026 para autenticação de alimentos, óleos e produtos naturais.

**Inputs:** `X` (dados da classe alvo — apenas amostras da classe genuína), `X_test` (dados de teste — pode conter amostras de outras classes)
**Parâmetros:** `n_components` (int ou 'auto'), `alpha` (nível de significância, default 0.05), `gamma` (float — parâmetro de regularização para estimativa de Mahalanobis, default 0.05)
**Outputs:** `model`, `class_membership` (vector booleano), `sd_scores` (score distances), `od_scores` (orthogonal distances), `sd_threshold`, `od_threshold`, `crit_plot_data` (dados para gráfico SD vs OD), `metrics_cal`
**Diferença de `simca`:** o bloco `simca` usa distâncias euclidianas com threshold empírico; `dd_simca` usa distâncias de Mahalanobis com fronteira estatística via distribuição F — são resultados diferentes para os mesmos dados
**Nota de implementação:** implementação própria ou biblioteca `ddtools` (Python) se disponível

---

## `oc_rf`

One-Class Random Forest (OC-RF). Classifica amostras como pertencentes ou não a uma classe alvo usando Random Forest treinado apenas com amostras da classe genuína e amostras artificialmente geradas (pseudo-negativos). Gera amostras sintéticas uniformes no espaço de features como classe negativa e treina o RF para discriminá-las. Aparece em 2024 comparado diretamente com DD-SIMCA e OC-PLS para autenticação de cafés especiais.

**Inputs:** `X` (dados da classe alvo), `X_test` (dados de teste, opcional)
**Parâmetros:** `n_estimators` (int, default 100), `contamination` (float 0–0.5 — fração de pseudo-negativos gerados, default 0.1), `random_state`, `alpha` (nível de significância para threshold de decisão, default 0.05)
**Outputs:** `model`, `class_membership` (vector booleano), `decision_scores` (vector — probabilidade de pertencer à classe), `threshold`, `metrics_cal`
**Nota de implementação:** `sklearn.ensemble.RandomForestClassifier` com geração de pseudo-negativos via `numpy.random.uniform` no bounding box de X

---

# Família 06 — Deep Learning 1D

---

## `mlp`

Multi-Layer Perceptron.

**Inputs:** `X` (matrix), `y` (vector ou matrix)
**Parâmetros:** `hidden_layers` (lista de inteiros), `activation` (relu | tanh | sigmoid), `dropout` (float), `learning_rate`, `epochs`, `batch_size`, `task` (regression | classification)
**Outputs:** `model`, `history` (loss por epoch), `metrics_cal`

---

## `cnn_1d`

Rede Convolucional 1D para espectros.

**Inputs:** `X` (matrix — cada linha é um espectro), `y`
**Parâmetros:** `filters` (lista), `kernel_size`, `pooling`, `dense_layers`, `dropout`, `epochs`, `batch_size`, `task`
**Outputs:** `model`, `history`, `metrics_cal`

---

## `cnn_2d`

Rede Convolucional 2D para imagens ou mapas 2D.

**Inputs:** `X` (tensor, data_order≥2), `y`
**Parâmetros:** `filters`, `kernel_size`, `pooling`, `dense_layers`, `dropout`, `epochs`, `batch_size`, `task`
**Outputs:** `model`, `history`, `metrics_cal`

---

## `rnn`

Rede Recorrente (LSTM ou GRU) para séries temporais.

**Inputs:** `X` (tensor com eixo temporal), `y`
**Parâmetros:** `cell_type` (lstm | gru), `units` (lista), `dropout`, `epochs`, `batch_size`, `task`
**Outputs:** `model`, `history`, `metrics_cal`

---

## `transformer`

Modelo Transformer para dados sequenciais.

**Inputs:** `X`, `y`
**Parâmetros:** `n_heads`, `n_layers`, `d_model`, `dropout`, `epochs`, `batch_size`, `task`
**Outputs:** `model`, `history`, `metrics_cal`

---

## `autoencoder`

Autoencoder para compressão ou detecção de anomalias.

**Inputs:** `X`
**Parâmetros:** `encoder_layers` (lista), `latent_dim`, `decoder_layers`, `activation`, `epochs`, `batch_size`
**Outputs:** `model`, `latent_representation`, `reconstruction_error`, `history`

---

## `diffusion`

Modelo de difusão para geração de dados sintéticos (uso avançado).

**Inputs:** `X`
**Parâmetros:** `n_steps`, `schedule` (linear | cosine), `epochs`, `batch_size`
**Outputs:** `model`, `generated_samples`

---

# Família 07 — Decomposição Multiway

Todos aceitam arrays N-way de ordem arbitrária (min_order=2, max_order=NULL).

---

## `parafac`

Decomposição CP/PARAFAC. Fatoração N-way em componentes trilineares (ou N-lineares).

**Inputs:** `X` (tensor, min_order=2, max_order=NULL, requires_sample_axis=NULL)
**Parâmetros:** `n_components` (int), `initialization` (svd | random | dtld), `constraints` (lista: non_negativity, unimodality), `max_iter` (int, default 2500), `tolerance` (float, default 1e-6), `random_state`
**Outputs:** `scores` (matrix I×R), `loadings` (lista de matrizes — uma por modo), `core_consistency` (scalar), `explained_variance` (scalar), `residuals` (tensor)

---

## `parafac2`

PARAFAC2 — permite variação controlada em um modo (ex: tempos cromatográficos diferentes entre amostras).

**Inputs:** `X` (lista de matrizes ou tensor com modo variável)
**Parâmetros:** `n_components`, `max_iter`, `tolerance`
**Outputs:** `scores`, `loadings`, `projection_matrices`, `explained_variance`

---

## `parafac_aumentado`

PARAFAC para matrizes aumentadas (concatenação de dados de múltiplos experimentos).

**Inputs:** `X_aug` (matrix com augmentation_scheme declarado)
**Parâmetros:** `n_components`, `max_iter`, `tolerance`
**Outputs:** `scores`, `loadings`, `explained_variance`

---

## `tucker3`

Decomposição Tucker N-way (implementada como Tucker genérico, não limitada a 3 modos).

**Inputs:** `X` (tensor, min_order=2, max_order=NULL)
**Parâmetros:** `n_components` (lista de inteiros — um por modo), `initialization`, `max_iter`, `tolerance`
**Outputs:** `core_tensor`, `factor_matrices` (lista), `explained_variance`

---

## `mcr_als`

Resolução de Curvas Multivariada por Mínimos Quadrados Alternados.

**Inputs:** `X` (matrix, min_order=1, max_order=2, requires_sample_axis=0 ou NULL)
**Parâmetros:** `n_components`, `constraints` (non_negativity, unimodality, closure, correspondence), `max_iter`, `tolerance`, `initial_estimate` (spectra | concentrations)
**Outputs:** `C` (perfis de concentração), `S` (perfis espectrais), `residuals`, `explained_variance`

---

## `mpca`

Multilinear PCA — extensão N-way do PCA clássico.

**Inputs:** `X` (tensor, min_order=2, requires_sample_axis=1)
**Parâmetros:** `n_components` (int por modo ou global)
**Outputs:** `scores`, `loadings`, `explained_variance`

---

## `tensor_svd`

Decomposição tensorial baseada em HOSVD (Higher-Order SVD).

**Inputs:** `X` (tensor, min_order=2)
**Parâmetros:** `n_components` (lista por modo ou int global), `mode`
**Outputs:** `core_tensor`, `factor_matrices`, `singular_values`

---

## `tensor_nmf`

Fatoração Matricial Não Negativa para tensores.

**Inputs:** `X` (tensor, min_order=2 — todos os valores devem ser ≥ 0)
**Parâmetros:** `n_components`, `max_iter`, `tolerance`, `random_state`
**Outputs:** `W` (fatores), `H` (fatores), `reconstruction_error`
**Restrições:** X não pode conter valores negativos

---

# Família 08 — Regressão Multiway

---

## `n_pls`

N-PLS — extensão multiway do PLS. Opera diretamente sobre tensores.

**Inputs:** `X` (tensor, min_order=2, requires_sample_axis=1), `Y` (matrix ou vector)
**Parâmetros:** `n_components`, `max_iter`, `tolerance`
**Outputs:** `model`, `x_scores`, `x_loadings`, `y_loadings`, `metrics_cal`

---

## `u_pls`

U-PLS — PLS com unfolding prévio. Aplica unfolding no tensor antes do PLS.

**Inputs:** `X` (tensor, min_order=2), `Y`
**Parâmetros:** `n_components`, `unfold_mode`, `ordering`
**Outputs:** `model`, `x_scores`, `loadings`, `metrics_cal`

---

## `n_way_pcr`

PCR multiway. Aplica MPCA antes da regressão.

**Inputs:** `X` (tensor), `Y`
**Parâmetros:** `n_components_pca`, `n_components_reg`
**Outputs:** `model`, `scores`, `metrics_cal`

---

## `u_pca`

Unfolding + PCA. Aplica unfolding e depois PCA clássico.

**Inputs:** `X` (tensor)
**Parâmetros:** `n_components`, `unfold_mode`
**Outputs:** `scores`, `loadings`, `explained_variance`

---

## `parafac_regression`

Usa scores do PARAFAC como preditores em modelo de regressão.

**Inputs:** `scores` (matrix — output de parafac), `Y`
**Parâmetros:** `method` (ols | pls | ridge), `n_components`
**Outputs:** `model`, `coefficients`, `metrics_cal`

---

## `tucker_regression`

Usa core tensor e fatores do Tucker como base de regressão.

**Inputs:** `core_tensor`, `factor_matrices`, `Y`
**Parâmetros:** `method`, `n_components`
**Outputs:** `model`, `metrics_cal`

---

## `hpls`

Hierarchical PLS (H-PLS). Constrói um modelo PLS em dois níveis hierárquicos: primeiro extrai scores latentes de cada bloco de variáveis separadamente (PLS de primeiro nível), e depois usa esses scores como entradas de um PLS de segundo nível para prever y. Útil quando os dados vêm de múltiplos instrumentos ou modalidades com escalas e dimensionalidades diferentes — cada instrumento é um bloco independente. Aparece em 2025 combinando cinco instrumentos distintos para previsão de composição.

**Inputs:** `X_blocks` (lista de matrizes — uma por instrumento/modalidade, todas com mesmo sample_axis), `y` (vector ou matrix)
**Parâmetros:** `n_components_per_block` (int ou lista de int — componentes PLS em cada bloco de primeiro nível), `n_components_global` (int — componentes PLS no segundo nível), `scale_blocks` (bool, default true — centraliza e escala cada bloco independentemente)
**Outputs:** `model`, `block_scores` (lista de matrizes — scores de cada bloco), `global_scores` (matrix — scores do segundo nível), `block_weights` (importância de cada bloco), `metrics_cal`
**Restrições:** todos os blocos devem ter o mesmo número de amostras (mesmo sample_axis)
**Nota de implementação:** implementação própria encadeando chamadas ao `pls` por bloco

---

## `tensor_regression`

Regressão tensorial genérica.

**Inputs:** `X` (tensor), `Y`
**Parâmetros:** `method` (cp | tucker | tt), `rank`
**Outputs:** `model`, `metrics_cal`

---

# Família 09 — Classificação Multiway

---

## `multilinear_lda`

LDA multilinear para tensores.

**Inputs:** `X` (tensor, requires_sample_axis=1), `y`
**Parâmetros:** `n_components`
**Outputs:** `model`, `scores`, `metrics_cal`

---

## `tensor_svm`

SVM aplicado a representações tensoriais (via unfolding ou kernel tensorial).

**Inputs:** `X` (tensor), `y`
**Parâmetros:** `kernel`, `C`, `gamma`, `unfold_mode`
**Outputs:** `model`, `metrics_cal`

---

## `tensor_knn`

KNN sobre dados tensoriais.

**Inputs:** `X` (tensor), `y`
**Parâmetros:** `n_neighbors`, `metric`, `unfold_mode`
**Outputs:** `model`, `metrics_cal`

---

## `tensor_random_forest`

Random Forest sobre representação tensorial.

**Inputs:** `X` (tensor), `y`
**Parâmetros:** `n_estimators`, `max_depth`, `unfold_mode`, `random_state`
**Outputs:** `model`, `feature_importances`, `metrics_cal`

---

## `multiway_pls_da`

PLS-DA multiway.

**Inputs:** `X` (tensor), `y`
**Parâmetros:** `n_components`
**Outputs:** `model`, `scores`, `predicted_classes`, `metrics_cal`

---

## `multiway_simca`

SIMCA multiway. Modelos de classe independentes sobre dados tensoriais.

**Inputs:** `X` (tensor), `y`
**Parâmetros:** `n_components`, `alpha`
**Outputs:** `model`, `class_membership`, `distances`, `metrics_cal`

---

## `multiway_one_class`

Modelo de classe única para dados tensoriais.

**Inputs:** `X` (tensor da classe alvo)
**Parâmetros:** `method` (mpca | parafac), `n_components`, `alpha`
**Outputs:** `model`, `class_membership`, `metrics_cal`

---

# Família 10 — Calibração de Ordem Superior

Os scripts desta família são wrappers didáticos que referenciam os algoritmos das famílias 07 e 08 configurados para cada ordem analítica. Não há limite estrutural — os mesmos algoritmos funcionam para ordens superiores.

---

## `segunda_ordem`

Calibração com dados de segunda ordem (tensores I×J×K).

**Inputs:** `X` (tensor, data_order=2, requires_sample_axis=1), `y`
**Parâmetros:** `algorithm` (parafac | tucker | mcr_als | n_pls), demais parâmetros do algoritmo
**Outputs:** os mesmos do algoritmo selecionado + `analytical_figures_of_merit`

---

## `terceira_ordem`

Calibração com dados de terceira ordem (tensores I×J×K×L).

**Inputs:** `X` (tensor, data_order=3, requires_sample_axis=1), `y`
**Parâmetros:** `algorithm`, parâmetros do algoritmo
**Outputs:** mesmos do algoritmo + `analytical_figures_of_merit`

---

## `quarta_ordem`

**Inputs:** `X` (tensor, data_order=4), `y`
**Parâmetros:** `algorithm`, parâmetros do algoritmo
**Outputs:** mesmos do algoritmo + `analytical_figures_of_merit`

---

## `ordem_superior_generica`

Calibração para qualquer ordem analítica.

**Inputs:** `X` (tensor, min_order=2, max_order=NULL), `y`
**Parâmetros:** `algorithm`, parâmetros do algoritmo
**Outputs:** mesmos do algoritmo + `analytical_figures_of_merit`

---

# Família 11 — Interferentes e Vantagem Analítica

---

## `rtl`

Residue Trilinearization. Aproveitamento da vantagem analítica de segunda ordem na presença de interferentes não calibrados.

**Inputs:** `X_sample` (tensor de uma amostra), `model` (output de parafac)
**Parâmetros:** `n_components`, `max_iter`
**Outputs:** `predicted_concentration`, `residuals`, `analytical_sensitivity`

---

## `u_pls_rtl`

U-PLS com RTL para segunda ordem.

**Inputs:** `X` (tensor), `Y`, `X_unknown`
**Parâmetros:** `n_components`, `max_iter`
**Outputs:** `model`, `predicted_concentration`, `analytical_figures_of_merit`

---

## `n_pls_rtl`

N-PLS com RTL.

**Inputs:** `X` (tensor), `Y`, `X_unknown`
**Parâmetros:** `n_components`
**Outputs:** `model`, `predicted_concentration`, `analytical_figures_of_merit`

---

## `u_pca_rtl`

U-PCA com RTL.

**Inputs:** `X` (tensor), `X_unknown`
**Parâmetros:** `n_components`
**Outputs:** `scores`, `predicted_concentration`

---

## `pso_rtl`

PSO (Particle Swarm Optimization) com RTL.

**Inputs:** `X` (tensor), `Y`, `X_unknown`
**Parâmetros:** `n_components`, `n_particles`, `max_iter`
**Outputs:** `model`, `predicted_concentration`

---

## `interferentes_nao_calibrados`

Diagnóstico de presença de interferentes não calibrados.

**Inputs:** `X` (tensor), `model`
**Outputs:** `interferent_flag` (bool), `residual_analysis`, `recommendation`

---

# Família 12 — Seleção de Variáveis

Todos os scripts desta família devem declarar explicitamente em qual eixo/modo a seleção ocorre.

---

## `vip`

Variable Importance in Projection — score VIP do PLS.

**Inputs:** `model` (output de pls), `X`, `y`
**Parâmetros:** `threshold` (float, default 1.0)
**Outputs:** `vip_scores` (vector), `selected_variables` (vector de índices)

---

## `ispa_pls`

Interval Selection by PLS. Seleção de intervalos espectrais.

**Inputs:** `X`, `y`
**Parâmetros:** `n_intervals`, `n_components`, `cv_folds`
**Outputs:** `selected_intervals`, `interval_rmse`, `best_model`

---

## `interval_pls`

iPLS — seleção de intervalos ótimos.

**Inputs:** `X`, `y`
**Parâmetros:** `interval_width`, `n_components`, `cv_folds`
**Outputs:** `selected_intervals`, `rmsecv_per_interval`, `best_model`

---

## `cars`

Competitive Adaptive Reweighted Sampling.

**Inputs:** `X`, `y`
**Parâmetros:** `n_runs` (int), `n_components`, `cv_folds`, `random_state`
**Outputs:** `selected_variables`, `rmsecv_per_run`, `best_model`

---

## `genetic_algorithm`

Seleção de variáveis por algoritmo genético.

**Inputs:** `X`, `y`
**Parâmetros:** `population_size`, `n_generations`, `mutation_rate`, `crossover_rate`, `n_components`, `fitness_metric`, `random_state`
**Outputs:** `selected_variables`, `fitness_history`, `best_model`

---

## `pso`

Seleção de variáveis por Particle Swarm Optimization.

**Inputs:** `X`, `y`
**Parâmetros:** `n_particles`, `max_iter`, `w`, `c1`, `c2`, `n_components`, `random_state`
**Outputs:** `selected_variables`, `best_fitness_history`, `best_model`

---

## `wavelength_selection`

Seleção manual ou semi-automática de comprimentos de onda.

**Inputs:** `X` (matrix espectral)
**Parâmetros:** `ranges` (lista de [start, stop]), `mode` (manual | correlation | loadings_based)
**Outputs:** `X_sel`, `selected_indices`

---

## `bipls`

Bi-Interval PLS (biPLS). Seleciona o par de intervalos espectrais não contíguos que, combinados, produzem o menor RMSECV em PLS. Extensão do iPLS para duas regiões espectrais simultaneamente — útil quando informação analítica está distribuída em duas regiões distantes do espectro (ex: pico de grupo funcional + pico de combinação). Aparece na literatura 2022–2025 em NIR de óleos e produtos alimentares.

**Inputs:** `X` (matrix), `y` (vector)
**Parâmetros:** `n_intervals` (int — número de intervalos em que o espectro é dividido, default 20), `n_components` (int), `cv_folds` (int, default 5)
**Outputs:** `selected_intervals` (lista de 2 intervalos [start, stop]), `selected_variables` (índices combinados), `rmsecv_matrix` (matrix — RMSECV para cada par de intervalos), `best_model`
**Restrições:** avalia todas as C(n_intervals, 2) combinações de pares — para n_intervals grande pode ser custoso
**Nota de implementação:** implementação própria (loop sobre pares + `pls` interno)

---

## `sipls`

Synergy Interval PLS (siPLS). Seleciona a combinação ótima de dois ou mais intervalos espectrais contíguos ou não, avaliando subconjuntos de intervalos por RMSECV. Generalização do biPLS para N intervalos — busca sinergia entre regiões. Especialmente poderoso em NIR onde várias bandas de sobreposição contribuem para a predição.

**Inputs:** `X` (matrix), `y` (vector)
**Parâmetros:** `n_intervals` (int, default 20), `max_combination_size` (int — número máximo de intervalos combinados, default 3), `n_components` (int), `cv_folds` (int, default 5), `search_strategy` (exhaustive | genetic | random, default exhaustive quando combinações ≤ 1000)
**Outputs:** `selected_intervals` (lista de intervalos [start, stop]), `selected_variables` (índices), `best_rmsecv` (scalar), `search_history`, `best_model`

---

## `sratio`

Seleção de variáveis por sRatio (selectivity ratio). Calcula para cada variável a razão entre a variância explicada pelo componente PLS alvo e a variância residual, identificando variáveis com alta seletividade para y. Alternativa ao VIP que penaliza explicitamente variáveis com alta variância não correlacionada a y.

**Inputs:** `X` (matrix), `y` (vector), `model` (output de `pls`, opcional — se não fornecido, treina internamente)
**Parâmetros:** `n_components` (int), `threshold` (float, default None — retorna ranking completo se None), `spectral_axis` (int, default 1)
**Outputs:** `sratio_scores` (vector — um valor por variável), `selected_variables` (vector de índices, se threshold fornecido), `ranking_plot_data`
**Nota de implementação:** implementação própria (~15 linhas NumPy/scikit-learn)

---

## `ffipls`

Fast Firefly-based interval PLS (FFiPLS). Seleciona combinações ótimas de intervalos espectrais para PLS usando o algoritmo Firefly como meta-heurística. Mais eficiente que busca exaustiva de intervalos quando o número de variáveis é alto. O fitness de cada combinação de intervalos é avaliado por RMSECV.

**Inputs:** `X` (matrix), `y` (vector)
**Parâmetros:** `n_intervals` (int — número de intervalos em que o espectro é dividido), `n_components` (int), `n_fireflies` (int, default 20), `max_iter` (int, default 50), `alpha` (float — randomização inicial, default 0.5), `beta` (float — atratividade, default 1.0), `gamma` (float — absorção de luz, default 1.0), `cv_folds` (int, default 5), `random_state`
**Outputs:** `selected_intervals` (lista de índices de intervalos), `selected_variables` (índices individuais), `rmsecv_history`, `best_model`
**Restrições:** `n_intervals` deve ser ≥ 2
**Nota de implementação:** implementação própria — não existe pacote PyPI estabelecido; marcar como `is_beta=true`

---

## `moving_window_selection`

Seleção de variáveis por janela deslizante. Avalia sistematicamente todas as janelas contíguas de largura `window_width` ao longo do eixo espectral, calculando RMSECV para cada posição. Retorna a janela ou combinação de janelas com melhor desempenho preditivo. Útil em UV-Vis e NIR com regiões espectrais estreitas e bem definidas.

**Inputs:** `X` (matrix), `y` (vector)
**Parâmetros:** `window_width` (int — número de variáveis por janela), `step` (int, default 1 — deslocamento entre janelas consecutivas), `n_components` (int), `cv_folds` (int, default 5), `metric` (rmsecv | r2cv, default rmsecv), `select_top_n` (int, default 1 — número de janelas a combinar)
**Outputs:** `best_windows` (lista de [start, stop] das melhores janelas), `selected_variables` (índices), `rmsecv_per_window` (vector), `best_model`
**Nota de implementação:** implementação própria (NumPy + scikit-learn)

---

# Família 13 — Otimização de Hiperparâmetros

---

## `grid_search`

Busca exaustiva em grade de hiperparâmetros.

**Inputs:** `X`, `y`, `technique_slug`
**Parâmetros:** `param_grid` (dict), `cv_folds`, `scoring_metric`, `n_jobs`
**Outputs:** `best_params`, `best_score`, `results_table`

---

## `random_search`

Busca aleatória.

**Inputs:** `X`, `y`, `technique_slug`
**Parâmetros:** `param_distributions` (dict), `n_iter`, `cv_folds`, `scoring_metric`, `random_state`
**Outputs:** `best_params`, `best_score`, `results_table`

---

## `bayesian_optimization`

Otimização bayesiana (Gaussian Process ou TPE).

**Inputs:** `X`, `y`, `technique_slug`
**Parâmetros:** `search_space` (dict), `n_trials`, `cv_folds`, `scoring_metric`
**Outputs:** `best_params`, `best_score`, `optimization_history`

---

## `hyperparameter_optimization`

Wrapper genérico que delega para grid, random ou bayesian.

**Inputs:** `X`, `y`, `technique_slug`
**Parâmetros:** `method` (grid | random | bayesian), demais parâmetros do método
**Outputs:** `best_params`, `best_score`

---

# Família 14 — Validação

Todos os scripts que particionam amostras exigem `requires_sample_axis=1`.

---

## `train_test_split`

Divisão simples treino/teste.

**Inputs:** `X`, `y` (opcional)
**Parâmetros:** `test_size` (float 0–1), `random_state`, `stratify` (bool)
**Outputs:** `X_train`, `X_test`, `y_train` (se y fornecido), `y_test`, `train_indices`, `test_indices`

---

## `kennard_stone`

Divisão treino/teste pelo algoritmo de Kennard-Stone. Seleciona amostras de forma determinística e sequencial, maximizando a cobertura uniforme do espaço das variáveis X. A primeira amostra é a mais distante da média; as seguintes são selecionadas maximizando a distância mínima às amostras já selecionadas. Garante que o conjunto de calibração represente toda a variabilidade espectral, sem depender de seed aleatório.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y` (vector ou matrix, opcional)
**Parâmetros:** `train_fraction` (float 0–1, default 0.7), `distance_metric` (euclidean | mahalanobis, default euclidean), `spectral_axis` (int, default 1)
**Outputs:** `X_train`, `X_test`, `y_train` (se y fornecido), `y_test`, `train_indices`, `test_indices`
**Restrições:** determinístico — não aceita `random_state` (não há aleatoriedade)
**Nota de implementação:** biblioteca `kennard_stone` (PyPI) ou implementação própria (~25 linhas NumPy)

---

## `spxy`

Sample set Partitioning based on joint X-Y distances (SPXY). Extensão do Kennard-Stone que considera simultaneamente a distância no espaço X e no espaço y ao selecionar as amostras de calibração. Garante cobertura uniforme tanto na variabilidade espectral quanto na variabilidade da variável resposta, sendo especialmente recomendado quando y tem distribuição assimétrica ou multimodal.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y` (vector — obrigatório, diferente do Kennard-Stone)
**Parâmetros:** `train_fraction` (float 0–1, default 0.7), `distance_metric_x` (euclidean | mahalanobis, default euclidean), `distance_metric_y` (euclidean, default euclidean), `weight_x` (float 0–1, default 0.5 — peso da contribuição de X na distância combinada)
**Outputs:** `X_train`, `X_test`, `y_train`, `y_test`, `train_indices`, `test_indices`
**Restrições:** `y` é obrigatório — sem ele use `kennard_stone`; determinístico, sem `random_state`
**Nota de implementação:** implementação própria (~30 linhas NumPy) ou biblioteca `kennard_stone` com extensão SPXY

---

## `k_fold`

Validação cruzada K-Fold.

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** `n_splits` (int), `shuffle` (bool), `random_state`
**Outputs:** `metrics_per_fold`, `metrics_mean`, `metrics_std`, `best_model`

---

## `leave_one_out`

Leave-One-Out Cross-Validation.

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** parâmetros do modelo
**Outputs:** `predicted_loo` (vector), `metrics_loo`

---

## `leave_p_out`

Leave-P-Out Cross-Validation. Em cada rodada, exclui exatamente `p` amostras do treinamento e usa-as para teste, iterando por todas as combinações possíveis (ou por amostragem quando o número de combinações é inviável). Mais rigoroso que LOO quando p > 1; comum em quimiometria para datasets pequenos.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y`, `model_slug`
**Parâmetros:** `p` (int — número de amostras excluídas por rodada, default 1), `max_combinations` (int, default 1000 — se o número real de combinações exceder esse valor, usa amostragem aleatória), `random_state`, demais parâmetros do modelo
**Outputs:** `predicted_lpo` (vector — previsões para cada amostra acumuladas), `metrics_lpo`, `n_combinations_used`
**Restrições:** para p=1 equivale a `leave_one_out`; combinações de `C(n, p)` crescem rapidamente — usar `max_combinations` para controlar custo computacional

---

## `venetian_blinds`

Validação cruzada por Venetian Blinds. Divide as amostras em `n_splits` grupos intercalados (como lâminas de uma persiana), respeitando a ordem original do dataset. Em cada fold, um grupo intercalado é o conjunto de teste. Diferente do K-Fold, preserva a estrutura temporal ou sequencial do dado espectral — especialmente adequado quando os espectros foram coletados em ordem temporal e k-fold aleatório quebraria esse padrão.

**Inputs:** `X` (matrix, requires_sample_axis=1), `y`, `model_slug`
**Parâmetros:** `n_splits` (int — número de "lâminas", default 5), demais parâmetros do modelo
**Outputs:** `metrics_per_fold`, `metrics_mean`, `metrics_std`, `predicted_cv` (vetor com previsões de todas as amostras), `best_model`
**Nota:** para datasets sem estrutura temporal, `k_fold` com shuffle=True é equivalente e preferível
**Nota de implementação:** implementação própria (~15 linhas NumPy) usando `np.arange(n)[i::n_splits]` para montar os folds

---

## `repeated_cv`

K-Fold repetido N vezes com seeds diferentes.

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** `n_splits`, `n_repeats`, `random_state`
**Outputs:** `metrics_all_repeats`, `metrics_mean`, `metrics_std`

---

## `bootstrap`

Validação por reamostragem bootstrap.

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** `n_bootstrap` (int), `random_state`
**Outputs:** `metrics_distribution`, `metrics_ci_95`

---

## `permutation_test`

Teste de permutação para avaliar significância do modelo.

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** `n_permutations` (int), `scoring_metric`, `random_state`
**Outputs:** `observed_score`, `permuted_scores`, `p_value`

---

## `external_validation`

Validação com conjunto externo independente.

**Inputs:** `X_cal`, `y_cal`, `X_val`, `y_val`, `model_slug`
**Parâmetros:** parâmetros do modelo
**Outputs:** `model`, `metrics_cal`, `metrics_ext`

---

## `nested_cv`

Cross-validation aninhada (seleção de modelo + avaliação não enviesada).

**Inputs:** `X`, `y`, `model_slug`
**Parâmetros:** `outer_splits`, `inner_splits`, `param_grid`, `scoring_metric`
**Outputs:** `outer_scores`, `best_params_per_fold`, `metrics_mean`

---

# Família 15 — Métricas

Scripts de cálculo de métricas. Recebem predições e valores reais.

---

## Métricas de Regressão

| Script | Descrição | Inputs | Output |
|--------|-----------|--------|--------|
| `r2` | Coeficiente de determinação | `y_true`, `y_pred` | `r2` (scalar) |
| `rmse` | Root Mean Squared Error | `y_true`, `y_pred` | `rmse` (scalar) |
| `rmsec` | RMSE de calibração | `y_true`, `y_pred_cal` | `rmsec` (scalar) |
| `rmsecv` | RMSE de validação cruzada | `y_true`, `y_pred_cv` | `rmsecv` (scalar) |
| `rmsep` | RMSE de previsão | `y_true`, `y_pred_ext` | `rmsep` (scalar) |
| `mae` | Mean Absolute Error | `y_true`, `y_pred` | `mae` (scalar) |
| `bias` | Bias sistemático | `y_true`, `y_pred` | `bias` (scalar) |
| `sep` | Standard Error of Prediction | `y_true`, `y_pred` | `sep` (scalar) |

---

## Métricas de Classificação

| Script | Descrição | Inputs | Output |
|--------|-----------|--------|--------|
| `accuracy` | Acurácia global | `y_true`, `y_pred` | `accuracy` (scalar) |
| `precision` | Precisão por classe | `y_true`, `y_pred` | `precision` (vector ou scalar) |
| `recall` | Revocação por classe | `y_true`, `y_pred` | `recall` (vector ou scalar) |
| `specificity` | Especificidade | `y_true`, `y_pred` | `specificity` (scalar) |
| `f1` | F1-score | `y_true`, `y_pred` | `f1` (scalar) |
| `roc_auc` | Área sob a curva ROC | `y_true`, `y_scores` | `auc` (scalar), `fpr`, `tpr` |
| `confusion_matrix` | Matriz de confusão | `y_true`, `y_pred` | `matrix` (matrix inteira) |

---

## Métricas Analíticas (Quimiometria)

| Script | Descrição | Outputs |
|--------|-----------|---------|
| `sensitivity` | Sensibilidade analítica | `sensitivity` (scalar por analito) |
| `selectivity` | Seletividade | `selectivity` (scalar) |
| `analytical_sensitivity` | γ = sensitivity/noise | `analytical_sensitivity` |
| `lod` | Limite de detecção | `lod` (scalar na unidade da referência) |
| `loq` | Limite de quantificação | `loq` (scalar) |
| `concentration_std` | Desvio padrão de concentração prevista | `std_concentration` |

---

# Família 16 — Diagnósticos

---

## `residuals`

Calcula e analisa resíduos de um modelo.

**Inputs:** `X`, `model`
**Outputs:** `residuals` (tensor ou matrix), `residual_variance`, `residual_plot_data`

---

## `leverage`

Calcula leverage (influência) de cada amostra.

**Inputs:** `X`, `model`
**Outputs:** `leverage` (vector), `threshold`

---

## `hotelling_t2`

Estatística T² de Hotelling para detecção de outliers no espaço do modelo.

**Inputs:** `scores` (matrix), `n_components`
**Parâmetros:** `alpha` (nível de significância, default 0.05)
**Outputs:** `t2` (vector), `threshold`, `outlier_mask`

---

## `q_residuals`

Q-residuals (SPE — Squared Prediction Error).

**Inputs:** `X`, `model`
**Parâmetros:** `alpha`
**Outputs:** `q` (vector), `threshold`, `outlier_mask`

---

## `core_consistency`

Diagnóstico de core consistency para PARAFAC — indica se o número de componentes é adequado.

**Inputs:** `X` (tensor), `scores`, `loadings`
**Parâmetros:** `n_components`
**Outputs:** `core_consistency` (scalar 0–100%), `interpretation` (string)

---

## `overfitting`

Diagnóstico de overfitting comparando métricas de calibração e validação.

**Inputs:** `metrics_cal`, `metrics_cv` (ou `metrics_ext`)
**Parâmetros:** `threshold_ratio` (float, alerta se rmse_cv/rmse_cal > threshold)
**Outputs:** `overfitting_flag` (bool), `ratio`, `recommendation`

---

## `model_diagnostics`

Diagnóstico geral de modelo: combina leverage, Q-residuals e T².

**Inputs:** `X`, `model`
**Outputs:** `leverage`, `q_residuals`, `hotelling_t2`, `influence_plot_data`, `outlier_mask`

---

# Família 17 — Visualização

Scripts de visualização retornam dados estruturados para renderização no frontend. Não retornam imagens — retornam JSON com séries, eixos e metadados.

---

## `spectra`

Dados para plotagem de espectros.

**Inputs:** `X` (matrix), `x_axis` (vetor de comprimentos de onda, opcional), `labels` (vetor de nomes de amostras, opcional)
**Outputs:** `plot_data` — `{series: [{x, y, label}], x_label, y_label}`

---

## `scores`

Scatter plot de scores.

**Inputs:** `scores` (matrix), `labels` (opcional), `classes` (opcional)
**Parâmetros:** `pc_x` (int, default 0), `pc_y` (int, default 1)
**Outputs:** `plot_data` — `{points: [{x, y, label, class}], explained_variance}`

---

## `loadings`

Perfis de loadings.

**Inputs:** `loadings` (matrix), `x_axis` (opcional)
**Parâmetros:** `component` (int, default 0)
**Outputs:** `plot_data` — `{series: [{x, y}], component_label}`

---

## `biplot`

Scores + loadings sobrepostos.

**Inputs:** `scores`, `loadings`, `sample_labels` (opcional), `variable_labels` (opcional)
**Parâmetros:** `pc_x`, `pc_y`, `scale_loadings` (float)
**Outputs:** `plot_data` — `{score_points, loading_arrows, explained_variance}`

---

## `calibration_plot`

Gráfico de calibração: valor previsto × referência.

**Inputs:** `y_true`, `y_pred`, `sample_labels` (opcional)
**Outputs:** `plot_data` — `{points: [{x, y, label}], ideal_line, r2, rmse}`

---

## `predicted_vs_reference`

Equivalente ao calibration_plot para validação externa.

**Inputs:** `y_true`, `y_pred_cal`, `y_pred_cv` (opcional), `y_pred_ext` (opcional)
**Outputs:** `plot_data` — `{cal_points, cv_points, ext_points, metrics}`

---

## `confusion_matrix`

Visualização da matriz de confusão.

**Inputs:** `confusion_matrix` (matrix inteira), `class_labels`
**Outputs:** `plot_data` — `{matrix, labels, accuracy, per_class_metrics}`

---

## `roc_curve`

Curva ROC.

**Inputs:** `fpr`, `tpr`, `auc`
**Outputs:** `plot_data` — `{curve: [{fpr, tpr}], auc, random_line}`

---

## `heatmap`

Mapa de calor de qualquer matriz.

**Inputs:** `Z` (matrix), `x_labels` (opcional), `y_labels` (opcional)
**Parâmetros:** `colormap`, `symmetric` (bool)
**Outputs:** `plot_data` — `{matrix, x_labels, y_labels, colormap, z_min, z_max}`

---

## `tensor_profiles`

Perfis por modo para tensores N-way. Funciona dinamicamente: um tensor de ordem N gera N conjuntos de perfis.

**Inputs:** `loadings` (lista de matrizes — uma por modo), `mode_labels` (lista de nomes)
**Parâmetros:** `component` (int)
**Outputs:** `profiles` — lista de `{mode_label, x, y}`, um por modo

---

## `parafac_profiles`

Perfis de fatores PARAFAC formatados para exibição científica.

**Inputs:** output de `parafac` (scores + loadings + core_consistency)
**Parâmetros:** `component`, `mode_labels`, `x_axes` (vetor por modo, opcional)
**Outputs:** `profiles`, `core_consistency`, `explained_variance`

---

## `mcr_profiles`

Perfis C e S do MCR-ALS.

**Inputs:** `C`, `S` (outputs de mcr_als), `sample_labels`, `variable_axis` (opcional)
**Outputs:** `concentration_profiles` `spectral_profiles`

---

## `augmented_profiles`

Perfis para dados aumentados (matrizes concatenadas).

**Inputs:** `C` (perfis de concentração aumentados), `S`, `augmentation_scheme`
**Outputs:** `profiles_per_block`, `spectral_profiles`

---

## `3d_surface`

Superfície 3D para dados 2D (ex: EEM).

**Inputs:** `Z` (matrix), `x_axis`, `y_axis`
**Parâmetros:** `colormap`
**Outputs:** `plot_data` — `{Z, x, y, colormap}`

---

## `contour`

Contorno 2D de superfície.

**Inputs:** `Z` (matrix), `x_axis`, `y_axis`
**Parâmetros:** `n_levels`, `colormap`
**Outputs:** `plot_data` — `{Z, x, y, levels}`

---

# Família 18 — Dados Sintéticos

---

## `synthetic_spectra`

Gera espectros sintéticos baseados em gaussianas.

**Inputs:** nenhum (parâmetros apenas)
**Parâmetros:** `n_samples`, `n_variables`, `x_range` ([min, max]), `peaks` (lista de `{center, width, height}`), `noise_level`, `noise_type` (gaussian | poisson), `baseline` (float), `outlier_fraction`, `reference_values` (lista ou None), `random_state`
**Outputs:** `X` (matrix I×J), `y` (vector, se reference_values fornecido), `x_axis`

---

## `synthetic_eem`

Gera dados de Excitação-Emissão de Fluorescência sintéticos.

**Inputs:** parâmetros apenas
**Parâmetros:** `n_samples`, `excitation_range`, `emission_range`, `n_components`, `peak_positions` (lista de `{ex, em}`), `noise_level`, `random_state`
**Outputs:** `X` (tensor I×J×K), `C` (concentrações), `Ex_axis`, `Em_axis`

---

## `synthetic_chromatography`

Gera dados cromatográficos sintéticos com sobreposição de picos.

**Inputs:** parâmetros apenas
**Parâmetros:** `n_samples`, `time_points`, `n_analytes`, `retention_times`, `peak_widths`, `noise_level`, `random_state`
**Outputs:** `X` (matrix ou tensor), `time_axis`, `y`

---

## `synthetic_multiway`

Gera tensor N-way sintético com estrutura PARAFAC controlada.

**Inputs:** parâmetros apenas
**Parâmetros:** `shape` (tupla — define ordem e dimensões), `n_components`, `noise_level`, `random_state`
**Outputs:** `X` (tensor com shape declarado), `true_factors` (lista de fatores por modo)

---

## `synthetic_phosphorescence`

Gera dados de fosforescência resolvida no tempo.

**Inputs:** parâmetros apenas
**Parâmetros:** `n_samples`, `excitation_range`, `emission_range`, `time_points`, `decay_rates`, `noise_level`, `random_state`
**Outputs:** `X` (tensor I×J×K×L), `Ex_axis`, `Em_axis`, `time_axis`

---

## `noise_generation`

Adiciona ruído controlado a um array existente.

**Inputs:** `X` (array N-dimensional)
**Parâmetros:** `noise_type` (gaussian | poisson | uniform | shot), `noise_level`, `random_state`
**Outputs:** `X_noisy`

---

## `outlier_generation`

Injeta outliers em um dataset existente.

**Inputs:** `X`
**Parâmetros:** `n_outliers`, `outlier_type` (amplitude | shift | random), `outlier_magnitude`, `random_state`
**Outputs:** `X_with_outliers`, `outlier_indices`

---

## `interferent_generation`

Gera e adiciona sinal de interferente a dados existentes.

**Inputs:** `X`
**Parâmetros:** `interferent_spectrum` (vetor) ou parâmetros de gaussiana, `concentration_range`, `random_state`
**Outputs:** `X_with_interferent`, `interferent_concentrations`

---

## `shift_simulation`

Simula deslocamentos espectrais (drift de instrumento).

**Inputs:** `X` (matrix espectral)
**Parâmetros:** `shift_type` (horizontal | vertical | both), `max_shift`, `random_state`
**Outputs:** `X_shifted`, `shift_applied`

---

## `diffusion_generation`

Geração de espectros por modelo de difusão (uso avançado).

**Inputs:** `X_reference` (dataset de referência para treino do modelo)
**Parâmetros:** `n_samples`, `n_steps`, `guidance_scale`, `random_state`
**Outputs:** `X_generated`

---

---

# Família 19 — Transferência de Calibração

Scripts para transferir modelos calibrados em um instrumento (master) para outro instrumento (slave), ou para compensar mudanças instrumentais ao longo do tempo (drift, troca de componentes, mudança de laboratório). Elimina a necessidade de recalibrar completamente quando o instrumento muda. Aparece como lacuna em todos os anos 2021–2025 da varredura de literatura.

---

## `pds`

Piecewise Direct Standardization (PDS). Método de transferência de calibração mais usado em NIR. Para cada variável do instrumento slave, constrói uma janela de variáveis do instrumento master e ajusta um modelo de regressão local. Compensa diferenças sistemáticas de resposta entre instrumentos mantendo a estrutura local do espectro.

**Inputs:** `X_master` (matrix — espectros no instrumento de referência), `X_slave` (matrix — espectros no instrumento a ser padronizado), ambos com as mesmas amostras de transferência
**Parâmetros:** `window_size` (int — número de variáveis na janela local, default 5), `spectral_axis` (int, default 1)
**Outputs:** `transfer_model`, `F` (matrix de transferência), `X_slave_standardized` (matrix — X_slave após padronização)
**Restrições:** X_master e X_slave devem ter o mesmo número de amostras de transferência e mesmo número de variáveis

---

## `ds`

Direct Standardization (DS). Versão global do PDS: estima uma única matriz de transformação F que mapeia X_slave → X_master por regressão de mínimos quadrados. Mais simples que PDS mas menos eficaz quando as diferenças instrumentais variam ao longo do eixo espectral.

**Inputs:** `X_master` (matrix), `X_slave` (matrix)
**Parâmetros:** `spectral_axis` (int, default 1)
**Outputs:** `transfer_model`, `F` (matrix de transformação global), `X_slave_standardized`
**Restrições:** mesmas amostras em ambos os instrumentos

---

## `sbc`

Spectral Background Correction / Slope-and-Bias Correction (SBC). Correção simples de transferência por ajuste de inclinação e offset espectral. Cada variável é corrigida individualmente por: `x_corr = (x_slave - bias) / slope`. Útil para diferenças instrumentais pequenas ou como pré-etapa antes de métodos mais sofisticados.

**Inputs:** `X_master` (matrix), `X_slave` (matrix)
**Parâmetros:** `spectral_axis` (int, default 1)
**Outputs:** `transfer_model`, `slope_` (vector), `bias_` (vector), `X_slave_standardized`

---

## `model_update`

Atualização incremental de modelo de calibração com novas amostras. Em vez de recalibrar do zero ao adicionar novas amostras ao conjunto de calibração, atualiza o modelo existente usando as novas observações. Útil para monitoramento contínuo onde novas amostras são coletadas periodicamente.

**Inputs:** `model` (output de pls ou outro modelo de regressão), `X_new` (matrix — novas amostras), `y_new` (vector — novos valores de referência)
**Parâmetros:** `method` (incremental | full_refit, default incremental), `max_samples` (int — máximo de amostras a manter no histórico, default None)
**Outputs:** `model_updated`, `metrics_cal_updated`, `n_samples_total`

---

## `drift_detection`

Detecção de drift instrumental ao longo do tempo. Monitora se o modelo de calibração permanece válido para novos dados usando estatísticas de controle (Hotelling T² e Q-residuals dos novos espectros em relação ao modelo de calibração). Gera alarme quando os novos espectros saem dos limites de controle. Aparece em 2023 para monitoramento contínuo de modelos PLS.

**Inputs:** `X_new` (matrix — novos espectros coletados), `model` (output de pls ou pca)
**Parâmetros:** `alpha` (nível de significância para limites de controle, default 0.05), `window_size` (int — janela de amostras para calcular estatísticas, default None = usar todas)
**Outputs:** `drift_flag` (bool), `t2_new` (vector), `q_new` (vector), `t2_limit`, `q_limit`, `control_chart_data` (dados para gráfico de controle)

---

# Família 20 — Fusão de Sensores

Scripts para combinar dados de múltiplos instrumentos ou técnicas analíticas. A fusão pode ocorrer em três níveis: dados brutos (low-level), features extraídas (mid-level) ou decisões/predições (high-level). Aparece consistentemente na literatura 2023–2026 combinando NIR+Raman, UV-Vis+FTIR, ICP-MS+espectroscopia, etc.

---

## `low_level_fusion`

Fusão em nível de dados (low-level). Concatena as matrizes espectrais de múltiplos instrumentos diretamente ao longo do eixo de variáveis, após padronização das escalas. O modelo resultante opera sobre o espectro combinado. Simples e preserva toda a informação, mas pode ser dominado por instrumentos com mais variáveis.

**Inputs:** `X_blocks` (lista de matrizes — uma por instrumento, todas com mesmo número de amostras)
**Parâmetros:** `scale_blocks` (bool, default true — normaliza cada bloco ao mesmo intervalo antes de concatenar para evitar dominância numérica), `weights` (lista de floats opcional — peso de cada bloco, default uniforme)
**Outputs:** `X_fused` (matrix — concatenação ponderada), `block_ranges` (dict — índices de cada bloco no espectro fundido), `scaling_params_` (parâmetros para aplicar a novos dados)
**Transformação de shape:** `(I, J1) + (I, J2) + ... → (I, J1+J2+...)`

---

## `mid_level_fusion`

Fusão em nível de features (mid-level). Extrai features de cada bloco separadamente (scores PCA, coeficientes wavelet, VIP, etc.) e concatena as features resultantes antes do modelo final. Reduz redundância e dimensionalidade em relação à fusão low-level; cada bloco contribui com sua representação compacta.

**Inputs:** `X_blocks` (lista de matrizes), `feature_method` (slug do método de extração — pca | wavelet_transform | vip | manual)
**Parâmetros:** `n_features_per_block` (int ou lista de int — features a extrair de cada bloco), demais parâmetros do método de extração
**Outputs:** `X_features_fused` (matrix — features concatenadas), `extraction_models_` (lista de modelos de extração — necessários para novos dados), `block_feature_ranges` (dict)

---

## `high_level_fusion`

Fusão em nível de decisão (high-level). Treina modelos independentes em cada bloco e combina suas predições ou scores de decisão por votação, média ponderada ou meta-modelo. Mais robusto a falhas de um instrumento e permite interpretação por bloco, mas perde correlações entre instrumentos.

**Inputs:** `predictions_blocks` (lista de vectors ou matrizes — predições de cada modelo por bloco)
**Parâmetros:** `fusion_method` (mean | weighted_mean | majority_vote | meta_model), `weights` (lista de floats — apenas para weighted_mean), `meta_model_slug` (slug do modelo de meta-aprendizado — apenas para meta_model)
**Outputs:** `fused_predictions` (vector ou matrix), `block_weights_used`, `metrics_cal` (se y fornecido)

---

## `block_pls`

PLS multi-bloco (MB-PLS). Versão do PLS que processa múltiplos blocos de variáveis X simultaneamente, extraindo componentes latentes que maximizam a covariância de cada bloco com y. Diferente do HPLS (hierárquico): aqui os blocos são processados em paralelo dentro de cada componente latente, não sequencialmente. Indicado quando os blocos têm correlações mútuas relevantes para y.

**Inputs:** `X_blocks` (lista de matrizes), `y` (vector ou matrix)
**Parâmetros:** `n_components` (int), `scale_blocks` (bool, default true), `max_iter` (int, default 500)
**Outputs:** `model`, `block_scores` (lista), `block_loadings` (lista), `super_scores` (scores globais), `block_weights` (importância relativa de cada bloco para y), `metrics_cal`

---

## Regras gerais do worker

1. **Nenhum script assume dimensionalidade fixa.** Se a técnica é N-way, ela descobre `ndim`, `shape`, `mode_labels` e `sample_axis` do input.
2. **Operações matemáticas declaram restrições explícitas.** `inversa` recusa matrizes não quadradas; não converte silenciosamente para pseudo-inversa.
3. **Pseudo-inversa é script distinto** de `inversa`.
4. **Multi-input é sempre explícito.** `soma` tem portas `A` e `B`; nunca usa posição física.
5. **Multi-output é sempre explícito.** `svd` tem portas `U`, `S`, `Vt`; `eig` tem `eigenvalues` e `eigenvectors`.
6. **Números complexos usam representação `{real, imag}` na serialização JSON.** Internamente o worker usa `complex64` ou `complex128`.
7. **`formula_customizada` nunca usa `eval()`.** Sempre parse → AST → whitelist → executor.
8. **Scripts de visualização retornam dados, não imagens.** O frontend renderiza.
9. **Parâmetros de pré-processamento necessários para aplicar a novos dados** (`mean_`, `std_`, `scale_`, `weights_`, `quotients_`) são sempre salvos no output e referenciados no modelo. Scripts como `osc`, `emsc`, `pqn`, `robust_scaling` e `eilers_smoothing` devem ser aplicados ao conjunto de teste com os mesmos parâmetros aprendidos no treino — nunca reajustados.
10. **Pré-processamento de treino e teste são independentes.** Scripts de divisão de amostras (`kennard_stone`, `spxy`, `train_test_split`, `venetian_blinds`) produzem `X_train` e `X_test` como outputs separados. O pré-processamento (SNV, OSC, EMSC, centering etc.) deve ser aplicado primeiro ao `X_train` — aprendendo os parâmetros — e depois ao `X_test` usando esses parâmetros, nunca ajustando no conjunto completo antes da divisão. Isso evita data leakage. O worker valida que nenhum script de pré-processamento receba X sem que sample_axis seja declarado nos metadados do nó.
11. **Scripts marcados com `is_beta=true`** (`mie_emsc`, `ffipls`) podem ser instanciados em workflows, mas exibem aviso no frontend e nos logs de execução. Seus resultados não devem ser usados como base para publicação sem validação independente.
12. **Família 19 — Transferência de Calibração.** Scripts de transferência (`pds`, `ds`, `sbc`) aprendem a matriz de transformação F a partir de amostras de transferência (medidas nos dois instrumentos). O output `transfer_model` deve ser salvo e aplicado a todos os espectros futuros do instrumento slave antes de qualquer predição. O worker rejeita conexão direta entre espectros do slave não padronizados e modelos calibrados no master.
13. **Família 20 — Fusão de Sensores.** Scripts de fusão (`low_level_fusion`, `mid_level_fusion`, `high_level_fusion`, `block_pls`, `hpls`) recebem listas de matrizes como input. O worker valida que todos os blocos têm o mesmo número de amostras no `sample_axis`. Os `scaling_params_` e `extraction_models_` dos scripts de fusão são salvos e obrigatoriamente aplicados aos blocos de novos dados antes da predição.