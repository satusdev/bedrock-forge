#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════╗"
echo "║    Bedrock Forge — First-Time Setup    ║"
echo "╚════════════════════════════════════════╝"

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl is required."; exit 1; }

# ── Generate .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "Generating .env from .env.example…"
  cp .env.example .env

  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)

  sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env

  echo "Secrets written to .env"
else
  echo ".env already exists — skipping generation."
fi

# ── Build & start ────────────────────────────────────────────────────────────
echo "Building image…"
docker compose build

echo "Starting services…"
docker compose up -d

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
echo "Forge is healthy."

# ── Seed ─────────────────────────────────────────────────────────────────────
echo "Seeding database…"
docker compose exec forge node prisma/seed.js

echo ""
echo "Setup complete!"
echo "   → http://localhost:3000"
echo "   Admin: admin@bedrockforge.local / admin123"
echo ""
echo "   Logs:    docker compose logs -f forge"
echo "   Update:  ./update.sh"
echo "   Reset:   ./reset.sh"
echo "   Stop:    docker compose down"
