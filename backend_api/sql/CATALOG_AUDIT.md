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

Aplicar em produção:
```bash
docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
  < backend_api/sql/beta_active_set.sql
docker compose up -d --build backend
```
