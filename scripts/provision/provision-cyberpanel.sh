#!/bin/bash
# provision-cyberpanel.sh - Provision a Bedrock site on CyberPanel/OpenLiteSpeed (modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

ENV_FILE="scripts/.env.provision"

usage() {
  echo "Usage: $0 <yourdomain.com>"
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

create_cyberpanel_site_db() {
  local domain=$1
  log_info "Creating CyberPanel website and database for $domain..."
  local db_password
  db_password=$(openssl rand -base64 16)
  local db_name_raw db_user_raw db_name db_user
  db_name_raw=$(echo "$domain" | tr '.' '_')
  db_user_raw=$(echo "$domain" | tr '.' '_')
  db_name="${db_name_raw:0:50}_db"
  db_user="${db_user_raw:0:25}_user"

  local ssh_cyberpanel_cmd
  ssh_cyberpanel_cmd=$(cat <<EOF
if ! command -v jq &> /dev/null; then
    echo "Error: jq command could not be found on the remote server. Please install jq." >&2
    exit 1
fi
WEBSITE_CREATED_THIS_RUN=false
DB_CREATED_THIS_RUN=false
website_response=\$(cyberpanel createWebsite --package Default --owner admin --domainName "$domain" --email "$ADMIN_EMAIL" --php "$PHP_VERSION")
website_success=\$(echo "\$website_response" | jq -r '.success')
website_error_msg=\$(echo "\$website_response" | jq -r '.errorMessage // ""')
if [[ "\$website_success" == "1" ]]; then
    WEBSITE_CREATED_THIS_RUN=true
elif [[ "\$website_error_msg" == "This website already exists." ]]; then
    :
else
    echo "Error creating website: \$website_error_msg" >&2
    exit 1
fi
db_response_raw=\$(cyberpanel createDatabase --databaseWebsite "$domain" --dbName "$db_name" --dbUsername "$db_user" --dbPassword "$db_password")
if [[ "\$db_response_raw" == *"already exists"* || "\$db_response_raw" == *"already taken"* ]]; then
    :
else
    db_success=\$(echo "\$db_response_raw" | jq -r '.success' || true)
    db_error_msg=\$(echo "\$db_response_raw" | jq -r '.errorMessage // ""' || true)
    if [[ "\$db_success" == "1" ]]; then
        DB_CREATED_THIS_RUN=true
        echo "DB_NAME=$db_name" > "/tmp/db_creds_${domain}"
        echo "DB_USER=$db_user" >> "/tmp/db_creds_${domain}"
        echo "DB_PASSWORD=$db_password" >> "/tmp/db_creds_${domain}"
    else
        echo "Error creating database: \$db_error_msg" >&2
        if [[ "\$WEBSITE_CREATED_THIS_RUN" == "true" ]]; then
            cyberpanel deleteWebsite --domainName "$domain" || echo "Warning: Failed to delete website $domain after DB creation failure." >&2
        fi
        exit 1
    fi
fi
EOF
)
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_cyberpanel_cmd" || error_exit "Failed to execute CyberPanel setup commands via SSH. Check remote logs if necessary."

  DB_CREATED_FLAG=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "[ -f /tmp/db_creds_${domain} ] && echo 'true' || echo 'false'")

  if [[ "$DB_CREATED_FLAG" == "true" ]]; then
      local db_creds
      db_creds=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "cat /tmp/db_creds_${domain} 2>/dev/null") || error_exit "Failed to retrieve DB credentials from remote server."
      ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "rm /tmp/db_creds_${domain}"
      export DB_NAME_RETRIEVED=$(echo "$db_creds" | grep DB_NAME | cut -d= -f2)
      export DB_USER_RETRIEVED=$(echo "$db_creds" | grep DB_USER | cut -d= -f2)
      export DB_PASSWORD_RETRIEVED=$(echo "$db_creds" | grep DB_PASSWORD | cut -d= -f2)
      log_success "CyberPanel site and database creation/verification complete."
  else
      log_info "CyberPanel site and database creation/verification complete (DB likely existed previously)."
      unset DB_NAME_RETRIEVED
      unset DB_USER_RETRIEVED
      unset DB_PASSWORD_RETRIEVED
  fi
}

configure_ols_vhost() {
  local domain=$1
  local remote_web_root="/home/$domain/public_html"
  local remote_vhost_file="/usr/local/lsws/conf/vhosts/$domain/vhost.conf"
  log_info "Configuring OpenLiteSpeed vHost for $domain..."

  local ssh_vhost_cmd
  ssh_vhost_cmd=$(cat <<EOF
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
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_vhost_cmd" || error_exit "Failed to configure vHost via SSH."
  log_success "vHost configured."
}

restart_ols() {
  log_info "Restarting OpenLiteSpeed server..."
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "systemctl restart lsws" || error_exit "Failed to restart OpenLiteSpeed server."
  log_success "OpenLiteSpeed restarted."
}

main() {
  parse_arguments "$@"
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$CLOUDFLARE_API_TOKEN" "CLOUDFLARE_API_TOKEN"
  check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
  check_var "$CF_ZONE_ID" "CF_ZONE_ID"
  check_var "$ADMIN_EMAIL" "ADMIN_EMAIL"
  check_var "$PHP_VERSION" "PHP_VERSION"
  if [ ! -f "$SSH_PRIVATE_KEY" ]; then
    error_exit "SSH private key file not found at '$SSH_PRIVATE_KEY'."
  fi
  chmod 600 "$SSH_PRIVATE_KEY"
  SSH_USER="${SSH_USER:-root}"
  SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"
  log_info "Starting Infrastructure Provisioning for $DOMAIN on $SERVER_IP"
  setup_cloudflare_dns "$DOMAIN"
  create_cyberpanel_site_db "$DOMAIN"
  log_info "Pausing for 5 seconds to allow vhost file creation..."
  sleep 5
  configure_ols_vhost "$DOMAIN"
  restart_ols
  log_success "Infrastructure Provisioning Complete for $DOMAIN"
  if [[ -n "$DB_PASSWORD_RETRIEVED" ]]; then
    echo "DB Name: $DB_NAME_RETRIEVED"
    echo "DB User: $DB_USER_RETRIEVED"
    echo "DB Password: $DB_PASSWORD_RETRIEVED"
    echo "Update your 'config/sync-config.json' with these database credentials for '$DOMAIN'."
  else
    echo "Database credentials were NOT generated in this run (database likely existed previously)."
    echo "Ensure the correct existing database credentials for '$DOMAIN' are present in 'config/sync-config.json'."
  fi
}

main "$@"
