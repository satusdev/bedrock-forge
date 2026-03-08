#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Bedrock Forge setup (Docker + Nest + Dashboard)"

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ docker is required. Install Docker first." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ docker daemon is not reachable. Start Docker first." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.local.example ]]; then
    cp .env.local.example .env
    echo "✓ Created .env from .env.local.example"
  else
    echo "✗ Missing .env.local.example" >&2
    exit 1
  fi
fi

echo "Starting stack..."
docker compose up -d

echo "Running Prisma schema sync..."
docker compose --profile seed run --rm --no-deps --build nest-api sh -c "npm run prisma:push"

echo "Running Prisma seed..."
docker compose --profile seed run --rm --no-deps --build nest-api sh -c "npm run prisma:seed"

echo "✅ Setup complete"
echo "- Dashboard: http://localhost:3000"
echo "- API: http://localhost:8000"
echo "- Health: http://localhost:8000/api/v1/health"
