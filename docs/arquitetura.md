# Arquitetura do TcheLab

Visão de conjunto de como as peças se encaixam. Detalhes por assunto: [índice](README.md).

## 1. Componentes

```
Navegador ── React (Vite, zustand, React Flow, Plotly) ──┐
                                                          │ HTTPS /api/v1  (JWT Bearer)
                                                          ▼
                       ┌────────────── backend_api (Node/Express, :3003) ──────────────┐
                       │ routes → controllers → services (quota, usage, storage, mail, │
                       │ access, jobs…)        serve também o frontend compilado       │
                       └───┬───────────────┬──────────────────┬────────────────────┬───┘
                           │ SQL           │ fila/canal       │ S3 API             │ SMTP/API
                           ▼               ▼                  ▼                    ▼
                     MySQL/MariaDB      Redis (BLPOP +     MinIO / AWS S3      Resend (e-mail)
                     metadados,         pub/sub de         (ou disco local,
                     cota, consumo,     resultados)        STORAGE_DRIVER=local)
                     tensores*              ▲
                                            │ JobRequest / JobResult
                                      worker_api (Python)  ── executa as técnicas do catálogo
```
\* Os tensores ainda ficam no MySQL (teto de ~10 MB por linha); a Fase 3 os move para o bucket — [plano](plano_armazenamento_minio.md#8-fase-3-detalhada--dados-fora-do-mysql-busca-rápida-modelos-lendo-do-bucket).

| Componente | Pasta | Papel |
|---|---|---|
| Frontend | `frontend/` | SPA; i18n pt/en/es; 3 temas; páginas de Workspace, Workflows, Catálogo, Comunidades (apps), Perfil, Admin |
| Backend | `backend_api/` | REST `/api/v1`, autenticação JWT (acesso + refresh), papéis de comunidade, cota, medição, pipeline de execução (DAG), e-mail, prévia de Office→PDF (LibreOffice) |
| Worker | `worker_api/` | Consome a fila Redis, instancia a técnica pelo `slug` (`ScriptFactory`), executa, mede CPU/RAM e publica o `JobResult` |
| Banco | MySQL 8 (compose) / MariaDB | Esquema em [database.md](database.md); migrações idempotentes em `src/config/migrate.js` |
| Redis | – | Fila `tchelab_fila` e canal `tchelab_resultados` |
| Arquivos | MinIO (compose) ou S3 | Atrás do `StorageService`, drivers `local` e `s3` |

## 2. Fluxo de uma execução

1. O usuário monta o workflow (grafo tipado) e clica em executar → `POST /executions/:id/dispatch`.
2. O backend confere **orçamento de CPU** (402 se esgotado), valida o grafo, cria `execution_nodes` e enfileira os nós prontos (`job.service.js`).
3. O worker faz `BLPOP`, roda `validate` + `execute` da técnica e publica o resultado com `metrics` (CPU, pico de memória, bytes).
4. `resultConsumer.service.js` grava saída e métricas (`jobs`, `execution_nodes.metrics`, `usage_monthly`), reserva **cota** para as saídas
   e chama `advanceExecution`, que libera os nós seguintes (ou marca `failed`/`skipped`; bloqueia nós não iniciados se o orçamento acabou).
5. O frontend acompanha a execução e mostra os resultados; operações rápidas de dataset usam o mesmo caminho com um workflow efêmero.

Detalhes: [workflow.md](workflow.md) (grafo, validação, resultados) e [api-python.md](api-python.md) (contrato com o worker).

## 3. Arquivos, cota e consumo

- **Onde cada arquivo mora:** [armazenamento.md §1](armazenamento.md#1-onde-cada-coisa-fica) (pastas lógicas `datasets/ communities/ articles/ avatars/ equipment/`; uploads passam por `STORAGE_PATH/tmp`).
- **Cota por usuário** (Beta: 100 MB/usuário, 20 MB/arquivo): reserva atômica → grava → confirma/libera; só escrever é bloqueado; erros 413/503. Ledger e `storage_objects` no MySQL.
- **Consumo:** CPU, RAM e armazenamento ao longo do tempo por usuário e mês; **calculadora** de custo real × teto por plano (preços editáveis no Admin);
  **orçamento mensal de CPU** bloqueia novas execuções (402). Ver [armazenamento.md §3.1](armazenamento.md#31-consumo-de-processamento-e-custo-por-usuário-22102026).
- **Proteção do servidor:** acima de 90% de ocupação global → 503 `STORAGE_SERVER_FULL`.

## 4. Segurança e acesso

- JWT de acesso (`JWT_EXPIRES_IN`, 24 h) e de refresh (30 d); limitadores de taxa em login/cadastro e nas rotas públicas.
- Papéis de comunidade `owner > admin > moderator > member` (`cg('<papel>')` no roteador); acesso derivado a projetos, workflows e variáveis em
  `access.service.js`. Administradores da plataforma acessam `/admin/*`.
- Página pública de equipamentos (`/e/:token`) sem login: só horários ocupados, honeypot, limites por e-mail/IP; tokens de gerenciamento guardados como hash.
- Uploads: tipo e tamanho validados (`utils/multer.js`, teto rígido `UPLOAD_MAX_BYTES`); imagens com `nosniff` e CSP sandbox; SVG recusado.
- Segredos só em `.env`/gerenciador de segredos. O worker (Fase 3) lerá o bucket com credencial própria, somente leitura.

## 5. Implantação

**Docker Compose** (`docker-compose.yml`): `mysql`, `redis`, `minio`, `backend` (porta 3003; volume `storage_data` para `tmp/` e `local`) e `worker`;
volumes `mysql_data`, `redis_data`, `storage_data`, `minio_data`. `Dockerfile` (raiz) compila o frontend e empacota o backend; `worker_api/Dockerfile` o worker.

**Sem Docker:** `pm2 start ecosystem.config.js` (`tchelab-api` e `tchelab-worker`, ajuste os caminhos `cwd`); MySQL/MariaDB, Redis e MinIO/S3 à parte.
Atualização: `git pull`, `npm run build` em `frontend/`, reiniciar API e worker (a migração roda sozinha).

Checklist de produção (backup do MinIO, domínio verificado na Resend, preços/orçamentos, `./scripts/verify_minio.sh`):
[armazenamento.md](armazenamento.md#checklist-de-produção).

## 6. Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `NODE_ENV` | 3003 / – | porta e modo do backend |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | – | conexão MySQL; `DB_POOL_MAX` (20) tamanho do pool |
| `DB_ROOT_PASSWORD` | – | só o container MySQL (compose) |
| `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` `REDIS_DB` | – | conexão Redis (o worker usa `REDIS_URL`) |
| `JWT_SECRET` `JWT_REFRESH_SECRET` | – (obrigatórios) | assinatura dos tokens |
| `JWT_EXPIRES_IN` `JWT_REFRESH_EXPIRES_IN` | 24h / 30d | validade |
| `JOB_QUEUE` `RESULT_CHANNEL` | `tchelab_fila` / `tchelab_resultados` | nomes da fila e do canal (iguais no backend e no worker) |
| `JOB_TIMEOUT_SECONDS` | 300 | tempo máximo por job |
| `WORKER_CONCURRENCY` `POLL_INTERVAL_SECONDS` `LOG_LEVEL` | 4 / 0.5 / INFO | worker |
| `STORAGE_DRIVER` | `s3` no compose, `local` sem ele | onde os arquivos são gravados |
| `STORAGE_PATH` | `./storage` | pasta local (driver `local`) e `tmp/` de uploads |
| `S3_ENDPOINT` `S3_BUCKET` `S3_REGION` `S3_ACCESS_KEY` `S3_SECRET_KEY` `S3_FORCE_PATH_STYLE` | `http://minio:9000`, `tchelab`, `us-east-1`, –, –, `true` | MinIO/S3 (para AWS: endpoint vazio, path-style `false`) |
| `S3_CAPACITY_BYTES` | 0 | capacidade provisionada (painel do admin e trava global) |
| `STORAGE_GLOBAL_LIMIT` | 0.9 | fração de ocupação global que dispara `STORAGE_SERVER_FULL` |
| `UPLOAD_MAX_BYTES` | 200 MB | teto rígido por upload (antes do limite do plano) |
| `RESEND_API_KEY` `MAIL_FROM` `MAIL_TRANSPORT` | – / `TcheLab <onboarding@resend.dev>` / `resend`\|`file`\|`none` | e-mails (reservas de equipamento) |
| `PUBLIC_BASE_URL` | – | links em e-mails e QR Code |
| `FRONTEND_DIST` | `frontend/dist` | pasta do frontend compilado servido pelo backend |
| `SOFFICE_BIN` `OFFICE_PREVIEW_TIMEOUT_MS` | `soffice` / 120000 | LibreOffice para prévia de PPT/DOC/XLS |
