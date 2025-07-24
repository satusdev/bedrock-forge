#!/bin/bash
# cloudflare-dns.sh - Manage Cloudflare DNS A records for a domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

ENV_FILE="scripts/.env.provision"

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

load_env() {
  if [ -f "$ENV_FILE" ]; then
    log_info "Loading environment variables from $ENV_FILE"
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
  else
    error_exit "$ENV_FILE not found. Please create it from $ENV_FILE.example and fill in the details."
  fi
}

check_var() {
  local var_value=$1
  local var_name=$2
  if [ -z "$var_value" ]; then
    error_exit "$var_name is not set in $ENV_FILE or passed correctly. Please define it."
  fi
}

setup_cloudflare_dns() {
  local domain=$1
  log_info "Setting up Cloudflare DNS A record for $domain..."
  local api_response
  api_response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${domain}\",\"content\":\"${SERVER_IP}\",\"ttl\":120,\"proxied\":false}")

  local success_status error_code error_message
  success_status=$(echo "$api_response" | jq -r '.success')
  error_code=$(echo "$api_response" | jq -r '.errors[0].code // empty')

  if [[ "$success_status" == "true" ]]; then
    log_success "Cloudflare DNS record created successfully."
  elif [[ "$error_code" == "81057" || "$error_code" == "81058" ]]; then
    log_info "Cloudflare DNS record already exists (Code: $error_code). Continuing..."
  else
    error_message=$(echo "$api_response" | jq -r '.errors[0].message // "Unknown error"')
    log_error "Cloudflare API Response: $api_response"
    error_exit "Failed to create Cloudflare DNS record. Code: $error_code, Message: $error_message. Check API token, Zone ID, and response."
  fi
}

main() {
  parse_arguments "$@"
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$CLOUDFLARE_API_TOKEN" "CLOUDFLARE_API_TOKEN"
  check_var "$CF_ZONE_ID" "CF_ZONE_ID"
  setup_cloudflare_dns "$DOMAIN"
}

main "$@"
