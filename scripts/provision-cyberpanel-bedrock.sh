#!/bin/bash

# Script to provision the infrastructure for a new Bedrock site on a CyberPanel/OpenLiteSpeed server.
# Handles: Cloudflare DNS -> CyberPanel Site/DB -> OLS vHost Config -> OLS Restart
# Excludes Bedrock/WordPress installation (handled by manage-site.sh setup-new-site).

# --- Usage ---
# 1. Create and fill `scripts/.env.provision` from `scripts/.env.provision.example`.
# 2. Run the script:
#    ./scripts/provision-cyberpanel-bedrock.sh yourdomain.com
#
# --- Prerequisites ---
# - jq, curl, openssl, ssh installed locally.
# - SSH key access configured for the root user (or a user with sudo) on the CyberPanel server.
# - CyberPanel CLI tools available on the server.
# - Cloudflare API token with DNS edit permissions.
# - A `scripts/.env.provision` file with necessary credentials.

# --- Configuration Loading ---
ENV_FILE="scripts/.env.provision"
DOMAIN="$1"

# --- Helper Functions ---
error_exit() {
  echo "Error: $1" >&2
  exit 1
}

# Function to load .env file
load_env() {
  if [ -f "$ENV_FILE" ]; then
    echo "Loading environment variables from $ENV_FILE"
    # Source the .env file, handling potential issues like spaces in values
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

# --- Main Functions ---

setup_cloudflare_dns() {
  local domain=$1
  echo "1. Setting up Cloudflare DNS A record for $domain..."
  local api_response
  api_response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${domain}\",\"content\":\"${SERVER_IP}\",\"ttl\":120,\"proxied\":false}")

  # Check response using jq
  local success_status error_code error_message
  success_status=$(echo "$api_response" | jq -r '.success')
  error_code=$(echo "$api_response" | jq -r '.errors[0].code // empty')

  if [[ "$success_status" == "true" ]]; then
    echo "--> Cloudflare DNS record created successfully."
  elif [[ "$error_code" == "81057" || "$error_code" == "81058" ]]; then
    # 81057: Record already exists.
    # 81058: An identical record already exists.
    echo "--> Cloudflare DNS record already exists (Code: $error_code). Continuing..."
  else
    error_message=$(echo "$api_response" | jq -r '.errors[0].message // "Unknown error"')
    echo "--> Cloudflare API Response: $api_response"
    error_exit "Failed to create Cloudflare DNS record. Code: $error_code, Message: $error_message. Check API token, Zone ID, and response."
  fi
}

create_cyberpanel_site_db() {
  local domain=$1
  echo "2. Creating CyberPanel website and database for $domain..."
  # Generate secure random password for DB
  local db_password
  db_password=$(openssl rand -base64 16)
  # Construct DB name and user from domain (replace dots, ensure length limits if necessary)
  local db_name_raw db_user_raw db_name db_user
  db_name_raw=$(echo "$domain" | tr '.' '_')
  db_user_raw=$(echo "$domain" | tr '.' '_')
  # Ensure names don't exceed common MySQL limits (e.g., 64 for db, 32 for user, adjust if needed)
  db_name="${db_name_raw:0:50}_db"
  db_user="${db_user_raw:0:25}_user"

  local ssh_cyberpanel_cmd
  # Note: We need jq installed on the remote server for this error checking.
  # Add a check or ensure jq is pre-installed on the CyberPanel server.
  ssh_cyberpanel_cmd=$(cat <<EOF
# set -e # Removed to prevent jq parse errors from halting the script prematurely

# Ensure jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq command could not be found on the remote server. Please install jq." >&2
    exit 1
fi

# Flags to track creation status
WEBSITE_CREATED_THIS_RUN=false
DB_CREATED_THIS_RUN=false

echo "Creating/Verifying website..."
website_response=\$(cyberpanel createWebsite --package Default --owner admin --domainName "$domain" --email "$ADMIN_EMAIL" --php "$PHP_VERSION")
website_success=\$(echo "\$website_response" | jq -r '.success')
website_error_msg=\$(echo "\$website_response" | jq -r '.errorMessage // ""')

if [[ "\$website_success" == "1" ]]; then
    echo "--> Website created successfully."
    WEBSITE_CREATED_THIS_RUN=true
elif [[ "\$website_error_msg" == "This website already exists." ]]; then
    echo "--> Website already exists. Continuing..."
else
    echo "Error creating website: \$website_error_msg" >&2
    echo "CyberPanel Response: \$website_response" >&2
    exit 1
fi

echo "Creating/Verifying database..."
# Capture raw output first
db_response_raw=\$(cyberpanel createDatabase --databaseWebsite "$domain" --dbName "$db_name" --dbUsername "$db_user" --dbPassword "$db_password")

# Check for plain text "already exists" or "already taken" message using Bash substring matching
if [[ "\$db_response_raw" == *"already exists"* || "\$db_response_raw" == *"already taken"* ]]; then
    echo "--> Database/User already exists/taken (Detected plain text message). Continuing..."
    # DB_CREATED_THIS_RUN remains false
else
    # If not plain text "already exists", try parsing as JSON
    # Use '|| true' to prevent jq failure from exiting due to 'set -e'
    db_success=\$(echo "\$db_response_raw" | jq -r '.success' || true)
    db_error_msg=\$(echo "\$db_response_raw" | jq -r '.errorMessage // ""' || true) # Default error message if parsing fails

    # Now check the extracted values
    if [[ "\$db_success" == "1" ]]; then
        echo "--> Database created successfully."
        DB_CREATED_THIS_RUN=true
        # Store credentials temporarily ONLY if DB was created now
        echo "DB_NAME=$db_name" > "/tmp/db_creds_${domain}"
        echo "DB_USER=$db_user" >> "/tmp/db_creds_${domain}"
        echo "DB_PASSWORD=$db_password" >> "/tmp/db_creds_${domain}"
    # Check specific JSON error message as fallback (might not be needed if plain text check works)
    # elif [[ "\$db_error_msg" == *"already exists"* ]]; then
    #    echo "--> Database/User already exists (Detected JSON message). Continuing..."
    #    # DB_CREATED_THIS_RUN remains false
    else
        # Handle errors: Check if success is empty/null (jq failed) or not "1"
        if [[ -z "\$db_success" || "\$db_success" == "null" ]]; then
             # jq parsing failed
             db_error_msg="Unexpected output or JSON parse error"
        elif [[ -z "\$db_error_msg" ]]; then
             # jq parsed but errorMessage was empty/null
             db_error_msg="Unknown error (success was not 1, but no error message found)"
        fi
        # else db_error_msg should contain the message extracted by jq

        echo "Error creating database: \$db_error_msg" >&2
        echo "CyberPanel Raw Response: \$db_response_raw" >&2
        # Attempt to delete the website ONLY if it was created in THIS run
        if [[ "\$WEBSITE_CREATED_THIS_RUN" == "true" ]]; then
            echo "Attempting to delete website created in this run..." >&2
            cyberpanel deleteWebsite --domainName "$domain" || echo "Warning: Failed to automatically delete website $domain after DB creation failure." >&2
        fi
        exit 1
    fi
fi

echo "CyberPanel setup commands finished."
# This block was duplicated, removing the second instance below
#    if [[ "\$WEBSITE_CREATED_THIS_RUN" == "true" ]]; then
#        echo "Attempting to delete website created in this run..." >&2
#        cyberpanel deleteWebsite --domainName "$domain" || echo "Warning: Failed to automatically delete website $domain after DB creation failure." >&2
#    fi
#    exit 1
# fi # This fi also belongs to the duplicated block

# echo "CyberPanel setup commands finished." # This is also duplicated
EOF
)

  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_cyberpanel_cmd" || error_exit "Failed to execute CyberPanel setup commands via SSH. Check remote logs if necessary."

  # Retrieve database credentials ONLY if they were created in this run
  DB_CREATED_FLAG=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "[ -f /tmp/db_creds_${domain} ] && echo 'true' || echo 'false'")

  if [[ "$DB_CREATED_FLAG" == "true" ]]; then
      local db_creds
      db_creds=$(ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "cat /tmp/db_creds_${domain} 2>/dev/null") || error_exit "Failed to retrieve DB credentials from remote server."
      ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "rm /tmp/db_creds_${domain}" # Clean up temp file

      # Parse credentials locally and export them
      export DB_NAME_RETRIEVED=$(echo "$db_creds" | grep DB_NAME | cut -d= -f2)
      export DB_USER_RETRIEVED=$(echo "$db_creds" | grep DB_USER | cut -d= -f2)
      export DB_PASSWORD_RETRIEVED=$(echo "$db_creds" | grep DB_PASSWORD | cut -d= -f2)

      if [ -z "$DB_NAME_RETRIEVED" ] || [ -z "$DB_USER_RETRIEVED" ] || [ -z "$DB_PASSWORD_RETRIEVED" ]; then
          error_exit "Failed to parse retrieved DB credentials, although temp file existed."
      fi
      echo "--> CyberPanel site and database creation/verification complete."
  else
      echo "--> CyberPanel site and database creation/verification complete (DB likely existed previously)."
      # Unset potentially exported variables from previous runs if DB wasn't created now
      unset DB_NAME_RETRIEVED
      unset DB_USER_RETRIEVED
      unset DB_PASSWORD_RETRIEVED
  fi
}

configure_ols_vhost() {
  export DB_USER_RETRIEVED=$(echo "$db_creds" | grep DB_USER | cut -d= -f2)
  export DB_PASSWORD_RETRIEVED=$(echo "$db_creds" | grep DB_PASSWORD | cut -d= -f2)

  if [ -z "$DB_NAME_RETRIEVED" ] || [ -z "$DB_USER_RETRIEVED" ] || [ -z "$DB_PASSWORD_RETRIEVED" ]; then
      error_exit "Failed to parse retrieved DB credentials. Check /tmp/db_creds_${domain} on the server manually if needed."
  fi
  echo "--> CyberPanel site and database created."
}

configure_ols_vhost() {
  local domain=$1
  local remote_web_root="/home/$domain/public_html"
  local remote_vhost_file="/usr/local/lsws/conf/vhosts/$domain/vhost.conf" # Changed filename from vhconf.conf
  echo "3. Configuring OpenLiteSpeed vHost for $domain..."

  local ssh_vhost_cmd
  ssh_vhost_cmd=$(cat <<EOF
set -e
echo "Backing up vhost config: $remote_vhost_file"
cp "$remote_vhost_file" "${remote_vhost_file}.bak.\$(date +%Y%m%d%H%M%S)"

echo "Setting docRoot to $remote_web_root/web ..."
# Use a different delimiter for sed in case paths contain slashes
sed -i 's|docRoot.*|docRoot                   $remote_web_root/web|' "$remote_vhost_file"

echo "Adding/Updating Bedrock rewrite rules context..."
# Remove existing context / block if present to avoid duplication
sed -i '/^context \/ {/,/}$/d' "$remote_vhost_file"

# Add the new context block at the end of the file
cat << 'REWRITE_RULES' >> "$remote_vhost_file"

context / {
  allowBrowse             1
  location                $remote_web_root/web/
  rewrite {
    enable                1
    RewriteRule ^/wp-admin/ - [L]
    RewriteRule ^/wp-login.php - [L]
    RewriteRule ^(.*)$ index.php?/\$1 [L] # Escaped $1 for heredoc
  }
  addDefaultCharset       off

  phpIniOverride {

  }
}

REWRITE_RULES
echo "vHost configuration finished."
EOF
)

  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "$ssh_vhost_cmd" || error_exit "Failed to configure vHost via SSH."
  echo "--> vHost configured."
}

restart_ols() {
  echo "4. Restarting OpenLiteSpeed server..."
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_CONNECTION_STRING" "systemctl restart lsws" || error_exit "Failed to restart OpenLiteSpeed server."
  echo "--> OpenLiteSpeed restarted."
}

# --- Script Execution ---

# Validate domain argument
if [ -z "$DOMAIN" ]; then
  error_exit "Usage: $0 <yourdomain.com>"
fi

# Load configuration from .env file
load_env

# Validate loaded variables
check_var "$SERVER_IP" "SERVER_IP"
check_var "$CLOUDFLARE_API_TOKEN" "CLOUDFLARE_API_TOKEN"
check_var "$SSH_PRIVATE_KEY" "SSH_PRIVATE_KEY"
check_var "$CF_ZONE_ID" "CF_ZONE_ID"
check_var "$ADMIN_EMAIL" "ADMIN_EMAIL" # Needed for CyberPanel site creation
check_var "$PHP_VERSION" "PHP_VERSION"

# Validate SSH key file
if [ ! -f "$SSH_PRIVATE_KEY" ]; then
    error_exit "SSH private key file not found at '$SSH_PRIVATE_KEY'."
fi
chmod 600 "$SSH_PRIVATE_KEY" # Ensure key has correct permissions

# Define SSH connection string (use SSH_USER from .env or default to root)
SSH_USER="${SSH_USER:-root}"
SSH_CONNECTION_STRING="$SSH_USER@$SERVER_IP"

echo "--- Starting Infrastructure Provisioning for $DOMAIN on $SERVER_IP ---"

# Execute steps
setup_cloudflare_dns "$DOMAIN"
create_cyberpanel_site_db "$DOMAIN"

echo "Pausing for 5 seconds to allow vhost file creation..."
sleep 5

configure_ols_vhost "$DOMAIN"
restart_ols

# --- Finish ---
echo ""
echo "--- Infrastructure Provisioning Complete for $DOMAIN ---"

if [[ -n "$DB_PASSWORD_RETRIEVED" ]]; then
  echo "The following database credentials were generated:"
  echo "DB Name: $DB_NAME_RETRIEVED"
  echo "DB User: $DB_USER_RETRIEVED"
  echo "DB Password: $DB_PASSWORD_RETRIEVED"
  echo ""
  echo "Next steps:"
  echo "1. Update your 'scripts/sync-config.json' with these database credentials for the '$DOMAIN' production environment."
  echo "2. Run './scripts/manage-site.sh $DOMAIN setup-new-site production <admin_user> <admin_email> <admin_pass>' to deploy Bedrock/WordPress."
else
  echo "Database credentials were NOT generated in this run (database likely existed previously)."
  echo ""
  echo "Next steps:"
  echo "1. Ensure the correct existing database credentials for '$DOMAIN' are present in 'scripts/sync-config.json'."
  echo "2. Run './scripts/manage-site.sh $DOMAIN setup-new-site production <admin_user> <admin_email> <admin_pass>' to deploy Bedrock/WordPress."
fi
echo "-------------------------------------------------"

exit 0
