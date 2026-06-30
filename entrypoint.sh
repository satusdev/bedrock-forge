#!/bin/sh
set -eu

API_PID=""
WORKER_PID=""

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

# ── Dedicated Migration Job check ────────────────────────────────────────────
if [ "${RUN_MIGRATIONS_ONLY:-false}" = "true" ]; then
  echo "[forge] Dedicated database migrations runner triggered…"
  node_modules/.bin/prisma migrate deploy || { echo "[forge] Migration failed — aborting"; exit 1; }
  echo "[forge] Migration succeeded — exiting"
  exit 0
fi

# Skip migrations option for horizontally scaled replicas
if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "[forge] Skipping database migrations as requested…"
else
  echo "[forge] Running database migrations…"
  node_modules/.bin/prisma migrate deploy || { echo "[forge] Migration failed — aborting startup"; exit 1; }
fi

echo "[forge] Starting API server (port 3000)…"
node apps/api/dist/main.js &
API_PID=$!

echo "[forge] Starting Worker…"
node apps/worker/dist/main.js &
WORKER_PID=$!

echo "[forge] All services started. API_PID=$API_PID WORKER_PID=$WORKER_PID"

# ── Graceful shutdown handler ────────────────────────────────────────────────
# How long (seconds) to wait for Node processes to drain in-flight work after
# SIGTERM before escalating to SIGKILL.  Docker's stop_grace_period must be
# greater than this value.  Default: 60 s.
DRAIN_TIMEOUT="${FORGE_DRAIN_TIMEOUT:-60}"

handle_shutdown() {
  echo "[forge] Signal received — sending SIGTERM to API (${API_PID}) and Worker (${WORKER_PID})…"
  [ -n "$API_PID" ]    && kill -TERM "$API_PID"    2>/dev/null || true
  [ -n "$WORKER_PID" ] && kill -TERM "$WORKER_PID" 2>/dev/null || true

  # Wait up to DRAIN_TIMEOUT seconds for each child to exit cleanly.
  # After the timeout, escalate to SIGKILL so the container does not hang.
  ELAPSED=0
  API_GONE=false
  WORKER_GONE=false

  while [ "$ELAPSED" -lt "$DRAIN_TIMEOUT" ]; do
    if ! kill -0 "$API_PID" 2>/dev/null; then API_GONE=true; fi
    if ! kill -0 "$WORKER_PID" 2>/dev/null; then WORKER_GONE=true; fi
    if $API_GONE && $WORKER_GONE; then break; fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done

  if ! $API_GONE; then
    echo "[forge] API did not exit within ${DRAIN_TIMEOUT}s — sending SIGKILL"
    kill -KILL "$API_PID" 2>/dev/null || true
  fi
  if ! $WORKER_GONE; then
    echo "[forge] Worker did not exit within ${DRAIN_TIMEOUT}s — sending SIGKILL"
    kill -KILL "$WORKER_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  echo "[forge] Shutdown complete"
  exit 0
}

trap 'handle_shutdown' TERM INT

# ── Monitor both children ────────────────────────────────────────────────────
# If either process exits unexpectedly (crash, OOM), send SIGTERM to the
# survivor and exit non-zero so Docker's restart policy can recover.
# A dead API must not leave the container "running" while health checks fail.
while :; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[forge] API process (PID $API_PID) has exited — shutting down container for restart"
    [ -n "$WORKER_PID" ] && kill -TERM "$WORKER_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[forge] Worker process (PID $WORKER_PID) has exited — shutting down container for restart"
    [ -n "$API_PID" ] && kill -TERM "$API_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
