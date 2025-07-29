#!/bin/bash
# ols-restart.sh - Restart OpenLiteSpeed server on remote host

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

ENV_FILE="$PROJECT_ROOT/scripts/.env.provision"

usage() {
  echo "Usage: $0"
  exit 1
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    log_info "Loading environment variables from $ENV_FILE"
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
  else
    error_exit "$ENV_FILE not found. Please create it from $ENV_FILE.example and fill in the details."
  fi
}

check_var() {
  local var_value=$1
  local var_name=$2
  if [ -z "$var_value" ]; then
    error_exit "$var_name is not set in $ENV_FILE or passed correctly. Please define it."
  fi
}

restart_ols() {
  log_info "Restarting OpenLiteSpeed server..."
  SSH_USER="${SSH_USER:-root}"
  SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "systemctl restart lsws" || error_exit "Failed to restart OpenLiteSpeed server."
  log_success "OpenLiteSpeed restarted."
}

main() {
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
  restart_ols
}

main "$@"
