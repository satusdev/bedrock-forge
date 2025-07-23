#!/bin/bash
# rclone-setup.sh - Install rclone and configure Google Drive remote on a server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <user@host> [--rclone-conf=/path/to/rclone.conf]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing user@host argument."
    usage
  fi
  SSH_TARGET="$1"
  RCLONE_CONF=""
  shift
  for arg in "$@"; do
    case $arg in
      --rclone-conf=*) RCLONE_CONF="${arg#*=}" ;;
    esac
  done
}

install_rclone() {
  log_info "Installing rclone on $SSH_TARGET..."
  ssh "$SSH_TARGET" "command -v rclone >/dev/null 2>&1 || (curl https://rclone.org/install.sh | sudo bash)" || error_exit "Failed to install rclone on $SSH_TARGET"
  log_success "rclone installed on $SSH_TARGET"
}

upload_rclone_conf() {
  if [ -n "$RCLONE_CONF" ] && [ -f "$RCLONE_CONF" ]; then
    log_info "Uploading rclone.conf to $SSH_TARGET:~/.config/rclone/rclone.conf"
    ssh "$SSH_TARGET" "mkdir -p ~/.config/rclone"
    scp "$RCLONE_CONF" "$SSH_TARGET:~/.config/rclone/rclone.conf" || error_exit "Failed to upload rclone.conf"
    log_success "rclone.conf uploaded"
  else
    log_warn "No rclone.conf provided. You must run 'rclone config' manually on the server to set up Google Drive remote."
  fi
}

main() {
  parse_arguments "$@"
  install_rclone
  upload_rclone_conf
  log_success "rclone setup complete on $SSH_TARGET"
}

main "$@"
