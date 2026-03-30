#!/bin/sh
set -e

echo "[forge] Running database migrations…"
node_modules/.bin/prisma migrate deploy

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
