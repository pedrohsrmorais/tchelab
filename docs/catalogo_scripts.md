# TcheLab — Catálogo de Scripts

> Cada entrada representa um bloco executável no TcheLab.

> Todo script declara `input_schema`, `parameter_schema`, `output_schema` e `validate()`.

> A compatibilidade entre blocos é verificada automaticamente pelo sistema de workflows.

> A validação considera tipo, shape, ordem analítica, eixo de amostras e compatibilidade semântica.

---

# Contrato geral dos scripts

Todo bloco do catálogo possui:

```text
slug
nome
categoria
descricao
input_schema
parameter_schema
output_schema
validate()
execute()
```

O `validate()` deve verificar:

* tipos;
* shape;
* dtype;
* ordem;
* eixo de amostras;
* parâmetros;
* compatibilidade entre múltiplas entradas.

O `execute()` recebe somente entradas previamente validadas.

---

# Estrutura de um bloco

Exemplo:

```json
{
  "nome": "Produto Matricial",

  "categoria": "01_dados",

  "input": {
    "A": {
      "tipo": "matrix",
      "dtype": "float"
    },

    "B": {
      "tipo": "matrix",
      "dtype": "float"
    }
  },

  "parametros": {},

  "output": {
    "result": {
      "tipo": "matrix"
    }
  }
}
```

---

# 01 · Dados e Operações

Esta família contém operações estruturais e matemáticas sobre arrays.

```text
01_dados

├── importacao
├── limpeza
├── tratamento_missing
├── selecao_amostras
├── selecao_variaveis
│
├── transpose
├── reshape
├── slice
├── squeeze
├── expand_dims
│
├── unfolding
├── folding
├── concatenacao
├── stack
├── split
│
├── soma
├── subtracao
├── multiplicacao_elementwise
├── divisao_elementwise
├── produto_matricial
│
├── inversa
├── pseudo_inversa
├── determinante
├── autovalores
├── autovetores
├── eig
├── svd
│
├── norma
├── trace
├── rank
├── mean
├── median
├── std
├── min
├── max
├── sum
│
└── formula_customizada
```

---

# `transpose`

Permuta os eixos do array.

Entrada:

```text
X.shape = (I,J,K)
```

Parâmetro:

```text
axes = [2,0,1]
```

Saída:

```text
shape = (K,I,J)
```

Para uma matriz:

```text
(3,2) → (2,3)
```

O número de elementos permanece constante.

---

# `reshape`

Altera a forma do array sem alterar a ordem dos elementos.

Exemplo:

```text
(3,2) → (2,3)
```

Validação:

```text
produto(shape_original)
=
produto(shape_novo)
```

---

# `slice`

Seleciona parte de um ou mais eixos.

Exemplo:

```text
X.shape = (100,200,30)
```

Selecionando:

```text
samples = 0:50
```

produz:

```text
(50,200,30)
```

---

# `squeeze`

Remove eixos de tamanho 1.

```text
(100,1,30)
```

pode se tornar:

```text
(100,30)
```

---

# `expand_dims`

Insere um eixo de tamanho 1.

```text
(100,30)
```

pode se tornar:

```text
(100,1,30)
```

---

# `unfolding`

Transforma um tensor N-way em matriz 2D.

Exemplo:

```text
(10,20,30)
```

pode ser desdobrado como:

```text
(10,600)
```

dependendo do modo escolhido.

Parâmetros:

```text
mode
ordering
```

---

# `folding`

Operação inversa do unfolding.

Exemplo:

```text
(10,600)
```

para:

```text
(10,20,30)
```

quando os metadados necessários forem conhecidos.

---

# `concatenacao`

Concatena arrays ao longo de um eixo.

Exemplo:

```text
A.shape = (10,20)
B.shape = (15,20)
```

concatenação em `axis=0`:

```text
result.shape = (25,20)
```

A operação pode atualizar `augmentation_scheme` quando representar concatenação não ortogonal.

---

# `stack`

Combina arrays adicionando um novo eixo.

```text
A.shape = (10,20)
B.shape = (10,20)
```

pode produzir:

```text
(2,10,20)
```

---

# `split`

Divide um array em múltiplos outputs.

Exemplo:

```text
(100,20)
```

em:

```text
A = (50,20)
B = (50,20)
```

Esse bloco possui múltiplas saídas nomeadas:

```text
part_1
part_2
```

---

# Operações elementwise

## `soma`

Inputs:

```text
A
B
```

Requer shapes compatíveis.

## `subtracao`

```text
A - B
```

## `multiplicacao_elementwise`

```text
A * B
```

## `divisao_elementwise`

```text
A / B
```

Broadcasting pode ser permitido somente se explicitamente declarado no schema da operação.

O comportamento deve ser documentado para evitar operações silenciosamente diferentes do esperado pelo usuário.

---

# `produto_matricial`

Executa:

```text
A @ B
```

Exemplo:

```text
A = (100,20)
B = (20,5)

resultado = (100,5)
```

A segunda dimensão de A precisa ser compatível com a primeira dimensão de B.

---

# `inversa`

Calcula:

```text
A⁻¹
```

Exige:

```text
A.shape = (n,n)
```

Matrizes não quadradas são rejeitadas.

O bloco não executa pseudo-inversa automaticamente.

---

# `pseudo_inversa`

Calcula a pseudo-inversa de Moore-Penrose.

Aceita:

```text
(m,n)
```

e produz:

```text
(n,m)
```

---

# `determinante`

Exige matriz quadrada.

```text
A.shape = (n,n)
```

Produz:

```text
scalar
```

---

# `autovalores`

Exige matriz quadrada.

Entrada:

```text
(n,n)
```

Saída:

```text
(n,)
```

Quando houver valores complexos:

```json
{
  "real": [...],
  "imag": [...]
}
```

---

# `autovetores`

Exige matriz quadrada.

Entrada:

```text
(n,n)
```

Saída:

```text
(n,n)
```

Cada coluna representa um autovetor associado ao autovalor correspondente, conforme a convenção utilizada pelo backend.

---

# `eig`

Pode ser um bloco combinado que retorna:

```text
eigenvalues
eigenvectors
```

Exemplo:

```text
input:
    A

outputs:
    eigenvalues
    eigenvectors
```

---

# `svd`

Decomposição:

```text
A = U Σ Vᵀ
```

Pode aceitar matriz retangular.

Outputs:

```text
U
S
Vt
```

Para:

```text
A.shape = (m,n)
```

o backend deve documentar claramente se utiliza SVD completa ou reduzida.

---

# `norma`

Calcula norma do array.

Parâmetros:

```text
ord
axis
```

---

# `trace`

Calcula:

```text
trace(A)
```

Exige matriz quadrada.

---

# `rank`

Calcula o posto numérico da matriz.

Pode possuir parâmetro de tolerância.

---

# Operações estatísticas

```text
mean
median
std
min
max
sum
```

Cada operação deve permitir especificar:

```text
axis
keepdims
```

quando aplicável.

Exemplo:

```text
X.shape = (100,200,30)

mean(axis=0)

resultado:
(200,30)
```

---

# `formula_customizada`

Permite expressões matemáticas controladas.

Exemplos:

```text
X * 2
```

```text
sqrt(X)
```

```text
(X - mean(X)) / std(X)
```

```text
A @ B
```

A expressão deve passar por:

```text
parser
   ↓
AST
   ↓
whitelist
   ↓
executor
```

Nunca deve utilizar:

```python
eval()
```

para executar diretamente a expressão fornecida pelo usuário.

---

# 02 · Pré-processamento

```text
02_pre_processamento

├── snv
├── msc
├── detrend
├── baseline
├── savitzky_golay
├── normalizacao
├── centering
├── autoscaling
├── pareto
└── outros_scalings
```

Esses métodos podem ser configurados para trabalhar sobre eixos explicitamente definidos.

A implementação não deve presumir silenciosamente qual eixo representa amostras.

---

# 03 · Análise Exploratória 1D

```text
03_exploratoria_1d

├── pca
├── hca
├── kmeans
├── scores
├── loadings
├── biplot
└── outlier_detection
```

PCA clássica espera uma estrutura matricial apropriada.

---

# 04 · Regressão 1D

```text
04_regressao_1d

├── ols
├── ridge
├── lasso
├── elastic_net
├── pcr
├── pls
└── nonlinear_regression
```

---

# 05 · Classificação 1D

```text
05_classificacao_1d

├── lda
├── qda
├── knn
├── svm
├── pls_da
├── random_forest
├── mlp
├── simca
├── pls_oc
└── one_class_svm
```

---

# 06 · Deep Learning 1D

```text
06_deep_learning_1d

├── mlp
├── cnn_1d
├── cnn_2d
├── rnn
├── transformer
├── autoencoder
└── diffusion
```

---

# 07 · Decomposição Multiway

```text
07_decomposicao_multiway

├── parafac
├── parafac2
├── parafac_aumentado
├── tucker3
├── mcr_als
├── mpca
├── tensor_svd
└── tensor_nmf
```

---

# `parafac`

Decomposição CP/PARAFAC.

Aceita:

```text
min_order = 2
max_order = NULL
```

O número de modos não é codificado como 3 ou 4.

Outputs:

```text
scores
loadings
residuals
core_consistency
explained_variance
```

---

# `parafac2`

Permite variação controlada de um modo.

A compatibilidade deve ser declarada pelo schema do bloco.

---

# `tucker3`

Apesar do nome histórico, a implementação deve ser tratada como decomposição Tucker N-way.

O número de modos é determinado pelo input.

---

# `mcr_als`

MCR-ALS pode operar sobre:

* matrizes;
* matrizes aumentadas;
* estruturas compatíveis com os modos de resolução implementados.

Restrições possíveis:

```text
non_negativity
unimodality
closure
correspondence
```

---

# `mpca`

Multilinear PCA para arrays N-way.

---

# `tensor_svd`

Decomposição tensorial baseada em SVD/HOSVD.

---

# `tensor_nmf`

Fatoração não negativa para arrays.

---

# 08 · Regressão Multiway

```text
08_regressao_multiway

├── n_pls
├── u_pls
├── n_way_pcr
├── u_pca
├── parafac_regression
├── tucker_regression
└── tensor_regression
```

---

# `n_pls`

PLS multiway.

O número de modos é determinado pelo dataset.

---

# `u_pls`

Executa abordagem baseada em unfolding.

O dataset pode ser N-way antes do unfolding.

---

# `parafac_regression`

Utiliza resultados da decomposição PARAFAC para calibração.

---

# 09 · Classificação Multiway

```text
09_classificacao_multiway

├── multilinear_lda
├── tensor_svm
├── tensor_knn
├── tensor_random_forest
├── multiway_pls_da
├── multiway_simca
└── multiway_one_class
```

---

# 10 · Calibração de Ordem Superior

```text
10_calibracao_ordem_superior

├── segunda_ordem
├── terceira_ordem
├── quarta_ordem
└── ordem_superior_generica
```

Essa divisão é exclusivamente didática.

Ela não representa limites estruturais.

Os mesmos algoritmos podem trabalhar em ordens superiores quando declarados como N-way.

---

# 11 · Interferentes e Vantagem Analítica

```text
11_interferentes_advantage

├── rtl
├── u_pls_rtl
├── n_pls_rtl
├── u_pca_rtl
├── pso_rtl
└── interferentes_nao_calibrados
```

---

# 12 · Seleção de Variáveis

```text
12_selecao_variaveis

├── vip
├── ispa_pls
├── interval_pls
├── cars
├── genetic_algorithm
├── pso
└── wavelength_selection
```

A seleção deve declarar explicitamente em qual eixo ou modo ocorre.

---

# 13 · Otimização

```text
13_otimizacao

├── grid_search
├── random_search
├── bayesian_optimization
├── pso
├── genetic_algorithm
└── hyperparameter_optimization
```

---

# 14 · Validação

```text
14_validacao

├── train_test_split
├── k_fold
├── leave_one_out
├── repeated_cv
├── bootstrap
├── permutation_test
├── external_validation
└── nested_cv
```

Esses blocos exigem estrutura de amostras quando a operação depende de particionamento de indivíduos.

---

# 15 · Métricas

```text
15_metricas

├── regressao
│   ├── r2
│   ├── rmse
│   ├── rmsec
│   ├── rmsecv
│   ├── rmsep
│   ├── mae
│   ├── bias
│   └── sep
│
├── classificacao
│   ├── accuracy
│   ├── precision
│   ├── recall
│   ├── specificity
│   ├── f1
│   ├── roc_auc
│   └── confusion_matrix
│
└── quimiometria_analitica
    ├── sensitivity
    ├── selectivity
    ├── analytical_sensitivity
    ├── lod
    ├── loq
    └── concentration_std
```

---

# 16 · Diagnósticos

```text
16_diagnosticos

├── residuals
├── leverage
├── hotelling_t2
├── q_residuals
├── outlier_detection
├── overfitting
├── core_consistency
└── model_diagnostics
```

---

# 17 · Visualização

```text
17_visualizacao

├── spectra
├── scores
├── loadings
├── biplot
├── calibration_plot
├── predicted_vs_reference
├── confusion_matrix
├── roc_curve
├── 3d_surface
├── contour
├── heatmap
├── tensor_profiles
├── parafac_profiles
├── mcr_profiles
└── augmented_profiles
```

`tensor_profiles` deve funcionar dinamicamente:

```text
array de ordem 3
→ 3 modos

array de ordem 5
→ 5 modos

array de ordem 10
→ 10 modos
```

---

# 18 · Dados Sintéticos

```text
18_dados_sinteticos

├── synthetic_spectra
├── synthetic_eem
├── synthetic_chromatography
├── synthetic_multiway
├── synthetic_phosphorescence
├── noise_generation
├── outlier_generation
├── interferent_generation
├── shift_simulation
└── diffusion_generation
```

---

# Regras gerais do catálogo

## Regra 1 — Nenhuma operação deve assumir 3D ou 4D arbitrariamente

Se uma técnica é matematicamente N-way, ela deve receber o array e descobrir:

```text
ndim
shape
mode_labels
sample_axis
```

---

## Regra 2 — Operações matemáticas devem declarar restrições

Exemplo:

```text
inverse:
    requires_square_matrix = true
```

---

## Regra 3 — Pseudo-inversa é operação distinta

Não deve existir conversão silenciosa:

```text
inverse(non_square)
```

para:

```text
pinv()
```

---

## Regra 4 — Multi-input precisa ser explícito

Exemplo:

```text
A → input:A
B → input:B
```

---

## Regra 5 — Multi-output precisa ser explícito

Exemplo:

```text
SVD

outputs:
    U
    S
    Vt
```

---

## Regra 6 — Outputs complexos devem possuir representação explícita

```json
{
  "real": [...],
  "imag": [...]
}
```

---

## Regra 7 — Fórmulas não executam Python arbitrário

Nunca:

```python
eval(expression)
```

Sempre:

```text
parse
→ validate AST
→ whitelist
→ execute
```

---

## Regra 8 — O catálogo deve declarar transformação de shape

Exemplo:

```text
transpose:
    shape_out = permute(shape_in)

sum:
    shape_out = remove_axis(shape_in, axis)

matmul:
    shape_out = (A.rows, B.cols)
```

---

# Exemplo completo: operação 3×2

Entrada:

```text
Dataset A

shape = (3,2)

[1 2]
[3 4]
[5 6]
```

Workflow:

```text
Dataset A
   ↓
Transpose
   ↓
Dataset B
```

Saída:

```text
shape = (2,3)

[1 3 5]
[2 4 6]
```

---

# Exemplo: produto matricial

```text
Dataset A
shape = (100,20)

       │
       │ input:A
       ▼

    [Matmul]

       ▲
       │ input:B
       │

Dataset B
shape = (20,5)
```

Resultado:

```text
shape = (100,5)
```

---

# Exemplo: autovalores

```text
Dataset A
shape = (5,5)
       │
       ▼
 [Autovalores]
       │
       ▼
eigenvalues
shape = (5,)
dtype = complex128
```

Representação JSON:

```json
{
  "real": [1.2, 2.1, 4.3, 0.0, 0.5],
  "imag": [0.0, 0.0, 1.2, -1.2, 0.0]
}
```

---

# Exemplo: workflow matemático + quimiometria

```text
[Importação]
      │
      ▼
[Transpose]
      │
      ▼
[Centering]
      │
      ▼
[PCA]
      │
      ├──→ [Scores]
      │
      └──→ [Loadings]
```

---

# Exemplo: operação entre datasets + modelagem

```text
Dataset A ──────┐
                │
                ▼
             [Soma]
                │
Dataset B ──────┘
                │
                ▼
             [PCA]
                │
                ▼
             [Scores]
```

---

# Exemplo: tensor N-way

```text
Dataset

shape =
(
  50,
  20,
  30,
  10,
  5
)

sample_axis = 0
data_order = 4
```

Workflow:

```text
Dataset
   ↓
Transpose
axes = [0,2,1,3,4]
   ↓
PARAFAC
   ↓
tensor_profiles
```

Nenhum bloco precisa ser duplicado para "PARAFAC 4D".

---

# Resumo das famílias

| Família                   | Função                                     |
| ------------------------- | ------------------------------------------ |
| 01 Dados                  | Entrada, estrutura e operações matemáticas |
| 02 Pré-processamento      | Transformações espectrais                  |
| 03 Exploratória           | PCA e agrupamento                          |
| 04 Regressão 1D           | Modelos quantitativos                      |
| 05 Classificação 1D       | Classificação                              |
| 06 Deep Learning          | Redes e modelos generativos                |
| 07 Decomposição Multiway  | Fatoração N-way                            |
| 08 Regressão Multiway     | Calibração N-way                           |
| 09 Classificação Multiway | Classificação tensorial                    |
| 10 Calibração superior    | Calibração de ordem superior               |
| 11 Interferentes          | Vantagem analítica                         |
| 12 Seleção                | Seleção de variáveis                       |
| 13 Otimização             | Busca de hiperparâmetros                   |
| 14 Validação              | Estratégias de validação                   |
| 15 Métricas               | Avaliação quantitativa                     |
| 16 Diagnósticos           | Diagnóstico de modelos                     |
| 17 Visualização           | Gráficos e inspeção                        |
| 18 Sintéticos             | Geração de dados                           |

---

# Princípio final

O catálogo do TcheLab não deve ser apenas uma lista de algoritmos quimiométricos.

Ele deve funcionar como uma **biblioteca de operações científicas tipadas**.

Um workflow pode começar com:

```text
dados brutos
```

passar por:

```text
transpose
reshape
slice
soma
produto matricial
unfolding
```

seguir para:

```text
SNV
MSC
centering
```

e finalmente executar:

```text
PCA
PLS
PARAFAC
Tucker
MCR-ALS
```

Cada bloco possui contrato explícito, validação matemática, inputs e outputs nomeados e compatibilidade declarada.

Isso permite que o frontend construa workflows válidos sem conhecer a implementação interna dos algoritmos.

A arquitetura resultante transforma o TcheLab em uma plataforma para **composição, execução e rastreabilidade de operações matemáticas e quimiométricas sobre dados científicos multidimensionais**.
