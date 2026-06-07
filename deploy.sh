#!/bin/bash
# deploy.sh — Build locally, ship images to server, deploy Bedrock Forge.
#
# Usage:
#   ./deploy.sh                # incremental deploy (build + push + restart)
#   ./deploy.sh --install      # force first-time setup even if .env exists
#   ./deploy.sh --cleanup-only # only run safe Docker disk cleanup on server
#   ./deploy.sh --build-only   # build images locally without deploying
#   ./deploy.sh --no-cache     # force a clean Docker build (ignore layer cache)
#
# Deployment config is read from .env.deploy (copy from .env.deploy.example).
#
# HOW IT WORKS
# ────────────────────────────────────────────────────────────────────────────
#  1. Build `forge` and `web` Docker images on THIS machine (uses local CPU).
#  2. Stream each image to the server via:  docker save | gzip | ssh | docker load
#     No registry required; images travel directly over the existing SSH tunnel.
#  3. Server only runs `docker compose up` — zero build work on the VPS.
#
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

# ── Image tag (defaults to git short-sha for reproducibility) ─────────────────
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo "latest")}"
FORGE_IMAGE="bedrock-forge/forge:${IMAGE_TAG}"
WEB_IMAGE="bedrock-forge/web:${IMAGE_TAG}"

# ── Colour helpers ────────────────────────────────────────────────────────────
ok()    { echo -e "\033[0;32m✔  $*\033[0m"; }
info()  { echo -e "\033[0;36mℹ  $*\033[0m"; }
warn()  { echo -e "\033[0;33m⚠  $*\033[0m"; }
err()   { echo -e "\033[0;31m✖  $*\033[0m" >&2; exit 1; }
step()  { echo -e "\033[1;35m▶  $*\033[0m"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
FORCE_INSTALL=false
CLEANUP_ONLY=false
BUILD_ONLY=false
NO_CACHE=""
for arg in "$@"; do
  case "$arg" in
    --install)      FORCE_INSTALL=true ;;
    --cleanup-only) CLEANUP_ONLY=true ;;
    --build-only)   BUILD_ONLY=true ;;
    --no-cache)     NO_CACHE="--no-cache" ;;
    *) err "Unknown argument: $arg" ;;
  esac
done

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║    Bedrock Forge — Production Deploy        ║"
echo "╚════════════════════════════════════════════╝"
echo ""
info "Target    : ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}"
info "Domain    : ${DOMAIN}"
info "Image tag : ${IMAGE_TAG}"
echo ""

# ── Local prerequisites ───────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || err "docker is not installed locally."
command -v rsync  >/dev/null 2>&1 || err "rsync is not installed locally."
command -v ssh    >/dev/null 2>&1 || err "ssh is not installed locally."

SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

# ── Remote Docker cleanup helper ─────────────────────────────────────────────
run_remote_cleanup() {
  local skip_cleanup="${DEPLOY_SKIP_DOCKER_CLEANUP:-false}"
  local builder_until="${DEPLOY_DOCKER_BUILDER_PRUNE_UNTIL:-168h}"
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" bash <<ENDCLEAN
set -euo pipefail
cd "${SERVER_PATH}"
SKIP_CLEANUP=${skip_cleanup@Q}
BUILDER_UNTIL=${builder_until@Q}

if [[ "\$SKIP_CLEANUP" == "true" ]]; then
  echo "Docker cleanup skipped (DEPLOY_SKIP_DOCKER_CLEANUP=true)."
  exit 0
fi

command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not installed on server."; exit 1; }

echo "Docker disk usage before cleanup:"
docker system df || true
echo ""
echo "Removing dangling images (untagged layers from old builds)..."
docker image prune -f || true
echo ""
echo "Removing builder cache older than \$BUILDER_UNTIL..."
docker builder prune -f --filter "until=\$BUILDER_UNTIL" || true
echo ""
echo "Docker disk usage after cleanup:"
docker system df || true
ENDCLEAN
}

# ── Cleanup-only mode ─────────────────────────────────────────────────────────
if [[ "$CLEANUP_ONLY" == "true" ]]; then
  info "Testing SSH connection…"
  ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" "echo connected" \
    >/dev/null 2>&1 || err "Cannot connect to ${SERVER_USER}@${SERVER_HOST}."
  ok "SSH OK"
  info "Running safe Docker cleanup only…"
  run_remote_cleanup
  ok "Docker cleanup finished"
  exit 0
fi

# ── Step 1: Build images LOCALLY ─────────────────────────────────────────────
step "Building images locally (your CPU, not the server's)…"
echo ""

# Build forge (runtime) target
info "Building forge image → ${FORGE_IMAGE}"
# shellcheck disable=SC2086
docker build \
  ${NO_CACHE} \
  --target runtime \
  --tag "${FORGE_IMAGE}" \
  --tag "bedrock-forge/forge:latest" \
  --label "git.sha=${IMAGE_TAG}" \
  --label "built.at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .
ok "forge image built"

# Build web (nginx) target — reuses the cached builder layer from above
info "Building web image   → ${WEB_IMAGE}"
# shellcheck disable=SC2086
docker build \
  ${NO_CACHE} \
  --target web \
  --tag "${WEB_IMAGE}" \
  --tag "bedrock-forge/web:latest" \
  --label "git.sha=${IMAGE_TAG}" \
  --label "built.at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .
ok "web image built"

echo ""
info "Local image sizes:"
docker image ls --format "  {{.Repository}}:{{.Tag}}  {{.Size}}" \
  | grep "bedrock-forge/" || true
echo ""

# Exit here if --build-only
if [[ "$BUILD_ONLY" == "true" ]]; then
  ok "Build-only mode — skipping deploy"
  exit 0
fi

# ── Step 2: Test SSH connectivity ─────────────────────────────────────────────
step "Connecting to server…"
ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" "echo connected" \
  >/dev/null 2>&1 || err "Cannot connect to ${SERVER_USER}@${SERVER_HOST}. Check SSH keys / firewall."
ok "SSH connection OK"

# ── Step 3: Sync config / compose files (NOT source code) ────────────────────
step "Syncing compose files and config to server…"
rsync -az --delete \
  --include='docker-compose.yml' \
  --include='nginx/' \
  --include='nginx/**' \
  --include='.env.example' \
  --include='entrypoint.sh' \
  --exclude='*' \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
ok "Config synced"

# ── Step 4: Stream images to server via SSH pipe ──────────────────────────────
# docker save | gzip | ssh | docker load
# Gzip reduces ~40-60% of image data over the wire. No registry needed.
step "Shipping images to server (streaming via SSH)…"
echo ""

info "Uploading forge image (${FORGE_IMAGE})…"
docker save "${FORGE_IMAGE}" \
  | gzip -1 \
  | ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" \
      "gzip -d | docker load"
ok "forge image loaded on server"

info "Uploading web image   (${WEB_IMAGE})…"
docker save "${WEB_IMAGE}" \
  | gzip -1 \
  | ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" \
      "gzip -d | docker load"
ok "web image loaded on server"
echo ""

# ── Step 5: Remote deploy (compose up only — no build) ───────────────────────
step "Running remote deployment steps…"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}" bash <<ENDSSH
set -euo pipefail
cd "${SERVER_PATH}"
CORS_ORIGIN=${REMOTE_CORS_ORIGIN}
IMAGE_TAG=${IMAGE_TAG@Q}

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

# ── Verify Docker is available on the server ──────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not installed on server."; exit 1; }

# ── First-time install vs incremental update ──────────────────────────────────
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
  set_env_value IMAGE_TAG "\$IMAGE_TAG"
  set_env_value NODE_ENV production

  echo "Secrets generated and written to .env"

  # Pull infrastructure images, bring everything up.
  # forge/web images are already loaded — compose uses the image: field.
  docker compose pull postgres redis || true
  if ! docker compose up -d --remove-orphans; then
    echo "ERROR: docker compose up failed. Forge logs:"
    docker compose logs --tail=100 forge
    exit 1
  fi

else
  echo ">>> Incremental update"

  # Update dynamic env vars
  set_env_value CORS_ORIGIN "\$CORS_ORIGIN"
  set_env_value IMAGE_TAG "\$IMAGE_TAG"

  # Ensure infra services are running (no-op if already healthy)
  docker compose up -d postgres redis

  # Restart forge with the new image (no build — image is already loaded)
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

# ── Wait for the API to report healthy ────────────────────────────────────────
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

# ── Step 6: Remote cleanup (dangling images from prior deploys) ───────────────
info "Running safe Docker cleanup on server…"
run_remote_cleanup

ok "Deployment finished"
echo ""
echo "   Production URL → ${DOMAIN}"
echo "   Image tag      → ${IMAGE_TAG}"
echo ""
