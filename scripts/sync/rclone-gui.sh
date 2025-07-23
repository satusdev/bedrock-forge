#!/bin/bash
# rclone-gui.sh - Launch rclone web GUI (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 [--port=<port>]"
  exit 1
}

PORT=5572

for arg in "$@"; do
  case $arg in
    --port=*) PORT="${arg#*=}" ;;
    -h|--help) usage ;;
  esac
done

log_info "Launching rclone web GUI on port $PORT..."
rclone rcd --rc-web-gui --rc-addr "localhost:$PORT" &
PID=$!
log_success "rclone web GUI started (PID $PID). Access it at http://localhost:$PORT"
wait $PID
