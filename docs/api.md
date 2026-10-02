# TcheLab — API REST: Controllers e Rotas

> Versão: v1
> Padrão: REST sobre HTTP/JSON
> Prefixo base: `/api/v1`
> Autenticação: Bearer Token (JWT) em todas as rotas exceto `/auth/*`

---

## Nota sobre Services

A princípio a lógica vive nos controllers. Entretanto, três casos **exigem extração para service desde o início**, porque a mesma lógica é chamada por mais de um controller ou por workers assíncronos:

1. **`ShapeValidatorService`** — valida compatibilidade de tipos, shapes, ordem e eixo de amostras entre portas de dois blocos. Usado por `WorkflowEdgeController` (ao salvar aresta) e pelo worker de execução (antes de rodar cada nó). Se ficar no controller, o worker duplica a lógica.
2. **`LineageService`** — registra linhagem de datasets derivados em `dataset_lineage`. Usado por `DatasetController` (operação avulsa) e pelo worker de execução (quando um nó produz um dataset derivado).
3. **`FormulaParserService`** — parser seguro de fórmulas customizadas (AST + whitelist). Nunca deve ficar num controller; precisa ser testado isoladamente e reutilizado pelo worker.

Todo o restante pode começar nos controllers e ser extraído conforme a necessidade aparecer.

---

## Tabelas referenciadas neste documento

Este documento referencia as seguintes tabelas do banco. Todas devem existir em `database.md`:

```
users
communities
community_members
community_projects         ← nova (comunidade ↔ projeto)
projects                   ← nova (requisito 6)
project_members            ← nova (usuário ↔ projeto)
project_datasets           ← nova (dataset vinculado a projeto)
project_workflows          ← nova (workflow vinculado a projeto)
project_articles           ← nova (artigo vinculado a projeto)
spectra
collections
collection_spectra
datasets
dataset_lineage
dataset_spectra
articles
article_analyses
article_techniques
techniques
technique_compatibilities
workflows
workflow_nodes
workflow_edges
workflow_node_origins
workflow_versions          ← nova (versionamento de workflows)
workflow_templates
executions
execution_nodes
execution_comparisons
execution_comparison_items
metrics
models
predictions
jobs
messages
audit_logs
ai_interactions
```

---

## Gaps identificados nos docs anteriores (decisões tomadas aqui)

| Gap | Decisão |
|-----|---------|
| Projetos (req 6) — sem tabela no banco | Criar `projects`, `project_members`, `community_projects` e tabelas de associação |
| `dataset.purpose` — req 1 pede treino/validação/teste/calibração/previsão | Adicionar campo `purpose` em `datasets` |
| `dataset.dtype` — mencionado em `database.md`, ausente no dump SQL | Adicionar campo `dtype` em `datasets` |
| Modelos customizados (req 5) — req pede que apareçam no catálogo como qualquer outro modelo | Adicionar `is_custom BOOLEAN` e `custom_definition JSON` em `techniques` |
| Versionamento de workflows (req 6) | Criar `workflow_versions` |
| Comunidade contém projetos — decisão desta conversa | `community_projects` liga `communities` ↔ `projects` |
| `purpose` em `project_datasets` — um dataset pode ter papel diferente em cada projeto | Colocar `purpose` na tabela de associação `project_datasets`, não no dataset em si |

---

# Controllers

---

## 1. `auth.controller.js`

**Responsabilidade:** autenticação e sessão do usuário.
Nenhuma outra lógica. Não acessa projetos nem comunidades.

**Tabelas:** `users`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Registra novo usuário |
| `POST` | `/auth/login` | Autentica e retorna JWT |
| `POST` | `/auth/logout` | Invalida token (blacklist ou revogação) |
| `POST` | `/auth/refresh` | Renova o JWT antes de expirar |
| `POST` | `/auth/forgot-password` | Solicita reset de senha por e-mail |
| `POST` | `/auth/reset-password` | Conclui reset com token do e-mail |
| `GET`  | `/auth/me` | Retorna dados do usuário autenticado |

### Funções

```
register(req, res)
  - Valida campos obrigatórios (name, email, password)
  - Verifica unicidade do e-mail
  - Faz hash da senha
  - Insere em `users`
  - Retorna usuário criado (sem password_hash)

login(req, res)
  - Valida e-mail e senha
  - Retorna JWT + dados básicos do usuário

logout(req, res)
  - Invalida token da sessão atual

refresh(req, res)
  - Valida refresh token
  - Emite novo JWT

forgotPassword(req, res)
  - Enfileira job de envio de e-mail com link de reset

resetPassword(req, res)
  - Valida token do e-mail
  - Atualiza password_hash

me(req, res)
  - Retorna dados do usuário autenticado (sem campos sensíveis)
```

---

## 2. `user.controller.js`

**Responsabilidade:** perfil científico do usuário, estatísticas e preferências.

**Tabelas:** `users`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/users/:id` | Retorna perfil público do usuário |
| `PUT`    | `/users/:id` | Atualiza perfil (nome, bio, área, instituição, Lattes, LinkedIn, GitHub) |
| `PUT`    | `/users/:id/avatar` | Upload de avatar |
| `GET`    | `/users/:id/stats` | Retorna contadores: modelos, análises, datasets |
| `DELETE` | `/users/:id` | Soft delete da conta |

### Funções

```
getUser(req, res)
  - Retorna perfil público: name, initials, bio, research_area,
    institution, lattes_url, linkedin_url, github_url, avatar_url,
    cover_color, stat_*
  - Campos sensíveis (email, password_hash) nunca expostos

updateUser(req, res)
  - Permite atualizar: name, initials, bio, research_area,
    institution, lattes_url, linkedin_url, github_url, cover_color
  - Somente o próprio usuário ou admin

uploadAvatar(req, res)
  - Recebe multipart/form-data
  - Salva arquivo, atualiza avatar_url

getStats(req, res)
  - Retorna stat_models, stat_analyses, stat_datasets,
    stat_public_analyses, stat_private_analyses

deleteUser(req, res)
  - Soft delete: preenche deleted_at
  - Apenas o próprio usuário ou admin
```

---

## 3. `community.controller.js`

**Responsabilidade:** criação e gestão de comunidades (laboratórios, turmas, grupos de pesquisa). Uma comunidade pode ter membros e projetos. O professor cria uma comunidade "Aula de quimiometria" e compartilha dados e modelos com os alunos por meio dos projetos vinculados.

**Tabelas:** `communities`, `community_members`, `community_datasets`, `community_workflows`, `community_projects`, `messages`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/communities` | Lista comunidades do usuário autenticado |
| `GET`    | `/communities/public` | Lista comunidades públicas |
| `POST`   | `/communities` | Cria nova comunidade |
| `GET`    | `/communities/:id` | Detalhe da comunidade |
| `PUT`    | `/communities/:id` | Atualiza nome, descrição, visibilidade |
| `DELETE` | `/communities/:id` | Remove comunidade (soft delete ou hard delete) |
| `GET`    | `/communities/:id/members` | Lista membros e seus papéis |
| `POST`   | `/communities/:id/members` | Adiciona membro (por e-mail ou user_id) |
| `PUT`    | `/communities/:id/members/:uid` | Altera papel do membro (member/moderator/admin) |
| `DELETE` | `/communities/:id/members/:uid` | Remove membro |
| `GET`    | `/communities/:id/projects` | Lista projetos da comunidade |
| `POST`   | `/communities/:id/projects/:pid` | Vincula projeto existente à comunidade |
| `DELETE` | `/communities/:id/projects/:pid` | Desvincula projeto da comunidade |
| `GET`    | `/communities/:id/datasets` | Lista datasets compartilhados na comunidade |
| `POST`   | `/communities/:id/datasets/:did` | Compartilha dataset na comunidade |
| `DELETE` | `/communities/:id/datasets/:did` | Remove compartilhamento |
| `GET`    | `/communities/:id/workflows` | Lista workflows compartilhados |
| `POST`   | `/communities/:id/workflows/:wid` | Compartilha workflow |
| `DELETE` | `/communities/:id/workflows/:wid` | Remove compartilhamento |
| `GET`    | `/communities/:id/messages` | Lista mensagens do chat da comunidade |
| `POST`   | `/communities/:id/messages` | Envia mensagem |
| `DELETE` | `/communities/:id/messages/:mid` | Remove mensagem (autor ou moderador) |

### Funções

```
listMyCommunities(req, res)
  - Retorna comunidades onde o usuário é membro

listPublicCommunities(req, res)
  - Retorna comunidades com visibility = 'public'

createCommunity(req, res)
  - Cria em `communities` com owner_id = usuário autenticado
  - Insere o criador como admin em `community_members`

getCommunity(req, res)
  - Retorna detalhes, contagem de membros e projetos

updateCommunity(req, res)
  - Apenas owner ou admin da comunidade

deleteCommunity(req, res)
  - Apenas owner

listMembers(req, res)
  - Retorna membros com papel e data de entrada

addMember(req, res)
  - Valida que o usuário existe
  - Insere em `community_members` com role = 'member'

updateMemberRole(req, res)
  - Apenas admin pode promover/rebaixar

removeMember(req, res)
  - Admin pode remover qualquer membro; membro pode sair

listCommunityProjects(req, res)
  - Retorna projetos via `community_projects`

linkProject(req, res)
  - Insere em `community_projects`
  - Usuário deve ser owner ou admin do projeto

unlinkProject(req, res)
  - Remove de `community_projects`

shareDataset / removeDatasetShare(req, res)
  - Gerencia `community_datasets`

shareWorkflow / removeWorkflowShare(req, res)
  - Gerencia `community_workflows`

listMessages / sendMessage / deleteMessage(req, res)
  - Gerencia `messages`
```

---

## 4. `project.controller.js`

**Responsabilidade:** organização central do trabalho científico. Um projeto agrupa datasets, workflows, modelos, artigos e resultados. Dentro de um projeto, cada dataset tem um papel explícito (calibração, validação, teste, previsão). Um projeto pode pertencer a uma ou mais comunidades.

**Tabelas:** `projects`, `project_members`, `project_datasets`, `project_workflows`, `project_articles`, `community_projects`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/projects` | Lista projetos do usuário autenticado |
| `POST`   | `/projects` | Cria projeto |
| `GET`    | `/projects/:id` | Detalhe do projeto |
| `PUT`    | `/projects/:id` | Atualiza nome, descrição, visibilidade |
| `DELETE` | `/projects/:id` | Remove projeto |
| `GET`    | `/projects/:id/members` | Lista membros do projeto |
| `POST`   | `/projects/:id/members` | Adiciona membro ao projeto |
| `PUT`    | `/projects/:id/members/:uid` | Altera papel (viewer/editor/admin) |
| `DELETE` | `/projects/:id/members/:uid` | Remove membro |
| `GET`    | `/projects/:id/datasets` | Lista datasets do projeto com seus papéis |
| `POST`   | `/projects/:id/datasets/:did` | Associa dataset ao projeto com papel definido |
| `PUT`    | `/projects/:id/datasets/:did` | Altera papel do dataset no projeto |
| `DELETE` | `/projects/:id/datasets/:did` | Desassocia dataset do projeto |
| `GET`    | `/projects/:id/workflows` | Lista workflows do projeto |
| `POST`   | `/projects/:id/workflows/:wid` | Associa workflow ao projeto |
| `DELETE` | `/projects/:id/workflows/:wid` | Desassocia workflow |
| `GET`    | `/projects/:id/articles` | Lista artigos do projeto |
| `POST`   | `/projects/:id/articles/:aid` | Associa artigo ao projeto |
| `DELETE` | `/projects/:id/articles/:aid` | Desassocia artigo |
| `GET`    | `/projects/:id/history` | Histórico de execuções e análises do projeto |

### Funções

```
listProjects(req, res)
  - Retorna projetos onde o usuário é owner ou membro

createProject(req, res)
  - Campos: name, description, visibility
  - Insere o criador como admin em `project_members`

getProject(req, res)
  - Retorna detalhes, contagem de datasets, workflows, modelos

updateProject(req, res)
  - Apenas owner ou admin do projeto

deleteProject(req, res)
  - Soft delete; não remove os datasets/workflows associados

listProjectMembers(req, res)
addProjectMember(req, res)
updateProjectMemberRole(req, res)
removeProjectMember(req, res)
  - Gerencia `project_members` com papéis: viewer, editor, admin

listProjectDatasets(req, res)
  - Retorna datasets com campo `purpose` da tabela de associação
  - purpose: 'training' | 'validation' | 'test' | 'calibration' |
             'prediction' | 'reference' | 'other'

addDatasetToProject(req, res)
  - Insere em `project_datasets` com purpose obrigatório
  - O dataset já deve existir em `datasets`

updateDatasetPurpose(req, res)
  - Altera apenas o campo purpose na tabela de associação
  - Permite mudar de 'training' para 'validation' sem mexer no dataset

removeDatasetFromProject(req, res)
  - Remove de `project_datasets`; dataset continua existindo

listProjectWorkflows(req, res)
addWorkflowToProject(req, res)
removeWorkflowFromProject(req, res)
  - Gerencia `project_workflows`

listProjectArticles(req, res)
addArticleToProject(req, res)
removeArticleFromProject(req, res)
  - Gerencia `project_articles`

getProjectHistory(req, res)
  - Retorna execuções do projeto em ordem cronológica
  - Join com executions via datasets e workflows do projeto
```

---

## 5. `spectrum.controller.js`

**Responsabilidade:** espectros individuais 1D — unidade atômica de dado antes de ser agrupada em dataset.

**Tabelas:** `spectra`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/spectra` | Lista espectros do usuário (com filtros) |
| `POST`   | `/spectra` | Insere espectro manualmente ou por upload |
| `POST`   | `/spectra/batch` | Importa múltiplos espectros de uma vez |
| `GET`    | `/spectra/:id` | Detalhe do espectro |
| `PUT`    | `/spectra/:id` | Atualiza metadados (nome, classe, referência) |
| `DELETE` | `/spectra/:id` | Soft delete |
| `GET`    | `/spectra/:id/plot` | Retorna dados formatados para visualização (x, y) |

### Funções

```
listSpectra(req, res)
  - Filtros: technique, sample_class, visibility, x_min, x_max,
    collection_id, date range
  - Paginação obrigatória

createSpectrum(req, res)
  - Aceita JSON com x_values e y_values
  - Ou arquivo CSV/XLSX (parsed no controller)
  - Campos obrigatórios: name, technique, x_values, y_values
  - Calcula x_points, x_min, x_max automaticamente

batchImport(req, res)
  - Recebe array de espectros ou arquivo multi-coluna
  - Retorna lista de IDs criados e erros por linha

getSpectrum(req, res)
  - Retorna todos os campos incluindo x_values e y_values

updateSpectrum(req, res)
  - Permite alterar: name, description, sample_class,
    reference_value, reference_values, metadata, visibility

deleteSpectrum(req, res)
  - Soft delete: preenche deleted_at

getPlotData(req, res)
  - Retorna {x, y, label, technique, x_unit, y_unit}
  - Formato pronto para biblioteca de gráficos do frontend
```

---

## 6. `collection.controller.js`

**Responsabilidade:** agrupamentos informais de espectros para comparação e organização.

**Tabelas:** `collections`, `collection_spectra`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/collections` | Lista coleções do usuário |
| `POST`   | `/collections` | Cria coleção |
| `GET`    | `/collections/:id` | Detalhe com contagem de espectros |
| `PUT`    | `/collections/:id` | Atualiza nome, descrição, visibilidade |
| `DELETE` | `/collections/:id` | Remove coleção (não remove os espectros) |
| `GET`    | `/collections/:id/spectra` | Lista espectros da coleção |
| `POST`   | `/collections/:id/spectra` | Adiciona espectro(s) à coleção |
| `DELETE` | `/collections/:id/spectra/:sid` | Remove espectro da coleção |

### Funções

```
listCollections(req, res)
  - Retorna coleções do usuário autenticado
  - Inclui spectra_count desnormalizado

createCollection(req, res)
  - Campos: name, description, visibility

getCollection(req, res)
  - Detalhe com metadados e spectra_count

updateCollection / deleteCollection(req, res)

listCollectionSpectra(req, res)
  - Retorna espectros com metadados resumidos (sem x_values/y_values)
  - Paginação

addSpectraToCollection(req, res)
  - Aceita array de spectrum_ids
  - Insere em `collection_spectra`; ignora duplicatas

removeSpectrumFromCollection(req, res)
  - Remove de `collection_spectra`
  - Atualiza spectra_count
```

---

## 7. `dataset.controller.js`

**Responsabilidade:** datasets estruturados N-way. É o coração do domínio de dados. Suporta importação inteligente, linhagem, operações matemáticas avulsas e navegação por fatias do array.

**Tabelas:** `datasets`, `dataset_lineage`, `dataset_spectra`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/datasets` | Lista datasets do usuário (com filtros) |
| `POST`   | `/datasets` | Cria dataset (upload ou manual) |
| `POST`   | `/datasets/import` | Import inteligente: identifica shape, dtype, mode_labels |
| `GET`    | `/datasets/:id` | Detalhe com dimensões, shape, metadados |
| `PUT`    | `/datasets/:id` | Atualiza metadados (não os dados em si) |
| `DELETE` | `/datasets/:id` | Soft delete |
| `GET`    | `/datasets/:id/lineage` | Cadeia completa de linhagem (upstream e downstream) |
| `GET`    | `/datasets/:id/slice` | Retorna fatia do array (para visualização) |
| `GET`    | `/datasets/:id/preview` | Previsualização: primeiras amostras/variáveis |
| `POST`   | `/datasets/:id/spectra` | Associa espectros a posições do dataset |
| `GET`    | `/datasets/:id/spectra` | Lista espectros associados ao dataset |

### Funções

```
listDatasets(req, res)
  - Filtros: data_type, data_order, sample_axis, visibility,
    technique, project_id (via project_datasets)
  - Retorna dimensions, mode_labels, data_order, sample_axis

createDataset(req, res)
  - Aceita JSON com dimensions, mode_labels, mode_ranges,
    sample_axis, data_order, augmentation_scheme, dtype,
    file_format, storage_path
  - Não armazena o array em si — apenas metadados e referência

smartImport(req, res)
  - Recebe arquivo XLSX/CSV/NumPy/HDF5/Zarr
  - Detecta automaticamente: shape, dtype, número de amostras,
    mode_labels candidatos
  - Retorna proposta de metadados para o usuário confirmar
  - Após confirmação, cria o dataset e armazena o array no
    storage externo (Zarr)
  - Enfileira job do tipo 'operate_dataset' para processamento

getDataset(req, res)
  - Retorna todos os metadados: dimensions, mode_labels,
    mode_ranges, sample_axis, data_order, augmentation_scheme,
    dtype, file_format, storage_path, parent_dataset_id,
    derived_from_operation

updateDataset(req, res)
  - Permite alterar: name, description, visibility,
    mode_labels, mode_ranges, metadata
  - Não permite alterar dimensions ou dtype (imutáveis após criação)

deleteDataset(req, res)
  - Soft delete

getLineage(req, res)
  - Consulta `dataset_lineage` recursivamente
  - Retorna grafo upstream (origem) e downstream (dependentes)
  - Resposta: { upstream: [...], downstream: [...] }

getSlice(req, res)
  - Parâmetros: ranges por eixo (ex: ?axis0=0:10&axis1=0:50)
  - Busca fatia do array no storage externo
  - Retorna array JSON ou base64 dependendo do tamanho

getPreview(req, res)
  - Retorna as primeiras N amostras e M variáveis do primeiro modo
  - Usado para inspeção rápida sem carregar o dataset inteiro

addSpectraToDataset / listDatasetSpectra(req, res)
  - Gerencia `dataset_spectra` com campo position
```

---

## 8. `article.controller.js`

**Responsabilidade:** gerenciamento de artigos científicos — inserção por DOI ou PDF, disparo da análise por IA.

**Tabelas:** `articles`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/articles` | Lista artigos do usuário |
| `POST`   | `/articles` | Insere artigo (JSON com DOI ou metadados manuais) |
| `POST`   | `/articles/upload` | Upload de PDF |
| `GET`    | `/articles/:id` | Detalhe do artigo |
| `PUT`    | `/articles/:id` | Atualiza metadados (título, autores, journal) |
| `DELETE` | `/articles/:id` | Remove artigo |
| `POST`   | `/articles/:id/analyze` | Dispara análise por IA |

### Funções

```
listArticles(req, res)
  - Filtros: journal, publication_date range, extraction_status
  - Opcionalmente filtra por project_id

createArticle(req, res)
  - Aceita: doi, title, abstract, authors (JSON), journal,
    publisher, publication_date, url
  - Se DOI fornecido, pode tentar buscar metadados via CrossRef

uploadPDF(req, res)
  - Recebe multipart/form-data
  - Salva PDF em storage externo, atualiza pdf_path
  - Enfileira job de extração de texto (extraction_status = 'pending')

getArticle(req, res)
  - Retorna todos os metadados e status de extração

updateArticle(req, res)
  - Permite atualizar metadados bibliográficos

deleteArticle(req, res)
  - Remove artigo e desassocia de projetos (não remove análises)

analyzeArticle(req, res)
  - Valida que o artigo tem texto extraído (extraction_status = 'extracted')
  - Cria registro em `article_analyses` com status = 'pending'
  - Enfileira job do tipo 'analyze_article'
  - Retorna { analysis_id, job_id }
```

---

## 9. `articleAnalysis.controller.js`

**Responsabilidade:** consulta e gestão dos resultados de análise de artigos pela IA. Ciclo de vida próprio separado do artigo.

**Tabelas:** `article_analyses`, `article_techniques`, `workflow_node_origins`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/article-analyses` | Lista análises do usuário |
| `GET`    | `/article-analyses/:id` | Detalhe da análise (status, metodologia, workflow gerado) |
| `GET`    | `/article-analyses/:id/techniques` | Técnicas identificadas com confiança e evidências |
| `POST`   | `/article-analyses/:id/generate-workflow` | Converte análise em workflow editável |
| `DELETE` | `/article-analyses/:id` | Remove análise |

### Funções

```
listAnalyses(req, res)
  - Filtra por article_id, status, user_id
  - Retorna: status, data_type_detected, dimensionality_detected,
    generated_workflow_id

getAnalysis(req, res)
  - Retorna análise completa: summary, methodology (JSON),
    data_type_detected, dimensionality_detected, status

getTechniques(req, res)
  - Retorna técnicas identificadas com:
    step_order, technique (do catálogo), parameters,
    evidence, confidence, raw_text, mapping_notes

generateWorkflow(req, res)
  - Cria workflow com nós baseados nas técnicas identificadas
  - Popula workflow_nodes e workflow_edges a partir de article_techniques
  - Cria registros em workflow_node_origins para rastreabilidade
  - Atualiza generated_workflow_id na análise
  - Enfileira job do tipo 'generate_workflow'
  - Retorna { workflow_id }

deleteAnalysis(req, res)
  - Remove análise e article_techniques associados
```

---

## 10. `technique.controller.js`

**Responsabilidade:** catálogo de blocos disponíveis. Praticamente read-only para usuários; escrita apenas via seed/admin. Inclui técnicas nativas e modelos customizados do usuário (que aparecem no catálogo como qualquer outro bloco).

**Tabelas:** `techniques`, `technique_compatibilities`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/techniques` | Lista técnicas com filtros |
| `GET`    | `/techniques/:id` | Detalhe: schemas de input, output, parâmetros |
| `GET`    | `/techniques/:id/compatibilities` | Lista compatibilidades declaradas |
| `GET`    | `/techniques/categories` | Lista categorias e famílias disponíveis |
| `POST`   | `/techniques` | Cria técnica customizada do usuário (req 5) |
| `PUT`    | `/techniques/:id` | Atualiza técnica customizada própria |
| `DELETE` | `/techniques/:id` | Remove técnica customizada própria |

### Funções

```
listTechniques(req, res)
  - Filtros: category, family, min_order, max_order,
    requires_sample_axis, tags (array), is_beta, is_custom
  - Retorna: id, slug, name, category, family, description,
    min_order, max_order, requires_sample_axis, input_type,
    output_type, tags, is_beta, is_custom
  - Inclui técnicas nativas (is_custom=false) e customizadas
    do próprio usuário ou de sua comunidade (is_custom=true)

getTechnique(req, res)
  - Retorna todos os campos incluindo:
    input_schema, output_schema, parameter_schema
  - input_schema: {port: {tipo, min_order, max_order,
    requires_sample_axis, dtype}}
  - output_schema: {port: {tipo, shape_formula, dtype}}
  - parameter_schema: {param: {tipo, default, range, opcoes}}

getCompatibilities(req, res)
  - Retorna entradas de `technique_compatibilities`
    para source_technique_id = :id
  - Inclui is_valid (whitelist e blacklist)
  - Usado pelo frontend para sugerir/bloquear conexões

listCategories(req, res)
  - Retorna famílias e categorias distintas do catálogo
  - Útil para montar o painel lateral do canvas

createCustomTechnique(req, res)
  - Apenas usuários autenticados
  - is_custom = true, user_id = autenticado
  - custom_definition: JSON com a sequência de operações
    (ex: [transpose → centering → formula_customizada])
  - Valida que todos os slugs referenciados existem no catálogo
  - Gera input_schema e output_schema automaticamente
    a partir da cadeia de operações
  - Técnica aparece no catálogo do usuário

updateCustomTechnique / deleteCustomTechnique(req, res)
  - Apenas o próprio usuário pode editar/remover
  - Não permite alterar técnicas nativas (is_custom=false)
```

---

## 11. `workflow.controller.js`

**Responsabilidade:** criação, edição e versionamento de workflows. Um workflow é um grafo de blocos com conexões tipadas. Pode ser criado manualmente, gerado por IA ou derivado (fork) de outro workflow.

**Tabelas:** `workflows`, `workflow_versions`, `workflow_templates`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/workflows` | Lista workflows do usuário |
| `GET`    | `/workflows/templates` | Lista templates públicos |
| `POST`   | `/workflows` | Cria workflow novo |
| `POST`   | `/workflows/:id/fork` | Faz fork de um workflow existente |
| `GET`    | `/workflows/:id` | Detalhe do workflow (nós, arestas, parâmetros) |
| `PUT`    | `/workflows/:id` | Atualiza metadados (nome, descrição, status, tags) |
| `DELETE` | `/workflows/:id` | Soft delete |
| `POST`   | `/workflows/:id/snapshot` | Salva versão explícita do estado atual |
| `GET`    | `/workflows/:id/versions` | Lista versões salvas |
| `GET`    | `/workflows/:id/versions/:vid` | Retorna snapshot de versão específica |
| `POST`   | `/workflows/:id/versions/:vid/restore` | Restaura workflow para versão anterior |
| `PUT`    | `/workflows/:id/template` | Marca/desmarca como template público |

### Funções

```
listWorkflows(req, res)
  - Filtros: status, visibility, is_template, project_id,
    source_article_analysis_id
  - Retorna: id, name, status, created_at, updated_at,
    source_article_analysis_id, fork_from_workflow_id

listTemplates(req, res)
  - Retorna workflows com is_template = true e visibility = 'public'
  - Inclui workflow_templates.domain, data_type, analytical_order

createWorkflow(req, res)
  - Campos: name, description, visibility, tags
  - Cria workflow com status = 'draft' e definition = {}
  - Opcionalmente recebe definition (JSON completo do grafo)

forkWorkflow(req, res)
  - Copia workflow original (nós, arestas, parâmetros)
  - Define fork_from_workflow_id
  - Novo workflow pertence ao usuário autenticado

getWorkflow(req, res)
  - Retorna workflow com:
    - definition (snapshot)
    - Ou nós e arestas via join com workflow_nodes e workflow_edges
  - Inclui status de cada nó se houver execução recente

updateWorkflow(req, res)
  - Permite alterar: name, description, visibility, status, tags
  - Status: draft → ready → archived
  - Atualiza definition (snapshot) sempre que nós/arestas mudam

deleteWorkflow(req, res)
  - Soft delete

saveSnapshot(req, res)
  - Salva estado atual (definition) em `workflow_versions`
  - Campos: label, description, definition JSON
  - Útil antes de grandes modificações

listVersions(req, res)
  - Lista versões de `workflow_versions` com label e created_at

getVersion(req, res)
  - Retorna definition de versão específica

restoreVersion(req, res)
  - Copia definition da versão para o workflow atual
  - Salva snapshot automático antes de restaurar (segurança)

setTemplate(req, res)
  - Apenas admin ou owner
  - Alterna is_template; cria/atualiza registro em workflow_templates
```

---

## 12. `workflowNode.controller.js`

**Responsabilidade:** nós dentro de um workflow. Cada nó é uma instância de uma técnica do catálogo com seus parâmetros e posição no canvas.

**Tabelas:** `workflow_nodes`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/workflows/:wid/nodes` | Lista todos os nós do workflow |
| `POST`   | `/workflows/:wid/nodes` | Adiciona nó ao workflow |
| `GET`    | `/workflows/:wid/nodes/:nid` | Detalhe do nó |
| `PUT`    | `/workflows/:wid/nodes/:nid` | Atualiza parâmetros ou posição |
| `DELETE` | `/workflows/:wid/nodes/:nid` | Remove nó (e suas arestas) |

### Funções

```
listNodes(req, res)
  - Retorna todos os nós com technique_id, node_key, name,
    parameters, position_x, position_y
  - Inclui input_schema e output_schema da técnica (join)

addNode(req, res)
  - Campos: technique_id, node_key (único no workflow),
    name (label opcional), parameters, position_x, position_y
  - Valida que technique_id existe e está ativo
  - Valida parâmetros contra parameter_schema da técnica
  - Atualiza definition do workflow (snapshot)

getNode(req, res)
  - Retorna nó com técnica expandida (schemas)

updateNode(req, res)
  - Permite alterar: parameters, position_x, position_y, name
  - Valida parâmetros novamente contra parameter_schema
  - Se parâmetros mudarem, marca outputs downstream como 'stale'
    (via campo status em execution_nodes da última execução)
  - Atualiza definition do workflow

deleteNode(req, res)
  - Remove nó de workflow_nodes
  - Remove todas as arestas que partem ou chegam neste nó
  - Atualiza definition do workflow
```

---

## 13. `workflowEdge.controller.js`

**Responsabilidade:** arestas do workflow — conexões tipadas entre portas específicas de nós. Este controller executa a validação de compatibilidade usando `ShapeValidatorService`.

**Tabelas:** `workflow_edges`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/workflows/:wid/edges` | Lista arestas do workflow |
| `POST`   | `/workflows/:wid/edges` | Cria aresta com validação |
| `DELETE` | `/workflows/:wid/edges/:eid` | Remove aresta |

### Funções

```
listEdges(req, res)
  - Retorna arestas com:
    source_node_key, source_port, target_node_key, target_port
  - Inclui metadados das portas (tipo, shape, dtype)

createEdge(req, res)
  - Campos obrigatórios:
    source_node_key, source_port, target_node_key, target_port
  - Validações executadas (via ShapeValidatorService):
    1. source_node e target_node existem no workflow
    2. source_port existe no output_schema da técnica de origem
    3. target_port existe no input_schema da técnica de destino
    4. Tipos são compatíveis (ex: tensor → tensor, scalar → scalar)
    5. Ordem do array é compatível com min_order/max_order do destino
    6. requires_sample_axis é satisfeito
    7. Compatibilidade semântica via technique_compatibilities
    8. Conexão não cria ciclo no grafo (DAG)
  - Se inválida: retorna 422 com mensagem explícita do erro
    (ex: "Inversa exige matriz quadrada. A entrada possui shape (3,2).")
  - Se válida: insere em workflow_edges, atualiza definition

deleteEdge(req, res)
  - Remove aresta
  - Atualiza definition do workflow
```

---

## 14. `execution.controller.js`

**Responsabilidade:** disparo e monitoramento de execuções de workflows. Uma execução roda todos os nós do grafo em ordem topológica.

**Tabelas:** `executions`, `execution_nodes`, `jobs`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/executions` | Lista execuções do usuário |
| `POST`   | `/executions` | Dispara nova execução |
| `GET`    | `/executions/:id` | Detalhe e status geral da execução |
| `GET`    | `/executions/:id/nodes` | Status e outputs de cada nó |
| `GET`    | `/executions/:id/nodes/:nkey` | Detalhe de nó específico (output, shape, dtype) |
| `POST`   | `/executions/:id/cancel` | Cancela execução em andamento |
| `POST`   | `/executions/:id/rerun` | Re-executa com mesmos parâmetros |
| `POST`   | `/executions/:id/rerun-from/:nkey` | Re-executa a partir de nó específico |

### Funções

```
listExecutions(req, res)
  - Filtros: workflow_id, dataset_id, status, comparison_group,
    project_id (via project_datasets)
  - Retorna: id, label, status, started_at, finished_at,
    workflow_id, dataset_id, comparison_group

createExecution(req, res)
  - Campos: workflow_id, dataset_id (ou collection_id),
    parameters (override de parâmetros por nó),
    random_seed, label, comparison_group
  - Valida que workflow está em status 'ready'
  - Valida compatibilidade do dataset com o primeiro nó do workflow
  - Cria execução com status = 'queued'
  - Cria execution_nodes para cada nó do workflow
  - Enfileira job do tipo 'execute_workflow'
  - Retorna { execution_id, job_id }

getExecution(req, res)
  - Retorna execução com status, parâmetros, dataset_id,
    started_at, finished_at, error_message

getExecutionNodes(req, res)
  - Retorna todos os execution_nodes com:
    node_key, technique, status, runtime_ms,
    output_type, output_shape, output_dtype
  - Não inclui output_data por padrão (pode ser grande)

getExecutionNode(req, res)
  - Retorna nó específico com output_data ou link para
    output_storage_path dependendo do tamanho
  - Inclui input_metadata para rastreabilidade

cancelExecution(req, res)
  - Atualiza status para 'cancelled'
  - Sinaliza o worker para parar via Celery revoke

rerun(req, res)
  - Cria nova execução com mesmos parâmetros
  - Define parent_execution_id para rastreabilidade

rerunFrom(req, res)
  - Re-executa a partir de nó específico
  - Reutiliza outputs de nós anteriores já computados
  - Útil quando apenas parâmetros downstream mudaram
```

---

## 15. `model.controller.js`

**Responsabilidade:** modelos treinados reutilizáveis. Modelos são produzidos como resultado de execuções, não criados diretamente. Este controller gerencia consulta, aplicação e ciclo de vida.

**Tabelas:** `models`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/models` | Lista modelos do usuário |
| `GET`    | `/models/:id` | Detalhe do modelo (hiperparâmetros, métricas, algoritmo) |
| `PUT`    | `/models/:id` | Atualiza nome, descrição |
| `DELETE` | `/models/:id` | Soft delete |
| `GET`    | `/models/:id/metrics` | Métricas de calibração, CV e validação externa |

### Funções

```
listModels(req, res)
  - Filtros: algorithm, model_type, status, project_id
  - Retorna: id, name, algorithm, model_type, status,
    metrics_cv (resumo), created_at

getModel(req, res)
  - Retorna completo: hyperparameters, preprocessing,
    selected_vars, metrics_cal, metrics_cv, metrics_ext,
    train_samples, test_samples, cv_folds,
    execution_id, dataset_id

updateModel(req, res)
  - Apenas name e description editáveis

deleteModel(req, res)
  - Soft delete; não afeta execuções associadas

getModelMetrics(req, res)
  - Retorna métricas organizadas por split:
    calibration, cross_validation, external_validation
  - Inclui: r2, rmse, rmsec, rmsecv, rmsep, mae, bias, sep
    (regressão) ou accuracy, f1, roc_auc (classificação)
```

---

## 16. `prediction.controller.js`

**Responsabilidade:** aplicação de modelos treinados a novos dados para geração de previsões. Cobre o req 5 ("aplicar modelo customizado a novos dados") e o requisito geral de previsão.

**Tabelas:** `predictions`, `jobs`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/predictions` | Lista previsões do usuário |
| `POST`   | `/predictions` | Dispara previsão com modelo + dataset |
| `GET`    | `/predictions/:id` | Resultado da previsão |
| `DELETE` | `/predictions/:id` | Remove previsão |

### Funções

```
listPredictions(req, res)
  - Filtra por model_id, source_dataset_id
  - Retorna: id, model_id, sample_count, created_at, status (via job)

createPrediction(req, res)
  - Campos: model_id, source_dataset_id (ou upload de arquivo)
  - Valida que model.status = 'ready'
  - Valida compatibilidade do dataset com os requisitos do modelo
    (dtype, shape, data_order)
  - Enfileira job do tipo 'predict'
  - Retorna { prediction_id, job_id }

getPrediction(req, res)
  - Retorna results (JSON com valores preditos por amostra),
    sample_count, model usado

deletePrediction(req, res)
```

---

## 17. `metric.controller.js`

**Responsabilidade:** consulta de métricas por nó de execução. Separado de `ExecutionController` porque métricas têm consultas próprias (comparar entre execuções, filtrar por split).

**Tabelas:** `metrics`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/executions/:eid/nodes/:nkey/metrics` | Métricas de um nó específico |
| `GET`    | `/metrics/compare` | Compara métricas entre execuções (query params: execution_ids[]) |

### Funções

```
getNodeMetrics(req, res)
  - Retorna todas as métricas do nó: name, value, dataset_split, unit
  - Ex: r2=0.98, rmse=0.04, split='calibration'

compareMetrics(req, res)
  - Recebe array de execution_ids
  - Retorna métricas agrupadas por métrica e execução
  - Útil para tabela comparativa no frontend
```

---

## 18. `executionComparison.controller.js`

**Responsabilidade:** agrupamento de execuções para comparação lado a lado — por exemplo, PARAFAC 2 vs 3 componentes, ou PLS vs N-PLS.

**Tabelas:** `execution_comparisons`, `execution_comparison_items`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/comparisons` | Lista comparações do usuário |
| `POST`   | `/comparisons` | Cria grupo de comparação |
| `GET`    | `/comparisons/:id` | Detalhe com execuções e métricas |
| `PUT`    | `/comparisons/:id` | Atualiza nome, descrição, conclusão |
| `DELETE` | `/comparisons/:id` | Remove comparação (não as execuções) |
| `POST`   | `/comparisons/:id/items` | Adiciona execução ao grupo |
| `DELETE` | `/comparisons/:id/items/:eid` | Remove execução do grupo |

### Funções

```
listComparisons / createComparison / getComparison /
updateComparison / deleteComparison(req, res)
  - CRUD padrão de execution_comparisons

getComparison(req, res)
  - Retorna comparação com execuções e métricas de cada uma
  - Organiza métricas em tabela comparativa

addItem(req, res)
  - Adiciona execution_id ao grupo com label e position

removeItem(req, res)
  - Remove execução do grupo; não cancela nem deleta a execução
```

---

## 19. `synthetic.controller.js`

**Responsabilidade:** geração de dados sintéticos (req 7). Inicialmente espectros com gaussianas; estruturado para suportar VAE/GAN/difusão no futuro.

**Tabelas:** `jobs`, `datasets`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST`   | `/synthetic/spectra` | Gera conjunto de espectros sintéticos |
| `POST`   | `/synthetic/multiway` | Gera array N-way sintético |
| `POST`   | `/synthetic/eem` | Gera dados EEM sintéticos |
| `GET`    | `/synthetic/jobs/:jid` | Acompanha job de geração |

### Funções

```
generateSpectra(req, res)
  - Parâmetros: n_samples, n_variables, peaks (array de gaussianas:
    {center, width, height}), noise_level, noise_type,
    outlier_fraction, reference_values (array para calibração)
  - Enfileira job 'operate_dataset' com sub-tipo 'synthetic_spectra'
  - Retorna { job_id }
  - Ao concluir, job cria dataset normal com os dados gerados

generateMultiway(req, res)
  - Parâmetros: shape (array N-dimensional), data_order,
    sample_axis, generation_method ('parafac', 'random', 'gaussian'),
    n_components, noise_level
  - Gera tensor N-way e salva como dataset

generateEEM(req, res)
  - Parâmetros específicos para excitação/emissão/fluorescência:
    excitation_range, emission_range, n_components, noise_level

getSyntheticJob(req, res)
  - Retorna status do job e dataset_id gerado (quando completo)
```

---

## 20. `job.controller.js`

**Responsabilidade:** consulta de status de jobs assíncronos. Jobs são criados internamente pelos outros controllers, nunca pelo usuário diretamente.

**Tabelas:** `jobs`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/jobs` | Lista jobs do usuário (recentes) |
| `GET`    | `/jobs/:id` | Status, progresso e resultado do job |
| `POST`   | `/jobs/:id/cancel` | Cancela job em fila (se ainda não iniciado) |

### Funções

```
listJobs(req, res)
  - Filtros: job_type, status
  - Retorna: id, job_type, status, progress, queued_at, started_at,
    finished_at, entidade relacionada (workflow_id, dataset_id, etc.)

getJob(req, res)
  - Retorna detalhes incluindo result (JSON) ou error_message
  - Inclui link para a entidade criada pelo job quando concluído
    (ex: dataset_id para synthetic, workflow_id para generate_workflow)

cancelJob(req, res)
  - Apenas jobs com status = 'queued' podem ser cancelados
  - Atualiza status para 'cancelled'
```

---

## 21. `aiInteraction.controller.js`

**Responsabilidade:** registro e consulta de interações com IA além da análise de artigos — assistência a workflows, sugestões de hiperparâmetros, interpretação de resultados.

**Tabelas:** `ai_interactions`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/ai-interactions` | Lista interações do usuário |
| `POST`   | `/ai-interactions` | Dispara nova interação com IA |
| `GET`    | `/ai-interactions/:id` | Resultado de interação específica |

### Funções

```
listInteractions(req, res)
  - Filtros: type, workflow_id, execution_id
  - Tipos: article_analysis, workflow_generation,
    workflow_assistance, result_analysis, other

createInteraction(req, res)
  - Campos: type, input_context (JSON com dados da situação atual),
    workflow_id (opcional), execution_id (opcional)
  - Exemplos de uso:
    - "Sugira n_components para PARAFAC neste dataset"
    - "Interprete estes scores de PCA"
    - "Sugira pré-processamento para dados NIR com baseline"
  - Chama LLM com contexto e salva output em ai_interactions

getInteraction(req, res)
  - Retorna output (texto da IA), model usado, created_at
```

---

## 22. `audit.controller.js`

**Responsabilidade:** log de auditoria. Apenas para admins. Pode ser implementado depois.

**Tabelas:** `audit_logs`

### Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`    | `/audit-logs` | Lista logs (apenas admin) |
| `GET`    | `/audit-logs/:entity_type/:entity_id` | Histórico de entidade específica |

### Funções

```
listLogs(req, res)
  - Apenas role = 'admin'
  - Filtros: user_id, entity_type, entity_id, action, date range
  - Retorna: action, entity_type, entity_id, before_data,
    after_data, user_id, created_at

getEntityHistory(req, res)
  - Histórico completo de uma entidade (ex: dataset/:id)
```

---

## Tabelas novas necessárias (gaps vs banco atual)

As tabelas a seguir precisam ser adicionadas ao `database.md` e ao script SQL:

### `projects`
```sql
id, uuid, user_id, name, description, visibility,
status (active|archived), created_at, updated_at, deleted_at
```

### `project_members`
```sql
id, project_id, user_id, role (viewer|editor|admin), joined_at
```

### `project_datasets`
```sql
id, project_id, dataset_id, purpose (training|validation|test|
calibration|prediction|reference|other), added_by, added_at
```
> `purpose` fica aqui (não em `datasets`) porque o mesmo dataset pode ser "calibração" num projeto e "validação" em outro.

### `project_workflows`
```sql
id, project_id, workflow_id, added_by, added_at
```

### `project_articles`
```sql
id, project_id, article_id, added_by, added_at
```

### `community_projects`
```sql
id, community_id, project_id, shared_by, shared_at
```

### `workflow_versions`
```sql
id, workflow_id, label, description, definition (JSON),
created_by, created_at
```

### Campos adicionais em tabelas existentes

**`techniques`:**
```sql
is_custom    TINYINT(1) DEFAULT 0
user_id      BIGINT UNSIGNED NULL  -- dono se is_custom = 1
custom_definition  JSON NULL        -- cadeia de operações
```

**`datasets`:**
```sql
dtype        VARCHAR(50) NULL  -- float32, float64, complex128...
```
> (mencionado em database.md, ausente no dump SQL)

---

## Mapa de Requisitos × Controllers

| Requisito | Controllers principais |
|-----------|----------------------|
| 1 — Gestão e importação de dados | `dataset`, `spectrum`, `collection` |
| 2 — Exploração e visualização | `dataset` (slice, preview), `spectrum` (plot), `collection` |
| 3 — Workflow de análise | `workflow`, `workflowNode`, `workflowEdge`, `execution`, `technique` |
| 4 — Artigos → workflows | `article`, `articleAnalysis`, `workflow` |
| 5 — Operações matemáticas e modelos customizados | `technique` (createCustom), `execution`, `prediction` |
| 6 — Organização de projetos | `project`, `community`, `workflow` (versions) |
| 7 — Dados sintéticos | `synthetic` |
| 8 — Reprodutibilidade e rastreabilidade | `dataset` (lineage), `execution`, `executionComparison`, `workflow` (versions), `audit` |

---

## Convenções gerais da API

- Todas as respostas seguem `{ data: ..., meta: ..., error: null }` ou `{ data: null, error: { code, message } }`
- Paginação padrão: `?page=1&per_page=20` com `meta.total` na resposta
- Soft deletes respondem `204 No Content`; registros com `deleted_at` preenchido não aparecem em listagens sem `?include_deleted=true`
- Erros de validação retornam `422 Unprocessable Entity` com array de erros por campo
- Erros de permissão retornam `403 Forbidden` com mensagem descritiva
- Jobs assíncronos retornam `202 Accepted` com `{ job_id }` imediatamente
- Uploads de arquivo usam `multipart/form-data`; demais endpoints usam `application/json`