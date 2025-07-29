#!/bin/bash
# ols-vhost.sh - Configure OpenLiteSpeed vHost for a domain

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

configure_ols_vhost() {
  local domain=$1
  log_info "Configuring OpenLiteSpeed vHost for $domain..."
  SSH_USER="${SSH_USER:-root}"
  SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"
  local remote_web_root="/home/$domain/public_html"
  local remote_vhost_file="/usr/local/lsws/conf/vhosts/$domain/vhost.conf"
  local ssh_cmd
  ssh_cmd=$(cat <<EOF
set -e
cp "$remote_vhost_file" "${remote_vhost_file}.bak.\$(date +%Y%m%d%H%M%S)"
sed -i 's|docRoot.*|docRoot                   $remote_web_root/web|' "$remote_vhost_file"
sed -i '/^context \/ {/,/}$/d' "$remote_vhost_file"
cat << 'REWRITE_RULES' >> "$remote_vhost_file"

context / {
  allowBrowse             1
  location                $remote_web_root/web/
  rewrite {
    enable                1
    RewriteRule ^/wp-admin/ - [L]
    RewriteRule ^/wp-login.php - [L]
    RewriteRule ^(.*)$ index.php?/\$1 [L]
  }
  addDefaultCharset       off
  phpIniOverride {
  }
}
REWRITE_RULES
EOF
)
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_cmd" || error_exit "Failed to configure vHost via SSH."
  log_success "vHost configuration complete."
}

main() {
  parse_arguments "$@"
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
  configure_ols_vhost "$DOMAIN"
}

main "$@"
