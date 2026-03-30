#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════╗"
echo "║      Bedrock Forge — Update            ║"
echo "╚════════════════════════════════════════╝"

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run ./install.sh for first-time setup."
  exit 1
fi

# ── Rebuild forge + web images ───────────────────────────────────────────────
echo "Building new images…"
docker compose build forge web

# ── Rolling restart of forge + web (postgres + redis keep running) ───────────
echo "Restarting forge and web services…"
docker compose up -d --no-deps forge web

# ── Wait for API to be healthy ───────────────────────────────────────────────
echo "Waiting for Forge to be ready…"
RETRIES=30
until curl -sf http://localhost:3000/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: Forge did not become healthy in time."
    echo "Check logs: docker compose logs forge"
    exit 1
  fi
  sleep 3
done

echo ""
echo "Update complete."
echo "   Migrations are applied automatically on startup."
echo "   API  → http://localhost:3000"
echo "   Web  → http://localhost:8080"
echo ""
echo "   Logs: docker compose logs -f forge"
