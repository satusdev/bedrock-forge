#!/bin/bash
# kuma-register.sh - Register a monitor with Uptime Kuma via API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 --kuma-url=URL --api-key=KEY --name=NAME --url=SITE_URL [--interval=60]"
  exit 1
}

parse_arguments() {
  INTERVAL=60
  for arg in "$@"; do
    case $arg in
      --kuma-url=*) KUMA_URL="${arg#*=}" ;;
      --api-key=*) KUMA_API_KEY="${arg#*=}" ;;
      --name=*) MONITOR_NAME="${arg#*=}" ;;
      --url=*) SITE_URL="${arg#*=}" ;;
      --interval=*) INTERVAL="${arg#*=}" ;;
    esac
  done
  if [ -z "$KUMA_URL" ] || [ -z "$KUMA_API_KEY" ] || [ -z "$MONITOR_NAME" ] || [ -z "$SITE_URL" ]; then
    log_error "Missing required arguments."
    usage
  fi
}

main() {
  parse_arguments "$@"
  log_info "Registering monitor '$MONITOR_NAME' for $SITE_URL on $KUMA_URL"
  RESPONSE=$(curl -s -X POST "$KUMA_URL/api/monitor" \
    -H "Authorization: $KUMA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$MONITOR_NAME\",\"type\":\"http\",\"url\":\"$SITE_URL\",\"interval\":$INTERVAL}")
  MONITOR_ID=$(echo "$RESPONSE" | jq -r '.monitorID // empty')
  if [ -n "$MONITOR_ID" ]; then
    log_success "Monitor registered with ID: $MONITOR_ID"
    echo "$MONITOR_ID"
  else
    log_error "Failed to register monitor. Response: $RESPONSE"
    exit 1
  fi
}

main "$@"
