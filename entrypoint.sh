#!/bin/sh
set -e

# ── Wait for PostgreSQL to accept connections ────────────────────────────────
# Belt-and-suspenders guard: depends_on service_healthy handles the normal case,
# but if forge is restarted independently this loop prevents failing immediately.
DB_HOST="${PGHOST:-postgres}"
DB_PORT="${PGPORT:-5432}"
MAX_WAIT=60
WAITED=0
echo "[forge] Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}…"
until node -e "
  const net = require('net');
  const s = net.createConnection(${DB_PORT}, '${DB_HOST}');
  s.on('connect', () => { s.destroy(); process.exit(0); });
  s.on('error', () => { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "[forge] Timed out waiting for PostgreSQL — aborting"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
echo "[forge] PostgreSQL is ready"

echo "[forge] Running database migrations…"
node_modules/.bin/prisma migrate deploy || { echo "[forge] Migration failed — aborting startup"; exit 1; }

echo "[forge] Starting API server (port 3000)…"
node apps/api/dist/main.js &
API_PID=$!

echo "[forge] Starting Worker…"
node apps/worker/dist/main.js &
WORKER_PID=$!

# Forward SIGTERM/SIGINT to children
trap 'kill $API_PID $WORKER_PID 2>/dev/null; exit 0' TERM INT

echo "[forge] All services started. API_PID=$API_PID WORKER_PID=$WORKER_PID"
wait $API_PID $WORKER_PID
