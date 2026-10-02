# TcheLab — Requisitos da Plataforma

> Versão consolidada com decisões de arquitetura tomadas ao longo do projeto.
> Cada requisito indica as tabelas do banco (`database.md`), controllers da API (`api.md`) e scripts do catálogo (`catalogo_scripts.md`) que o implementam.

---

## Os 8 pilares do TcheLab

| # | Pilar | Descrição resumida |
|---|-------|--------------------|
| 1 | Dados | Importar e organizar dados 1D/multiway |
| 2 | Exploração | Visualizar e investigar os dados |
| 3 | Workflows | Construir análises visualmente |
| 4 | Artigos → Workflows | Transformar metodologia científica em análise executável |
| 5 | Modelos customizados | Combinar operações e salvar como novos modelos reutilizáveis |
| 6 | Projetos e organização | Organizar dados, workflows e resultados por projeto |
| 7 | Dados sintéticos | Gerar datasets para testes e validação |
| 8 | Rastreabilidade | Saber exatamente de onde veio cada resultado |

---

## 1. Gestão e Importação de Dados

### Requisitos

- Permitir inserção de dados 1D, 2D e multiway (N dimensões)
- Import inteligente: identificar automaticamente dimensões, número de amostras, variáveis, metadados e estrutura
- Suportar formatos XLSX e CSV inicialmente; formatos próprios para grandes matrizes posteriormente
- Associar dados a projetos com papel explícito (treino, validação, teste, calibração, previsão, referência)
- Manter informações de origem, versão e histórico (linhagem)

### Decisões de arquitetura

**Arrays N-way sem limite fixo.** O banco não impõe teto de dimensionalidade. `data_order` aceita qualquer valor; o `CHECK (1..20)` é proteção contra erro de digitação, não limite científico.

**Eixo de amostras e ordem analítica são propriedades independentes.**
- `sample_axis` — índice do modo que representa amostras (NULL se não existir)
- `data_order` — ordem de uma unidade de medição, excluindo o eixo de amostras

**O papel do dataset é contextual.** O mesmo dataset pode ser "calibração" em um projeto e "validação" em outro. O campo `purpose` fica em `project_datasets`, não em `datasets`.

**Arrays grandes ficam em storage externo** (Zarr preferido). O MySQL armazena apenas metadados e `storage_path`.

**Import inteligente.** O `POST /datasets/import` detecta automaticamente shape, dtype e `mode_labels` candidatos, retorna uma proposta para o usuário confirmar e então persiste.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `datasets`, `dataset_lineage`, `spectra`, `collections`, `collection_spectra`, `dataset_spectra`, `project_datasets` |
| Controllers | `dataset.controller.js`, `spectrum.controller.js`, `collection.controller.js` |
| Scripts | Família 01 (importacao, limpeza, tratamento_missing, selecao_amostras, selecao_variaveis) |

---

## 2. Exploração e Visualização dos Dados

### Requisitos

- Navegação livre pelas matrizes e tensores
- Visualizações adequadas à dimensionalidade
- Visualizar amostras, variáveis, espectros, mapas, matrizes e cortes de tensores
- Selecionar amostras/variáveis diretamente nas visualizações
- Aplicar filtros e consultar metadados
- Comparar diferentes conjuntos ou grupos de amostras
- Visualizações específicas para dados multiway (futuramente)

### Decisões de arquitetura

**Slice e preview via API.** O frontend não carrega o tensor inteiro. O endpoint `GET /datasets/:id/slice` retorna fatias parametrizadas por ranges de eixos. `GET /datasets/:id/preview` retorna as primeiras N amostras.

**Scripts de visualização retornam dados, não imagens.** A família 17 do catálogo retorna JSON estruturado (`{series, points, axes, labels}`). O frontend renderiza com a biblioteca de gráficos de sua escolha.

**`tensor_profiles` funciona dinamicamente.** Um tensor de ordem N gera N conjuntos de perfis — sem código específico para "3D" ou "4D".

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `datasets`, `spectra`, `collections` |
| Controllers | `dataset.controller.js` (slice, preview), `spectrum.controller.js` (plot) |
| Scripts | Família 17 (spectra, scores, loadings, biplot, heatmap, 3d_surface, contour, tensor_profiles, parafac_profiles, mcr_profiles, augmented_profiles) |

---

## 3. Workflow de Análise

### Requisitos

- Construir análises por drag-and-drop
- Catálogo de técnicas organizadas por categoria
- Cada análise funciona como bloco com entradas, parâmetros e saídas bem definidas
- Encadear blocos (ex: Dados → SNV → PCA → Classificação → Métricas)
- Impedir ou alertar sobre ligações incompatíveis
- Editar parâmetros de cada etapa
- Executar o workflow completo ou etapas individuais
- Registrar resultados e parâmetros em cada execução

### Decisões de arquitetura

**Grafo tipado.** Uma conexão identifica porta de saída e porta de entrada explicitamente — não apenas nó a nó. Isso é necessário para blocos com múltiplas entradas (soma, matmul) e múltiplas saídas (SVD, PARAFAC, EIG).

**Validação em camadas.** A `ShapeValidatorService` valida tipo, shape, ordem analítica, eixo de amostras e compatibilidade semântica. Erros são explícitos e acionáveis — nunca silenciosos.

**Execução por ordem topológica.** O worker processa os nós em ordem garantindo que as dependências estejam satisfeitas antes de cada nó.

**Reexecução seletiva.** Após alterar um nó intermediário, o sistema pode reexecutar a partir daquele nó reutilizando os outputs dos nós anteriores já computados.

**Snapshot `definition`.** O campo `workflows.definition` mantém um snapshot JSON do grafo completo para reconstituição rápida no frontend. As tabelas normalizadas são a fonte de verdade para execução.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `workflows`, `workflow_nodes`, `workflow_edges`, `workflow_versions`, `executions`, `execution_nodes`, `metrics`, `technique_compatibilities` |
| Controllers | `workflow.controller.js`, `workflowNode.controller.js`, `workflowEdge.controller.js`, `execution.controller.js`, `technique.controller.js`, `metric.controller.js` |
| Scripts | Todas as famílias do catálogo |
| Services | `ShapeValidatorService` (validação de arestas) |

---

## 4. Artigos Científicos → Workflows

### Requisitos

- Inserir artigos por DOI ou PDF
- IA identifica: dados utilizados, pré-processamentos, métodos, parâmetros, sequência metodológica, entradas e saídas
- Converter metodologia em workflow sugerido
- Mapear etapas do artigo para modelos disponíveis no catálogo
- Pesquisador edita e valida o workflow antes da execução
- Registrar referência científica associada ao workflow

### Decisões de arquitetura

**A IA não gera código.** Ela produz uma definição de grafo usando exclusivamente blocos do catálogo. O worker executa apenas scripts declarados.

**Rastreabilidade da geração.** `workflow_node_origins` liga cada nó gerado à técnica identificada no artigo (`article_techniques`), que por sua vez registra o trecho do texto que originou a identificação.

**Extração de texto é separada da análise.** O PDF é processado em um primeiro job (extração de texto → `full_text_path`). A análise da IA usa o texto já extraído — sem reprocessar o PDF.

**`dimensionality_detected` sem limite fixo.** A dimensionalidade detectada é `TINYINT UNSIGNED NULL` — o mesmo princípio N-way do restante do sistema.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `articles`, `article_analyses`, `article_techniques`, `workflow_node_origins`, `ai_interactions` |
| Controllers | `article.controller.js`, `articleAnalysis.controller.js`, `workflow.controller.js`, `aiInteraction.controller.js` |
| Jobs | `analyze_article`, `generate_workflow` |

---

## 5. Operações Matemáticas e Modelos Customizados

### Requisitos

- Operações matemáticas pré-existentes: inversão, transposição, multiplicação, soma/subtração, normalizações, funções, operações condicionais, seleção/concatenação/empilhamento de dimensões
- Combinar operações em sequência
- Operar sobre dimensões específicas de dados multiway
- Criar regras matemáticas/condicionais personalizadas
- Salvar sequência de operações como Modelo Customizado
- Modelo Customizado aparece no catálogo como qualquer outro bloco
- Aplicar modelo a novos dados reproduzindo exatamente a sequência original
- Armazenar definição, parâmetros e versão

### Decisões de arquitetura

**Operações são blocos de primeira classe.** Não são utilitários internos — são técnicas no catálogo com contratos explícitos, validação e rastreabilidade iguais a qualquer modelo quimiométrico.

**Modelos customizados vivem na tabela `techniques`.** `is_custom=1`, `user_id=<dono>`, `custom_definition=<cadeia de operações>`. Aparecem no catálogo filtráveis por `is_custom`.

**`formula_customizada` usa parser seguro.** Nunca `eval()`. Sempre: `expressão → parser AST → whitelist → executor`. Operadores permitidos são declarados explicitamente. Sem acesso a filesystem, rede ou módulos Python.

**Inversão não vira pseudo-inversa automaticamente.** São blocos distintos com restrições matemáticas distintas. Erros são explícitos com sugestão do bloco correto.

**Parâmetros de pré-processamento são persistidos.** `mean_`, `std_`, `scale_` e similares são salvos no output do nó e referenciados no modelo, permitindo aplicação exata a novos dados.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `techniques` (is_custom, user_id, custom_definition), `models`, `predictions` |
| Controllers | `technique.controller.js` (createCustomTechnique), `prediction.controller.js` |
| Scripts | Família 01 completa (todas as operações matemáticas e estruturais) |
| Services | `FormulaParserService` (parser AST + whitelist) |

---

## 6. Organização de Projetos e Experimentos

### Requisitos

- Organizar dados por projeto
- Dentro de cada projeto: datasets, experimentos, workflows, modelos, resultados, artigos, arquivos
- Identificar claramente o papel de cada dataset: treinamento, validação, teste, calibração, previsão, referência
- Manter histórico das análises
- Rastrear dado → workflow → modelo → resultado
- Versionamento de workflows e modelos

### Decisões de arquitetura

**Projetos são entidade própria.** Separados de comunidades. Um projeto é a unidade de trabalho científico; uma comunidade é o grupo social que compartilha projetos.

**Comunidade compartilha projetos.** A tabela `community_projects` liga comunidades a projetos. Isso permite que um professor crie uma comunidade "Aula de Quimiometria", adicione um projeto com datasets e workflows, e os alunos (membros da comunidade) tenham acesso.

**Um projeto pode estar em múltiplas comunidades.** E uma comunidade pode ter múltiplos projetos.

**`purpose` é contextual.** O mesmo dataset pode ter papéis diferentes em projetos distintos. O campo fica em `project_datasets.purpose`, não em `datasets`.

**Versionamento explícito de workflows.** `workflow_versions` armazena snapshots com label, descrição e `definition`. Restauração salva snapshot automático antes de sobrescrever.

**Histórico do projeto.** `GET /projects/:id/history` retorna execuções associadas via datasets e workflows do projeto, em ordem cronológica.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `projects`, `project_members`, `project_datasets`, `project_workflows`, `project_articles`, `communities`, `community_members`, `community_projects`, `workflow_versions` |
| Controllers | `project.controller.js`, `community.controller.js`, `workflow.controller.js` (versions) |

---

## 7. Geração de Dados Sintéticos

### Requisitos

- Módulo específico para geração de dados sintéticos
- Inicialmente: espectros por gaussianas
- Controlar parâmetros da geração
- Gerar conjuntos de amostras automaticamente
- Salvar dados gerados como datasets normais
- Usar dados sintéticos diretamente em workflows
- Futuramente: modelos estatísticos, VAE, GAN, difusão, dados multiway

### Decisões de arquitetura

**Geração é assíncrona.** O controller enfileira um job (`operate_dataset` com sub-tipo de geração) e retorna `job_id`. Quando concluído, o job cria um dataset normal — visível em `datasets`, associável a projetos, usável em workflows.

**Scripts de geração são família 18 do catálogo.** Aparecem como blocos no catálogo e podem ser instanciados em workflows (ex: gerar dados sintéticos → aplicar pré-processamento → treinar modelo).

**Estrutura preparada para modelos avançados.** Os parâmetros dos scripts `synthetic_multiway` e `diffusion_generation` estão estruturados para receber modelos mais sofisticados no futuro sem mudança de interface.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `datasets`, `jobs` |
| Controllers | `synthetic.controller.js` |
| Scripts | Família 18 (synthetic_spectra, synthetic_eem, synthetic_chromatography, synthetic_multiway, synthetic_phosphorescence, noise_generation, outlier_generation, interferent_generation, shift_simulation, diffusion_generation) |
| Jobs | `operate_dataset` (sub-tipos de geração) |

---

## 8. Reprodutibilidade e Rastreabilidade

### Requisitos

- Registrar todas as etapas executadas
- Registrar parâmetros dos modelos
- Registrar versão dos dados utilizados
- Registrar versão dos modelos
- Registrar resultados
- Permitir reproduzir uma análise anteriormente executada
- Manter histórico de alterações nos workflows
- Identificar exatamente como um resultado foi produzido

### Decisões de arquitetura

**Linhagem de datasets em dois níveis:**
1. Atalho inline: `datasets.parent_dataset_id` + `derived_from_operation` + `derived_parameters`
2. Registro completo: `dataset_lineage` com referência ao workflow, nó e execução

**Execução registra tudo.** `executions` guarda `random_seed`, `code_version` e `environment` (versões de numpy, tensorly, sklearn…). `execution_nodes` guarda parâmetros efetivamente usados e metadados de input/output por porta.

**`workflow_node_origins` rastreia a IA.** Quando um workflow é gerado a partir de um artigo, cada nó tem rastreabilidade até o trecho do artigo que o originou.

**Comparação de execuções.** `execution_comparisons` + `execution_comparison_items` permite comparar execuções lado a lado (ex: PLS 3 vs 5 componentes) com conclusão registrada pelo pesquisador.

**Reexecução idempotente.** `POST /executions/:id/rerun` cria nova execução com os mesmos parâmetros, com `parent_execution_id` apontando para a original.

**Auditoria.** `audit_logs` registra ações relevantes com estado antes e depois para entidades críticas.

### Implementação

| Componente | Referência |
|-----------|-----------|
| Tabelas | `dataset_lineage`, `executions`, `execution_nodes`, `execution_comparisons`, `execution_comparison_items`, `workflow_versions`, `workflow_node_origins`, `audit_logs` |
| Controllers | `execution.controller.js`, `executionComparison.controller.js`, `dataset.controller.js` (lineage), `audit.controller.js` |
| Services | `LineageService` (registro de linhagem) |

---

## Mapa completo: Requisito × Tabelas × Controllers × Scripts

| Requisito | Tabelas principais | Controllers | Famílias de scripts |
|-----------|-------------------|-------------|---------------------|
| 1 — Dados | datasets, dataset_lineage, spectra, collections, project_datasets | dataset, spectrum, collection | 01 |
| 2 — Exploração | datasets, spectra, collections | dataset (slice/preview), spectrum (plot) | 17 |
| 3 — Workflows | workflows, workflow_nodes, workflow_edges, executions, execution_nodes, metrics | workflow, workflowNode, workflowEdge, execution, technique, metric | 01–20 |
| 4 — Artigos → IA | articles, article_analyses, article_techniques, workflow_node_origins, ai_interactions | article, articleAnalysis, aiInteraction | — |
| 5 — Modelos customizados | techniques (is_custom), models, predictions | technique (custom), prediction | 01 |
| 6 — Projetos | projects, project_members, project_datasets, project_workflows, community_projects, workflow_versions | project, community | — |
| 7 — Sintéticos | datasets, jobs | synthetic | 18 |
| 8 — Rastreabilidade | dataset_lineage, executions, execution_nodes, execution_comparisons, workflow_versions, audit_logs | execution, executionComparison, dataset (lineage), audit | — |

---

## Services obrigatórios desde o início

| Service | Responsabilidade | Usado por |
|---------|-----------------|-----------|
| `ShapeValidatorService` | Valida compatibilidade de portas: tipo, shape, ordem, eixo de amostras, compatibilidade semântica | `WorkflowEdgeController` (ao salvar aresta), worker de execução (antes de rodar nó) |
| `LineageService` | Registra linhagem em `dataset_lineage` quando um nó produz um dataset derivado | `DatasetController` (operação avulsa), worker de execução |
| `FormulaParserService` | Parser AST + whitelist para `formula_customizada`. Nunca `eval()` | Worker de execução (nós com slug `formula_customizada`) |

---

## Convenções globais

### Números complexos
JSON não tem tipo complexo nativo. O TcheLab serializa como:
```json
{"real": [1.2, 2.1], "imag": [0.0, -1.2]}
```
Internamente o worker Python usa `complex64` ou `complex128`.

### Soft delete
Entidades com `deleted_at` não aparecem em listagens. Não são removidas do banco para preservar rastreabilidade.

### IDs e UUIDs
Toda entidade principal tem `id` (auto-increment interno) e `uuid` (CHAR 36, exposto pela API). O frontend usa UUIDs; o banco usa IDs inteiros em chaves estrangeiras.

### Jobs assíncronos
Operações longas (execução de workflow, análise de artigo, geração de dados, treinamento de modelo) são sempre assíncronas. Controllers retornam `202 Accepted` com `{job_id}`. O cliente consulta `GET /jobs/:id` para acompanhar progresso.

### Pré-processamento e modelos
Parâmetros aprendidos no pré-processamento (`mean_`, `std_`, `scale_`) são salvos no output do nó e referenciados no modelo. Isso garante que novos dados sejam transformados com exatamente os mesmos parâmetros do treinamento.