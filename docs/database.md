# TcheLab — Documentação do Banco de Dados

> Versão: v6
> Engine: MySQL 8.0+
> Charset: utf8mb4_unicode_ci
> Última revisão: alinhado com api.md, requisitos.md, workflow.md e catalogo_scripts.md

---

## Visão geral

```
USUÁRIOS
    │
    ├── COMUNIDADES
    │       ├── community_members
    │       ├── community_projects      ← comunidade compartilha projetos
    │       ├── community_datasets
    │       ├── community_workflows
    │       └── messages
    │
    ├── PROJETOS                        ← organização central do trabalho
    │       ├── project_members
    │       ├── project_datasets        ← dataset + papel (calibração, validação…)
    │       ├── project_workflows
    │       └── project_articles
    │
    ├── DADOS
    │       ├── spectra
    │       ├── collection_spectra
    │       ├── collections
    │       ├── datasets
    │       │       └── dataset_lineage
    │       └── dataset_spectra
    │
    ├── ARTIGOS & IA
    │       ├── articles
    │       ├── article_analyses
    │       ├── article_techniques
    │       └── ai_interactions
    │
    ├── CATÁLOGO
    │       ├── techniques
    │       └── technique_compatibilities
    │
    ├── WORKFLOWS
    │       ├── workflow_nodes
    │       ├── workflow_edges
    │       ├── workflow_node_origins
    │       ├── workflow_versions       ← versionamento explícito
    │       └── workflow_templates
    │
    └── EXECUÇÕES
            ├── executions
            ├── execution_nodes
            ├── execution_comparisons
            ├── execution_comparison_items
            ├── metrics
            ├── models
            ├── predictions
            └── jobs

audit_logs  (transversal)
```

---

## Decisões fundamentais

### Arrays N-way de ordem arbitrária

O banco não possui limite estrutural de dimensionalidade. `data_order` aceita qualquer valor; o `CHECK (1..20)` é apenas proteção contra erro de digitação, não limite científico.

### Eixo de amostras vs. ordem analítica

São propriedades independentes:
- `sample_axis` — índice do modo que representa amostras (NULL se não existir)
- `data_order` — ordem analítica de uma unidade de medição, excluindo o eixo de amostras

### Purpose do dataset é contextual

O papel de um dataset (calibração, validação, teste…) não é uma propriedade do dataset em si, mas do contexto em que ele é usado dentro de cada projeto. Por isso fica em `project_datasets.purpose`, não em `datasets`.

### Projetos vs. Comunidades

- **Projeto** — unidade de trabalho científico de um grupo ou pesquisador. Agrupa datasets, workflows, artigos, resultados.
- **Comunidade** — grupo social (laboratório, turma, equipe). Compartilha projetos (e opcionalmente datasets e workflows avulsos) com seus membros.
- Um projeto pode estar em múltiplas comunidades. Uma comunidade pode ter múltiplos projetos.

### Modelos customizados

Aparecem no catálogo de técnicas como qualquer outro bloco (`is_custom = 1`). A definição da cadeia de operações fica em `techniques.custom_definition`.

---

## Domínio 1 — Usuários

### `users`

Tabela central. Contadores `stat_*` são desnormalizados para evitar `COUNT()` frequentes.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `name` | VARCHAR(255) NOT NULL | |
| `initials` | VARCHAR(20) | |
| `email` | VARCHAR(255) UNIQUE NOT NULL | |
| `password_hash` | VARCHAR(255) NOT NULL | |
| `bio` | TEXT | |
| `research_area` | VARCHAR(255) | |
| `institution` | VARCHAR(255) | |
| `birth_date` | DATE | |
| `lattes_url` | VARCHAR(500) | |
| `linkedin_url` | VARCHAR(500) | |
| `github_url` | VARCHAR(500) | |
| `avatar_url` | VARCHAR(1000) | |
| `cover_color` | VARCHAR(100) DEFAULT 'gradient-primary' | |
| `stat_models` | INT UNSIGNED DEFAULT 0 | |
| `stat_analyses` | INT UNSIGNED DEFAULT 0 | |
| `stat_datasets` | INT UNSIGNED DEFAULT 0 | |
| `stat_public_analyses` | INT UNSIGNED DEFAULT 0 | |
| `stat_private_analyses` | INT UNSIGNED DEFAULT 0 | |
| `email_verified_at` | DATETIME | |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `role` | ENUM('user','admin','moderator') DEFAULT 'user' | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | Soft delete |

---

## Domínio 2 — Comunidades

### `communities`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `owner_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### `community_members`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `community_id` | BIGINT UNSIGNED FK → communities | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `role` | ENUM('member','moderator','admin') DEFAULT 'member' | |
| `joined_at` | DATETIME | |
| UNIQUE | `(community_id, user_id)` | |

### `community_projects`

Liga comunidades a projetos. Um projeto pode ser visível em múltiplas comunidades.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `community_id` | BIGINT UNSIGNED FK → communities | |
| `project_id` | BIGINT UNSIGNED FK → projects | |
| `shared_by` | BIGINT UNSIGNED FK → users | |
| `shared_at` | DATETIME | |
| UNIQUE | `(community_id, project_id)` | |

### `community_datasets`

Compartilhamento avulso de datasets (fora de projetos).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `community_id` | BIGINT UNSIGNED FK → communities | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets | |
| `shared_by` | BIGINT UNSIGNED FK → users | |
| `shared_at` | DATETIME | |
| UNIQUE | `(community_id, dataset_id)` | |

### `community_workflows`

Compartilhamento avulso de workflows.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `community_id` | BIGINT UNSIGNED FK → communities | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `shared_by` | BIGINT UNSIGNED FK → users | |
| `shared_at` | DATETIME | |
| UNIQUE | `(community_id, workflow_id)` | |

### `messages`

Chat por comunidade.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `community_id` | BIGINT UNSIGNED FK → communities | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `content` | TEXT NOT NULL | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | Soft delete |

---

## Domínio 3 — Projetos

Organização central do trabalho científico (Requisito 6).

### `projects`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | Criador / owner |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `status` | ENUM('active','archived') DEFAULT 'active' | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | Soft delete |

### `project_members`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `project_id` | BIGINT UNSIGNED FK → projects | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `role` | ENUM('viewer','editor','admin') DEFAULT 'viewer' | |
| `joined_at` | DATETIME | |
| UNIQUE | `(project_id, user_id)` | |

### `project_datasets`

Associa datasets a projetos com papel explícito. O mesmo dataset pode ter papéis diferentes em projetos distintos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `project_id` | BIGINT UNSIGNED FK → projects | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets | |
| `purpose` | ENUM('training','validation','test','calibration','prediction','reference','other') NOT NULL | Papel do dataset neste projeto |
| `added_by` | BIGINT UNSIGNED FK → users | |
| `added_at` | DATETIME | |
| UNIQUE | `(project_id, dataset_id)` | |

### `project_workflows`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `project_id` | BIGINT UNSIGNED FK → projects | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `added_by` | BIGINT UNSIGNED FK → users | |
| `added_at` | DATETIME | |
| UNIQUE | `(project_id, workflow_id)` | |

### `project_articles`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `project_id` | BIGINT UNSIGNED FK → projects | |
| `article_id` | BIGINT UNSIGNED FK → articles | |
| `added_by` | BIGINT UNSIGNED FK → users | |
| `added_at` | DATETIME | |
| UNIQUE | `(project_id, article_id)` | |

---

## Domínio 4 — Dados

### `spectra`

Espectros individuais 1D. Unidade atômica de dado.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `sample_class` | VARCHAR(255) | Classe/grupo da amostra |
| `technique` | ENUM('NIR','Raman','FTIR','UV-Vis','NMR','Fluorescence','Other') | |
| `x_unit` | VARCHAR(50) | Ex: nm, cm⁻¹, ppm |
| `y_unit` | VARCHAR(100) | Ex: Absorbance, Intensity |
| `x_values` | JSON NOT NULL | Vetor de eixo X |
| `y_values` | JSON NOT NULL | Vetor de intensidades |
| `x_points` | INT UNSIGNED NOT NULL | Número de pontos |
| `x_min` | DOUBLE | |
| `x_max` | DOUBLE | |
| `reference_value` | DOUBLE | Valor de referência único |
| `reference_values` | JSON | Valores de referência múltiplos |
| `metadata` | JSON | Campos livres adicionais |
| `source` | ENUM('file','paste','api') DEFAULT 'file' | |
| `source_filename` | VARCHAR(500) | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | |

### `collections`

Agrupamento informal de espectros.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `spectra_count` | INT UNSIGNED DEFAULT 0 | Desnormalizado |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | |

### `collection_spectra`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `collection_id` | BIGINT UNSIGNED FK → collections | |
| `spectrum_id` | BIGINT UNSIGNED FK → spectra | |
| `added_at` | DATETIME | |
| UNIQUE | `(collection_id, spectrum_id)` | |

### `datasets`

Estrutura principal para dados científicos multidimensionais. Suporta arrays N-way de ordem arbitrária. Os dados numéricos ficam em storage externo (Zarr/HDF5); este registro armazena apenas metadados e referência.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `data_type` | ENUM('matrix','tensor') DEFAULT 'matrix' | |
| `technique` | VARCHAR(100) | Ex: NIR, EEM, LC-DAD |
| `x_unit` | VARCHAR(50) | Para datasets matriciais simples |
| `y_unit` | VARCHAR(100) | |
| `spectra_count` | INT UNSIGNED DEFAULT 0 | Apenas para datasets matriciais |
| `x_points` | INT UNSIGNED | |
| `x_min` | DOUBLE | |
| `x_max` | DOUBLE | |
| `dtype` | VARCHAR(50) | Tipo numérico: float32, float64, complex128… |
| `dimensions` | JSON | Shape completo incluindo eixo de amostras. Ex: [9,17,19,10,5] |
| `mode_labels` | JSON | Nome de cada modo na ordem de dimensions. Ex: ["samples","excitation","emission"] |
| `mode_ranges` | JSON | Range [first,last,step] por modo |
| `sample_axis` | TINYINT UNSIGNED NULL | Índice (0-based) do modo de amostras. NULL = sem eixo de amostras (ex: matriz aumentada MCR-ALS) |
| `data_order` | TINYINT UNSIGNED DEFAULT 1 | Ordem analítica de uma medição, excluindo o eixo de amostras. CHECK (1..20) é proteção contra digitação — não é limite científico |
| `augmentation_scheme` | JSON NULL | Descreve dados concatenados/não ortogonais. Ex: `{"type":"augmented","augmented_mode":"C&D","n_blocks":9}`. NULL para arrays regulares |
| `reference_labels` | JSON | Nomes das variáveis alvo. Ex: ["analyte_1","analyte_2"] |
| `file_format` | VARCHAR(50) | Formato original do arquivo importado |
| `storage_path` | VARCHAR(1000) | Caminho no storage externo (S3/disco/Zarr) |
| `parent_dataset_id` | BIGINT UNSIGNED FK → datasets NULL | Dataset de origem (atalho de conveniência — linhagem completa em dataset_lineage) |
| `derived_from_operation` | VARCHAR(100) | Slug da operação que gerou este dataset. Ex: transpose, unfolding |
| `derived_parameters` | JSON | Parâmetros da operação geradora. Ex: `{"axes": [1, 0]}` |
| `metadata` | JSON | Campos livres adicionais |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | |

**Constraints:**
```sql
CHECK (data_order BETWEEN 1 AND 20)
CHECK (sample_axis IS NULL OR sample_axis <= 20)
```

### `dataset_lineage`

Registro completo de linhagem entre datasets. Permite responder "De onde veio este dataset?" e "Quais resultados dependem deste dataset?".

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `source_dataset_id` | BIGINT UNSIGNED FK → datasets | Dataset de entrada |
| `target_dataset_id` | BIGINT UNSIGNED FK → datasets | Dataset produzido |
| `operation` | VARCHAR(100) NOT NULL | Slug da operação. Ex: transpose, reshape, unfolding, soma |
| `parameters` | JSON | Parâmetros usados. Ex: `{"axes": [1,0]}` |
| `workflow_id` | BIGINT UNSIGNED FK → workflows NULL | Workflow que gerou a transformação |
| `workflow_node_id` | BIGINT UNSIGNED FK → workflow_nodes NULL | Nó específico responsável |
| `execution_id` | BIGINT UNSIGNED FK → executions NULL | Execução em que ocorreu |
| `created_at` | DATETIME | |
| UNIQUE | `(source_dataset_id, target_dataset_id, operation)` | |

### `dataset_spectra`

Associa espectros individuais a posições em datasets matriciais.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets | |
| `spectrum_id` | BIGINT UNSIGNED FK → spectra | |
| `position` | INT UNSIGNED NOT NULL | Índice de linha no dataset |
| `added_at` | DATETIME | |
| UNIQUE | `(dataset_id, spectrum_id)` | |
| UNIQUE | `(dataset_id, position)` | |

---

## Domínio 5 — Artigos e IA

### `articles`

Metadados bibliográficos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `doi` | VARCHAR(500) | |
| `title` | TEXT | |
| `abstract` | TEXT | |
| `authors` | JSON | Lista de autores |
| `journal` | VARCHAR(500) | |
| `publisher` | VARCHAR(255) | |
| `publication_date` | DATE | |
| `url` | VARCHAR(1000) | |
| `pdf_path` | VARCHAR(1000) | Caminho no storage |
| `full_text_path` | VARCHAR(1000) | Texto extraído do PDF — reutilizado sem reprocessar |
| `extraction_status` | ENUM('pending','extracted','failed') DEFAULT 'pending' | Status da extração de texto |
| `metadata` | JSON | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### `article_analyses`

Uma análise de um artigo realizada pela IA.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `article_id` | BIGINT UNSIGNED FK → articles | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `status` | ENUM('pending','processing','completed','failed') DEFAULT 'pending' | |
| `model` | VARCHAR(255) | Modelo de IA usado |
| `summary` | TEXT | Resumo da metodologia |
| `methodology` | JSON | Metodologia estruturada identificada |
| `raw_response` | LONGTEXT | Resposta bruta da IA |
| `error_message` | TEXT | |
| `generated_workflow_id` | BIGINT UNSIGNED FK → workflows NULL | Workflow gerado a partir desta análise |
| `data_type_detected` | VARCHAR(100) | Ex: EEM, NIR, LC-DAD, LC-EEM-Phosphorescence |
| `dimensionality_detected` | TINYINT UNSIGNED | Ordem analítica detectada — sem limite superior fixo |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### `article_techniques`

Técnicas identificadas pela IA no artigo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `article_analysis_id` | BIGINT UNSIGNED FK → article_analyses | |
| `technique_id` | BIGINT UNSIGNED FK → techniques | |
| `step_order` | INT UNSIGNED | Ordem na sequência metodológica |
| `parameters` | JSON | Parâmetros identificados no texto |
| `evidence` | TEXT | Justificativa da identificação |
| `confidence` | FLOAT | Confiança da IA (0.0 a 1.0) |
| `raw_text` | TEXT | Citação exata do texto que originou a identificação |
| `mapping_notes` | TEXT | Raciocínio ao mapear o texto para a técnica do catálogo |
| `created_at` | DATETIME | |

### `ai_interactions`

Interações com IA além da análise de artigos: assistência a workflows, sugestões de hiperparâmetros, interpretação de resultados.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `type` | ENUM('article_analysis','workflow_generation','workflow_assistance','result_analysis','other') | |
| `article_id` | BIGINT UNSIGNED FK → articles NULL | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows NULL | |
| `execution_id` | BIGINT UNSIGNED FK → executions NULL | |
| `input_context` | JSON | Contexto enviado para a IA |
| `output` | LONGTEXT | Resposta da IA |
| `model` | VARCHAR(255) | Modelo de IA usado |
| `created_at` | DATETIME | |

---

## Domínio 6 — Catálogo de Técnicas

### `techniques`

Catálogo dos blocos executáveis. Inclui técnicas nativas e modelos customizados de usuários.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `slug` | VARCHAR(255) UNIQUE NOT NULL | Identificador único. Ex: parafac, snv, transpose |
| `name` | VARCHAR(255) NOT NULL | Nome legível |
| `category` | ENUM('input','preprocessing','exploratory','regression','classification','multiway','multiway_regression','multiway_classification','calibration','interferents','deep_learning','visualization','validation','variable_selection','optimization','synthetic','calibration_transfer','sensor_fusion','utility','other') | |
| `subcategory` | VARCHAR(100) | Subcategoria livre |
| `family` | VARCHAR(50) | Família do catálogo. Ex: 07_decomposicao_multiway |
| `description` | TEXT | O que o script faz |
| `input_type` | VARCHAR(100) | Tipo genérico de entrada (Matrix, Tensor, Model…) — para filtragem rápida |
| `output_type` | VARCHAR(100) | Tipo genérico de saída |
| `input_schema` | JSON | Schema detalhado das portas de entrada: `{port: {tipo, min_order, max_order, requires_sample_axis, dtype}}` |
| `output_schema` | JSON | Schema detalhado das portas de saída: `{port: {tipo, shape_formula, dtype}}` |
| `parameter_schema` | JSON | Schema dos parâmetros: `{param: {tipo, default, range, opcoes}}` |
| `min_order` | TINYINT UNSIGNED NULL | Ordem analítica mínima suportada (excluindo eixo de amostras). NULL = sem mínimo |
| `max_order` | TINYINT UNSIGNED NULL | Ordem analítica máxima suportada. NULL = sem teto (ex: PARAFAC aceita N-way arbitrário) |
| `requires_sample_axis` | TINYINT(1) NULL | Tri-state: 1=exige, 0=opera sem eixo de amostras, NULL=indiferente |
| `tags` | JSON | Tags para busca semântica. Ex: ["EEM","fluorescence","N-way"] |
| `version` | VARCHAR(20) | Versão do script |
| `is_beta` | TINYINT(1) DEFAULT 0 | Técnica experimental |
| `is_custom` | TINYINT(1) DEFAULT 0 | 1 = criado por usuário; 0 = técnica nativa do catálogo |
| `user_id` | BIGINT UNSIGNED FK → users NULL | Dono do modelo customizado (NULL para técnicas nativas) |
| `custom_definition` | JSON NULL | Cadeia de operações do modelo customizado. Ex: `[{"slug":"snv"},{"slug":"centering"},{"slug":"pls","params":{"n_components":3}}]` |
| `implementation` | VARCHAR(500) | Caminho do script Python que implementa a técnica |
| `documentation` | TEXT | |
| `active` | TINYINT(1) DEFAULT 1 | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Constraints:**
```sql
CHECK (max_order IS NULL OR max_order BETWEEN 1 AND 20)
CHECK (min_order IS NULL OR min_order BETWEEN 1 AND 20)
CHECK (max_order IS NULL OR min_order IS NULL OR max_order >= min_order)
```

**Exemplos de min_order / max_order / requires_sample_axis:**

| Técnica | min | max | sample_axis |
|---------|-----|-----|-------------|
| SNV | 1 | 1 | 1 |
| PCA | 1 | 1 | 1 |
| PARAFAC | 2 | NULL | NULL |
| Tucker3 | 2 | NULL | NULL |
| MCR-ALS | 1 | 2 | 0 |
| N-PLS | 2 | NULL | 1 |
| Cross Validation | NULL | NULL | 1 |
| transpose | NULL | NULL | NULL |
| produto_matricial | 1 | 1 | NULL |
| wavelet_transform | 1 | 1 | NULL |
| dd_simca | 1 | 1 | 1 |
| oc_rf | 1 | 1 | 1 |
| hpls | 1 | NULL | 1 |
| bipls | 1 | 1 | 1 |
| sipls | 1 | 1 | 1 |
| cls | 1 | 1 | NULL |
| ils | 1 | 1 | 1 |
| pds | 1 | 1 | 1 |
| ds | 1 | 1 | 1 |
| block_pls | 1 | NULL | 1 |
| low_level_fusion | 1 | NULL | 1 |
| drift_detection | 1 | 1 | 1 |

### `technique_compatibilities`

Compatibilidades e incompatibilidades declaradas entre técnicas. Whitelist e blacklist explícitas para o validador de arestas.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `source_technique_id` | BIGINT UNSIGNED FK → techniques | Técnica de origem |
| `target_technique_id` | BIGINT UNSIGNED FK → techniques | Técnica de destino |
| `source_port` | VARCHAR(100) | Porta de saída da origem (NULL = qualquer) |
| `target_port` | VARCHAR(100) | Porta de entrada do destino (NULL = qualquer) |
| `condition` | JSON | Condições adicionais. Ex: `{"min_order": 3, "requires_sample_axis": true}` |
| `is_valid` | TINYINT(1) NOT NULL DEFAULT 1 | 1=compatível, 0=incompatível |
| `notes` | TEXT | Explicação. Ex: "Scores de PCA não são entrada válida para PARAFAC." |
| `created_at` | DATETIME | |
| UNIQUE | `(source_technique_id, target_technique_id, source_port, target_port)` | |

---

## Domínio 7 — Workflows

### `workflows`

Grafo completo de análise.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `visibility` | ENUM('public','private') DEFAULT 'private' | |
| `status` | ENUM('draft','ready','archived') DEFAULT 'draft' | |
| `source_article_analysis_id` | BIGINT UNSIGNED FK → article_analyses NULL | Gerado a partir de análise de artigo |
| `fork_from_workflow_id` | BIGINT UNSIGNED FK → workflows NULL | Derivado por fork |
| `tags` | JSON | |
| `is_template` | TINYINT(1) DEFAULT 0 | Aparece no catálogo público de templates |
| `definition` | JSON NOT NULL | Snapshot denormalizado do grafo (nós+arestas+parâmetros) para reconstrução rápida no frontend |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | |

### `workflow_nodes`

Uma instância de uma técnica dentro de um workflow.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `node_key` | VARCHAR(100) NOT NULL | Identificador único do nó dentro do workflow. Ex: "node_pca_1" |
| `technique_id` | BIGINT UNSIGNED FK → techniques NULL | Técnica instanciada |
| `name` | VARCHAR(255) | Label do nó no canvas |
| `parameters` | JSON | Parâmetros configurados pelo usuário (override dos defaults da técnica) |
| `position_x` | DOUBLE DEFAULT 0 | Posição no canvas |
| `position_y` | DOUBLE DEFAULT 0 | |
| `created_at` | DATETIME | |
| UNIQUE | `(workflow_id, node_key)` | |

### `workflow_edges`

Conexões tipadas entre portas específicas de nós. Uma aresta identifica explicitamente porta de saída → porta de entrada.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `source_node_key` | VARCHAR(100) NOT NULL | node_key do nó de origem |
| `source_port` | VARCHAR(100) | Porta de saída da origem. Ex: "scores", "U", "result" |
| `target_node_key` | VARCHAR(100) NOT NULL | node_key do nó de destino |
| `target_port` | VARCHAR(100) | Porta de entrada do destino. Ex: "X", "A", "B" |
| `created_at` | DATETIME | |
| UNIQUE | `(workflow_id, source_node_key, source_port, target_node_key, target_port)` | |

**Por que source_port e target_port são necessários:**
`A → B` não é suficiente para distinguir `A.output1 → B.input1` de `A.output2 → B.input2`. Operações com múltiplas entradas (soma, produto matricial, concatenação) exigem que cada conexão identifique a porta exata.

### `workflow_node_origins`

Rastreabilidade: liga cada nó gerado pela IA à técnica identificada no artigo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `workflow_node_id` | BIGINT UNSIGNED FK → workflow_nodes | |
| `article_technique_id` | BIGINT UNSIGNED FK → article_techniques | |
| `created_at` | DATETIME | |
| UNIQUE | `(workflow_node_id, article_technique_id)` | |

### `workflow_versions`

Versões explícitas de um workflow. Permite salvar snapshots antes de grandes modificações e restaurar versões anteriores.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `label` | VARCHAR(255) | Ex: "Antes de adicionar validação cruzada" |
| `description` | TEXT | |
| `definition` | JSON NOT NULL | Snapshot completo do grafo neste momento |
| `created_by` | BIGINT UNSIGNED FK → users | |
| `created_at` | DATETIME | |

### `workflow_templates`

Metadados adicionais para workflows marcados como templates.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows UNIQUE | |
| `domain` | VARCHAR(100) | Ex: spectroscopy, chromatography, imaging |
| `data_type` | VARCHAR(100) | Ex: EEM, NIR, LC-DAD |
| `analytical_order` | TINYINT UNSIGNED | Ordem analítica principal do template |
| `use_case` | TEXT | Descrição do caso de uso |
| `thumbnail_path` | VARCHAR(1000) | |
| `usage_count` | INT UNSIGNED DEFAULT 0 | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

## Domínio 8 — Execuções

### `executions`

Uma execução de workflow sobre um dataset.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets NULL | Dataset de entrada |
| `collection_id` | BIGINT UNSIGNED FK → collections NULL | Alternativa ao dataset_id |
| `parent_execution_id` | BIGINT UNSIGNED FK → executions NULL | Execução pai (para variantes de comparação) |
| `comparison_group` | VARCHAR(100) | Chave para agrupar execuções comparadas |
| `label` | VARCHAR(255) | Ex: "PARAFAC 3 componentes sem restrições" |
| `status` | ENUM('queued','running','completed','failed','cancelled') DEFAULT 'queued' | |
| `parameters` | JSON | Override de parâmetros por nó |
| `results` | JSON | Resumo de resultados (para acesso rápido) |
| `error_message` | TEXT | |
| `random_seed` | BIGINT | Para reprodutibilidade |
| `code_version` | VARCHAR(255) | Versão do worker Python |
| `environment` | JSON | Versões de bibliotecas (numpy, tensorly…) |
| `started_at` | DATETIME | |
| `finished_at` | DATETIME | |
| `created_at` | DATETIME | |

### `execution_nodes`

Estado e resultado de cada nó em uma execução.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `execution_id` | BIGINT UNSIGNED FK → executions | |
| `node_key` | VARCHAR(100) NOT NULL | Corresponde ao node_key em workflow_nodes |
| `technique_id` | BIGINT UNSIGNED FK → techniques NULL | |
| `status` | ENUM('pending','running','completed','failed','skipped') DEFAULT 'pending' | |
| `parameters` | JSON | Parâmetros efetivamente usados (após override) |
| `input_metadata` | JSON | Metadados das entradas recebidas: `{port: {type, shape, dtype}}` |
| `input_data` | JSON | Dados de entrada (apenas para inputs pequenos) |
| `output_data` | JSON | Output embutido (scores pequenos, métricas, escalares) |
| `output_type` | VARCHAR(50) | Tipo semântico do output: scalar, vector, matrix, tensor, model, complex_vector… |
| `output_shape` | JSON | Shape do output. Ex: [100, 5] para matrix, [5] para vetor |
| `output_dtype` | VARCHAR(50) | Dtype numérico: float32, float64, complex128… |
| `output_storage_path` | VARCHAR(1000) | Caminho no storage externo para outputs grandes |
| `output_storage_type` | ENUM('json','numpy','pickle','hdf5','zarr','csv','other') | Formato do arquivo externo |
| `metrics` | JSON | Métricas calculadas pelo nó |
| `runtime_ms` | BIGINT UNSIGNED | Tempo de execução |
| `logs` | LONGTEXT | Logs do nó |
| `error_message` | TEXT | |
| `started_at` | DATETIME | |
| `finished_at` | DATETIME | |
| `created_at` | DATETIME | |
| UNIQUE | `(execution_id, node_key)` | |

**Representação de números complexos em output_data:**
```json
{
  "real": [1.2, 2.1, 4.3],
  "imag": [0.0, 0.0, 1.2]
}
```

### `execution_comparisons`

Grupo de execuções comparadas lado a lado.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `name` | VARCHAR(255) NOT NULL | Ex: "PLS vs N-PLS no dataset EEM" |
| `description` | TEXT | |
| `conclusion` | TEXT | Conclusão do pesquisador após comparação |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### `execution_comparison_items`

Execuções que fazem parte de um grupo de comparação.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `comparison_id` | BIGINT UNSIGNED FK → execution_comparisons | |
| `execution_id` | BIGINT UNSIGNED FK → executions | |
| `label` | VARCHAR(255) | Ex: "PLS 3 componentes" |
| `notes` | TEXT | |
| `position` | INT UNSIGNED DEFAULT 0 | Ordem na comparação |
| `created_at` | DATETIME | |
| UNIQUE | `(comparison_id, execution_id)` | |

### `metrics`

Métricas individuais por nó de execução. Separadas de execution_nodes para permitir consultas independentes e comparações entre execuções.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `execution_node_id` | BIGINT UNSIGNED FK → execution_nodes | |
| `name` | VARCHAR(100) NOT NULL | Ex: r2, rmse, rmsecv, accuracy, f1 |
| `value` | DOUBLE NOT NULL | |
| `dataset_split` | VARCHAR(100) | calibration, cross_validation, external_validation |
| `unit` | VARCHAR(100) | Unidade da métrica quando aplicável |
| `metadata` | JSON | |
| `created_at` | DATETIME | |

---

## Domínio 9 — Modelos e Predições

### `models`

Modelos treinados reutilizáveis. Produzidos como resultado de execuções.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets NULL | Dataset de calibração |
| `execution_id` | BIGINT UNSIGNED FK → executions NULL | Execução que gerou o modelo |
| `name` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `algorithm` | VARCHAR(255) NOT NULL | Slug da técnica. Ex: pls, parafac, random_forest |
| `model_type` | ENUM('regression','classification','exploratory','other') DEFAULT 'other' | |
| `hyperparameters` | JSON | Hiperparâmetros efetivamente usados |
| `preprocessing` | JSON | Sequência de pré-processamento aplicada (necessária para aplicar a novos dados) |
| `selected_vars` | JSON | Variáveis selecionadas (índices) |
| `model_path` | VARCHAR(1000) | Caminho do modelo serializado no storage |
| `model_size_kb` | BIGINT UNSIGNED | |
| `status` | ENUM('pending','training','ready','failed') DEFAULT 'pending' | |
| `metrics_cal` | JSON | Métricas de calibração |
| `metrics_cv` | JSON | Métricas de validação cruzada |
| `metrics_ext` | JSON | Métricas de validação externa |
| `train_samples` | INT UNSIGNED | |
| `test_samples` | INT UNSIGNED | |
| `cv_folds` | INT UNSIGNED | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `deleted_at` | DATETIME | |

### `predictions`

Resultados de modelos aplicados a novos dados.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `model_id` | BIGINT UNSIGNED FK → models | |
| `job_id` | BIGINT UNSIGNED FK → jobs NULL | |
| `source_dataset_id` | BIGINT UNSIGNED FK → datasets NULL | |
| `source_filename` | VARCHAR(500) | Se upload direto |
| `results` | JSON NOT NULL | Valores preditos por amostra |
| `sample_count` | INT UNSIGNED DEFAULT 0 | |
| `created_at` | DATETIME | |

---

## Domínio 10 — Jobs

### `jobs`

Jobs assíncronos. Criados internamente pelos controllers; nunca diretamente pelo usuário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | CHAR(36) UNIQUE | |
| `user_id` | BIGINT UNSIGNED FK → users | |
| `job_type` | ENUM('train_model','predict','preprocess','execute_workflow','analyze_article','generate_workflow','operate_dataset','export','other') | `operate_dataset` cobre operações matemáticas e estruturais avulsas |
| `model_id` | BIGINT UNSIGNED FK → models NULL | |
| `dataset_id` | BIGINT UNSIGNED FK → datasets NULL | |
| `workflow_id` | BIGINT UNSIGNED FK → workflows NULL | |
| `execution_id` | BIGINT UNSIGNED FK → executions NULL | |
| `celery_task_id` | VARCHAR(255) | ID do task no Celery |
| `queue_name` | VARCHAR(100) DEFAULT 'default' | |
| `payload` | JSON | Parâmetros do job |
| `status` | ENUM('queued','running','done','failed','cancelled') DEFAULT 'queued' | |
| `progress` | DECIMAL(5,2) DEFAULT 0.00 | Progresso em % |
| `result` | JSON | Resultado ao concluir |
| `error_message` | TEXT | |
| `error_traceback` | LONGTEXT | |
| `queued_at` | DATETIME | |
| `started_at` | DATETIME | |
| `finished_at` | DATETIME | |

---

## Domínio 11 — Auditoria

### `audit_logs`

Registra ações relevantes para rastreabilidade.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT UNSIGNED PK | |
| `user_id` | BIGINT UNSIGNED FK → users NULL | NULL para ações de sistema |
| `action` | VARCHAR(100) NOT NULL | Ex: dataset.created, workflow.executed, model.deleted |
| `entity_type` | VARCHAR(100) NOT NULL | Ex: dataset, workflow, model |
| `entity_id` | BIGINT UNSIGNED | ID da entidade afetada |
| `before_data` | JSON | Estado antes da alteração |
| `after_data` | JSON | Estado após a alteração |
| `metadata` | JSON | Contexto adicional (IP, user-agent…) |
| `created_at` | DATETIME | |

---

## Storage externo

O MySQL armazena apenas metadados e referências. Arrays científicos grandes ficam em storage externo:

```
MySQL
  ├── metadata (shape, dtype, mode_labels, sample_axis…)
  ├── storage_path  →  aponta para →  Zarr / HDF5 / S3
  └── output_storage_path (em execution_nodes)

Storage externo (Zarr preferido)
  └── array N-dimensional
```

**Critério:** outputs pequenos (escalares, vetores curtos, métricas) ficam em JSON no MySQL. Outputs grandes (tensores, modelos serializados) ficam no storage externo com referência em `output_storage_path`.

---

## Fluxo central

```
Artigo / DOI / Dataset
        ↓
IA (article_analyses)
        ↓
Workflow (workflows + workflow_nodes + workflow_edges)
        ↓
Execução (executions + execution_nodes)
        ↓
Resultados (metrics + models + predictions)
        ↓
Rastreabilidade (dataset_lineage + workflow_node_origins + audit_logs)
```

---

## Rastreabilidade completa

O banco permite responder:

| Pergunta | Tabelas envolvidas |
|----------|--------------------|
| Qual arquivo originou este dataset? | `datasets.storage_path`, `datasets.metadata` |
| Qual operação criou este dataset? | `dataset_lineage`, `datasets.derived_from_operation` |
| Qual workflow executou essa operação? | `dataset_lineage.workflow_id`, `executions` |
| Quais parâmetros foram utilizados? | `dataset_lineage.parameters`, `execution_nodes.parameters` |
| Quais datasets foram usados como entrada? | `executions.dataset_id`, `dataset_lineage.source_dataset_id` |
| Quais resultados dependem deste dataset? | `dataset_lineage` (downstream via target_dataset_id) |
| De qual artigo veio este workflow? | `workflows.source_article_analysis_id` → `article_analyses` → `articles` |
| Qual nó do workflow corresponde a qual técnica do artigo? | `workflow_node_origins` |
| Qual versão do código rodou esta execução? | `executions.code_version`, `executions.environment` |