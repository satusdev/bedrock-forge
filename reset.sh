#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════╗"
echo "║      Bedrock Forge — Reset             ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "WARNING: This will permanently destroy ALL data (postgres + redis volumes)."
echo "         The database will be recreated and re-seeded from scratch."
echo ""

# ── Confirm ───────────────────────────────────────────────────────────────────
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl is required."; exit 1; }

# ── Stop all services and remove volumes ─────────────────────────────────────
echo "Stopping services and removing volumes…"
docker compose down -v --remove-orphans

# ── Regenerate secrets (fresh install) ───────────────────────────────────────
echo "Regenerating secrets in .env…"
if [ ! -f .env.example ]; then
  echo "ERROR: .env.example not found."
  exit 1
fi

cp .env.example .env

ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" .env

echo "New secrets written to .env"

# ── Build & start ─────────────────────────────────────────────────────────────
echo "Building image…"
docker compose build

echo "Starting services…"
docker compose up -d

# ── Wait for API to be healthy ────────────────────────────────────────────────
echo "Waiting for Forge to be ready…"
RETRIES=40
until curl -sf http://localhost:3001/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: Forge did not become healthy in time."
    echo "Check logs: docker compose logs forge"
    exit 1
  fi
  sleep 3
done
echo "Forge is healthy."

# ── Seed ──────────────────────────────────────────────────────────────────────
echo "Seeding database…"
docker compose exec forge node prisma/seed.js

echo ""
echo "Reset complete. Fresh installation ready."
echo "   → http://localhost:3001"
echo "   Admin: admin@bedrockforge.local / admin123"
echo ""
echo "   NOTE: All previous data, sessions, and SSH keys have been wiped."
echo "         Encryption key has been rotated — re-enter any stored credentials."
