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
REMOTE_CORS_ORIGIN=$(printf '%q' "$CORS_ORIGIN")

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

SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

# Test SSH connectivity up-front so we fail early with a clear message.
info "Testing SSH connection…"
ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" "echo connected" \
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
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
ok "Files synced"

# ── Remote setup / update ─────────────────────────────────────────────────────
info "Running remote deployment steps…"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" bash <<ENDSSH
set -euo pipefail
cd "${SERVER_PATH}"
CORS_ORIGIN=${REMOTE_CORS_ORIGIN}

set_env_value() {
  local key="\$1"
  local value="\$2"
  local file="\${3:-.env}"
  local temp_file="\${file}.tmp"

  local found=false
  if [[ -f "\$file" ]]; then
    while IFS= read -r line || [[ -n "\$line" ]]; do
      if [[ "\$line" == "\${key}"=* ]]; then
        printf '%s\n' "\${key}=\${value}"
        found=true
      else
        printf '%s\n' "\$line"
      fi
    done < "\$file" > "\$temp_file"
    mv "\$temp_file" "\$file"
  fi

  if [[ "\$found" = false ]]; then
    printf '%s\n' "\${key}=\${value}" >> "\$file"
  fi
}

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

  set_env_value ENCRYPTION_KEY "\$ENCRYPTION_KEY"
  set_env_value JWT_SECRET "\$JWT_SECRET"
  set_env_value JWT_REFRESH_SECRET "\$JWT_REFRESH_SECRET"
  set_env_value POSTGRES_PASSWORD "\$POSTGRES_PASSWORD"
  set_env_value REDIS_PASSWORD "\$REDIS_PASSWORD"
  set_env_value CORS_ORIGIN "\$CORS_ORIGIN"
  set_env_value NODE_ENV production

  echo "Secrets generated and written to .env"

  # Pull/build and bring everything up
  docker compose pull postgres redis || true
  docker compose build forge web
  if ! docker compose up -d --remove-orphans; then
    echo "ERROR: docker compose up failed. Forge logs:"
    docker compose logs --tail=100 forge
    exit 1
  fi

else
  echo ">>> Incremental update"

  # Set CORS_ORIGIN in case it changed
  set_env_value CORS_ORIGIN "\$CORS_ORIGIN"

  # Ensure infra services are running (no-op if already healthy)
  docker compose up -d postgres redis

  # Rebuild application images then bring up ALL services.
  # --force-recreate ensures forge/web containers always restart with the new image
  # even if compose detects no change in the service config.
  docker compose build forge web
  if ! docker compose up -d --force-recreate --no-deps forge; then
    echo "ERROR: forge failed to start. Logs:"
    docker compose logs --tail=100 forge
    exit 1
  fi
  if ! docker compose up -d --remove-orphans; then
    echo "ERROR: docker compose up (all services) failed. Forge logs:"
    docker compose logs --tail=100 forge
    exit 1
  fi
fi

# ── Wait for the API to report healthy ───────────────────────────────────────
echo "Waiting for Forge API to become healthy (up to 3 min)…"
RETRIES=60
until curl -sf http://localhost:3001/health > /dev/null 2>&1; do
  RETRIES=\$((RETRIES - 1))
  if [ "\${RETRIES}" -le 0 ]; then
    echo "ERROR: Forge API did not become healthy in time."
    echo "=== forge container logs (last 80 lines) ==="
    docker compose logs --tail=80 forge
    echo "=== forge container status ==="
    docker compose ps forge
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
