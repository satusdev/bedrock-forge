#!/bin/bash
# sync-db.sh - Sync Bedrock database between local and remote (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"
CONFIG_FILE="$PROJECT_ROOT/config/sync-config.json"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment> <push|pull>"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [ -z "$SITE_NAME" ]; then
    read -rp "Enter site name: " SITE_NAME
  fi
  if [ -z "$TARGET_ENV" ]; then
    read -rp "Enter environment [development]: " TARGET_ENV
    TARGET_ENV="${TARGET_ENV:-development}"
  fi
  if [ -z "$DIRECTION" ]; then
    read -rp "Direction (push or pull) [pull]: " DIRECTION
    DIRECTION="${DIRECTION:-pull}"
  fi
}

parse_arguments() {
  # Help flag
  for arg in "$@"; do
    case $arg in
      -h|--help) usage ;;
    esac
  done

  SITE_NAME="$1"
  TARGET_ENV="$2"
  DIRECTION="$3"
}

get_jq_config_value() {
  local site=$1
  local env=$2
  local key=$3
  jq -r ".${site}.${env}.${key} // empty" "$CONFIG_FILE"
}

sync_db_push() {
  # Expand ~ to $HOME if present
  if [[ "$SITE_NAME" == ~* ]]; then
    SITE_NAME="${HOME}${SITE_NAME:1}"
  fi
  # Determine if SITE_NAME is a path or just a name
  if [[ "$SITE_NAME" == /* || "$SITE_NAME" == ./* ]]; then
    SITE_DIR="$(realpath -m "$SITE_NAME")"
  else
    SITE_DIR="$PROJECT_ROOT/websites/$SITE_NAME"
  fi
  SITE_COMPOSE_FILE="${SITE_DIR}/docker-compose.yml"
  REMOTE_HOST=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_host")
  SSH_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_user")
  WEB_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "web_user")
  REMOTE_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "remote_path")
  LOCAL_DB_DUMP_DIR=$(get_jq_config_value "$SITE_NAME" "local" "db_dump_path")

  TIMESTAMP=$(date +"%Y%m%d%H%M%S")
  LOCAL_DUMP_FILE_NAME="db_dump_${SITE_NAME}_local_${TIMESTAMP}.sql"
  LOCAL_DUMP_FILE_PATH="${LOCAL_DB_DUMP_DIR}${LOCAL_DUMP_FILE_NAME}"
  REMOTE_DUMP_FILE_PATH="/tmp/${LOCAL_DUMP_FILE_NAME}"

  log_info "Exporting local database from Docker..."
  docker-compose -f "$SITE_COMPOSE_FILE" exec -T app wp db export "$LOCAL_DUMP_FILE_PATH" --allow-root || error_exit "Local DB export failed."

  log_info "Copying database dump to remote via SCP..."
  SSH_CONNECTION_STRING="$SSH_USER@$REMOTE_HOST"
  scp "$LOCAL_DUMP_FILE_PATH" "$SSH_CONNECTION_STRING":"$REMOTE_DUMP_FILE_PATH" || error_exit "SCP upload failed."

  log_info "Importing database on remote via SSH..."
  ssh "$SSH_CONNECTION_STRING" "cd '$REMOTE_PATH' && sudo -u $WEB_USER wp db import '$REMOTE_DUMP_FILE_PATH'" || error_exit "Remote DB import failed."

  log_info "Removing database dump from remote via SSH..."
  ssh "$SSH_CONNECTION_STRING" "sudo rm '$REMOTE_DUMP_FILE_PATH'" || log_warn "Failed to remove remote dump file."

  log_info "Cleaning up local database dump..."
  rm "$LOCAL_DUMP_FILE_PATH" || log_warn "Failed to remove local dump file."

  log_success "Database push complete."
}

sync_db_pull() {
  # Expand ~ to $HOME if present
  if [[ "$SITE_NAME" == ~* ]]; then
    SITE_NAME="${HOME}${SITE_NAME:1}"
  fi
  # Determine if SITE_NAME is a path or just a name
  if [[ "$SITE_NAME" == /* || "$SITE_NAME" == ./* ]]; then
    SITE_DIR="$(realpath -m "$SITE_NAME")"
  else
    SITE_DIR="$PROJECT_ROOT/websites/$SITE_NAME"
  fi
  SITE_COMPOSE_FILE="${SITE_DIR}/docker-compose.yml"
  REMOTE_HOST=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_host")
  SSH_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_user")
  WEB_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "web_user")
  REMOTE_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "remote_path")
  LOCAL_DB_DUMP_DIR=$(get_jq_config_value "$SITE_NAME" "local" "db_dump_path")

  TIMESTAMP=$(date +"%Y%m%d%H%M%S")
  REMOTE_DUMP_FILE_NAME="db_dump_${SITE_NAME}_${TARGET_ENV}_${TIMESTAMP}.sql"
  REMOTE_DUMP_FILE_PATH="/tmp/${REMOTE_DUMP_FILE_NAME}"
  LOCAL_DUMP_FILE_PATH="${LOCAL_DB_DUMP_DIR}${REMOTE_DUMP_FILE_NAME}"

  log_info "Exporting remote database via SSH..."
  SSH_CONNECTION_STRING="$SSH_USER@$REMOTE_HOST"
  ssh "$SSH_CONNECTION_STRING" "cd '$REMOTE_PATH' && sudo -u $WEB_USER wp db export '$REMOTE_DUMP_FILE_PATH'" || error_exit "Remote DB export failed."

  log_info "Copying database dump locally via SCP..."
  scp "$SSH_CONNECTION_STRING":"$REMOTE_DUMP_FILE_PATH" "$LOCAL_DUMP_FILE_PATH" || error_exit "SCP download failed."

  log_info "Removing remote database dump via SSH..."
  ssh "$SSH_CONNECTION_STRING" "sudo rm '$REMOTE_DUMP_FILE_PATH'" || log_warn "Failed to remove remote dump file."

  log_info "Importing database into local Docker container..."
  docker-compose -f "$SITE_COMPOSE_FILE" exec -T app wp db import "$LOCAL_DUMP_FILE_PATH" --allow-root || error_exit "Local DB import failed."

  log_info "Cleaning up local database dump..."
  rm "$LOCAL_DUMP_FILE_PATH" || log_warn "Failed to remove local dump file."

  log_success "Database pull complete."
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  if [ "$DIRECTION" = "push" ]; then
    sync_db_push
  elif [ "$DIRECTION" = "pull" ]; then
    sync_db_pull
  else
    log_error "Invalid direction: $DIRECTION. Use 'push' or 'pull'."
    usage
  fi
}

main "$@"
