#!/bin/bash
# env-switch.sh - Switch the active .env file for a Bedrock site (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

ENVS=("development" "staging" "production")

usage() {
  echo "Usage: $0 <site_name> <environment>"
  echo "  site_name: The name of the directory in websites/ (e.g., site1)"
  echo "  environment: One of ${ENVS[*]}"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments."
    usage
  fi
  SITE_NAME="$1"
  TARGET_ENV="$2"
}

validate_env() {
  local valid_env=false
  for env in "${ENVS[@]}"; do
    if [ "$env" == "$TARGET_ENV" ]; then
      valid_env=true
      break
    fi
  done
  if [ "$valid_env" = false ]; then
    log_error "Invalid environment '$TARGET_ENV'."
    usage
  fi
}

switch_env() {
  SITE_DIR="websites/$SITE_NAME"
  ENV_TEMPLATE_FILE="${SITE_DIR}/.env.${TARGET_ENV}.tpl"
  ENV_FILE_TO_COPY="${SITE_DIR}/.env.${TARGET_ENV}"
  ACTIVE_ENV_FILE="${SITE_DIR}/.env"

  if [ ! -d "$SITE_DIR" ]; then
    error_exit "Site directory '$SITE_DIR' not found."
  fi

  if [ ! -f "$ENV_FILE_TO_COPY" ]; then
    if [ -f "$ENV_TEMPLATE_FILE" ]; then
      log_warn "Site environment file '$ENV_FILE_TO_COPY' not found. Copying from template '$ENV_TEMPLATE_FILE'."
      ENV_FILE_TO_COPY=$ENV_TEMPLATE_FILE
    else
      error_exit "Neither site environment file '$ENV_FILE_TO_COPY' nor template '$ENV_TEMPLATE_FILE' found."
    fi
  fi

  log_info "Switching '$SITE_NAME' to '$TARGET_ENV' environment..."
  cp "$ENV_FILE_TO_COPY" "$ACTIVE_ENV_FILE"
  if [ $? -eq 0 ]; then
    log_success "Switched '$SITE_NAME' to '$TARGET_ENV'. '$ACTIVE_ENV_FILE' updated."
    echo "Restart Docker containers if running for '$SITE_NAME':"
    echo "cd $SITE_DIR && docker-compose down && docker-compose up -d"
  else
    error_exit "Failed to copy '$ENV_FILE_TO_COPY' to '$ACTIVE_ENV_FILE'."
  fi
}

main() {
  parse_arguments "$@"
  validate_env
  switch_env
}

main "$@"
