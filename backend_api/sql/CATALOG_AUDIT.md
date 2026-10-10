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
