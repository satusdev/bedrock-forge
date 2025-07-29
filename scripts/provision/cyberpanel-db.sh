#!/bin/bash
# cyberpanel-db.sh - Create a CyberPanel database and user for a domain

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

create_cyberpanel_db() {
  local domain=$1
  log_info "Creating CyberPanel database and user for $domain..."
  SSH_USER="${SSH_USER:-root}"
  SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"
  local db_password
  db_password=$(openssl rand -base64 16)
  local db_name_raw db_user_raw db_name db_user
  db_name_raw=$(echo "$domain" | tr '.' '_')
  db_user_raw=$(echo "$domain" | tr '.' '_')
  db_name="${db_name_raw:0:50}_db"
  db_user="${db_user_raw:0:25}_user"

  local ssh_cmd
  ssh_cmd=$(cat <<EOF
if ! command -v jq &> /dev/null; then
    echo "Error: jq command could not be found on the remote server. Please install jq." >&2
    exit 1
fi
db_response_raw=\$(cyberpanel createDatabase --databaseWebsite "$domain" --dbName "$db_name" --dbUsername "$db_user" --dbPassword "$db_password")
if [[ "\$db_response_raw" == *"already exists"* || "\$db_response_raw" == *"already taken"* ]]; then
    echo "Database/User already exists/taken. Continuing..."
else
    db_success=\$(echo "\$db_response_raw" | jq -r '.success' || true)
    db_error_msg=\$(echo "\$db_response_raw" | jq -r '.errorMessage // ""' || true)
    if [[ "\$db_success" == "1" ]]; then
        echo "DB_NAME=$db_name" > "/tmp/db_creds_${domain}"
        echo "DB_USER=$db_user" >> "/tmp/db_creds_${domain}"
        echo "DB_PASSWORD=$db_password" >> "/tmp/db_creds_${domain}"
        echo "Database created successfully."
    else
        echo "Error creating database: \$db_error_msg" >&2
        exit 1
    fi
fi
EOF
)
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_cmd" || error_exit "Failed to create CyberPanel database via SSH."

  # Retrieve database credentials if created
  DB_CREATED_FLAG=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "[ -f /tmp/db_creds_${domain} ] && echo 'true' || echo 'false'")
  if [[ "$DB_CREATED_FLAG" == "true" ]]; then
      local db_creds
      db_creds=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "cat /tmp/db_creds_${domain} 2>/dev/null") || error_exit "Failed to retrieve DB credentials from remote server."
      ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "rm /tmp/db_creds_${domain}"
      export DB_NAME_RETRIEVED=$(echo "$db_creds" | grep DB_NAME | cut -d= -f2)
      export DB_USER_RETRIEVED=$(echo "$db_creds" | grep DB_USER | cut -d= -f2)
      export DB_PASSWORD_RETRIEVED=$(echo "$db_creds" | grep DB_PASSWORD | cut -d= -f2)
      log_success "CyberPanel database creation complete. Credentials exported."
  else
      log_info "CyberPanel database creation complete (DB likely existed previously)."
      unset DB_NAME_RETRIEVED
      unset DB_USER_RETRIEVED
      unset DB_PASSWORD_RETRIEVED
  fi
}

main() {
  parse_arguments "$@"
  load_env
  check_var "$SERVER_IP" "SERVER_IP"
  check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
  create_cyberpanel_db "$DOMAIN"
}

main "$@"
