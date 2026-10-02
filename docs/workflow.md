# TcheLab — Workflows

> Um workflow é um grafo de blocos conectados que representa um pipeline de análise completo.
> Cada bloco é uma instância de uma técnica do catálogo (`catalogo_scripts.md`).
> Cada conexão identifica explicitamente qual porta de saída alimenta qual porta de entrada.
> O banco persiste a estrutura conforme descrito em `database.md`.

---

## O que é um workflow

No TcheLab, o pesquisador monta visualmente o caminho matemático da análise. O sistema garante que:

1. As conexões sejam matematicamente válidas (tipos, shapes, ordem, eixo de amostras)
2. As operações respeitem a dimensionalidade dos dados
3. As técnicas sejam compatíveis com a estrutura do dataset
4. A execução seja reproduzível (parâmetros, seed, versão do código registrados)
5. A origem de cada resultado possa ser rastreada (linhagem de datasets, nó de origem)

Um workflow não é necessariamente linear. Pode conter ramificações, múltiplas entradas, múltiplas saídas, comparações paralelas e resultados intermediários reutilizados por vários blocos.

---

## Princípio fundamental: grafo tipado

Uma conexão nunca é apenas `A → B`. É sempre:

```
output específico de A  →  input específico de B
```

Cada aresta carrega:

- `source_node_key` — nó de origem
- `source_port` — porta de saída do nó de origem
- `target_node_key` — nó de destino
- `target_port` — porta de entrada do nó de destino

Isso é necessário porque blocos têm múltiplas portas. `SVD` produz `U`, `S` e `Vt`. `PARAFAC` produz `scores`, `loadings`, `residuals`, `core_consistency`. `Soma` consome `A` e `B`.

---

## Anatomia de um nó

Cada nó do workflow é uma instância de uma técnica do catálogo com:

- `node_key` — identificador único no workflow (ex: `node_pca_1`)
- `technique_id` — técnica do catálogo instanciada
- `parameters` — parâmetros configurados pelo usuário (override dos defaults)
- `position_x`, `position_y` — posição no canvas

As portas disponíveis (input e output) são determinadas pelo `input_schema` e `output_schema` da técnica — não pelo nó.

---

## Tipos de blocos

### Operações estruturais
Alteram a organização do array sem contexto quimiométrico:
`transpose`, `reshape`, `slice`, `squeeze`, `expand_dims`, `unfolding`, `folding`, `concatenacao`, `stack`, `split`, `selecao_amostras`, `selecao_variaveis`

### Operações matemáticas
Álgebra sobre arrays:
`soma`, `subtracao`, `multiplicacao_elementwise`, `divisao_elementwise`, `produto_matricial`, `inversa`, `pseudo_inversa`, `determinante`, `autovalores`, `autovetores`, `eig`, `svd`, `norma`, `trace`, `rank`, `mean`, `median`, `std`, `min`, `max`, `sum`, `formula_customizada`

### Pré-processamento
Transformações espectrais:
`snv`, `msc`, `detrend`, `baseline`, `savitzky_golay`, `normalizacao`, `centering`, `autoscaling`, `pareto`

### Modelagem
Algoritmos quimiométricos e de ML (famílias 03–11 do catálogo)

### Validação e diagnóstico
Famílias 14, 15 e 16 do catálogo

### Visualização
Scripts da família 17 — retornam dados estruturados para o frontend renderizar

---

## Validação de conexões

Antes de aceitar uma aresta, o sistema verifica (via `ShapeValidatorService`):

### 1. Existência
`source_node_key` e `target_node_key` existem no workflow.

### 2. Porta válida
`source_port` existe no `output_schema` da técnica de origem.
`target_port` existe no `input_schema` da técnica de destino.

### 3. Tipo compatível
O tipo declarado no `output_schema` da porta de origem é compatível com o tipo no `input_schema` da porta de destino.

```
tensor → tensor     ✓
matrix → matrix     ✓
model  → tensor     ✗ (geralmente)
scalar → matrix     ✗
```

### 4. Ordem analítica
O `data_order` do array de entrada satisfaz `min_order` e `max_order` da técnica de destino.

```
PARAFAC recebe tensor de order=1   ✗  (min_order=2)
PARAFAC recebe tensor de order=5   ✓  (max_order=NULL)
SNV     recebe matrix de order=2   ✗  (max_order=1)
```

### 5. Eixo de amostras
O `sample_axis` do array satisfaz `requires_sample_axis` da técnica.

```
requires_sample_axis = 1 → dataset deve ter sample_axis declarado
requires_sample_axis = 0 → dataset não deve ter sample_axis
requires_sample_axis = NULL → indiferente
```

### 6. Compatibilidade matemática de shape
Para operações com restrições de shape:

```
produto_matricial: A.shape[-1] == B.shape[-2]
soma: shapes compatíveis
inversa: A deve ser quadrada
```

### 7. Compatibilidade semântica
Declarada em `technique_compatibilities`. Mesmo shape idêntico não garante compatibilidade semântica:

```
scores PCA  shape=(100,5)  ≠  matriz espectral  shape=(100,5)
```

### 8. Ausência de ciclos
A aresta não pode criar um ciclo — o grafo deve ser um DAG (grafo acíclico dirigido).

---

## Erros de validação

Erros devem ser explícitos e acionáveis. Nunca silenciosos.

```
Inversa exige uma matriz quadrada.
Entrada recebida: shape = (3, 2).
Use o bloco "Pseudo-inversa" se a intenção for calcular a Moore-Penrose pseudoinverse.
```

```
Produto matricial inválido.
A possui shape (100, 20). B possui shape (30, 5).
Para A @ B, a segunda dimensão de A deve ser igual à primeira dimensão de B.
```

```
SNV aceita apenas arrays de ordem 1 (max_order = 1).
O dataset conectado tem data_order = 3.
Considere aplicar SNV após um unfolding ou sobre cada modo separadamente.
```

```
PARAFAC exige arrays de ordem mínima 2 (min_order = 2).
O dataset conectado tem data_order = 1.
```

---

## Múltiplas entradas

Blocos com múltiplas entradas declaram todas as portas no `input_schema`. Cada porta deve ser conectada por uma aresta separada.

```
Dataset A  →  output:X  →  input:A  →  [Soma]  →  output:result
Dataset B  →  output:X  →  input:B  ↗
```

Representação no banco (`workflow_edges`):

```json
{"source_node_key": "node_dataset_a", "source_port": "X", "target_node_key": "node_soma", "target_port": "A"}
{"source_node_key": "node_dataset_b", "source_port": "X", "target_node_key": "node_soma", "target_port": "B"}
```

---

## Múltiplas saídas

Blocos com múltiplas saídas permitem que cada porta seja conectada a diferentes nós downstream.

```
[PARAFAC]
    ├── scores       →  [Regressão]
    ├── loadings     →  [Visualização de perfis]
    ├── residuals    →  [Diagnóstico]
    └── core_consistency  →  [Exibição]
```

---

## Transformação de shape

Cada operação declara o efeito esperado sobre o shape antes da execução, permitindo que o sistema atualize metadados sem executar o nó:

| Operação | Shape in | Shape out |
|----------|----------|-----------|
| `transpose(axes=[1,0])` | (3,2) | (2,3) |
| `reshape(new_shape=[2,3])` | (3,2) | (2,3) |
| `slice(axis0=0:50)` | (100,200,30) | (50,200,30) |
| `mean(axis=0)` | (100,200,30) | (200,30) |
| `unfolding(mode=0)` | (10,20,30) | (10,600) |
| `folding(shape=[10,20,30])` | (10,600) | (10,20,30) |
| `produto_matricial` | (100,20)×(20,5) | (100,5) |
| `svd` | (m,n) | U:(m,k), S:(k,), Vt:(k,n) |
| `squeeze` | (100,1,30) | (100,30) |
| `stack(axis=0)` | (10,20)+(10,20) | (2,10,20) |

---

## Status do workflow

```
draft    →  ready  →  archived
```

- `draft` — em edição
- `ready` — pronto para execução
- `archived` — não executável, mantido para histórico

Alterações em um nó intermediário podem marcar outputs downstream como `stale` (desatualizados) na última execução, permitindo reexecução seletiva a partir daquele nó.

---

## Versionamento

O workflow mantém duas representações paralelas:

1. **Tabelas normalizadas** (`workflow_nodes`, `workflow_edges`) — fonte estrutural para execução e validação
2. **`definition` (JSON snapshot)** — cópia denormalizada para reconstituição rápida no frontend

Versões explícitas ficam em `workflow_versions`. O usuário pode salvar um snapshot antes de grandes modificações e restaurar depois.

---

## Dataset derivado

Quando um nó produz um novo dataset (ex: após `transpose`, `unfolding`, `concatenacao`), o dataset derivado é registrado com linhagem:

```
Dataset A  →  [Transpose axes=[1,0]]  →  Dataset B
```

`Dataset B` registra em `dataset_lineage`:
```
source_dataset_id = A.id
target_dataset_id = B.id
operation = "transpose"
parameters = {"axes": [1, 0]}
workflow_node_id = <id do nó>
execution_id = <id da execução>
```

---

## Resultados que não são datasets

Nem todo output vira um dataset. O `output_schema` declara o tipo:

| Output | Tipo | Exemplo |
|--------|------|---------|
| determinante | scalar | 4.72 |
| autovalores | vector (complex) | `{"real":[…],"imag":[…]}` |
| core_consistency | scalar | 87.3 |
| R² | scalar | 0.982 |
| confusion_matrix | matrix | [[45,2],[1,52]] |
| modelo PLS | model | referência ao arquivo serializado |
| scores PCA | matrix | shape (I, R) |
| loadings | matrix | shape (J, R) |

---

## Geração por IA

A IA pode sugerir um workflow a partir de artigo, DOI, PDF ou dataset:

```
PDF / DOI
    ↓
analyze_article  (job)
    ↓
article_analyses + article_techniques
    ↓
generate_workflow  (job)
    ↓
workflow + workflow_nodes + workflow_edges
          com workflow_node_origins
    ↓
usuário revisa e edita no canvas
    ↓
execution
```

A IA **não gera código**. Ela produz uma definição de grafo usando exclusivamente blocos existentes no catálogo. Cada nó gerado é rastreado em `workflow_node_origins` com referência à técnica identificada no artigo.

---

## Exemplos

### Workflow simples

```
[Dataset]
shape = (100, 200)
sample_axis = 0
data_order = 1
    ↓  output:X → input:X
[SNV]
    ↓  output:X → input:X
[Centering]
    ↓  output:X → input:X
[PCA]  n_components=5
    ├──  output:scores → input:X  →  [Visualização scores]
    └──  output:loadings → input:X  →  [Visualização loadings]
```

---

### Workflow multi-entrada

```
[Dataset A]  shape=(100,20)          [Dataset B]  shape=(100,20)
    │ output:X                                │ output:X
    ▼                                         ▼
    └──────────────── input:A ──[Soma]── input:B ───────────────┘
                                   │ output:result
                                   ▼
                                [PCA]
                                   │
                                   ▼
                               [Scores]
```

---

### Workflow matemático com tensor

```
[Dataset]
shape = (50, 20, 30, 10)
sample_axis = 0
data_order = 3
    ↓  output:X → input:X
[Transpose]  axes=[0,2,1,3]
    ↓  output:X_T → input:X       (shape agora: 50,30,20,10)
[PARAFAC]  n_components=3
    ├──  scores      →  [Regressão PLS]
    ├──  loadings    →  [Perfis por modo]
    ├──  residuals   →  [Diagnóstico Q-residuals]
    └──  core_consistency  →  [Exibição]
```

---

### Workflow com operação de linhagem

```
[Dataset A]  shape=(200,100)
    ↓
[Unfolding]  mode=0
    ↓
[Dataset B]  shape=(200,10000)     ← novo dataset com linhagem registrada
parent_dataset_id = A.id
operation = "unfolding"
parameters = {"mode": 0}
    ↓
[U-PLS]
    ↓
[Métricas]
```

---

### Workflow com comparação paralela

```
[Dataset]
    ├──────────────────────────────────────────┐
    │                                          │
    ↓  output:X → input:X                     ↓  output:X → input:X
[SNV → Centering → PLS]              [MSC → Autoscaling → N-PLS]
    │                                          │
    ↓                                          ↓
[Métricas PLS]                        [Métricas N-PLS]
    └──────────────────────────────────────────┘
                          │
                 [Execution Comparison]
```

---

### Workflow MCR-ALS com matriz aumentada

```
[Dataset aumentado]
data_order = 2
sample_axis = NULL
augmentation_scheme = {
    "type": "augmented",
    "augmented_mode": "C&D",
    "n_blocks": 9
}
    ↓
[MCR-ALS]  n_components=2, constraints=["non_negativity"]
    ├──  C  →  [Perfis de concentração]
    ├──  S  →  [Perfis espectrais]
    └──  residuals  →  [Diagnóstico]
```

O sistema não trata esta matriz como tensor ortogonal regular — o `augmentation_scheme` é preservado e repassado ao worker.

---

### Workflow calibração de segunda ordem

```
[Dataset EEM]
shape = (30, 50, 40)
sample_axis = 0
data_order = 2
    ↓
[Seleção de variáveis]  mode=1, ranges=[[5,45]]
    ↓
[PARAFAC]  n_components=2
    ├──  core_consistency  →  [Diagnóstico]
    │
    └──  scores  →  [PLS]  ←─  [y_ref] (concentrações de referência)
                       │
                       ├──  [Figuras de mérito analítico]
                       └──  [Predição em novas amostras]
```

---

## Modelos customizados no workflow

Modelos customizados (Requisito 5) aparecem no catálogo como qualquer outra técnica (`is_custom=1`). Podem ser instanciados em nós de workflow normalmente.

Internamente, quando o worker encontra um nó com técnica `is_custom=1`, ele expande a `custom_definition` e executa os sub-blocos em sequência, aplicando as validações de cada um.

```
[Dataset novo]
    ↓
[Meu Pré-processamento XYZ]   ← técnica customizada
    ↓                            internamente: snv → centering → selecao_variaveis
[PCA]
    ↓
[Scores]
```

---

## Princípios de design

| Princípio | Implicação |
|-----------|-----------|
| Sem teto artificial de dimensionalidade | Nenhum bloco codifica "3D" ou "4D" — descobre ndim do input |
| Validação explícita | Operações inválidas geram erros descritivos, nunca conversões silenciosas |
| Modularidade | Um bloco pode ser substituído por outro com contrato compatível |
| Reprodutibilidade | Toda execução registra seed, código, parâmetros, ambiente |
| Rastreabilidade | Todo dataset derivado e todo nó tem origem registrada |
| Segurança | `formula_customizada` nunca usa `eval()` — sempre AST + whitelist |
| Separação estrutura/modelagem | O usuário pode manipular arrays antes de qualquer técnica quimiométrica |