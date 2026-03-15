#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"

read_env_project_name() {
	if [[ ! -f "${ENV_FILE}" ]]; then
		return 1
	fi
	local value
	value="$(grep -E '^COMPOSE_PROJECT_NAME=' "${ENV_FILE}" | tail -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs || true)"
	if [[ -n "${value}" ]]; then
		echo "${value}"
		return 0
	fi
	return 1
}

detect_existing_project_name() {
	local containers=(forge-api forge-postgres forge-redis forge-web forge-migrate)
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
	basename "${REPO_ROOT}"
}

PROJECT_NAME="$(resolve_project_name)"
COMPOSE_ARGS=( -p "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" )

compose() {
	docker compose "${COMPOSE_ARGS[@]}" "$@"
}

remove_named_containers() {
	local containers=(forge-postgres forge-redis forge-api forge-web forge-migrate forge-prisma-tools forge-dashboard)
	for container in "${containers[@]}"; do
		if docker ps -a --format '{{.Names}}' | grep -Fxq "${container}"; then
			echo "Removing container: ${container}"
			docker rm -f "${container}" >/dev/null 2>&1 || true
		fi
	done
}

cmd="${1:-}"
if [[ -z "${cmd}" ]]; then
	echo "Usage: $0 <project|up|down|down-hard|update|migrate|seed|seed-demo|logs|restart|ps>"
	exit 1
fi

case "${cmd}" in
	project)
		echo "${PROJECT_NAME}"
		;;
	up)
		echo "Compose project: ${PROJECT_NAME}"
		compose up -d --build --remove-orphans --wait
		;;
	down)
		echo "Compose project: ${PROJECT_NAME}"
		compose down --remove-orphans || true
		remove_named_containers
		;;
	down-hard)
		echo "Compose project: ${PROJECT_NAME}"
		compose down -v --remove-orphans || true
		remove_named_containers
		;;
	migrate)
		echo "Compose project: ${PROJECT_NAME}"
		compose --profile seed run --rm --no-deps --build prisma-tools sh -c "npm run prisma:push"
		;;
	seed)
		echo "Compose project: ${PROJECT_NAME}"
		compose --profile seed run --rm --no-deps --build prisma-tools sh -c "npm run prisma:seed"
		;;
	seed-demo)
		echo "Compose project: ${PROJECT_NAME}"
		compose --profile seed run --rm --no-deps --build -e SEED_DEMO_MODE=true prisma-tools sh -c "npm run prisma:seed"
		;;
	update)
		echo "Compose project: ${PROJECT_NAME}"
		echo "Applying schema updates"
		compose --profile seed run --rm --no-deps --build prisma-tools sh -c "npm run prisma:push"
		echo "Updating API + web containers"
		compose up -d --build --remove-orphans api web --wait
		;;
	logs)
		# Usage: npm run logs [service]  e.g. npm run logs api
		shift || true
		compose logs -f --tail=100 "${@:-}"
		;;
	restart)
		# Usage: npm run restart [service]
		shift || true
		compose restart "${@:-}"
		;;
	ps|status)
		compose ps
		;;
	*)
		echo "Unknown command: ${cmd}"
		exit 1
		;;
esac