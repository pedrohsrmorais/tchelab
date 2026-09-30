# TcheLab — Documentação do Banco de Dados

> Versão conceitual do schema: v5
> Engine: MySQL 8.0+
> Charset: utf8mb4_unicode_ci

---

# Visão geral

O banco do TcheLab é organizado em torno de seis domínios funcionais:

```text
USUÁRIOS & COMUNIDADE
        │
        ├── DADOS
        │      ├── spectra
        │      ├── collections
        │      └── datasets
        │
        ├── ARTIGOS & IA
        │      └── article_analyses
        │
        ├── CATÁLOGO
        │      └── techniques
        │
        ├── WORKFLOWS
        │      ├── workflows
        │      ├── workflow_nodes
        │      └── workflow_edges
        │
        └── EXECUÇÕES
               ├── executions
               ├── execution_nodes
               ├── metrics
               └── models
```

O fluxo central é:

```text
Artigo / DOI / Dataset
        ↓
IA
        ↓
Workflow
        ↓
Operações de dados
        ↓
Pré-processamento
        ↓
Modelagem
        ↓
Validação
        ↓
Resultados
        ↓
Rastreabilidade
```

---

# Decisão fundamental: arrays N-way de ordem arbitrária

O TcheLab não deve possuir um limite estrutural baseado em:

```text
3D
4D
5D
```

A estrutura deve trabalhar com arrays N-dimensional.

O dataset possui duas propriedades independentes:

1. existência de eixo de amostras;
2. ordem da medição.

---

# Dataset e eixo de amostras

Em:

```text
I × J
```

temos:

```text
I = amostras
J = variáveis
```

Então:

```text
sample_axis = 0
data_order = 1
```

Em:

```text
I × J × K
```

podemos ter:

```text
sample_axis = 0
data_order = 2
```

Os modos instrumentais da medição são:

```text
J × K
```

A mesma lógica continua para ordens superiores.

---

# Estrutura de `datasets`

Os campos relevantes incluem:

```sql
dimensions          JSON
mode_labels         JSON
mode_ranges         JSON
sample_axis         TINYINT NULL
data_order          TINYINT
augmentation_scheme JSON NULL
data_type           VARCHAR(...)
dtype               VARCHAR(...)
file_format         VARCHAR(...)
storage_path        VARCHAR(...)
reference_labels    JSON
metadata            JSON
```

Exemplo:

```json
{
  "dimensions": [9, 17, 19, 10, 5],
  "mode_labels": [
    "samples",
    "chrom_time",
    "excitation",
    "emission",
    "phosphorescence_decay"
  ],
  "sample_axis": 0,
  "data_order": 4
}
```

---

# Limite estrutural

O schema não deve depender de uma lista fechada de ordens.

Uma implementação pode manter um `CHECK` generoso para detectar erros de entrada, por exemplo:

```sql
CHECK (data_order BETWEEN 1 AND 50)
```

Esse valor não representa um limite científico.

Se futuramente a implementação precisar aceitar ordem maior, a alteração é simples.

---

# Storage de arrays

Arrays pequenos podem ser armazenados ou transportados por formatos simples.

Arrays grandes e multidimensionais devem utilizar armazenamento externo apropriado, preferencialmente Zarr ou formato equivalente.

Conceitualmente:

```text
MySQL
  │
  ├── metadata
  ├── shape
  ├── dtype
  ├── dimension labels
  └── storage path
             │
             ▼
          Zarr
             │
             └── array N-dimensional
```

O MySQL não deve armazenar milhões de valores numéricos em JSON quando o dataset puder ser representado de forma eficiente em armazenamento especializado.

---

# Dataset derivado e linhagem

Uma das extensões fundamentais da arquitetura é permitir que um dataset seja resultado de uma operação.

Exemplo:

```text
Dataset A
   ↓
Transpose
   ↓
Dataset B
```

O Dataset B deve registrar sua origem.

Campos conceituais:

```sql
parent_dataset_id
derived_from_operation
derived_parameters
```

ou, quando a implementação preferir separar a operação:

```text
dataset_lineage
```

com:

```text
source_dataset_id
target_dataset_id
operation
parameters
workflow_id
workflow_node_id
created_at
```

A finalidade é permitir:

```text
"Como este dataset foi produzido?"
```

e:

```text
"Quais resultados dependem deste dataset?"
```

---

# Operações não necessariamente produzem datasets

Um output pode ser:

```text
scalar
vector
matrix
tensor
model
metrics
classification
prediction
complex_vector
complex_matrix
```

Portanto, `execution_nodes` precisa distinguir:

```text
output_data
```

de:

```text
output_storage_path
```

e possuir metadados suficientes para identificar:

```text
output_type
dtype
shape
```

---

# Complex numbers

JSON não possui tipo nativo para números complexos.

O TcheLab utiliza:

```json
{
  "real": [1.2, 3.4, 5.6],
  "imag": [0.0, 0.2, -1.1]
}
```

para representar vetores complexos.

Para uma matriz:

```json
{
  "real": [[...]],
  "imag": [[...]]
}
```

Internamente, o worker Python pode utilizar:

```text
complex64
complex128
```

O formato JSON é uma representação de transporte/persistência, não uma restrição matemática do worker.

---

# Técnicas e compatibilidade de ordem

A tabela `techniques` declara:

```sql
min_order              TINYINT UNSIGNED
max_order              TINYINT UNSIGNED NULL
requires_sample_axis   TINYINT(1) NULL
input_schema            JSON
output_schema           JSON
parameter_schema        JSON
```

Interpretação:

```text
requires_sample_axis = 1
```

exige eixo de amostras.

```text
requires_sample_axis = 0
```

opera sem eixo de amostras.

```text
requires_sample_axis = NULL
```

é indiferente.

---

# Catálogo de compatibilidade

Exemplos:

| Técnica          |  min |  max | sample axis |
| ---------------- | ---: | ---: | ----------: |
| SNV              |    1 |    1 |           1 |
| PCA              |    1 |    1 |           1 |
| PARAFAC          |    2 | NULL |        NULL |
| Tucker3          |    2 | NULL |        NULL |
| MCR-ALS          |    2 |    2 |           0 |
| Cross Validation | NULL | NULL |           1 |

`NULL` em `max_order` significa sem teto declarado.

---

# Domínio 1 — Usuários e Comunidade

## `users`

Tabela central de usuários.

Campos científicos incluem:

```text
research_area
institution
lattes_url
```

Contadores `stat_*` podem ser mantidos desnormalizados para evitar consultas `COUNT()` frequentes.

---

## `communities`

Grupos de pesquisa ou laboratórios.

---

## `community_members`

Tabela de associação:

```text
member
moderator
admin
```

---

## `community_datasets`

Permite compartilhar datasets dentro de uma comunidade.

---

## `community_workflows`

Permite compartilhar workflows.

---

## `messages`

Chat por comunidade.

---

## `audit_logs`

Registra ações relevantes.

Campos conceituais:

```text
before_data
after_data
user_id
action
entity_type
entity_id
created_at
```

---

# Domínio 2 — Dados

## `spectra`

Espectros individuais 1D.

Podem possuir:

```text
x_values
y_values
reference_value
reference_values
```

---

## `collections`

Agrupamento informal de espectros.

---

## `collection_spectra`

Relação entre collections e spectra.

---

## `datasets`

Estrutura principal para dados científicos.

Suporta:

```text
matrix
tensor
```

e arrays N-dimensional.

---

## `dataset_spectra`

Relaciona espectros individuais com posições dentro de datasets matriciais.

---

# Domínio 3 — Artigos e IA

## `articles`

Metadados bibliográficos.

---

## `article_analyses`

Representa uma análise do artigo realizada por um usuário.

Campos importantes:

```text
methodology
generated_workflow_id
data_type_detected
dimensionality_detected
```

`dimensionality_detected` não deve assumir teto fixo.

---

## `article_techniques`

Registra técnicas identificadas pela IA.

Inclui:

```text
confidence
raw_text
mapping_notes
```

---

## `workflow_node_origins`

Relaciona um nó gerado no workflow com a técnica identificada no artigo.

---

# Domínio 4 — Catálogo

## `techniques`

É o catálogo dos blocos disponíveis.

Campos:

```text
slug
name
category
subcategory
family
input_schema
output_schema
parameter_schema
min_order
max_order
requires_sample_axis
tags
is_beta
```

---

# Domínio 5 — Workflows

## `workflows`

Representa o grafo completo.

Campos importantes:

```text
definition
source_article_analysis_id
fork_from_workflow_id
is_template
status
```

`definition` é um snapshot do grafo.

As tabelas normalizadas continuam sendo a fonte estrutural para execução.

---

## `workflow_nodes`

Uma instância de uma técnica/operação.

Campos conceituais:

```text
workflow_id
technique_id
parameters
position_x
position_y
label
```

Cada nó possui portas determinadas pelo `input_schema` e `output_schema` da técnica.

---

# `workflow_edges`

Esta tabela precisa representar **qual porta de saída alimenta qual porta de entrada**.

Estrutura conceitual:

```sql
workflow_edges
--------------------------
id
workflow_id
source_node_id
source_output_key
target_node_id
target_input_key
created_at
```

A restrição de unicidade deve impedir conexões duplicadas:

```text
workflow_id
source_node_id
source_output_key
target_node_id
target_input_key
```

Isso resolve a limitação da estrutura anterior, na qual:

```text
A → B
```

não era suficiente para distinguir:

```text
A.output1 → B.input1
```

de:

```text
A.output2 → B.input2
```

---

# Multi-input

O novo modelo permite:

```text
A.X ─────────→ Soma.A
B.X ─────────→ Soma.B
```

ou:

```text
A.X ─────────→ Produto.A
B.X ─────────→ Produto.B
```

ou:

```text
A.X ─────────→ Matmul.A
B.X ─────────→ Matmul.B
```

Uma operação pode declarar quantas entradas possui no `input_schema`.

---

# `technique_compatibilities`

Permite declarar compatibilidade semântica entre técnicas.

Exemplo:

```json
{
  "min_order": 3,
  "condition": "output.type == tensor"
}
```

Também pode registrar incompatibilidades:

```text
is_valid = 0
notes = "Scores de PCA não são uma entrada válida para esta decomposição."
```

---

# Domínio 6 — Execuções

## `executions`

Uma execução de workflow.

Pode utilizar:

```text
dataset_id
collection_id
```

e registra:

```text
random_seed
code_version
environment
parent_execution_id
comparison_group
```

---

## `execution_nodes`

Registra o estado de cada nó.

Pode armazenar:

```text
status
input_metadata
output_data
output_storage_path
output_storage_type
output_type
output_shape
output_dtype
error_message
```

Outputs pequenos podem permanecer em JSON.

Outputs grandes devem utilizar armazenamento externo.

---

# Jobs

Tipos previstos:

```text
analyze_article
generate_workflow
execute_workflow
train_model
predict
preprocess
operate_dataset
export
```

`operate_dataset` permite executar operações matemáticas/estruturais independentemente de um modelo.

---

# Modelos e predições

## `models`

Armazena modelos treinados reutilizáveis.

## `predictions`

Armazena resultados produzidos por modelos.

---

# Comparação de execuções

## `execution_comparisons`

Grupo de comparação.

## `execution_comparison_items`

Lista as execuções comparadas.

---

# Diagrama de dependências

```text
users
  │
  ├── articles
  │      └── article_analyses
  │             └── article_techniques
  │
  ├── spectra
  │      ├── collection_spectra
  │      └── dataset_spectra
  │
  ├── collections
  │
  ├── datasets
  │      └── dataset_lineage
  │
  ├── workflows
  │      ├── workflow_nodes
  │      ├── workflow_edges
  │      ├── workflow_node_origins
  │      └── workflow_templates
  │
  ├── executions
  │      ├── execution_nodes
  │      ├── metrics
  │      └── predictions
  │
  ├── communities
  │      ├── community_members
  │      ├── community_datasets
  │      ├── community_workflows
  │      └── messages
  │
  ├── jobs
  └── audit_logs

techniques
  └── technique_compatibilities
```

---

# Fluxo de geração de workflow por artigo

```text
PDF / DOI
   ↓
analyze_article
   ↓
article_analysis
   ↓
article_techniques
   ↓
generate_workflow
   ↓
workflow
   ↓
workflow_nodes
   ↓
workflow_edges
   ↓
usuário revisa
   ↓
execution
```

---

# Fluxo de operação matemática

```text
Dataset A
   ↓
workflow_node: transpose
   ↓
Dataset B
   ↓
workflow_node: PCA
   ↓
Scores
```

Para duas entradas:

```text
Dataset A ────────┐
                  ↓
               [Soma]
                  ↑
Dataset B ────────┘
```

---

# Rastreabilidade

A linhagem deve permitir responder:

```text
Qual arquivo originou este dataset?

Qual operação criou este dataset?

Qual workflow executou essa operação?

Quais parâmetros foram utilizados?

Quais datasets foram usados como entrada?

Quais resultados dependem deste dataset?
```

---

# Segurança da fórmula customizada

A fórmula do usuário não deve ser executada diretamente pelo banco ou pelo Python usando:

```python
eval(user_expression)
```

O fluxo deve ser:

```text
expressão
   ↓
parser
   ↓
AST
   ↓
validação por whitelist
   ↓
executor
   ↓
resultado
```

Somente operações permitidas pelo catálogo podem ser utilizadas.

---

# Decisões de design

## Por que `workflow_edges` precisa de `source_output_key` e `target_input_key`?

Porque workflows modernos podem possuir múltiplas entradas e saídas.

`A → B` não identifica qual porta está conectada.

---

## Por que inversa não vira automaticamente pseudo-inversa?

Porque são operações matematicamente distintas.

Uma matriz não quadrada não possui inversa convencional.

O usuário deve escolher explicitamente:

```text
Inversa
```

ou:

```text
Pseudo-inversa
```

---

## Por que números complexos possuem `real` e `imag`?

Porque JSON não possui tipo complexo.

A representação é explícita e interoperável.

---

## Por que não usar `eval()`?

Porque isso permitiria execução arbitrária de código no servidor.

A fórmula deve ser interpretada por um parser controlado.

---

## Por que manter datasets derivados?

Porque o TcheLab precisa ser capaz de reconstruir a cadeia de transformação.

---

## Por que operações são blocos?

Porque isso permite:

* composição;
* validação;
* execução assíncrona;
* logging;
* reprodução;
* visualização;
* IA;
* comparação.

---

## Por que o MySQL não armazena diretamente os arrays grandes?

Porque arrays científicos grandes são mais adequados a armazenamento especializado, como Zarr.

O MySQL armazena metadados e referências.

---

## Por que `definition` existe além das tabelas normalizadas?

Para snapshot e reconstrução rápida do frontend.

As tabelas normalizadas continuam sendo a fonte estrutural.

---

# Princípio final do banco

O banco deve representar três coisas de forma independente:

```text
DADOS
  ↓
OPERAÇÕES
  ↓
WORKFLOWS
  ↓
EXECUÇÕES
```

O resultado científico não deve ser tratado apenas como um arquivo solto.

Ele deve possuir:

```text
origem
estrutura
operação
parâmetros
workflow
execução
linhagem
```

Isso transforma o TcheLab em uma plataforma de análise reproduzível, e não apenas em uma interface para executar scripts.
