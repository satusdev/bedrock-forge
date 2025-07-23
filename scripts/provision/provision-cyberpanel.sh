#!/bin/bash
# provision-cyberpanel.sh - Orchestrate full CyberPanel/OpenLiteSpeed provisioning

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVISION_DIR="$SCRIPT_DIR"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <domain>"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing domain argument."
    usage
  fi
  DOMAIN="$1"
}

main() {
  parse_arguments "$@"
  "$PROVISION_DIR/cloudflare-dns.sh" "$DOMAIN" || error_exit "Cloudflare DNS step failed."
  "$PROVISION_DIR/cyberpanel-site.sh" "$DOMAIN" || error_exit "CyberPanel site step failed."
  "$PROVISION_DIR/cyberpanel-db.sh" "$DOMAIN" || error_exit "CyberPanel DB step failed."
  sleep 5
  "$PROVISION_DIR/ols-vhost.sh" "$DOMAIN" || error_exit "OLS vHost step failed."
  "$PROVISION_DIR/ols-restart.sh" || error_exit "OLS restart step failed."
  log_success "Provisioning complete for $DOMAIN."
}

main "$@"
