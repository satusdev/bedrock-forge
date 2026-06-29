#!/bin/bash
# Bedrock Forge — Update
set -euo pipefail

# Source helper routines
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/tools/setup-helpers.sh"

echo "╔════════════════════════════════════════╗"
echo "║      Bedrock Forge — Update            ║"
echo "╚════════════════════════════════════════╝"

cleanup_docker_disk() {
  if [[ "${DEPLOY_SKIP_DOCKER_CLEANUP:-false}" == "true" ]]; then
    echo "Docker cleanup skipped (DEPLOY_SKIP_DOCKER_CLEANUP=true)."
    return
  fi

  local builder_until="${DEPLOY_DOCKER_BUILDER_PRUNE_UNTIL:-168h}"
  echo "Docker disk usage before cleanup:"
  docker system df || true
  echo ""
  echo "Removing unused images..."
  docker image prune -f || true
  echo ""
  echo "Removing builder cache older than ${builder_until}..."
  docker builder prune -f --filter "until=${builder_until}" || true
  echo ""
  echo "Docker disk usage after cleanup:"
  docker system df || true
}

# ── Prerequisites ────────────────────────────────────────────────────────────
verify_prereq "docker" "Docker is not installed."

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
wait_for_api_healthy 3001 30

echo ""
echo "Update complete."
echo "   Migrations are applied automatically on startup."
echo "   API  → http://localhost:3001"
echo "   Web  → http://localhost:3002"
echo ""
echo "   Logs: docker compose logs -f forge"

echo ""
cleanup_docker_disk
