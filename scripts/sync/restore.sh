#!/bin/bash
# restore.sh - Restore DB and uploads from rclone remote backup (DDEV-based)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"
CONFIG_FILE="$PROJECT_ROOT/config/sync-config.json"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment> --date=YYYYMMDD-HHMMSS"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments: site_name, environment."
    usage
  fi
  SITE_NAME="$1"
  TARGET_ENV="$2"
  BACKUP_DATE=""
  shift 2
  for arg in "$@"; do
    case $arg in
      --date=*) BACKUP_DATE="${arg#*=}" ;;
    esac
  done
  if [ -z "$BACKUP_DATE" ]; then
    log_error "Missing --date argument."
    usage
  fi
}

get_jq_config_value() {
  local site=$1
  local env=$2
  local key=$3
  jq -r ".${site}.${env}.${key} // empty" "$CONFIG_FILE"
}

main() {
  parse_arguments "$@"
  # Expand ~ to $HOME if present
  if [[ "$SITE_NAME" == ~* ]]; then
    SITE_NAME="${HOME}${SITE_NAME:1}"
  fi
  LOCAL_DB_DUMP_DIR=$(get_jq_config_value "$SITE_NAME" "local" "db_dump_path")
  LOCAL_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "local" "uploads_path")
  RCLONE_REMOTE=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_remote")
  REMOTE_BACKUP_DIR="${RCLONE_REMOTE}backups/${SITE_NAME}/${TARGET_ENV}/${BACKUP_DATE}/"

  [ -d "$LOCAL_DB_DUMP_DIR" ] || mkdir -p "$LOCAL_DB_DUMP_DIR"
  [ -d "$LOCAL_UPLOADS_PATH" ] || mkdir -p "$LOCAL_UPLOADS_PATH"

  # 1. Download DB and uploads archive
  log_info "Downloading backup from $REMOTE_BACKUP_DIR"
  rclone copy "$REMOTE_BACKUP_DIR" "$LOCAL_DB_DUMP_DIR" || error_exit "Failed to download backup"

  DB_DUMP_FILE=$(ls "$LOCAL_DB_DUMP_DIR"/db_${SITE_NAME}_${TARGET_ENV}_${BACKUP_DATE}.sql 2>/dev/null | head -n1)
  UPLOADS_ARCHIVE=$(ls "$LOCAL_DB_DUMP_DIR"/uploads_${SITE_NAME}_${TARGET_ENV}_${BACKUP_DATE}.zip 2>/dev/null | head -n1)
  [ -f "$DB_DUMP_FILE" ] || error_exit "DB dump not found in backup"
  [ -f "$UPLOADS_ARCHIVE" ] || error_exit "Uploads archive not found in backup"

  # 2. Restore DB using DDEV
  log_info "Restoring DB from $DB_DUMP_FILE using DDEV"
  ddev import-db --file="$DB_DUMP_FILE" || error_exit "DB restore failed"

  # 3. Restore uploads
  log_info "Restoring uploads from $UPLOADS_ARCHIVE"
  unzip -o "$UPLOADS_ARCHIVE" -d "$(dirname "$LOCAL_UPLOADS_PATH")" || error_exit "Uploads unzip failed"

  log_success "Restore complete for $SITE_NAME ($TARGET_ENV) from $BACKUP_DATE"
}

main "$@"
