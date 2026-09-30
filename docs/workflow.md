# TcheLab — Workflow

## O que é um workflow

No TcheLab, um **workflow** é um grafo de blocos conectados que representa um pipeline de análise completo, da entrada dos dados até os resultados finais.

Cada bloco do workflow representa uma operação ou técnica do catálogo e possui:

* entradas (`inputs`);
* parâmetros;
* saídas (`outputs`);
* regras de validação;
* requisitos de dimensionalidade;
* requisitos de eixo de amostras;
* tipos de dados aceitos;
* tipos de dados produzidos.

O workflow não é necessariamente linear. Pode conter:

* ramificações;
* múltiplas entradas;
* múltiplas saídas;
* comparações paralelas;
* operações matemáticas;
* transformações estruturais;
* modelos quimiométricos;
* etapas de validação;
* visualizações;
* resultados intermediários reutilizados por vários blocos.

A ideia central é que o pesquisador **monte visualmente** o pipeline e o TcheLab garanta que:

1. as conexões sejam matematicamente válidas;
2. os tipos e shapes sejam compatíveis;
3. as operações respeitem a dimensionalidade dos dados;
4. as técnicas sejam compatíveis com a estrutura do dataset;
5. a execução seja reproduzível;
6. a origem de cada resultado possa ser rastreada.

---

## Princípio fundamental: o workflow é um grafo tipado

Uma conexão entre dois blocos não significa apenas:

```text
A → B
```

Ela significa:

```text
output específico de A
        ↓
input específico de B
```

Por isso, cada conexão possui explicitamente:

* nó de origem;
* porta de saída da origem;
* nó de destino;
* porta de entrada do destino.

Conceitualmente:

```text
[Dataset A]
    │
    └── output: X
             │
             ▼
        input: X
       [Transpose]
             │
             └── output: X
                      │
                      ▼
                 [PCA]
```

Para operações com múltiplas entradas:

```text
[Dataset A] ── output:X ──→ input:A
                              │
                              ▼
                           [Soma]
                              ▲
                              │
[Dataset B] ── output:X ──────┘
```

Essa distinção é fundamental para operações como:

* soma;
* subtração;
* multiplicação elemento a elemento;
* divisão;
* produto matricial;
* concatenação;
* operações entre datasets;
* combinação de matrizes de calibração e teste;
* operações matemáticas entre outputs de diferentes modelos.

---

# Anatomia de um script / bloco

Todo script no catálogo do TcheLab segue uma interface padronizada.

Um bloco declara:

```python
{
  "nome": "PARAFAC",

  "categoria": "07_decomposicao_multiway",

  "descricao": "Decomposição por análise de fatores paralelos para arrays N-way.",

  "input": {
    "X": {
      "tipo": "tensor",
      "min_order": 2,
      "max_order": None,
      "requires_sample_axis": None,
      "dtype": "float"
    }
  },

  "parametros": {
    "n_components": {
      "tipo": "int",
      "default": 3,
      "range": [1, 50]
    },

    "initialization": {
      "tipo": "str",
      "default": "svd",
      "opcoes": ["svd", "random", "dtld"]
    },

    "constraints": {
      "tipo": "list",
      "default": [],
      "opcoes": ["non_negativity", "unimodality"]
    },

    "max_iter": {
      "tipo": "int",
      "default": 2500
    },

    "tolerance": {
      "tipo": "float",
      "default": 1e-6
    }
  },

  "output": {
    "scores": {
      "tipo": "matrix",
      "shape": "(I, R)"
    },

    "loadings": {
      "tipo": "array",
      "descricao": "Uma matriz de loadings por modo."
    },

    "core_consistency": {
      "tipo": "float"
    },

    "explained_variance": {
      "tipo": "float"
    },

    "residuals": {
      "tipo": "tensor"
    }
  }
}
```

Esse contrato é declarado uma vez por script.

O frontend pode então descobrir:

* quais entradas o bloco possui;
* quais tipos são aceitos;
* quais shapes são aceitos;
* quais parâmetros existem;
* quais saídas existem;
* quais operações podem ser conectadas;
* quais ordens do array são suportadas;
* se o bloco exige eixo de amostras;
* se o bloco pode receber múltiplas conexões.

---

# Inputs e outputs nomeados

Cada bloco possui portas nomeadas.

Exemplo:

```text
Produto matricial

inputs:
    A
    B

output:
    result
```

Outro:

```text
PARAFAC

input:
    X

outputs:
    scores
    loadings
    residuals
    core_consistency
```

Outro:

```text
Divisão

inputs:
    numerator
    denominator

output:
    result
```

O workflow nunca deve depender apenas da posição física dos conectores no frontend.

A identidade lógica da conexão é dada pelas portas.

---

# Conexões entre blocos

A estrutura conceitual de uma aresta é:

```text
workflow_edge

source_node_id
source_output_key
target_node_id
target_input_key
```

Exemplo:

```text
Dataset A
    output: X
        │
        ▼
Transpose
    input: X
```

Representação:

```json
{
  "source_node_id": 10,
  "source_output_key": "X",
  "target_node_id": 15,
  "target_input_key": "X"
}
```

Para múltiplas entradas:

```json
{
  "source_node_id": 10,
  "source_output_key": "X",
  "target_node_id": 20,
  "target_input_key": "A"
}
```

e:

```json
{
  "source_node_id": 11,
  "source_output_key": "X",
  "target_node_id": 20,
  "target_input_key": "B"
}
```

O bloco 20 recebe:

```text
A ← Dataset 10
B ← Dataset 11
```

---

# Operações de dados versus técnicas de modelagem

O catálogo possui diferentes tipos de blocos.

Uma distinção importante é entre:

### Operações estruturais

Alteram a organização dos dados:

* transpose;
* permutação de eixos;
* reshape;
* unfolding;
* folding;
* slice;
* seleção;
* concatenação;
* stack.

### Operações matemáticas

Executam operações algébricas:

* soma;
* subtração;
* multiplicação;
* divisão;
* produto matricial;
* inversa;
* pseudo-inversa;
* determinante;
* autovalores;
* autovetores;
* SVD;
* norma;
* média;
* desvio padrão;
* operações elemento a elemento.

### Pré-processamento

Transformam os dados segundo métodos quimiométricos:

* SNV;
* MSC;
* Savitzky-Golay;
* baseline;
* centering;
* autoscaling;
* Pareto;
* etc.

### Modelagem

Executam algoritmos:

* PCA;
* PLS;
* PLS-DA;
* SIMCA;
* PARAFAC;
* Tucker;
* MCR-ALS;
* N-PLS;
* U-PLS;
* redes neurais;
* etc.

Essa separação é importante porque uma operação matemática pode ser usada como parte de praticamente qualquer workflow.

---

# Operações matriciais e tensoriais

O TcheLab deve permitir que o usuário manipule diretamente seus arrays antes, depois ou entre técnicas quimiométricas.

Exemplo simples:

```text
Dataset

shape = (3, 2)

[ 1  2 ]
[ 3  4 ]
[ 5  6 ]
```

Aplicando `Transpose`:

```text
axes = [1, 0]
```

Resultado:

```text
shape = (2, 3)

[ 1  3  5 ]
[ 2  4  6 ]
```

Para um tensor:

```text
shape = (I, J, K)
```

uma operação:

```text
Transpose
axes = [2, 0, 1]
```

produz:

```text
shape = (K, I, J)
```

A operação não precisa conhecer previamente se o array é 2D, 3D, 4D ou N-dimensional. Ela recebe uma permutação válida dos eixos.

---

# Operações que preservam, alteram ou reduzem a ordem

Cada operação deve declarar o efeito esperado sobre o shape.

Exemplos:

```text
Transpose
(3,2) → (2,3)

Reshape
(3,2) → (2,3)

Slice
(100,200,30) → (50,200,30)

Sum(axis=0)
(100,200,30) → (200,30)

Mean(axis=1)
(100,200,30) → (100,30)

Unfolding
(10,20,30) → (10,600)

Folding
(10,600) → (10,20,30)
```

Isso permite que o sistema atualize o metadata do resultado sem depender de execução para descobrir sua estrutura.

---

# Operações com múltiplas entradas

Operações que utilizam mais de um objeto possuem múltiplos inputs nomeados.

Exemplo:

```text
Soma

inputs:
    A
    B

output:
    result
```

Para:

```text
A.shape = (100,200)
B.shape = (100,200)
```

temos:

```text
A + B
```

com:

```text
result.shape = (100,200)
```

Se os shapes forem incompatíveis, o frontend bloqueia a conexão ou a execução.

O mesmo vale para produto matricial:

```text
A.shape = (100,20)
B.shape = (20,5)
```

Resultado:

```text
A @ B

shape = (100,5)
```

Mas:

```text
A.shape = (100,20)
B.shape = (30,5)
```

é inválido.

O erro deve ser explícito:

```text
Produto matricial inválido.

A possui shape (100,20).
B possui shape (30,5).

Para A @ B, a segunda dimensão de A
deve ser igual à primeira dimensão de B.
```

---

# Operações matemáticas com restrições

Cada operação declara suas próprias regras matemáticas.

## Inversa

Entrada:

```text
A.shape = (n,n)
```

Saída:

```text
A⁻¹.shape = (n,n)
```

Uma matriz não quadrada é rejeitada.

O TcheLab **não converte automaticamente** uma matriz não quadrada em pseudo-inversa.

Erro:

```text
Inversa exige uma matriz quadrada.

Entrada recebida:
shape = (3,2)

Utilize o bloco "Pseudo-inversa" se a intenção
for calcular a Moore-Penrose pseudoinverse.
```

---

## Pseudo-inversa

A pseudo-inversa é um bloco separado.

Aceita:

```text
A.shape = (m,n)
```

e produz:

```text
A⁺.shape = (n,m)
```

Pode ser aplicada a matrizes quadradas ou retangulares.

---

## Determinante

Exige:

```text
A.shape = (n,n)
```

Produz:

```text
det(A)
```

com saída escalar.

---

## Autovalores e autovetores

O bloco exige matriz quadrada:

```text
A.shape = (n,n)
```

Os autovalores são:

```text
λ.shape = (n,)
```

e os autovetores:

```text
V.shape = (n,n)
```

Quando o resultado for complexo, a representação da API/JSON será:

```json
{
  "real": [...],
  "imag": [...]
}
```

Internamente, o worker Python pode utilizar números complexos nativos, como `complex64` ou `complex128`.

A representação JSON existe apenas para garantir uma serialização explícita e compatível.

---

# Fórmula customizada

O TcheLab pode oferecer um bloco de fórmula customizada para operações matemáticas que não estejam no catálogo.

Exemplo:

```text
X * 2
```

ou:

```text
sqrt(X)
```

ou:

```text
(X - mean(X)) / std(X)
```

ou:

```text
A @ B
```

Entretanto, o sistema **não deve executar a expressão diretamente com `eval()`**.

O backend deve utilizar um parser seguro baseado em AST ou mecanismo equivalente com whitelist explícita.

A linguagem deve permitir somente operações declaradas pelo catálogo, por exemplo:

```text
+
-
*
/
**
@
sqrt()
log()
exp()
abs()
mean()
std()
min()
max()
transpose()
```

Não devem existir acesso a:

```text
os
subprocess
open
exec
eval
import
__import__
```

nem acesso arbitrário ao sistema de arquivos, rede ou processo.

A expressão é:

```text
texto
  ↓
parser
  ↓
AST validada
  ↓
whitelist
  ↓
executor matemático
  ↓
resultado
```

O usuário nunca executa código Python arbitrário no servidor.

---

# Dataset derivado

Uma operação realizada sobre um dataset cria um **resultado derivado**.

Exemplo:

```text
Dataset A
    │
    ▼
Transpose
    │
    ▼
Dataset B
```

O Dataset B deve manter a relação com o Dataset A.

Conceitualmente:

```text
Dataset B

parent_dataset_id = A
operation = transpose
parameters = {
    "axes": [1,0]
}
```

Isso cria uma linhagem:

```text
arquivo_original
      ↓
Dataset A
      ↓
Transpose
      ↓
Dataset B
      ↓
PCA
      ↓
Scores
```

O usuário deve poder consultar:

```text
"De onde veio este resultado?"
```

e o sistema deve conseguir reconstruir a cadeia.

---

# Resultados que não são datasets

Nem todo output deve ser armazenado como um novo dataset.

Exemplos:

```text
determinante → escalar

autovalores → vetor

core_consistency → escalar

R² → escalar

confusion_matrix → matriz de métricas

modelo PLS → objeto de modelo

scores → matriz

loadings → conjunto de matrizes
```

O schema de output deve informar a natureza do resultado.

Exemplo:

```json
{
  "tipo": "scalar",
  "dtype": "float"
}
```

ou:

```json
{
  "tipo": "vector",
  "dtype": "complex128"
}
```

ou:

```json
{
  "tipo": "matrix",
  "dtype": "float64"
}
```

ou:

```json
{
  "tipo": "tensor",
  "dtype": "float32"
}
```

ou:

```json
{
  "tipo": "model"
}
```

Isso permite que o frontend saiba se o resultado pode ser conectado a outro bloco.

---

# Ordem do array versus eixo de amostras

Um erro comum ao modelar pipelines de quimiometria é tratar "quantas dimensões tem o dado" como um número só.

O TcheLab trata duas propriedades separadamente.

## 1. Existe um eixo de amostras?

Em calibração clássica:

```text
amostras × variáveis
```

existe um eixo de amostras.

Em uma matriz aumentada usada pelo MCR-ALS, ou em um array único analisado como bloco, pode não existir.

## 2. Qual a ordem do array de uma medição?

Exemplos:

```text
espectro → ordem 1

EEM → ordem 2

cromatografia + EEM → ordem 3

cromatografia + excitação + emissão + decaimento
→ ordem 4
```

O eixo de amostras é tratado separadamente.

Um dataset pode ser:

```text
sample_axis = 0
data_order = 4
```

e possuir shape:

```text
(I, J, K, L, M)
```

onde:

```text
I = amostras
J..M = modos instrumentais
```

---

# Compatibilidade de ordem

Cada técnica declara:

```text
min_order
max_order
requires_sample_axis
```

Exemplo:

```text
PARAFAC

min_order = 2
max_order = NULL
requires_sample_axis = NULL
```

Isso significa:

```text
PARAFAC
2-way ✓
3-way ✓
4-way ✓
5-way ✓
10-way ✓
```

desde que a implementação consiga processar o array.

---

# Validação de conexões

O TcheLab realiza várias validações antes de permitir uma conexão.

## 1. Tipo

Exemplo:

```text
tensor → tensor
```

válido.

```text
model → tensor
```

normalmente inválido.

## 2. Shape

Exemplo:

```text
A = (100,20)
B = (20,5)

A @ B
```

válido.

## 3. Ordem

Exemplo:

```text
PARAFAC
min_order = 2
```

recebendo:

```text
order = 1
```

é inválido.

## 4. Eixo de amostras

Uma validação pode exigir:

```text
sample_axis != NULL
```

para validação cruzada.

## 5. Compatibilidade semântica

Mesmo que duas saídas tenham o mesmo shape, isso não significa necessariamente que sejam semanticamente compatíveis.

Por exemplo:

```text
scores PCA
shape = (100,5)
```

e:

```text
matriz espectral
shape = (100,5)
```

podem ter o mesmo shape, mas representar objetos diferentes.

O catálogo pode declarar restrições semânticas por meio de `technique_compatibilities`.

---

# Conexões válidas

```text
Dataset
    ↓
Transpose
    ↓
PCA
```

```text
Dataset A ──┐
            ├──→ Soma
Dataset B ──┘
```

```text
Dataset
    ↓
Unfolding
    ↓
U-PLS
```

```text
Dataset 4-way
    ↓
PARAFAC
    ├──→ scores
    ├──→ loadings
    └──→ residuals
```

```text
PARAFAC
    ↓
scores
    ↓
Regressão
```

---

# Conexões inválidas

```text
Dataset 6-way
    ↓
SNV
```

quando SNV aceita somente ordem 1.

```text
Matriz 3×2
    ↓
Inversa
```

inválido porque a matriz não é quadrada.

```text
Matriz 3×2
    ↓
Determinante
```

inválido.

```text
Matriz 3×2
    ↓
Autovalores
```

inválido.

```text
A(100×20) @ B(30×5)
```

inválido por incompatibilidade de dimensões internas.

---

# Exemplo de workflow matemático

```text
[Dataset A]
shape = (3,2)
      │
      ▼
[Transpose]
axes = [1,0]
      │
      ▼
[Dataset derivado]
shape = (2,3)
      │
      ▼
[Visualização]
```

Outro exemplo:

```text
[Dataset A]
shape = (100,20)
      │
      ├──────────────┐
      │              │
      ▼              ▼
 [Centering]     [SNV]
      │              │
      ▼              ▼
     PCA            PLS
      │              │
      └──────┬───────┘
             ▼
        [Comparação]
```

---

# Exemplo de workflow multi-input

```text
Dataset A (100×20)
        │
        │ output: X
        ▼
      ┌─────────┐
      │         │
      │  SOMA   │
      │         │
      └─────────┘
        ▲
        │ input: B
        │
Dataset B (100×20)
```

As duas conexões são diferentes:

```text
A.X → Soma.A
B.X → Soma.B
```

O frontend precisa representar visualmente essas portas.

---

# Exemplo de workflow completo

## Cenário: Quantificação de analitos em dados EEM

```text
[Importação]

data_order: 2
sample_axis: 0

        ↓

[Seleção de sensores]

        ↓

[PARAFAC]

n_components: 3

        ├──→ [Core Consistency]
        ├──→ [Perfis por modo]
        ├──→ [Resíduos]
        │
        └──→ [Calibração pseudo-univariada]
                    │
                    ├──→ [Figuras de mérito]
                    ├──→ [Predição]
                    └──→ [Relatório]
```

---

# Cenário: dados de ordem 4

```text
[Importação]

data_order = 4
sample_axis = 0

dimensions =
[
  samples,
  chromatographic_time,
  excitation,
  emission,
  phosphorescence_decay
]

        ↓

[Seleção]

        ↓

[PARAFAC]

        ├──→ [Core Consistency]
        ├──→ [Perfis modo 1]
        ├──→ [Perfis modo 2]
        ├──→ [Perfis modo 3]
        ├──→ [Perfis modo 4]
        │
        └──→ [Calibração]
```

O mesmo bloco PARAFAC é utilizado independentemente da ordem.

---

# Cenário: MCR-ALS com matriz aumentada

```text
[Importação]

data_order = 2
sample_axis = NULL

augmentation_scheme =
{
  "type": "augmented",
  "augmented_mode": "C&D",
  "n_blocks": 9
}

        ↓

[MCR-ALS]

        ├──→ [Perfis espectrais]
        ├──→ [Perfis aumentados]
        └──→ [Calibração]
```

O workflow não trata automaticamente essa matriz como um tensor ortogonal comum.

---

# Camada de IA sobre os workflows

O TcheLab possui uma camada de IA capaz de sugerir ou gerar workflows a partir de:

* texto livre;
* artigos;
* DOI;
* PDFs;
* datasets.

A IA identifica:

```text
Tipo de dado
Dimensionalidade
Eixo de amostras
Pré-processamento
Operações necessárias
Modelo
Hiperparâmetros
Validação
Métricas
Visualizações
```

A IA pode sugerir:

```text
PDF
 ↓
análise da metodologia
 ↓
workflow candidato
 ↓
validação estrutural
 ↓
workflow disponível no canvas
 ↓
usuário revisa
 ↓
execução
```

A IA **não deve gerar código arbitrário para execução**.

Ela deve gerar uma definição baseada nos blocos existentes no catálogo.

---

# Os mundos do frontend

## 1. Dados e operações

Dados · Transformações · Operações matemáticas · Estrutura de arrays

## 2. Pré-processamento

SNV · MSC · Savitzky-Golay · Baseline · Scaling

## 3. Modelagem 1D

Exploratória · Regressão · Classificação · Deep Learning

## 4. Modelagem Multiway

Decomposição · Regressão · Classificação · Calibração de ordem superior

## 5. Avaliação

Validação · Métricas · Diagnósticos · Visualização

## 6. Dados Sintéticos / IA

Geração de espectros · Dados multiway · Outliers · Interferentes · Difusão

---

# Princípios de design

## Reprodutibilidade

Cada execução registra:

* versão dos scripts;
* parâmetros;
* datasets;
* operações;
* seeds;
* ambiente;
* resultados.

## Modularidade

Um bloco pode ser substituído por outro desde que os contratos sejam compatíveis.

## Sem teto artificial de dimensionalidade

A arquitetura não deve assumir que o maior tensor possível é 3-way ou 4-way.

## Rastreabilidade

Todo resultado derivado deve permitir reconstruir sua origem.

## Segurança

Fórmulas customizadas não podem executar código arbitrário.

## Validação explícita

Operações matematicamente inválidas devem gerar erros claros em vez de conversões silenciosas.

## Comparação

Workflows podem ser clonados e executados com diferentes operações ou modelos para comparação.

## Separação entre estrutura e modelagem

O usuário pode manipular o array diretamente antes de aplicar qualquer técnica quimiométrica.

---

# Estado de um workflow

Um workflow pode possuir:

```text
draft
ready
running
completed
failed
archived
```

Alterações em um bloco intermediário podem marcar outputs downstream como:

```text
stale
```

ou:

```text
outdated
```

permitindo reexecução seletiva.

---

# Princípio final

O workflow do TcheLab não representa apenas uma sequência de modelos quimiométricos.

Ele representa uma **linguagem visual de operações científicas sobre dados**.

Um pipeline pode começar com:

```text
Importação
```

passar por:

```text
Transpose
Reshape
Slice
Soma
Centering
Unfolding
```

e somente então chegar a:

```text
PCA
PLS
PARAFAC
MCR-ALS
Tucker
```

Isso permite que o usuário construa explicitamente o caminho matemático utilizado na análise, mantendo a operação reproduzível e rastreável.
