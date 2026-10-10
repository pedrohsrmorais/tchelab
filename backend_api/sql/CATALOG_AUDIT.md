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
