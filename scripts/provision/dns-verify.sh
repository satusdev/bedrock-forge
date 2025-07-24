#!/bin/bash
# dns-verify.sh - Check DNS A/CNAME record propagation for a domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <domain> --expect-ip=IP [--type=A|CNAME] [--timeout=300] [--interval=15]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing domain argument."
    usage
  fi
  DOMAIN="$1"
  EXPECT_IP=""
  TYPE="A"
  TIMEOUT=300
  INTERVAL=15
  shift
  for arg in "$@"; do
    case $arg in
      --expect-ip=*) EXPECT_IP="${arg#*=}" ;;
      --type=*) TYPE="${arg#*=}" ;;
      --timeout=*) TIMEOUT="${arg#*=}" ;;
      --interval=*) INTERVAL="${arg#*=}" ;;
    esac
  done
  if [ -z "$EXPECT_IP" ]; then
    log_error "Missing --expect-ip argument."
    usage
  fi
}

check_dns() {
  if [ "$TYPE" = "A" ]; then
    dig +short "$DOMAIN" | grep -w "$EXPECT_IP" >/dev/null
  else
    dig +short "$DOMAIN" CNAME | grep -w "$EXPECT_IP" >/dev/null
  fi
}

main() {
  parse_arguments "$@"
  log_info "Checking DNS $TYPE record for $DOMAIN (expect $EXPECT_IP)..."
  ELAPSED=0
  while ! check_dns; do
    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
      log_error "DNS $TYPE record for $DOMAIN did not propagate to $EXPECT_IP within $TIMEOUT seconds."
      exit 1
    fi
    log_info "Not propagated yet. Waiting $INTERVAL seconds..."
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
  done
  log_success "DNS $TYPE record for $DOMAIN points to $EXPECT_IP"
}

main "$@"
