#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$SCRIPT_DIR")}" 
MIGRATION_STRATEGY="${MIGRATION_STRATEGY:-auto}"
RUN_SEED="${RUN_SEED:-true}"
WIPE_VOLUMES="${WIPE_VOLUMES:-true}"

read_env_project_name() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    return 1
  fi
  local value
  value="$(grep -E '^COMPOSE_PROJECT_NAME=' "${ENV_FILE}" | tail -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs || true)"
  [[ -n "${value}" ]] || return 1
  echo "${value}"
}

detect_existing_project_name() {
  local containers=(forge-api forge-postgres forge-redis forge-dashboard forge-migrate)
  for container in "${containers[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -Fxq "${container}"; then
      local project
      project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "${container}" 2>/dev/null || true)"
      if [[ -n "${project}" && "${project}" != "<no value>" ]]; then
        echo "${project}"
        return 0
      fi
    fi
  done
  return 1
}

resolve_project_name() {
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    echo "${COMPOSE_PROJECT_NAME}"
    return 0
  fi
  if detect_existing_project_name >/dev/null 2>&1; then
    detect_existing_project_name
    return 0
  fi
  if read_env_project_name >/dev/null 2>&1; then
    read_env_project_name
    return 0
  fi
  basename "${SCRIPT_DIR}"
}

PROJECT_NAME="$(resolve_project_name)"

cleanup_stale_forge_containers() {
  local containers=(
    forge-postgres
    forge-redis
    forge-api
    forge-dashboard
  )

  for container in "${containers[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
      echo "Removing stale container: ${container}"
      docker rm -f "$container" >/dev/null 2>&1 || true
    fi
  done
}

is_production_deploy() {
  local env_value="${DEPLOY_ENV:-${APP_ENV:-${NODE_ENV:-}}}"
  [[ "${env_value,,}" == "production" ]]
}

can_seed_in_production() {
  local override_value="${SEED_ALLOW_PRODUCTION:-}"
  [[ "${override_value,,}" == "true" || "${override_value}" == "1" ]]
}

run_seed_container_cmd() {
  local cmd="$1"
  docker compose -p "${PROJECT_NAME}" --profile seed --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" run --rm --no-deps --build nest-api sh -c "${cmd}"
}

has_prisma_migrations() {
  local migrations_dir="${SCRIPT_DIR}/nest-api/prisma/migrations"
  [[ -d "${migrations_dir}" ]] || return 1
  find "${migrations_dir}" -mindepth 2 -maxdepth 2 -type f -name 'migration.sql' | grep -q .
}

run_migrations() {
  case "${MIGRATION_STRATEGY}" in
    deploy)
      echo "Running migrations with strategy=deploy"
      run_seed_container_cmd "npm run prisma:deploy"
      ;;
    push)
      echo "Running migrations with strategy=push"
      run_seed_container_cmd "npm run prisma:push"
      ;;
    auto)
      echo "Running migrations with strategy=auto (deploy -> push fallback)"
      if ! has_prisma_migrations; then
        echo "No Prisma migration files found, using prisma db push"
        run_seed_container_cmd "npm run prisma:push"
      elif ! run_seed_container_cmd "npm run prisma:deploy"; then
        echo "Deploy migrations failed, falling back to prisma db push"
        run_seed_container_cmd "npm run prisma:push"
      fi
      ;;
    *)
      echo "✗ Invalid MIGRATION_STRATEGY='${MIGRATION_STRATEGY}'. Use auto|deploy|push." >&2
      exit 1
      ;;
  esac
}

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "✗ Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "✗ Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

echo "Using compose file: ${COMPOSE_FILE}"
echo "Using env file: ${ENV_FILE}"
echo "Compose project: ${PROJECT_NAME}"
echo "Migration strategy: ${MIGRATION_STRATEGY}"
echo "Run seed: ${RUN_SEED}"
echo "Wipe volumes: ${WIPE_VOLUMES}"

if [[ "${WIPE_VOLUMES,,}" == "true" || "${WIPE_VOLUMES}" == "1" ]]; then
  echo "Resetting stack (containers + named volumes)"
  docker compose -p "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down -v --rmi all --remove-orphans
else
  echo "Resetting stack (containers only, preserving named volumes)"
  docker compose -p "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down --remove-orphans
fi

cleanup_stale_forge_containers

echo "Rebuilding and starting services"
docker compose -p "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --wait

echo "Running migrations"
run_migrations

echo "Running seed"
run_prisma_seed() {
  echo "Seed source: nest-api/prisma/seed.cjs"
  run_seed_container_cmd "npm run prisma:seed"
}

if [[ "${RUN_SEED,,}" == "true" || "${RUN_SEED}" == "1" ]]; then
  if is_production_deploy && ! can_seed_in_production; then
    echo "✗ Seed blocked in production. Set SEED_ALLOW_PRODUCTION=true to override." >&2
    exit 1
  fi

  run_prisma_seed
else
  echo "Skipping seed (set RUN_SEED=true to enable)"
fi

echo "✓ Reset and seed completed"
