#!/bin/bash
# sync-uploads.sh - Sync Bedrock uploads between local and remote/cloud (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
CONFIG_FILE="config/sync-config.json"

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

sync_uploads_push() {
  LOCAL_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "local" "uploads_path")
  RCLONE_REMOTE=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_remote")
  RCLONE_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_uploads_path")

  if [ -z "$RCLONE_REMOTE" ] || [ -z "$RCLONE_UPLOADS_PATH" ] || [ -z "$LOCAL_UPLOADS_PATH" ]; then
    error_exit "Could not parse rclone or uploads config for site '$SITE_NAME' and environment '$TARGET_ENV'."
  fi

  log_info "Syncing local '$LOCAL_UPLOADS_PATH' to '$RCLONE_REMOTE$RCLONE_UPLOADS_PATH'..."
  rclone copy "$LOCAL_UPLOADS_PATH" "$RCLONE_REMOTE$RCLONE_UPLOADS_PATH" --progress || error_exit "rclone copy to remote failed."
  log_success "Uploads push complete."
}

sync_uploads_pull() {
  LOCAL_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "local" "uploads_path")
  RCLONE_REMOTE=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_remote")
  RCLONE_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_uploads_path")

  if [ -z "$RCLONE_REMOTE" ] || [ -z "$RCLONE_UPLOADS_PATH" ] || [ -z "$LOCAL_UPLOADS_PATH" ]; then
    error_exit "Could not parse rclone or uploads config for site '$SITE_NAME' and environment '$TARGET_ENV'."
  fi

  mkdir -p "$LOCAL_UPLOADS_PATH" || error_exit "Failed to create local uploads directory '$LOCAL_UPLOADS_PATH'."
  log_info "Syncing '$RCLONE_REMOTE$RCLONE_UPLOADS_PATH' to local '$LOCAL_UPLOADS_PATH'..."
  rclone copy "$RCLONE_REMOTE$RCLONE_UPLOADS_PATH" "$LOCAL_UPLOADS_PATH" --progress || error_exit "rclone copy to local failed."
  log_success "Uploads pull complete."
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  if [ "$DIRECTION" = "push" ]; then
    sync_uploads_push
  elif [ "$DIRECTION" = "pull" ]; then
    sync_uploads_pull
  else
    log_error "Invalid direction: $DIRECTION. Use 'push' or 'pull'."
    usage
  fi
}

main "$@"
