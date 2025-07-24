#!/bin/bash
# rclone-config-auto.sh - Generate and upload rclone config for Google Drive (service account or token)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <user@host> --remote-name=NAME --service-account=/path/to/sa.json"
  echo "Or:    $0 <user@host> --remote-name=NAME --token=/path/to/token.json"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing user@host argument."
    usage
  fi
  SSH_TARGET="$1"
  REMOTE_NAME=""
  SA_JSON=""
  TOKEN_JSON=""
  shift
  for arg in "$@"; do
    case $arg in
      --remote-name=*) REMOTE_NAME="${arg#*=}" ;;
      --service-account=*) SA_JSON="${arg#*=}" ;;
      --token=*) TOKEN_JSON="${arg#*=}" ;;
    esac
  done
  if [ -z "$REMOTE_NAME" ]; then
    log_error "Missing --remote-name argument."
    usage
  fi
  if [ -z "$SA_JSON" ] && [ -z "$TOKEN_JSON" ]; then
    log_error "Must provide either --service-account or --token"
    usage
  fi
}

generate_rclone_conf() {
  RCLONE_CONF=$(mktemp)
  if [ -n "$SA_JSON" ]; then
    [ -f "$SA_JSON" ] || error_exit "Service account file $SA_JSON not found."
    log_info "Generating rclone.conf for Google Drive (service account)"
    cat > "$RCLONE_CONF" <<EOF
[$REMOTE_NAME]
type = drive
scope = drive
service_account_file = $SA_JSON
EOF
  else
    [ -f "$TOKEN_JSON" ] || error_exit "Token file $TOKEN_JSON not found."
    log_info "Generating rclone.conf for Google Drive (OAuth token)"
    cat > "$RCLONE_CONF" <<EOF
[$REMOTE_NAME]
type = drive
scope = drive
token = $(cat "$TOKEN_JSON")
EOF
  fi
}

upload_rclone_conf() {
  log_info "Uploading rclone.conf to $SSH_TARGET:~/.config/rclone/rclone.conf"
  ssh "$SSH_TARGET" "mkdir -p ~/.config/rclone"
  scp "$RCLONE_CONF" "$SSH_TARGET:~/.config/rclone/rclone.conf" || error_exit "Failed to upload rclone.conf"
  log_success "rclone.conf uploaded"
  rm "$RCLONE_CONF"
}

main() {
  parse_arguments "$@"
  generate_rclone_conf
  upload_rclone_conf
}

main "$@"
