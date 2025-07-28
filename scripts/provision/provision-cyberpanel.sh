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
  # Cloudflare DNS step
  DNS_OUTPUT=$("$PROVISION_DIR/cloudflare-dns.sh" "$DOMAIN") || error_exit "Cloudflare DNS step failed."
  # Extract DNS info (example: IP and records)
  DNS_IP=$(echo "$DNS_OUTPUT" | grep -Eo 'IP: [0-9.]+' | awk '{print $2}' | head -n1)
  DNS_RECORDS=$(echo "$DNS_OUTPUT" | grep -Eo 'Record: .+' | awk -F': ' '{print $2}' | tr '\n' ',' | sed 's/,$//')

  # Update project-info.json DNS section
  jq \
    --arg domain "$DOMAIN" \
    --arg ip "$DNS_IP" \
    --arg records "$DNS_RECORDS" \
    '.dns.domain = $domain | .dns.records = ($records | split(","))' \
    project-info.json > project-info.json.tmp && mv project-info.json.tmp project-info.json

  "$PROVISION_DIR/cyberpanel-site.sh" "$DOMAIN" || error_exit "CyberPanel site step failed."

  # CyberPanel DB step
  DB_OUTPUT=$("$PROVISION_DIR/cyberpanel-db.sh" "$DOMAIN") || error_exit "CyberPanel DB step failed."
  # Extract DB info (example: host, name, user, password)
  DB_HOST=$(echo "$DB_OUTPUT" | grep -Eo 'Host: [^ ]+' | awk '{print $2}' | head -n1)
  DB_NAME=$(echo "$DB_OUTPUT" | grep -Eo 'DB Name: [^ ]+' | awk '{print $3}' | head -n1)
  DB_USER=$(echo "$DB_OUTPUT" | grep -Eo 'User: [^ ]+' | awk '{print $2}' | head -n1)
  DB_PASS=$(echo "$DB_OUTPUT" | grep -Eo 'Password: [^ ]+' | awk '{print $2}' | head -n1)

  # Update project-info.json DB section
  jq \
    --arg host "$DB_HOST" \
    --arg name "$DB_NAME" \
    --arg user "$DB_USER" \
    --arg password "$DB_PASS" \
    '.database.host = $host | .database.name = $name | .database.user = $user | .database.password = $password' \
    project-info.json > project-info.json.tmp && mv project-info.json.tmp project-info.json

  sleep 5
  "$PROVISION_DIR/ols-vhost.sh" "$DOMAIN" || error_exit "OLS vHost step failed."
  "$PROVISION_DIR/ols-restart.sh" || error_exit "OLS restart step failed."
  log_success "Provisioning complete for $DOMAIN."
}

main "$@"
