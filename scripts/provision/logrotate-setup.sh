#!/bin/bash
# logrotate-setup.sh - Install and configure logrotate for a logs directory on remote server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <user@host> <remote-logs-dir> [--rotate=7] [--size=100M]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments: user@host and remote-logs-dir."
    usage
  fi
  SSH_TARGET="$1"
  REMOTE_LOGS_DIR="$2"
  ROTATE=7
  SIZE="100M"
  shift 2
  for arg in "$@"; do
    case $arg in
      --rotate=*) ROTATE="${arg#*=}" ;;
      --size=*) SIZE="${arg#*=}" ;;
    esac
  done
}

install_logrotate() {
  log_info "Installing logrotate on $SSH_TARGET"
  ssh "$SSH_TARGET" "sudo apt-get update && sudo apt-get install -y logrotate"
  log_success "logrotate installed"
}

upload_logrotate_conf() {
  CONF_FILE=$(mktemp)
  cat > "$CONF_FILE" <<EOF
$REMOTE_LOGS_DIR/*.log {
    daily
    rotate $ROTATE
    size $SIZE
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    create 0640 $(whoami) $(whoami)
    sharedscripts
    postrotate
        /usr/bin/killall -HUP syslogd 2>/dev/null || true
    endscript
}
EOF
  log_info "Uploading logrotate config to $SSH_TARGET:/etc/logrotate.d/wordpress-logs"
  scp "$CONF_FILE" "$SSH_TARGET:/tmp/wordpress-logs"
  ssh "$SSH_TARGET" "sudo mv /tmp/wordpress-logs /etc/logrotate.d/wordpress-logs && sudo chmod 644 /etc/logrotate.d/wordpress-logs"
  rm "$CONF_FILE"
  log_success "logrotate config deployed"
}

main() {
  parse_arguments "$@"
  install_logrotate
  upload_logrotate_conf
  log_success "Log rotation setup complete for $REMOTE_LOGS_DIR on $SSH_TARGET"
}

main "$@"
