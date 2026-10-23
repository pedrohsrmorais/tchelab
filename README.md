# TcheLab

Plataforma web de **quimiometria**: importar dados (espectros, tabelas, tensores multiway), montar fluxos de análise a partir de um
catálogo de 217 técnicas (94 ativas), executá-los em um worker Python, comparar resultados, e colaborar em **comunidades**
(aulas, quizzes, equipamentos, quadros). Interface em português, inglês e espanhol; temas Escuro, Claro e Classic (estilo MATLAB).

| Camada | Tecnologia | Pasta |
|---|---|---|
| Interface | React + Vite, zustand, React Flow, Plotly/Three | `frontend/` |
| API | Node.js + Express (`/api/v1`), MySQL/MariaDB, Redis | `backend_api/` |
| Execução | Python (consumidor de fila Redis, NumPy/SciPy/…) | `worker_api/` |
| Arquivos | MinIO (S3) ou disco local, atrás do `StorageService` | `backend_api/src/services/storage/` |

Visão completa dos componentes e fluxos: [docs/arquitetura.md](docs/arquitetura.md). **Índice de toda a documentação: [docs/README.md](docs/README.md).**

## Subir tudo com Docker

```bash
cp .env.example .env        # preencha senhas/segredos (JWT, banco, MinIO); .env nunca é versionado
docker compose up -d --build
```

Serviços: `mysql`, `redis`, `minio`, `backend` (API + frontend compilado, porta **3003**) e `worker`. Abra `http://localhost:3003`.
O esquema do banco é criado/atualizado sozinho na subida (`src/config/migrate.js`); o bucket do MinIO também.

Antes de produção rode `./scripts/verify_minio.sh` (valida o MinIO real: escrita, leitura, cota, `STORAGE_SERVER_FULL`) e leia o
checklist em [docs/armazenamento.md](docs/armazenamento.md#checklist-de-produção).

## Desenvolvimento sem Docker

```bash
# MySQL/MariaDB e Redis rodando localmente; variáveis em backend_api/.env (ver tabela em docs/arquitetura.md §6)
cd backend_api && npm install && npm run dev          # API em :3003  (STORAGE_DRIVER=local usa ./storage)
cd worker_api  && pip install -r requirements.txt && python worker.py
cd frontend    && npm install && npm run dev          # Vite em :5173 com proxy para a API
```

Produção sem Docker: `pm2 start ecosystem.config.js` (API + worker); o frontend é gerado com `npm run build` em `frontend/` e servido pelo backend (`FRONTEND_DIST`).

## Testes

```bash
cd frontend && npm run i18n:check && npm run build                       # paridade pt/en/es e build
cd backend_api && node tests/quota_e2e.mjs                                # cota, ledger, 413/503 (e demais suítes em tests/)
node scripts/gen_routes_doc.js --check                                    # docs/api_rotas.md em dia com o código
cd worker_api && python -m pytest tests                                   # medição de CPU/memória
```

Ordem, pré-requisitos (worker para `usage_e2e`, reiniciar o backend entre suítes) e resultados: [docs/testes_e2e.md](docs/testes_e2e.md#como-rodar-todas-as-suítes).

## Variáveis de ambiente principais

Lista completa e o que cada uma faz: [docs/arquitetura.md §6](docs/arquitetura.md#6-variáveis-de-ambiente). Segredos (`JWT_*`, `DB_*`, `S3_SECRET_KEY`,
`RESEND_API_KEY`) ficam só no `.env` local ou no gerenciador de segredos do servidor — nunca no repositório, em docs ou em mensagens de commit.
