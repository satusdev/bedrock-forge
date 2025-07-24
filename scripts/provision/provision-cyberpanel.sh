#!/bin/bash
# provision-cyberpanel.sh - Orchestrate full CyberPanel/OpenLiteSpeed provisioning

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVISION_DIR="$SCRIPT_DIR"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <domain>"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [ -z "$DOMAIN" ]; then
    read -rp "Enter domain (e.g., mysite.com): " DOMAIN
  fi
}

parse_arguments() {
  # Help flag
  for arg in "$@"; do
    case $arg in
      -h|--help) usage ;;
    esac
  done

  DOMAIN="$1"
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  "$PROVISION_DIR/cloudflare-dns.sh" "$DOMAIN" || error_exit "Cloudflare DNS step failed."
  "$PROVISION_DIR/cyberpanel-site.sh" "$DOMAIN" || error_exit "CyberPanel site step failed."
  "$PROVISION_DIR/cyberpanel-db.sh" "$DOMAIN" || error_exit "CyberPanel DB step failed."
  sleep 5
  "$PROVISION_DIR/ols-vhost.sh" "$DOMAIN" || error_exit "OLS vHost step failed."
  "$PROVISION_DIR/ols-restart.sh" || error_exit "OLS restart step failed."
  log_success "Provisioning complete for $DOMAIN."
}

main "$@"
