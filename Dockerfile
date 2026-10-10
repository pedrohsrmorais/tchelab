# TcheLab — backend_api + frontend (servidos juntos, como já funciona hoje:
# server.js serve frontend/dist estaticamente na mesma porta da API — ver
# backend_api/server.js, bloco "SPA static serving"). Build multi-stage a
# partir da raiz do repo porque precisa enxergar frontend/ e backend_api/
# ao mesmo tempo.
#
# Build: docker build -t tchelab-backend -f Dockerfile .   (contexto = raiz do repo)
# Ou, mais simples, via docker-compose.yml (que já aponta pra cá).

# ---- Stage 1: build do frontend (Vite) ------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime do backend -------------------------------------------
FROM node:20-alpine AS backend
WORKDIR /app/backend_api

# Só manifestos primeiro — cache de `npm ci` não invalida a cada mudança de
# código fonte, só quando package.json/package-lock.json mudam.
COPY backend_api/package.json backend_api/package-lock.json ./
RUN npm ci --omit=dev

COPY backend_api/ ./

# dist do frontend, gerado no stage 1 — FRONTEND_DIST é um override que já
# existia em server.js (`process.env.FRONTEND_DIST || path.resolve(__dirname,
# '..', 'frontend', 'dist')`); usamos explicitamente em vez de depender do
# layout de diretórios relativo, pra não quebrar se o WORKDIR mudar.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
ENV FRONTEND_DIST=/app/frontend/dist

ENV NODE_ENV=production
EXPOSE 3003

# Uploads/datasets/modelos (storage.config.js, STORAGE_PATH) — ver
# docker-compose.yml para o volume nomeado montado aqui.
RUN mkdir -p /app/storage

CMD ["node", "server.js"]
