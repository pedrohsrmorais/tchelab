# Armazenamento e cota por usuário

> Implementado em 22/10/2026 (fases 1 e 2 do `plano_armazenamento_minio.md`). Testes: `backend_api/tests/quota_e2e.mjs`
> (71 checagens, nos drivers `local` e `s3`) e `backend_api/tests/storage_driver_check.mjs`.

## 1. Onde cada coisa fica

| Dado | Onde | Formato / chave | Conta na cota? |
|---|---|---|---|
| Arquivos de dataset enviados (CSV etc.) | Storage (MinIO/S3) | `datasets/<uuid-do-dataset>.<ext>` | sim (tamanho do arquivo) |
| Matrizes/tensores e metadados de dataset | **MySQL** `datasets.metadata` (JSON) | JSON (limite atual de 10 MB por requisição — sai do MySQL na fase 3) | sim (bytes do JSON + 1 KB de linha) |
| Material de comunidade (PPTX, PDF…) e prévias | Storage | `communities/<arquivo>` (prévia em PDF ao lado) | sim, de **quem enviou** |
| PDFs de artigos | Storage | `articles/<uuid>.pdf` | sim |
| Foto de perfil | Storage | `avatars/<arquivo>` (servida em `/storage/avatars/:nome`) | sim |
| Imagem de equipamento | Storage | `equipment/<arquivo>` | sim, de quem enviou |
| Resultado de execução (saídas dos nós) | MySQL (`execution_nodes.output_data`, `jobs.result`) | JSON | sim, por execução (`ref_type=execution`) |
| Arquivos temporários de upload | disco local do backend (`STORAGE_PATH/tmp`) | apagados ao fim da requisição; o que sobrar de uploads interrompidos é limpo ao iniciar | não |

> Diferença em relação ao plano: as chaves **mantêm a pasta por tipo** (`datasets/`, `communities/`…) em vez de
> `u/<usuario>/…`. Quem é o dono de cada objeto fica na tabela `storage_objects`, que é a fonte da cota.

## 2. Modelo da cota

- **Plano Beta**: 100 MB por usuário, 20 MB por arquivo. Plano `staff`: 10 GB / 200 MB (para contas internas).
  Ajustáveis por plano (`PUT /admin/storage/plans/:code`) e por usuário (`PUT /admin/storage/users/:uuid`), sem deploy.
  A cota efetiva do usuário é `users.storage_quota_bytes` (se definida) → cota do plano → cota do plano padrão.
- **Tudo que entra no Workspace conta**, inclusive cópia/importação de dataset da plataforma ou de comunidade.
  Arquivo de comunidade conta para quem enviou. Saídas de execução contam e **não expiram**: o usuário libera espaço excluindo.
- **Só escrever é bloqueado.** Ler, baixar e excluir continuam funcionando com a cota cheia.
- **Reserva atômica**: antes de gravar, `UPDATE users SET storage_reserved_bytes = … WHERE used + reserved + n <= cota`
  (uma instrução, sem corrida). Depois: grava e `commit` (reserva vira uso, registra em `storage_objects` e no
  `storage_ledger`) ou `release` se falhar. Oito envios simultâneos com cota para três: só três passam (testado).
- **Tabelas**: `storage_plans`, `storage_objects` (um registro por objeto ativo, com dono, tipo e referência),
  `storage_ledger` (histórico de cada variação, para auditoria), colunas `users.storage_*`.
- **Proteção do servidor**: acima de 90% de ocupação global (`STORAGE_GLOBAL_LIMIT`, capacidade lida do disco ou de
  `S3_CAPACITY_BYTES`) novas gravações recebem `503 STORAGE_SERVER_FULL`, mesmo para quem tem cota sobrando.

### Erros da API

| HTTP | `error.code` | Quando |
|---|---|---|
| 413 | `STORAGE_QUOTA_EXCEEDED` | não cabe na cota (`details`: `used`, `quota`, `needed`, `remaining`) |
| 413 | `FILE_TOO_LARGE` | maior que o máximo por arquivo do plano (`details`: `size`, `max_file_bytes`) |
| 503 | `STORAGE_SERVER_FULL` | servidor acima do limite global |

### Endpoints

- `GET /storage/usage[?details=1&limit=30]` — uso, cota, plano e nível (`ok` < 80% ≤ `warning` < 95% ≤ `critical` < 100% = `full`);
  com `details`, lista `by_kind` e `items` (nome, tipo, tamanho, `deletable`) do maior para o menor.
- `GET /admin/storage` — capacidade × cota alocada × uso real, sobrevenda e uso por usuário. `GET /admin/storage/plans`, `PUT /admin/storage/plans/:code`, `PUT /admin/storage/users/:uuid`.
- `DELETE /executions/:id` — exclui a execução (não pode estar em fila/rodando) e devolve o espaço.

## 3. Interface

- **Sidebar**: medidor "X de Y" (verde → âmbar a 80% → vermelho a 95%); leva a `Perfil → Armazenamento`.
- **Perfil → Armazenamento**: barra de uso, tamanhos por tipo e a lista "o que mais ocupa espaço" com abrir/excluir (confirmação em dois cliques).
- **Diálogo "Seu armazenamento está cheio"**: abre sozinho em qualquer 413 de cota (interceptor do axios) e já mostra o que excluir.
- **Admin → Armazenamento**: cartões de capacidade/alocação/uso/sobrevenda, edição de planos e cota por usuário.

## 3.1 Consumo de processamento e custo por usuário (22/10/2026)

O worker mede **cada job** (`worker_api/metering.py`) e devolve em `JobResult.metrics`; o `resultConsumer` grava em `jobs`
(`cpu_seconds`, `wall_ms`, `peak_rss_bytes`, `mem_bytes`, `input_bytes`, `output_bytes`), em `execution_nodes.metrics` e soma ao
mês do usuário em `usage_monthly` (jobs, falhas, CPU, GB·s de RAM, pico de memória, bytes, **GB·hora de armazenamento**).

- **CPU**: tempo de CPU do processo (inclui threads do NumPy/BLAS) repartido em partes iguais entre os jobs ativos a cada intervalo.
  Com 1 job é exato; com N simultâneos a soma dos jobs bate com o gasto real do processo (testado).
- **Memória**: `peak_rss_bytes` = pico do processo durante o job (para dimensionar o servidor); `mem_bytes` = quanto passou do RSS
  ocioso, dividido pelos jobs simultâneos (estimativa; exata com `WORKER_CONCURRENCY=1`).
- **Armazenamento ao longo do tempo**: a cada hora o backend credita `GB usados × horas` ao mês (`usage.service.js › tickStorage`;
  cobre reinícios, máx. 48 h).
- **Falha também conta** (consumiu CPU).
- Endpoints: `GET /usage/compute` (usuário: mês atual + 6 meses, orçamento de CPU do plano), `GET /admin/storage` (consumo e custo do
  mês por usuário), `GET /admin/storage/costs?licenses=N` (calculadora), `PUT /admin/storage/prices` e `PUT /admin/storage/plans/:code`
  (agora aceita `monthly_cpu_seconds`).
- **Fórmulas** (preços editáveis no painel; os iniciais são só exemplo: US$ 0,023/GB·mês e US$ 0,05/CPU-hora):
  `armazenamento = GB médios × preço_GB_mês` (GB médios = GB·hora ÷ 730) · `processamento = CPU-horas × preço_CPU_hora`
  (o preço da CPU-hora deve embutir a memória) · `teto por usuário = cota do plano × preço_GB_mês + orçamento de CPU do plano (h) × preço_CPU_hora`.
  Para N licenças, `N × teto`. Orçamentos iniciais de CPU (placeholders editáveis): Beta 10 h/mês, Equipe 200 h/mês.
- **Ainda não bloqueia**: o orçamento mensal de CPU é medido e exibido, mas não impede execuções (decisão de produto pendente: bloquear,
  só avisar, ou cobrar excedente). Também falta o limite de jobs simultâneos por usuário (`max_concurrent_jobs` existe no plano, sem aplicação).
- Testes: `worker_api/tests/test_metering.py` (7) e `backend_api/tests/usage_e2e.mjs` (30, com o worker real).

## 4. Subindo com MinIO (Docker)

1. No `.env`: defina `S3_ACCESS_KEY` e `S3_SECRET_KEY` únicos (`openssl rand -hex 24`) e `S3_CAPACITY_BYTES` (o que você provisionou).
2. `docker compose up -d` — o serviço `minio` sobe com o volume `minio_data`; o backend cria o bucket e a regra de lifecycle de `tmp/` ao iniciar (`storage.init`, com novas tentativas).
3. O console do MinIO (porta 9001) **não é publicado**; use túnel SSH.
4. **Dados antigos**: `docker compose exec backend node scripts/storage_backfill.js --dry-run` e depois sem `--dry-run`. É idempotente: envia os arquivos antigos ao bucket, registra `storage_objects`, recalcula o uso e lista quem já passou da cota. Use `LEGACY_STORAGE_PATH` se os arquivos antigos estiverem em outra pasta.
5. Desenvolvimento sem MinIO: `STORAGE_DRIVER=local` (grava em `STORAGE_PATH`).

### Migrar para a AWS S3

`STORAGE_DRIVER=s3`, `S3_ENDPOINT=` (vazio), `S3_FORCE_PATH_STYLE=false`, `S3_REGION=<região>`, `S3_BUCKET=<bucket>` e as chaves IAM em `S3_ACCESS_KEY`/`S3_SECRET_KEY`. Copie o conteúdo do bucket do MinIO para o da AWS (`mc mirror` ou `aws s3 sync`) antes de trocar. Nenhum código muda.

### Checklist de produção

- [ ] Trocar `S3_SECRET_KEY` por valor forte; **rotacionar a chave Resend** que esteve em `.env` durante o desenvolvimento.
- [ ] Backup do volume `minio_data` (ou versionamento/replicação no S3).
- [ ] Definir `S3_CAPACITY_BYTES` para o painel de sobrevenda refletir a realidade.
- [ ] Rodar o `storage_backfill.js` e conferir a lista de usuários acima da cota.
- [ ] Testar `docker compose up` com o MinIO real (os testes aqui usaram um mock S3 compatível; o MinIO em si não foi executado no ambiente de desenvolvimento).

## 5. Limitações conhecidas (próximas fases)

- **Fase 3**: tensores ainda ficam no JSON do MySQL; `jobs.result` e `execution_nodes.input_data/output_data` duplicam JSON grande; o navegador ainda baixa o tensor e o reenvia no `dispatch`; o worker não lê o bucket; teto de 10 MB por requisição JSON.
- **Fase 4**: datasets excluídos (soft delete) mantêm os metadados no MySQL até uma rotina de limpeza; usuário excluído (soft delete) não tem os dados apagados; sem lixeira nem reconciliação semanal.
- **Fase 6 (restante)**: aplicar o orçamento de CPU e o limite de jobs simultâneos por usuário (a medição e a calculadora já existem, ver §3.1).
- Antes de executar um workflow a plataforma ainda **não** confere espaço mínimo livre: se a saída não couber, o nó falha com `STORAGE_QUOTA_EXCEEDED` (sem gravar parcial).
- A foto nova precisa de espaço antes de a antiga ser liberada (troca de avatar com cota quase cheia pode falhar; exclua a foto antiga primeiro).
