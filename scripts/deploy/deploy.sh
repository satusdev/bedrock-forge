#!/bin/bash
# deploy.sh - Deploy Bedrock code to remote server (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"
CONFIG_FILE="$PROJECT_ROOT/config/sync-config.json"
PROJECT_INFO_FILE="$PROJECT_ROOT/project-info.json"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment>"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments: site_name, environment."
    usage
  fi
  SITE_NAME="$1"
  TARGET_ENV="$2"
}

get_jq_config_value() {
  local site=$1
  local env=$2
  local key=$3
  jq -r ".${site}.${env}.${key} // empty" "$CONFIG_FILE"
}

deploy_code() {
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
  LOCAL_WEB_ROOT="${SITE_DIR}/www"
  REMOTE_HOST=$(jq -r '.server.ip // empty' "$PROJECT_INFO_FILE")
  SSH_USER=$(jq -r '.site.admin_user // empty' "$PROJECT_INFO_FILE")
  WEB_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "web_user")
  REMOTE_PATH=$(jq -r '.site.url // empty' "$PROJECT_INFO_FILE")

  if [ -z "$REMOTE_HOST" ] || [ -z "$SSH_USER" ] || [ -z "$WEB_USER" ] || [ -z "$REMOTE_PATH" ]; then
    error_exit "Missing remote info in project-info.json. Please provision first."
  fi

  SSH_CONNECTION_STRING="$SSH_USER@$REMOTE_HOST"

  if [ ! -d "$LOCAL_WEB_ROOT" ]; then
    error_exit "Local web root directory '$LOCAL_WEB_ROOT' not found."
  fi

  log_info "Building local production dependencies..."
  cd "$LOCAL_WEB_ROOT" || error_exit "Failed to cd into local web root '$LOCAL_WEB_ROOT'."
  composer install --no-dev --optimize-autoloader || error_exit "Local composer install failed."
  cd - > /dev/null

  log_info "Syncing files to remote server via rsync..."
  rsync -az --delete \
    --exclude '.env' \
    --exclude '.git/' \
    --exclude '.github/' \
    --exclude 'node_modules/' \
    --exclude '.DS_Store' \
    "$LOCAL_WEB_ROOT/" "$SSH_CONNECTION_STRING":"$REMOTE_PATH/" || error_exit "Rsync failed."

  log_info "Setting permissions on remote server..."
  ssh "$SSH_CONNECTION_STRING" " \
    cd '${REMOTE_PATH}' || { echo 'ERROR: Failed to cd to remote web root'; exit 1; }; \
    sudo chown -R '${WEB_USER}:${WEB_USER}' . || { echo 'ERROR: Failed to set ownership'; exit 1; }; \
    sudo find . -type d -exec chmod 755 {} \; || { echo 'ERROR: Failed to set directory permissions'; exit 1; }; \
    sudo find . -type f -exec chmod 644 {} \; || { echo 'ERROR: Failed to set file permissions'; exit 1; }; \
    UPLOADS_DIR='web/app/uploads'; \
    if [ -d \"\$UPLOADS_DIR\" ]; then \
      sudo chmod -R 775 \"\$UPLOADS_DIR\" || { echo 'WARNING: Failed to set uploads directory permissions'; }; \
    fi; \
    if [ -f '.env' ]; then \
      sudo chmod 600 .env || { echo 'WARNING: Failed to set .env permissions'; }; \
    fi; \
  " || error_exit "SSH command execution for permissions failed."

  log_success "Code deployment for '$SITE_NAME' to '$TARGET_ENV' complete."
}

main() {
  parse_arguments "$@"
  deploy_code
}

main "$@"
