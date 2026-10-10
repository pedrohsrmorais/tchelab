# TcheLab — worker Python (processo separado e de vida longa; ver
# worker_api/README.md para por que ele precisa de supervisão — com Docker,
# `restart: unless-stopped` no compose cumpre esse papel).
#
# python:3.11-slim (Debian), não alpine: requirements.txt inclui
# tensorflow/scipy/h5py/tensorly — pacotes científicos cujas wheels
# manylinux não são compatíveis com a libc musl do Alpine (forçaria compilar
# tudo do zero, lento e frágil). slim já tem glibc e mantém a imagem razoável.

FROM python:3.11-slim AS worker
WORKDIR /app/worker_api

# build-essential: algumas dependências (ex: h5py, tensorly em certas
# versões) podem cair para sdist e precisar compilar em plataformas sem
# wheel pronta — mantém o build robusto independente da arquitetura do host.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY worker_api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY worker_api/ ./

CMD ["python3", "worker.py"]
