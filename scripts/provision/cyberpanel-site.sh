#!/bin/bash
# cyberpanel-site.sh - Create a CyberPanel website for a domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

ENV_FILE="$PROJECT_ROOT/scripts/.env.provision"

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

create_cyberpanel_site() {
  local domain=$1
  log_info "Creating CyberPanel website for $domain..."
  SSH_USER="${SSH_USER:-root}"
  SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"
  local ssh_cmd
  ssh_cmd=$(cat <<EOF
if ! command -v jq &> /dev/null; then
    echo "Error: jq command could not be found on the remote server. Please install jq." >&2
    exit 1
fi
website_response=\$(cyberpanel createWebsite --package Default --owner admin --domainName "$domain" --email "$ADMIN_EMAIL" --php "$PHP_VERSION")
website_success=\$(echo "\$website_response" | jq -r '.success')
website_error_msg=\$(echo "\$website_response" | jq -r '.errorMessage // ""')
if [[ "\$website_success" == "1" ]]; then
    echo "Website created successfully."
elif [[ "\$website_error_msg" == "This website already exists." ]]; then
    echo "Website already exists. Continuing..."
else
    echo "Error creating website: \$website_error_msg" >&2
    exit 1
fi
EOF
)
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_cmd" || error_exit "Failed to create CyberPanel website via SSH."
  log_success "CyberPanel website creation complete."
}

main() {
  parse_arguments "$@"
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
  check_var "$ADMIN_EMAIL" "ADMIN_EMAIL"
  check_var "$PHP_VERSION" "PHP_VERSION"
  create_cyberpanel_site "$DOMAIN"
}

main "$@"
