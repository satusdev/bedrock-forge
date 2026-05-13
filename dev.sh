#!/bin/bash
set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║   Bedrock Forge — Local Dev Launcher     ║"
echo "╚══════════════════════════════════════════╝"

command -v docker  > /dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }
command -v openssl > /dev/null 2>&1 || { echo "ERROR: openssl is required."; exit 1; }

set_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"
  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\/&|\\]/\\&/g')
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# ── Generate .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "Generating .env from .env.example…"
  cp .env.example .env

  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  REDIS_PASSWORD=$(openssl rand -hex 16)

  set_env_value ENCRYPTION_KEY "$ENCRYPTION_KEY"
  set_env_value JWT_SECRET "$JWT_SECRET"
  set_env_value JWT_REFRESH_SECRET "$JWT_REFRESH_SECRET"
  set_env_value POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  set_env_value REDIS_PASSWORD "$REDIS_PASSWORD"

  echo "Secrets written to .env"
else
  echo ".env already exists — skipping secret generation."
fi

echo "Starting dev stack (Postgres + Redis + API + Worker + Web)…"
docker compose -f docker-compose.dev.yml up --build
