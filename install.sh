#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════╗"
echo "║       Bedrock Forge — Installer        ║"
echo "╚════════════════════════════════════════╝"

# Prerequisites
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl is required."; exit 1; }

# Generate secrets if .env doesn't exist
if [ ! -f .env ]; then
  echo "Generating .env from .env.example…"
  cp .env.example .env

  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)

  sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env

  echo "Secrets generated and written to .env"
else
  echo ".env already exists — skipping generation."
fi

echo "Starting services with Docker Compose…"
docker compose up -d --build

echo ""
echo "✅ Bedrock Forge is starting up!"
echo "   → http://localhost:3000"
echo ""
echo "   Logs: docker compose logs -f forge"
echo "   Stop: docker compose down"
