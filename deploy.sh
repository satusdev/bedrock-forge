#!/bin/bash
# deploy.sh — Push & deploy Bedrock Forge to the production server.
#
# Usage:
#   ./deploy.sh            # deploy (first run: full install; subsequent: update)
#   ./deploy.sh --install  # force a fresh install even if .env already exists
#
# Deployment config is read from .env.deploy (copy from .env.deploy.example).
set -euo pipefail

# ── Load deployment config ────────────────────────────────────────────────────
if [[ ! -f .env.deploy ]]; then
  echo "ERROR: .env.deploy not found. Copy .env.deploy.example and fill in your values."
  exit 1
fi
# shellcheck source=.env.deploy.example
source .env.deploy

# Validate required vars
: "${SERVER_USER:?SERVER_USER must be set in .env.deploy}"
: "${SERVER_HOST:?SERVER_HOST must be set in .env.deploy}"
: "${SERVER_PATH:?SERVER_PATH must be set in .env.deploy}"
: "${DOMAIN:?DOMAIN must be set in .env.deploy}"

CORS_ORIGIN="$DOMAIN"

FORCE_INSTALL=false
if [[ "${1:-}" == "--install" ]]; then
  FORCE_INSTALL=true
fi

# ── Colour helpers ────────────────────────────────────────────────────────────
ok()   { echo -e "\033[0;32m✔  $*\033[0m"; }
info() { echo -e "\033[0;36mℹ  $*\033[0m"; }
warn() { echo -e "\033[0;33m⚠  $*\033[0m"; }
err()  { echo -e "\033[0;31m✖  $*\033[0m" >&2; exit 1; }

echo ""
echo "╔════════════════════════════════════════╗"
echo "║    Bedrock Forge — Production Deploy   ║"
echo "╚════════════════════════════════════════╝"
echo ""
info "Target : ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}"
info "Domain : ${DOMAIN}"
echo ""

# ── Local prerequisites ───────────────────────────────────────────────────────
command -v rsync >/dev/null 2>&1 || err "rsync is not installed locally."
command -v ssh   >/dev/null 2>&1 || err "ssh is not installed locally."

# Test SSH connectivity up-front so we fail early with a clear message.
info "Testing SSH connection…"
ssh -o ConnectTimeout=10 -o BatchMode=yes "${SERVER_USER}@${SERVER_HOST}" "echo connected" \
  >/dev/null 2>&1 || err "Cannot connect to ${SERVER_USER}@${SERVER_HOST}. Check SSH keys / firewall."
ok "SSH connection OK"

# ── Sync project files to server ─────────────────────────────────────────────
info "Syncing project files to server…"
rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='**/node_modules/' \
  --exclude='dist/' \
  --exclude='**/dist/' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='.turbo/' \
  --exclude='coverage/' \
  --exclude='**/coverage/' \
  -e "ssh -o StrictHostKeyChecking=no" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
ok "Files synced"

# ── Remote setup / update ─────────────────────────────────────────────────────
info "Running remote deployment steps…"
# shellcheck disable=SC2029
ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" bash <<ENDSSH
set -euo pipefail
cd "${SERVER_PATH}"

# ── Verify Docker is available on the server ─────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed on the server."; exit 1; }

# ── First-time install vs incremental update ─────────────────────────────────
if [[ ! -f .env ]] || [[ "${FORCE_INSTALL}" == "true" ]]; then
  echo ">>> First-time install (or --install flag set)"
  if [[ ! -f .env.example ]]; then
    echo "ERROR: .env.example not found in ${SERVER_PATH}"
    exit 1
  fi
  cp .env.example .env

  # Generate secrets
  ENCRYPTION_KEY=\$(openssl rand -hex 32)
  JWT_SECRET=\$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=\$(openssl rand -hex 32)
  POSTGRES_PASSWORD=\$(openssl rand -hex 16)
  REDIS_PASSWORD=\$(openssl rand -hex 16)

  sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=\${ENCRYPTION_KEY}|" .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=\${JWT_SECRET}|" .env
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=\${JWT_REFRESH_SECRET}|" .env
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}|" .env
  sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=\${REDIS_PASSWORD}|" .env
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${CORS_ORIGIN}|" .env
  sed -i "s|NODE_ENV=.*|NODE_ENV=production|" .env

  echo "Secrets generated and written to .env"

  # Pull/build and bring everything up
  docker compose pull postgres redis || true
  docker compose build forge web
  docker compose up -d

else
  echo ">>> Incremental update"

  # Set CORS_ORIGIN in case it changed
  if grep -q "^CORS_ORIGIN=" .env; then
    sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${CORS_ORIGIN}|" .env
  else
    echo "CORS_ORIGIN=${CORS_ORIGIN}" >> .env
  fi

  # Ensure infra services are running (no-op if already healthy)
  docker compose up -d postgres redis

  # Rebuild application images then bring up ALL services.
  # Using plain `up -d` (without --no-deps) ensures web is always created/started
  # and respects the depends_on:service_healthy chain (web waits for forge).
  docker compose build forge web
  docker compose up -d
fi

# ── Wait for the API to report healthy ───────────────────────────────────────
echo "Waiting for Forge API to become healthy (up to 3 min)…"
RETRIES=60
until curl -sf http://localhost:3001/health > /dev/null 2>&1; do
  RETRIES=\$((RETRIES - 1))
  if [ "\${RETRIES}" -le 0 ]; then
    echo "ERROR: Forge API did not become healthy in time."
    echo "Check logs: docker compose logs forge"
    exit 1
  fi
  sleep 3
done

echo ""
echo "Deployment complete."
echo "   API  → http://localhost:3001  (proxied via nginx as ${DOMAIN}/api)"
echo "   Web  → http://localhost:3002  (proxied via nginx as ${DOMAIN})"
echo ""
echo "   Live logs : docker compose logs -f forge"
ENDSSH

ok "Deployment finished"
echo ""
echo "   Production URL → ${DOMAIN}"
echo ""
