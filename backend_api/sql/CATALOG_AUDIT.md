# Auditoria do catálogo de técnicas — 2026-10-10

Contexto: módulo "Catálogo" pedido pelo usuário expôs que a tabela `techniques`
nunca foi mantida em sincronia com os 169 scripts reais em `worker_api/catalog/`.
Isso importa porque `workflow_nodes.technique_id → techniques.slug` é o valor
enviado **direto** pro worker Python (`ScriptFactory.get(slug)`) — um slug
desalinhado quebra a execução daquele nó specific.

Aplicado em `sync_catalog_169.sql` (idempotente, seguro rodar de novo):

## 1. Renomeações aplicadas (20) — mesma técnica, slug divergente

| slug antigo (banco) | slug novo (= código real) |
|---|---|
| array_concatenate | concatenacao |
| autoscale | autoscaling |
| baseline_correction | baseline |
| dataset | importacao |
| hosvd | tensor_svd |
| ipls_var | ipls |
| lasso_regression | lasso |
| lstm | rnn |
| mean_center | centering |
| mlr | ols |
| multiway_pcr | n_way_pcr |
| normalization | normalizacao |
| ntf | tensor_nmf |
| pareto_scaling | pareto |
| ridge_regression | ridge |
| second_order_calibration | segunda_ordem |
| svr | nonlinear_regression |
| third_order_calibration | terceira_ordem |
| unfolded_pls | u_pls |
| unfolded_pls_da | multiway_pls_da |

## 2. Técnicas adicionadas (37) — já funcionam no worker, nunca tiveram linha

Inclui `hca` (agrupamento hierárquico) e `kmeans` — provavelmente nunca
apareceram selecionáveis no editor de workflow até agora. Lista completa em
`sync_catalog_169.sql`, seção 2.

## 3. Pendente — pares ambíguos (NÃO tocados, decisão humana necessária)

Nome/propósito parecido, mas descrição sugere método computacional diferente
por dentro. Não renomeei sem confirmar:

- `dataset_split` (banco: divisão genérica treino/teste/validação) vs
  `kennard_stone` (código: divisão determinística por distância) — podem ser
  técnicas distintas de verdade (split aleatório vs Kennard-Stone).
- `mlp_classification` + `mlp_regression` (2 linhas no banco) vs `mlp`
  (1 script só, parametrizado por `task`) — precisa decidir se consolida em
  uma linha ou se o script passa a aceitar duas entradas distintas.
- `pca_multiway` (banco: via Tucker R=1) vs `mpca` (código: via desdobramento
  iterativo) — podem ser dois métodos diferentes de PCA multiway, não o mesmo.
- `tucker_lda` (banco) vs `multilinear_lda` (código) — base computacional
  descrita diferente (scores Tucker vs tensor desdobrado).
- `tucker_pls` (banco) vs `hpls` (código) — mesma dúvida.
- `parafac_simca` (banco: scores PARAFAC) vs `multiway_simca` (código: tensor
  desdobrado) — mesma dúvida.
- `n_pls_da` (banco) — descreve N-PLS-DA via decomposição; não existe
  equivalente real no código (só a versão desdobrada, já mapeada para
  `multiway_pls_da`). Hoje é uma técnica sem script de verdade.
- `cluster_analysis`, `cp_decomp`, `hooi` — parecem placeholders legados
  (cluster_analysis sobrepõe hca+kmeans; cp_decomp é conceitualmente o mesmo
  que parafac; hooi é o método interno de otimização do tucker3, não um nó
  separado).

## 4. Pendente — declaradas no banco sem NENHUM script por trás (~18)

Vão quebrar se alguém arrastar pro workflow e rodar. Por decisão do usuário,
ficam como estão por ora — só documentar no módulo Catálogo como "não
implementado":

`atld`, `blls`, `core_consistency`, `correlation_analysis`, `dataset_info`,
`dataset_upload`, `descriptive_statistics`, `gpr`, `gram`, `interpolation`,
`logistic_regression`, `naive_bayes`, `nbet_correction`, `prediction`,
`rayleigh_masking`, `smoothing`, `spectral_cropping`, e os 3 duplicados de
nós de manipulação de array já existentes (`array_reshape`/`array_transpose`/
`array_unfold` — duplicam `reshape`/`transpose`/`unfolding`, que já funcionam).

## Deploy

`sync_catalog_169.sql` já foi testado localmente (MariaDB) contra uma cópia
de `init.mysql`: aplica limpo, é idempotente (rodar 2x não duplica nada), e
reduziu a divergência código↔banco de 60 para 5 slugs (os 5 que ficaram em
aberto são justamente os pares ambíguos da seção 3 acima, propositalmente
não tocados).

Em produção (sem derrubar o volume do MySQL):

```bash
docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
  < backend_api/sql/sync_catalog_169.sql
```

`init.mysql` também foi atualizado com a mesma sincronização, então uma
instalação nova (`docker compose down -v && up -d --build`) já nasce correta.

## 5. Lista beta (2026-10-10) — 75 técnicas ativas, resto "em desenvolvimento"

Decisão do usuário: pra essa versão beta, só as 75 técnicas abaixo ficam
selecionáveis no editor de workflow (`active = 1`); as outras 123 continuam
no catálogo pra documentação, mas marcadas `active = 0` — não aparecem no
editor e a API recusa criar nó com elas (`workflowNode.controller.js`).

**37 analíticas**: PCA, HCA, PLS, PLS-DA, SIMCA, PLS One-Class, SVM, Random
Forest, KNN, SNV, MSC, Autoscaling, Mean Centering, Savitzky-Golay,
Correção de Linha de Base, N-PLS, U-PLS, PARAFAC, Tucker3, Multiway PLS-DA,
iPLS, VIP, Cross-Validation, Detecção de Outliers, Metrics Aggregation, DS,
PDS, MLP, CNN-1D, Autoencoder, RNN, Transformer, Diffusion Model, PCR,
MCR-ALS, LDA, Leverage e Influência.

**38 utilitárias (família 01_dados — infraestrutura, não modelos)**:
Kennard-Stone, SVD, autovalores/autovetores/EIG, inversa/pseudo-inversa,
folding/unfolding, e a plumbing básica de array (soma, transpose, reshape,
slice, split, stack, concatenação, etc).

Achado durante a implementação: `mlp` nunca teve linha própria no banco —
era um dos 5 pares ambíguos da seção 3 (só existiam `mlp_classification` e
`mlp_regression` separados, mas o script Python real é um só, parametrizado
por `task`). Inserida a linha `mlp` em `beta_active_set.sql`;
`mlp_classification`/`mlp_regression` ficam como duplicatas inativas.

Implementação: `GET /techniques` agora filtra `active = 1` por padrão (passe
`include_inactive=true` pra listar tudo — é o que a página de Catálogo vai
usar). `POST /workflows/:wid/nodes` recusa criar nó com técnica `active = 0`
mesmo chamando a API direto, não só escondendo da listagem.

## 6. `init.mysql` consolidado (2026-10-10)

`seed_kennard_stone.sql` e `beta_active_set.sql` foram incorporados ao final
de `backend_api/src/config/init.mysql`, na ordem: schema → seed base → sync
do catálogo (169 scripts) → seed Kennard-Stone (schema completo, sobrescreve
a versão thin do sync) → lista beta de 75 ativas. `docker-compose.yml` não
monta mais `seed_kennard_stone.sql` separado — só `init.mysql`.

**Dois caminhos, não confundir:**

- **Banco do zero** (`docker compose down -v && up -d --build`, ou primeira
  instalação): só precisa de `init.mysql`, que já roda tudo sozinho via
  `docker-entrypoint-initdb.d`. Ele faz `DROP TABLE IF EXISTS` em tudo — **não
  rode à mão contra um banco que já tem dado que você quer manter.**
- **Banco já existente, sem recriar volume** (caso de produção com dado
  real): continue usando os arquivos avulsos em sequência, que são
  idempotentes e não tocam em nenhuma tabela além de `techniques`:
  ```bash
  docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
    < backend_api/sql/sync_catalog_169.sql
  docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
    < backend_api/sql/seed_kennard_stone.sql
  docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
    < backend_api/sql/beta_active_set.sql
  docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
    < backend_api/sql/catalog_content.sql
  docker compose up -d --build backend
  ```

## 7. Conteúdo do módulo Catálogo (2026-10-10) — `how_it_works`, `historical_note`, `usage_tips`

Pedido do usuário: a página de Catálogo precisa mostrar, pra cada técnica,
como ela funciona, uma curiosidade histórica, dicas de uso prático (ex:
"espera dados ortogonais, recomenda-se PCA antes"), e descrição de cada
porta de input/output — não só o nome.

Três colunas novas em `techniques` (`ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, seguro rodar de novo): `how_it_works`, `historical_note` (pode ser
NULL — nem toda técnica tem uma origem notável o suficiente pra citar) e
`usage_tips`. Além disso, `input_schema`/`output_schema` ganharam uma chave
`description` por porta via `JSON_MERGE_PATCH` (preserva `type`/`shape` que
já existiam, só acrescenta a descrição).

Conteúdo escrito à mão pra todas as 75 técnicas ativas (as 123 "em
desenvolvimento" mantêm só a `description` curta que já tinham — não
receberam o tratamento completo, por escopo: o pedido foi sobre os modelos
desta versão beta). Fontes:

- `catalog_content_source.py` — dicionário Python com o conteúdo de cada
  técnica (fonte da verdade; é aqui que se edita/corrige texto).
- `catalog_content.json` — dump do dicionário acima (gerado, não editar à mão).
- `gen_catalog_content_sql.py` — lê o JSON e gera `catalog_content.sql`.
- `catalog_content.sql` — o SQL final, idempotente, já incorporado ao fim
  de `init.mysql` (então uma instalação nova já nasce com o conteúdo).

**Armadilha encontrada e corrigida**: várias técnicas (pca, svd,
autovalores/autovetores/eig, determinante, rank, trace, norma, transpose,
reshape, squeeze, expand_dims, mean/median/std/max/min/sum, folding,
unfolding, pls_da) **já tinham** `input_schema`/`output_schema` com nomes
de porta reais (ex: `svd` usa `A`/`U`/`S`/`Vt`, não `X`/`U`/`S`/`Vt`). O
conteúdo escrito inicialmente usou nomes "de memória" que não bateram em
~20 casos — se tivesse ido direto pro `JSON_MERGE_PATCH`, teria criado
portas fantasmas (com descrição, mas nunca populadas em execução real) ao
lado das portas reais (sem descrição). `gen_catalog_content_sql.py` tem um
dicionário `RENAME` que corrige isso antes de gerar o SQL — qualquer
técnica nova adicionada ao conteúdo deve ter seu `input_schema`/
`output_schema` real (`SELECT input_schema, output_schema FROM techniques
WHERE slug=...`) conferido contra as chaves usadas, não assumido.

`kennard_stone` é a única das 75 sem `usage_tips` (schema completo já
definido em `seed_kennard_stone.sql`, com descrição por porta desde a
criação — não sobrescrito), mas ganhou `how_it_works`/`historical_note`
pra não ficar como a única sem nenhum texto na página de Catálogo.

## 8. Auditoria de hiperparâmetros (2026-10-13) — `parameter_schema` das 75 técnicas ativas

Pedido do usuário: documentar quais modelos do front têm hiperparâmetros
configuráveis de fato, como primeiro passo antes de permitir que o usuário
injete hiperparâmetros pelo frontend (ex: número de camadas da RNN). Escopo
confirmado com o usuário via pergunta direta: **Fases 0, 1 e 2 apenas**.
Fases 3 (UI especial para `importacao`/`formula_customizada`), 4 (editores
ricos — select/checkbox/array no `NodeConfigPanel`) e 5 (modal unificado
descrição+hiperparâmetros+resultados) foram explicitamente adiadas.

### Como foi feita a auditoria

Para cada uma das 75 técnicas ativas (`active=1 AND is_custom=0`), o
`parameter_schema` salvo no banco foi comparado com o que o script Python
real (`worker_api/catalog/familia_*/scripts.py`) de fato lê via
`params.get(...)`/`params[...]`, lendo o código-fonte de cada classe (não
inferência pelo nome). Resultado: 16 OK, 9 com bug de nomenclatura
(schema existia mas com chave errada — valor do usuário era silenciosamente
ignorado na execução), 36 sem nenhum schema, e 14 genuinamente sem
parâmetro nenhum (ex: `soma`, `trace`, `svd`/`autovalores`/etc. —
operações de álgebra linear puras). Documentação completa entregue ao
usuário em `auditoria-hiperparametros-tchelab.md`.

Também identificados dois casos estruturais que não se encaixam no modelo
de "porta de entrada fixa" (confirmado com o usuário):
- **`importacao`**: nó-fonte, zero portas de entrada reais — 100% via
  parâmetros (`file_path`, `format`, `sample_axis`, `dtype`). O banco
  mostrava uma porta fantasma `"file"` que o script nunca lê.
- **`formula_customizada`**: portas de entrada dinâmicas/variádicas —
  aceita N arrays com nome livre, referenciados dentro da própria
  expressão (`for key, val in inputs.items(): ...`). O banco mostrava uma
  única porta fixa fake `"X"`.
  (A UI especial para esses dois casos é Fase 3, fora do escopo desta rodada.)

### Fase 1 — corrige 9 `parameter_schema` com bug de nomenclatura

Técnicas afetadas: `rnn`, `tucker3`, `pca`, `pls`, `pls_da`,
`random_forest`, `parafac`, `cross_validation`, `savitzky_golay`. Cada
schema foi substituído por completo (não merge — o antigo estava errado e
não deveria sobreviver), com `type`/`default`/`minimum`/`maximum`/`enum`/
`description` por campo, batendo com o que o Python real aceita. Destaque:
`rnn` não tinha `hidden_layers`/`hidden_units` como eu tinha dito
incorretamente ao usuário antes desta auditoria — os parâmetros reais são
`task`, `cell`, `units` (lista — comprimento define número de camadas),
`dense_units`, `dropout`, `epochs`, `batch_size`, `learning_rate`.

Nota sobre `kennard_stone`: a extração automatizada por regex inicialmente
apontou essa técnica como "com bug" (não achou `n_train`/`train_size`/etc.
como parâmetros reais), mas isso foi falso positivo — o código lê esses
parâmetros através de um helper estático
`_resolve_count(params, int_key, frac_key, n, default_frac)` que recebe os
nomes das chaves como variável, não como string literal, invisível pra
regex. Conferido manualmente lendo a classe completa: o schema já existente
no banco está correto. Não entrou na lista de bugs.

Fontes: `backend_api/sql/fix_param_schema_bugs_source.py` →
`backend_api/sql/fix_param_schema_bugs.sql`.

### Fase 2 — preenche `parameter_schema` das 36 técnicas sem nenhum schema

Mesma exigência de rigor: cada parâmetro foi conferido lendo o
`execute()`/`validate()` real antes de escrever o schema (não assumido
pelo nome). Cobre modelos de deep learning (`autoencoder`, `cnn_1d`,
`diffusion`, `mlp`, `transformer`), multiway (`mcr_als`, `n_pls`, `u_pls`,
`multiway_pls_da`), classificação/regressão (`knn`, `svm`, `lda`, `pcr`,
`pls_oc`, `simca`, `ipls`), pré-processamento (`baseline`, `centering`,
`msc`, `snv`, `tratamento_missing`), utilitários estruturais
(`concatenacao`, `limpeza`, `selecao_amostras`, `selecao_variaveis`,
`slice`, `split`, `stack`), análise (`hca`, `outlier_detection`, `vip`,
`leverage_influence`, `pds`, `metrics_aggregation`) e os dois casos
estruturais `importacao`/`formula_customizada` (schema de parâmetros
preenchido mesmo com a UI especial ainda pendente — Fase 3).

Fontes: `backend_api/sql/fill_missing_schema_source.py` →
`backend_api/sql/fill_missing_schema.sql`.

### Verificação

Ambos os SQLs são idempotentes (`UPDATE ... SET parameter_schema = '<json
completo>' WHERE slug = ...` — substitui o valor inteiro, não faz merge).
Testados duas vezes cada contra `tchelab_test` local (segunda rodada produz
o mesmo resultado). Depois de aplicados os dois, restam exatamente as 14
técnicas genuinamente sem parâmetro algum (`autoscaling`, `autovalores`,
`autovetores`, `determinante`, `divisao_elementwise`, `ds`, `eig`,
`inversa`, `multiplicacao_elementwise`, `produto_matricial`,
`pseudo_inversa`, `soma`, `subtracao`, `trace`) — confirmado batendo
exatamente com a classificação "SEM_PARAMS" da auditoria. `init.mysql`
recebeu os dois blocos (antes do rodapé `SET TIME_ZONE=@OLD_TIME_ZONE`) e
foi re-testado via `DROP DATABASE`/`CREATE DATABASE`/load completo do
zero: 75 técnicas ativas, 61 com `parameter_schema` real, 14 corretamente
vazias.

O que isso desbloqueia: a infraestrutura de execução (`workflowNode.
controller.js` grava `parameters` como JSON livre, `worker.py` passa
direto pro `script.execute()`) já suportava parâmetros arbitrários de
ponta a ponta — o único gap real pra "controle máximo dos modelos" pelo
usuário era a completude do `parameter_schema` no banco (resolvido aqui) e
a riqueza da UI do `NodeConfigPanel`, que hoje só renderiza
`<input type="number">`/`<input type="text">` — isso é Fase 4, fora do
escopo desta rodada.
