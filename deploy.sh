#!/bin/bash
# =============================================================
# JUALAN (Blonjo + Sajen) - Production Deployment Script
# Pola: rsync source → build Docker image di VPS
# (Python tidak cross-compile, jadi build dilakukan di VPS)
# =============================================================
set -e

VPS_HOST="vps-server"
VPS_PATH="~/jualan"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Starting JUALAN Deployment Pipeline..."
echo "   Target: $VPS_HOST:$VPS_PATH"
echo ""

# ── 1. Pastikan folder tujuan di VPS ada ───────────────────
echo "📁 Preparing VPS directory..."
ssh $VPS_HOST "mkdir -p $VPS_PATH"

# ── 2. Sync source code ke VPS via rsync ───────────────────
# Exclude: dev artifacts, cache, __pycache__, node_modules lokal
echo "🔄 Syncing source code to VPS..."
rsync -avz --progress \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='*.pyo' \
  --exclude='.venv' \
  --exclude='app.db' \
  --exclude='nota_test.jpg' \
  --exclude='blonjo/.pnpm-store' \
  --exclude='blonjo/node_modules' \
  --exclude='blonjo/dist' \
  --exclude='sajen/uploads' \
  --exclude='.antigravitycli' \
  --exclude='scratch' \
  --exclude='.vscode' \
  ./ $VPS_HOST:$VPS_PATH/

# ── 3. Sync .env production (tidak masuk git) ──────────────
echo "🔐 Syncing production environment file..."
if [ -f ".env.production" ]; then
  rsync -avz .env.production $VPS_HOST:$VPS_PATH/.env.production
  echo "   ✅ .env.production synced"
else
  echo "   ⚠️  .env.production not found! Using .env as fallback..."
  rsync -avz .env $VPS_HOST:$VPS_PATH/.env.production
fi

# ── 4. Build & Deploy di VPS ───────────────────────────────
echo "🐳 Building and deploying containers on VPS..."
ssh $VPS_HOST << EOF
  set -e
  cd $VPS_PATH

  # Ambil argumen servis jika ada (misal: blonjo-ui, sajen-api)
  SERVICE_TARGETS="$*"

  echo "🔨 Building Docker images on VPS ($SERVICE_TARGETS)..."
  docker compose --env-file .env.production -f $COMPOSE_FILE -p jualan build $SERVICE_TARGETS

  echo "🚀 Re-starting production containers gracefully..."
  docker compose --env-file .env.production -f $COMPOSE_FILE -p jualan up -d --remove-orphans $SERVICE_TARGETS

  echo "⏳ Waiting for sajen-api backend container to be fully HEALTHY..."
  MAX_WAIT=30
  WAIT_COUNT=0
  until [ "\$(docker inspect --format='{{json .State.Health.Status}}' sajen_backend_api 2>/dev/null)" == "\"healthy\"" ] || [ \$WAIT_COUNT -ge \$MAX_WAIT ]; do
    echo "   [Waiting] FastAPI Uvicorn engine starting up... (\${WAIT_COUNT}s)"
    sleep 2
    WAIT_COUNT=\$((WAIT_COUNT + 2))
  done

  if [ \$WAIT_COUNT -ge \$MAX_WAIT ]; then
    echo "⚠️ Warning: sajen-api container health check timed out after 30s."
  else
    echo "✅ sajen-api is fully HEALTHY and ready to serve HTTP requests!"
  fi

  echo "🔄 Running database migrations (Alembic)..."
  docker compose --env-file .env.production -f $COMPOSE_FILE -p jualan exec -T sajen-api alembic upgrade heads

  echo "🔍 Verifying container status..."
  docker compose --env-file .env.production -f $COMPOSE_FILE -p jualan ps

  # Cek apakah ada container yang crash
  EXITED=\$(docker ps -a -f status=exited --format '{{.Names}}' | grep -E 'sajen|blonjo' || true)
  if [ ! -z "\$EXITED" ]; then
    echo "⚠️ Detected crashed containers: \$EXITED"
    for c in \$EXITED; do
      echo "--- LOGS: \$c ---"
      docker logs \$c --tail 30
    done
    exit 1
  fi

  echo "🧹 Pruning unused Docker images..."
  docker image prune -f

EOF

echo ""
echo "✅ JUALAN Deployment Complete!"
echo "   🖥️  Frontend & API (Blonjo Production): https://blonjo.samkarsa.com"
echo "   🔌  Backend Internal Endpoint : http://localhost:8005"
