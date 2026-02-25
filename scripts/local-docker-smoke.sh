#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-forge-local-smoke}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "✗ Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "✗ Env file not found: ${ENV_FILE}" >&2
  echo "  Create ${REPO_ROOT}/.env before running smoke test." >&2
  exit 1
fi

run_compose() {
  docker compose -p "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

cleanup_conflicting_dev_containers() {
  local containers=(
    forge-postgres
    forge-redis
    forge-api
    forge-dashboard
    forge-nest-api
  )

  for container in "${containers[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
      echo "Removing conflicting container: ${container}"
      docker rm -f "$container" >/dev/null 2>&1 || true
    fi
  done
}

cleanup() {
  run_compose down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[0/5] Cleaning conflicting dev containers"
cleanup_conflicting_dev_containers

echo "[1/5] Starting local stack"
run_compose up -d --build --wait

echo "[2/5] Running Prisma migrations"
run_compose run --rm --no-deps --build nest-api sh -c "npm run prisma:push"

echo "[3/5] Running Prisma seed"
echo "Seed source: nest-api/prisma/seed.cjs"
run_compose run --rm --no-deps --build nest-api sh -c "npm run prisma:seed"

echo "[4/5] Verifying health endpoints"
curl --fail --silent --show-error http://localhost:8000/api/v1/health >/dev/null
curl --fail --silent --show-error http://localhost:3000 >/dev/null

echo "[5/5] Smoke test complete"
echo "✓ Local deploy + migrate + seed + health smoke passed"
