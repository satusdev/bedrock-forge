#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_SAFE="${SCRIPT_DIR}/scripts/compose-safe.sh"

WIPE_VOLUMES="${WIPE_VOLUMES:-false}"
RUN_SEED="${RUN_SEED:-true}"
MIGRATION_STRATEGY="${MIGRATION_STRATEGY:-push}"

echo "==> Bringing stack down (wipe_volumes=${WIPE_VOLUMES})"
if [[ "${WIPE_VOLUMES}" == "true" ]]; then
	"${COMPOSE_SAFE}" down-hard
else
	"${COMPOSE_SAFE}" down
fi

echo "==> Starting stack"
"${COMPOSE_SAFE}" up

echo "==> Running migrations (strategy=${MIGRATION_STRATEGY})"
if [[ "${MIGRATION_STRATEGY}" == "auto" ]]; then
	docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
		--profile seed run --rm --no-deps --build \
		prisma-tools sh -c "npm run prisma:deploy"
else
	"${COMPOSE_SAFE}" migrate
fi

if [[ "${RUN_SEED}" == "true" ]]; then
	echo "==> Seeding database"
	"${COMPOSE_SAFE}" seed
else
	echo "==> Skipping seed (RUN_SEED=${RUN_SEED})"
fi

echo "==> Done"
