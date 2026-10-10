# TcheLab Worker (Python)

## Por que isto precisa ficar sempre rodando

`worker.py` é um processo **separado e de vida longa**: ele conecta no Redis,
faz `BLPOP` na fila `tchelab_fila` (configurável via `JOB_QUEUE`) e processa
um job por vez (até `WORKER_CONCURRENCY`, default 4, em paralelo via
thread pool). O `backend_api` (Node) só **enfileira** jobs
(`job.service.js` → `redis.rpush(...)`) e **escuta** os resultados que o
worker publica de volta (`resultConsumer.service.js`, assinando o canal
`tchelab_resultados`) — o Node nunca executa a técnica em si.

**Se este processo não estiver rodando, nada quebra visivelmente**: o
dispatch (`POST /workflows/:id/executions`) continua respondendo `202
Accepted` normalmente (ele só grava a execução como `queued`/`pending` e dá
`RPUSH` na fila), mas os jobs ficam parados na fila do Redis para sempre —
nenhum erro aparece no backend, nenhum toast de erro aparece no frontend.
O sintoma, do ponto de vista do usuário, é exatamente "cliquei em executar e
parece que o Robô não tá fazendo nada": os nós ficam presos em "Pendente"
indefinidamente porque **não existe nenhum consumidor da fila**.

Este repositório não tem Procfile, docker-compose ou unit do systemd — então
é fácil esquecer de iniciar o worker junto com o backend. Este README existe
para deixar esse requisito explícito.

## Rodando localmente (dev)

Precisa de MySQL e Redis já de pé (ver `backend_api/.env` /
`backend_api/src/config/redis.config.js` para host/porta/DB). Em dois
terminais:

```bash
# Terminal 1 — API
cd backend_api && npm run dev

# Terminal 2 — Worker (ESTE processo é o que de fato executa as técnicas)
cd worker_api && pip install -r requirements.txt --break-system-packages
python3 worker.py
```

O log de início deve mostrar algo como:

```
TcheLab Worker iniciando | concurrency=4 | queue=tchelab_fila
ScriptFactory: 169 scripts registrados.
Conectado ao Redis: redis://127.0.0.1:6379/1
```

Se esse log não aparecer, nenhum workflow vai ser processado, mesmo que o
backend e o frontend estejam perfeitos.

## Rodando em produção

`worker.py` precisa de um supervisor que o reinicie se cair (ele trata
SIGTERM/SIGINT para desligar graciosamente, mas não se auto-reinicia em
crash). Três opções comuns — escolha uma de acordo com o ambiente de deploy:

**systemd** (`/etc/systemd/system/tchelab-worker.service`):

```ini
[Unit]
Description=TcheLab Worker (Python)
After=network.target redis.service

[Service]
WorkingDirectory=/caminho/para/tchelab/worker_api
ExecStart=/usr/bin/python3 worker.py
Restart=always
RestartSec=3
EnvironmentFile=/caminho/para/tchelab/worker_api/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now tchelab-worker
journalctl -u tchelab-worker -f   # ver o log em tempo real
```

**pm2** (se o ambiente já usa pm2 para o Node):

```bash
pm2 start worker.py --interpreter python3 --name tchelab-worker
pm2 save
```

**Docker**: dar ao worker seu próprio serviço/container com
`restart: unless-stopped`, variáveis de ambiente (`REDIS_URL`, `JOB_QUEUE`,
`RESULT_CHANNEL`, `WORKER_CONCURRENCY`) apontando para o mesmo Redis do
`backend_api`, e `CMD ["python3", "worker.py"]`.

## Como confirmar que está funcionando

```bash
redis-cli -n 1 llen tchelab_fila   # deve cair para 0 pouco depois de um dispatch
```

Ou simplesmente: disparar um workflow pelo editor e ver os nós saírem de
"Pendente" para "Executando"/"Concluído" em poucos segundos — se ficarem
presos em "Pendente", o worker não está rodando (ou não está conectado no
mesmo Redis/DB que o backend — confira `REDIS_URL`/`REDIS_DB` nos dois lados).
