#!/bin/bash
# backup.sh - Backup DB and uploads to rclone remote with retention policy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
CONFIG_FILE="config/sync-config.json"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment> [--retention=N]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments: site_name, environment."
    usage
  fi
  SITE_NAME="$1"
  TARGET_ENV="$2"
  RETENTION=7
  shift 2
  for arg in "$@"; do
    case $arg in
      --retention=*) RETENTION="${arg#*=}" ;;
    esac
  done
}

get_jq_config_value() {
  local site=$1
  local env=$2
  local key=$3
  jq -r ".${site}.${env}.${key} // empty" "$CONFIG_FILE"
}

main() {
  parse_arguments "$@"
  TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
  SITE_DIR="websites/$SITE_NAME"
  SITE_COMPOSE_FILE="${SITE_DIR}/docker-compose.yml"
  LOCAL_DB_DUMP_DIR=$(get_jq_config_value "$SITE_NAME" "local" "db_dump_path")
  LOCAL_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "local" "uploads_path")
  RCLONE_REMOTE=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_remote")
  RCLONE_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_uploads_path")
  DB_NAME=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "db_name")

  [ -d "$LOCAL_DB_DUMP_DIR" ] || mkdir -p "$LOCAL_DB_DUMP_DIR"
  [ -d "$LOCAL_UPLOADS_PATH" ] || error_exit "Uploads path $LOCAL_UPLOADS_PATH not found."

  # 1. Dump DB
  DB_DUMP_FILE="${LOCAL_DB_DUMP_DIR}db_${SITE_NAME}_${TARGET_ENV}_${TIMESTAMP}.sql"
  log_info "Dumping DB to $DB_DUMP_FILE"
  docker-compose -f "$SITE_COMPOSE_FILE" exec -T app wp db export "$DB_DUMP_FILE" --allow-root || error_exit "DB export failed"

  # 2. Zip uploads
  UPLOADS_ARCHIVE="${LOCAL_DB_DUMP_DIR}uploads_${SITE_NAME}_${TARGET_ENV}_${TIMESTAMP}.zip"
  log_info "Zipping uploads to $UPLOADS_ARCHIVE"
  zip -r "$UPLOADS_ARCHIVE" "$LOCAL_UPLOADS_PATH" > /dev/null || error_exit "Uploads zip failed"

  # 3. Upload to rclone remote
  REMOTE_BACKUP_DIR="${RCLONE_REMOTE}backups/${SITE_NAME}/${TARGET_ENV}/${TIMESTAMP}/"
  log_info "Uploading DB and uploads to $REMOTE_BACKUP_DIR"
  rclone copy "$DB_DUMP_FILE" "$REMOTE_BACKUP_DIR" || error_exit "DB upload failed"
  rclone copy "$UPLOADS_ARCHIVE" "$REMOTE_BACKUP_DIR" || error_exit "Uploads upload failed"

  # 4. Retention policy
  log_info "Enforcing retention policy: keep $RETENTION most recent backups"
  BACKUP_PARENT="${RCLONE_REMOTE}backups/${SITE_NAME}/${TARGET_ENV}/"
  BACKUP_LIST=$(rclone lsf "$BACKUP_PARENT" --dirs-only | sort -r)
  BACKUP_COUNT=$(echo "$BACKUP_LIST" | wc -l)
  if [ "$BACKUP_COUNT" -gt "$RETENTION" ]; then
    TO_DELETE=$(echo "$BACKUP_LIST" | tail -n +$(($RETENTION + 1)))
    for DIR in $TO_DELETE; do
      log_info "Deleting old backup: $DIR"
      rclone purge "${BACKUP_PARENT}${DIR}" || log_warn "Failed to delete $DIR"
    done
  fi

  # 5. Cleanup local
  rm "$DB_DUMP_FILE" "$UPLOADS_ARCHIVE" || log_warn "Failed to clean up local backup files"

  log_success "Backup complete for $SITE_NAME ($TARGET_ENV) at $TIMESTAMP"
}

main "$@"
