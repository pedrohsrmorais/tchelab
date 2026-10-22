#!/usr/bin/env bash
# Verifica a fase 1–2 (MinIO + cota) com o MinIO REAL do docker-compose.
#
#   cp .env.example .env   # preencha S3_ACCESS_KEY / S3_SECRET_KEY (e as demais senhas)
#   ./scripts/verify_minio.sh            # sobe a stack (sem derrubar ao final), roda os testes e imprime o resumo
#
# Roda DENTRO do container do backend (a imagem já contém tests/ e scripts/), então não precisa de Node no host.
# O teste cria um bucket temporário e o remove; o teste de cota usa usuários descartáveis (…@test.local).
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
run()  { if "$@"; then echo "   ✔ ok"; else echo "   ✘ FALHOU: $*"; fail=1; fi; }

[ -f .env ] || { echo ".env não encontrado — copie .env.example e preencha as senhas."; exit 2; }
grep -q '^S3_ACCESS_KEY=.\+' .env && grep -q '^S3_SECRET_KEY=.\{8,\}' .env || { echo "Defina S3_ACCESS_KEY e S3_SECRET_KEY (mín. 8 caracteres) no .env."; exit 2; }

step "1/6 Configuração do compose"
run docker compose config -q

step "2/6 Subindo mysql, redis, minio e backend"
run docker compose up -d --build mysql redis minio backend

step "3/6 Aguardando o backend responder"
ok=0
for i in $(seq 1 60); do
  if docker compose exec -T backend wget -qO- http://localhost:3003/health >/dev/null 2>&1 \
     || docker compose exec -T backend wget -qO- http://localhost:3003/ >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] && echo "   ✔ backend no ar" || { echo "   ✘ backend não respondeu em 2 min — veja: docker compose logs backend minio"; fail=1; }

step "4/6 Driver S3 contra o MinIO (gravar, ler, copiar, remover, stream, capacidade, lifecycle)"
run docker compose exec -T -e S3_TEST_ENDPOINT=http://minio:9000 \
  -e S3_TEST_ACCESS_KEY="$(grep '^S3_ACCESS_KEY=' .env | cut -d= -f2-)" -e S3_TEST_SECRET_KEY="$(grep '^S3_SECRET_KEY=' .env | cut -d= -f2-)" \
  backend node tests/storage_driver_check.mjs

step "5/6 Cota de armazenamento ponta a ponta (71 checagens, com o driver s3 do container)"
echo "   (o limitador de login pode acusar 429 se você rodou isto várias vezes seguidas: docker compose restart backend)"
run docker compose exec -T backend node tests/quota_e2e.mjs http://localhost:3003

step "6/6 Backfill dos dados existentes (simulação, não altera nada)"
run docker compose exec -T backend node scripts/storage_backfill.js --dry-run

echo
if [ "$fail" = 0 ]; then echo "TUDO OK — MinIO validado. Próximo passo: rodar o backfill de verdade (sem --dry-run) e conferir a lista de usuários acima da cota."
else echo "HOUVE FALHAS — rode: docker compose logs --tail=100 backend minio"; fi
exit "$fail"
