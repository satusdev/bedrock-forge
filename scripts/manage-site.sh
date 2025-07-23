#!/bin/bash

# Unified script for deploying code, syncing data (DB/Uploads), and initial site setup for Bedrock sites.
# Relies on configuration in sync-config.json and tools: jq, git, composer, wp-cli, ssh, scp, rclone, docker-compose.

# --- Usage ---
# Initial Site Setup (Run ONCE per new site):
#   ./scripts/manage-site.sh <site_name> setup-new-site <environment> <admin_user> <admin_email> <admin_password> [--site-title="Your Site Title"] [--activate-defaults]
#   Example: ./scripts/manage-site.sh testsite setup-new-site production admin admin@example.com securepass --site-title="My New Site"
#
# Code Deployment (Run for subsequent code updates):
#   ./scripts/manage-site.sh <site_name> deploy <environment>
#   Example: ./scripts/manage-site.sh testsite deploy production
#
# Database Sync:
#   ./scripts/manage-site.sh <site_name> push-db <environment>
#   ./scripts/manage-site.sh <site_name> pull-db <environment>
#   Example: ./scripts/manage-site.sh testsite pull-db production
#
# Uploads Sync (via rclone to/from configured cloud remote):
#   ./scripts/manage-site.sh <site_name> push-uploads <environment>
#   ./scripts/manage-site.sh <site_name> pull-uploads <environment>
#   Example: ./scripts/manage-site.sh testsite push-uploads production
#
# WARNING: Pushing data (db or uploads) to production is risky and can overwrite live data. Use with extreme caution.

# --- Configuration ---
CONFIG_FILE="scripts/sync-config.json"
SITE_NAME=$1
ACTION=$2
TARGET_ENV=$3
# Arguments for setup-new-site
ADMIN_USER=$4
ADMIN_EMAIL=$5
ADMIN_PASSWORD=$6
# Optional arguments parsing for setup-new-site
SITE_TITLE=""
ACTIVATE_DEFAULTS=false
for arg in "$@"; do
  case $arg in
    --site-title=*)
      SITE_TITLE="${arg#*=}"
      shift
      ;;
    --activate-defaults)
      ACTIVATE_DEFAULTS=true
      shift
      ;;
  esac
done

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
DEFAULT_THEME="twentytwentyfour" # Define a default theme to activate if --activate-defaults is used

# --- Functions ---
error_exit() {
  echo "Error: $1" >&2
  exit 1
}

check_tool() {
  if ! command -v "$1" &> /dev/null; then
    error_exit "$1 command could not be found. Please install it."
  fi
}

confirm_action() {
  local site=$1
  local env=$2
  local type=$3 # "database" or "uploads"
  read -p "WARNING: You are about to PUSH $type for site '$site' to the '$env' environment. This will overwrite the remote $type. Are you sure? (yes/no): " confirmation
  if [[ "$confirmation" != "yes" ]]; then
    echo "Push operation cancelled."
    exit 0
  fi
}

# Function to safely get config value using jq
get_jq_config_value() {
  local site=$1
  local env=$2
  local key=$3
  jq -r ".${site}.${env}.${key} // empty" "$CONFIG_FILE"
}

# Function to generate local salts
generate_local_salts() {
  local salts=""
  for key in AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT; do
    local salt=$(openssl rand -base64 48 | tr -d '\n\r' | sed "s/'/\\'/g")
    salts="${salts}${key}='${salt}'\n"
  done
  echo -e "$salts"
}

# --- Validate Input & Tools ---
if [ -z "$SITE_NAME" ] || [ -z "$ACTION" ] || [ -z "$TARGET_ENV" ]; then
  error_exit "Missing arguments: site_name, action, environment. See usage instructions."
fi

if [[ "$ACTION" == "setup-new-site" ]]; then
  if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    error_exit "Missing arguments for setup-new-site: admin_user, admin_email, admin_password. See usage."
  fi
  if [ -z "$SITE_TITLE" ]; then
    SITE_TITLE="$SITE_NAME $TARGET_ENV"
  fi
fi

SITE_DIR="websites/$SITE_NAME"
if [ ! -d "$SITE_DIR" ]; then
  error_exit "Site directory '$SITE_DIR' not found."
fi

if [ ! -f "$CONFIG_FILE" ]; then
  if [ -f "${CONFIG_FILE}.sample" ]; then
    error_exit "Configuration file '$CONFIG_FILE' not found. Please copy ${CONFIG_FILE}.sample to $CONFIG_FILE and fill in details for '$SITE_NAME'."
  else
    error_exit "Configuration file '$CONFIG_FILE' and sample file not found."
  fi
fi

check_tool jq
check_tool git
check_tool composer
check_tool ssh
check_tool scp
check_tool rclone
check_tool docker-compose
check_tool curl

# --- Read Configuration ---
REMOTE_HOST=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_host")
SSH_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "ssh_user")
WEB_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "web_user")
REMOTE_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "remote_path")
DOMAIN=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "domain")
DB_NAME=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "db_name")
DB_USER=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "db_user")
DB_PASS=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "db_pass")
DB_HOST_CONFIG=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "db_host") # Read db_host from config
RCLONE_REMOTE=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_remote")
RCLONE_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "$TARGET_ENV" "rclone_uploads_path")
LOCAL_UPLOADS_PATH=$(get_jq_config_value "$SITE_NAME" "local" "uploads_path")
LOCAL_DB_DUMP_DIR=$(get_jq_config_value "$SITE_NAME" "local" "db_dump_path")

if [ -z "$REMOTE_HOST" ] || [ -z "$SSH_USER" ] || [ -z "$WEB_USER" ] || [ -z "$REMOTE_PATH" ] || [ -z "$DOMAIN" ]; then
  error_exit "Could not parse 'ssh_host', 'ssh_user', 'web_user', 'remote_path', or 'domain' from '$CONFIG_FILE' for site '$SITE_NAME' and environment '$TARGET_ENV'."
fi
if [[ "$ACTION" == "setup-new-site" || "$ACTION" == "push-db" || "$ACTION" == "pull-db" ]]; then
  if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
    error_exit "Could not parse 'db_name', 'db_user', or 'db_pass' from '$CONFIG_FILE' for site '$SITE_NAME' and environment '$TARGET_ENV'."
  fi
fi
if [[ "$ACTION" == "push-uploads" || "$ACTION" == "pull-uploads" ]]; then
  if [ -z "$RCLONE_REMOTE" ] || [ -z "$RCLONE_UPLOADS_PATH" ] || [ -z "$LOCAL_UPLOADS_PATH" ]; then
    error_exit "Could not parse 'rclone_remote', 'rclone_uploads_path', or local 'uploads_path' from '$CONFIG_FILE' for uploads action."
  fi
fi
if [[ "$ACTION" == "push-db" || "$ACTION" == "pull-db" ]]; then
  if [ -z "$LOCAL_DB_DUMP_DIR" ]; then
    error_exit "Could not parse local 'db_dump_path' from '$CONFIG_FILE' for DB sync action."
  fi
fi

SSH_CONNECTION_STRING="$SSH_USER@$REMOTE_HOST"
SITE_COMPOSE_FILE="${SITE_DIR}/docker-compose.yml"
REMOTE_UPLOADS_FULL_PATH="${REMOTE_PATH}/web/app/uploads"
REMOTE_WEB_ROOT="${REMOTE_PATH}/web"

# --- Ensure local dump directory exists ---
mkdir -p "$LOCAL_DB_DUMP_DIR" || error_exit "Failed to create local dump directory '$LOCAL_DB_DUMP_DIR'."

# --- Action Dispatcher ---
case "$ACTION" in
  setup-new-site)
    echo "--- Setting up New Site '$SITE_NAME' on '$TARGET_ENV' ---"
    LOCAL_WEB_ROOT="${SITE_DIR}/www"

    if [ ! -d "$LOCAL_WEB_ROOT" ]; then
      error_exit "Local web root directory '$LOCAL_WEB_ROOT' not found."
    fi

    echo "1. Building local production dependencies..."
    cd "$LOCAL_WEB_ROOT" || error_exit "Failed to cd into local web root '$LOCAL_WEB_ROOT'."
    composer install --no-dev --optimize-autoloader || error_exit "Local composer install failed."
    cd - > /dev/null

    echo "2. Syncing files to remote server via rsync..."
    rsync -az --delete \
      --exclude '.env' \
      --exclude '.git/' \
      --exclude '.github/' \
      --exclude 'node_modules/' \
      --exclude '.DS_Store' \
      "$LOCAL_WEB_ROOT/" "$SSH_CONNECTION_STRING":"$REMOTE_PATH/" || error_exit "Rsync failed."

    echo "3. Configuring remote .env file..."
    ENV_EXAMPLE_FILE="${SITE_DIR}/.env.example"
    if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
      error_exit "Local .env.example file not found at '$ENV_EXAMPLE_FILE'."
    fi

    # Generate salts locally
    SALTS=$(generate_local_salts)
    if [ -z "$SALTS" ]; then
      error_exit "Failed to generate salts."
    fi

    # Create .env content
    ENV_CONTENT=$(cat "$ENV_EXAMPLE_FILE")
    # Set DB_HOST, defaulting to localhost if not specified in config
    DB_HOST_FINAL=${DB_HOST_CONFIG:-localhost}

    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^DB_NAME=.*|DB_NAME='${DB_NAME}'|")
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^DB_USER=.*|DB_USER='${DB_USER}'|")
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^DB_PASSWORD=.*|DB_PASSWORD='${DB_PASS}'|")
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^DB_HOST=.*|DB_HOST='${DB_HOST_FINAL}'|") # Set DB_HOST from config or default
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^WP_HOME=.*|WP_HOME='https://${DOMAIN}'|")
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed "s|^WP_SITEURL=.*|WP_SITEURL='https://${DOMAIN}/wp'|")

    # Remove existing salt definitions
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^AUTH_KEY=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^SECURE_AUTH_KEY=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^LOGGED_IN_KEY=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^NONCE_KEY=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^AUTH_SALT=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^SECURE_AUTH_SALT=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^LOGGED_IN_SALT=/d')
    ENV_CONTENT=$(echo "$ENV_CONTENT" | sed '/^NONCE_SALT=/d')

    # Append new salts
    ENV_CONTENT="${ENV_CONTENT}\n# Salts\n${SALTS}"

    # Write to local .env file
    ENV_FILE_LOCAL="${SITE_DIR}/.env"
    echo -e "$ENV_CONTENT" > "$ENV_FILE_LOCAL" || error_exit "Failed to write local .env file."

    # Upload .env file to remote
    scp "$ENV_FILE_LOCAL" "$SSH_CONNECTION_STRING":"$REMOTE_PATH/.env" || error_exit "Failed to upload .env file to remote."
    ssh "$SSH_CONNECTION_STRING" "sudo chown '${WEB_USER}:${WEB_USER}' '${REMOTE_PATH}/.env' && sudo chmod 600 '${REMOTE_PATH}/.env'" || error_exit "Failed to set permissions for remote .env file."
    rm "$ENV_FILE_LOCAL" || echo "Warning: Failed to remove temporary local .env file."

    echo "4. Setting permissions on remote server..."
    ssh "$SSH_CONNECTION_STRING" " \
      cd '${REMOTE_PATH}' || { echo 'ERROR: Failed to cd to remote web root'; exit 1; }; \
      sudo chown -R '${WEB_USER}:${WEB_USER}' . || { echo 'ERROR: Failed to set ownership'; exit 1; }; \
      sudo find . -type d -exec chmod 755 {} \; || { echo 'ERROR: Failed to set directory permissions'; exit 1; }; \
      sudo find . -type f -exec chmod 644 {} \; || { echo 'ERROR: Failed to set file permissions'; exit 1; }; \
      UPLOADS_DIR='web/app/uploads'; \
      if [ -d \"\$UPLOADS_DIR\" ]; then \
        sudo chmod -R 775 \"\$UPLOADS_DIR\" || { echo 'WARNING: Failed to set uploads directory permissions'; }; \
      else \
        sudo mkdir -p \"\$UPLOADS_DIR\" && sudo chown '${WEB_USER}:${WEB_USER}' \"\$UPLOADS_DIR\" && sudo chmod 775 \"\$UPLOADS_DIR\" || { echo 'ERROR: Failed to create/set uploads directory'; exit 1; }; \
      fi; \
      if [ -f '.env' ]; then \
        sudo chmod 600 .env || { echo 'WARNING: Failed to set .env permissions'; }; \
      fi; \
    " || error_exit "SSH command execution for permissions failed."

    echo "5. Checking WordPress installation..."
    # Check if WordPress is already installed
    WP_INSTALLED=$(ssh "$SSH_CONNECTION_STRING" "cd '${REMOTE_PATH}' && sudo -u $WEB_USER wp core is-installed > /dev/null 2>&1 && echo 'yes' || echo 'no'")
    if [ "$WP_INSTALLED" = "yes" ]; then
      echo "--> WordPress is already installed. Skipping wp core install."
    else
      echo "--> Installing WordPress via WP-CLI..."
      ssh "$SSH_CONNECTION_STRING" " \
        cd '${REMOTE_PATH}' || { echo 'ERROR: Failed to cd to remote web root for WP install'; exit 1; }; \
        php -v | grep 'PHP 8.1' > /dev/null || { echo 'ERROR: PHP version < 8.1 detected. Please upgrade PHP on the remote server.'; exit 1; }; \
        sudo -u $WEB_USER wp core install --url='https://${DOMAIN}' --title='${SITE_TITLE}' --admin_user='${ADMIN_USER}' --admin_password='${ADMIN_PASSWORD}' --admin_email='${ADMIN_EMAIL}' --skip-email; \
        WP_INSTALL_STATUS=\$?; \
        if [ \$WP_INSTALL_STATUS -ne 0 ]; then \
          echo 'ERROR: wp core install failed!'; exit 1; \
        fi; \
      " || error_exit "Failed to run WP-CLI install command."
    fi

    if [ "$ACTIVATE_DEFAULTS" = true ]; then
      echo "6. Activating default theme ($DEFAULT_THEME)..."
      ssh "$SSH_CONNECTION_STRING" " \
        cd '${REMOTE_PATH}' || exit 1; \
        sudo -u $WEB_USER wp theme activate '$DEFAULT_THEME'; \
      " || echo "Warning: Failed to activate default theme '$DEFAULT_THEME'."
    fi

    echo "--- New Site Setup Complete ---"
    echo "Site URL: https://${DOMAIN}"
    echo "Admin URL: https://${DOMAIN}/wp/wp-admin/"
    echo "Admin User: $ADMIN_USER"
    echo "Admin Pass: $ADMIN_PASSWORD"
    ;;

  deploy)
    echo "--- Deploying Code for '$SITE_NAME' to '$TARGET_ENV' (Local Build & Rsync) ---"
    LOCAL_WEB_ROOT="${SITE_DIR}/www"

    if [ ! -d "$LOCAL_WEB_ROOT" ]; then
      error_exit "Local web root directory '$LOCAL_WEB_ROOT' not found."
    fi

    echo "1. Building local production dependencies..."
    cd "$LOCAL_WEB_ROOT" || error_exit "Failed to cd into local web root '$LOCAL_WEB_ROOT'."
    composer install --no-dev --optimize-autoloader || error_exit "Local composer install failed."
    cd - > /dev/null

    echo "2. Syncing files to remote server via rsync..."
    rsync -az --delete \
      --exclude '.env' \
      --exclude '.git/' \
      --exclude '.github/' \
      --exclude 'node_modules/' \
      --exclude '.DS_Store' \
      "$LOCAL_WEB_ROOT/" "$SSH_CONNECTION_STRING":"$REMOTE_PATH/" || error_exit "Rsync failed."

    echo "3. Setting permissions on remote server..."
    ssh "$SSH_CONNECTION_STRING" " \
      cd '${REMOTE_PATH}' || { echo 'ERROR: Failed to cd to remote web root'; exit 1; }; \
      sudo chown -R '${WEB_USER}:${WEB_USER}' . || { echo 'ERROR: Failed to set ownership'; exit 1; }; \
      sudo find . -type d -exec chmod 755 {} \; || { echo 'ERROR: Failed to set directory permissions'; exit 1; }; \
      sudo find . -type f -exec chmod 644 {} \; || { echo 'ERROR: Failed to set file permissions'; exit 1; }; \
      UPLOADS_DIR='web/app/uploads'; \
      if [ -d \"\$UPLOADS_DIR\" ]; then \
        sudo chmod -R 775 \"\$UPLOADS_DIR\" || { echo 'WARNING: Failed to set uploads directory permissions'; }; \
      fi; \
      if [ -f '.env' ]; then \
        sudo chmod 600 .env || { echo 'WARNING: Failed to set .env permissions'; }; \
      fi; \
    " || error_exit "SSH command execution for permissions failed."

    echo "--- Code Deployment Successful ---"
    ;;

  push-db)
    if [ "$TARGET_ENV" == "production" ]; then confirm_action "$SITE_NAME" "$TARGET_ENV" "database"; fi
    echo "--- Pushing Database for '$SITE_NAME' from Local to '$TARGET_ENV' ---"
    LOCAL_DUMP_FILE_NAME="db_dump_${SITE_NAME}_local_${TIMESTAMP}.sql"
    LOCAL_DUMP_FILE_PATH="${LOCAL_DB_DUMP_DIR}${LOCAL_DUMP_FILE_NAME}"
    REMOTE_DUMP_FILE_PATH="/tmp/${LOCAL_DUMP_FILE_NAME}"

    echo "1. Exporting local database from Docker..."
    docker-compose -f "$SITE_COMPOSE_FILE" exec -T app wp db export "$LOCAL_DUMP_FILE_PATH" --allow-root || error_exit "Local DB export failed."

    echo "2. Copying database dump to remote via SCP..."
    scp "$LOCAL_DUMP_FILE_PATH" "$SSH_CONNECTION_STRING":"$REMOTE_DUMP_FILE_PATH" || error_exit "SCP upload failed."

    echo "3. Importing database on remote via SSH..."
    ssh "$SSH_CONNECTION_STRING" "cd '$REMOTE_PATH' && sudo -u $WEB_USER wp db import '$REMOTE_DUMP_FILE_PATH'" || error_exit "Remote DB import failed."

    echo "4. Removing database dump from remote via SSH..."
    ssh "$SSH_CONNECTION_STRING" "sudo rm '$REMOTE_DUMP_FILE_PATH'" || echo "Warning: Failed to remove remote dump file."

    echo "5. Cleaning up local database dump..."
    rm "$LOCAL_DUMP_FILE_PATH" || echo "Warning: Failed to remove local dump file."

    echo "--- Database Push Complete ---"
    ;;

  pull-db)
    echo "--- Pulling Database for '$SITE_NAME' from '$TARGET_ENV' to Local ---"
    REMOTE_DUMP_FILE_NAME="db_dump_${SITE_NAME}_${TARGET_ENV}_${TIMESTAMP}.sql"
    REMOTE_DUMP_FILE_PATH="/tmp/${REMOTE_DUMP_FILE_NAME}"
    LOCAL_DUMP_FILE_PATH="${LOCAL_DB_DUMP_DIR}${REMOTE_DUMP_FILE_NAME}"

    echo "1. Exporting remote database via SSH..."
    ssh "$SSH_CONNECTION_STRING" "cd '$REMOTE_PATH' && sudo -u $WEB_USER wp db export '$REMOTE_DUMP_FILE_PATH'" || error_exit "Remote DB export failed."

    echo "2. Copying database dump locally via SCP..."
    scp "$SSH_CONNECTION_STRING":"$REMOTE_DUMP_FILE_PATH" "$LOCAL_DUMP_FILE_PATH" || error_exit "SCP download failed."

    echo "3. Removing remote database dump via SSH..."
    ssh "$SSH_CONNECTION_STRING" "sudo rm '$REMOTE_DUMP_FILE_PATH'" || echo "Warning: Failed to remove remote dump file."

    echo "4. Importing database into local Docker container..."
    docker-compose -f "$SITE_COMPOSE_FILE" exec -T app wp db import "$LOCAL_DUMP_FILE_PATH" --allow-root || error_exit "Local DB import failed."

    echo "5. Cleaning up local database dump..."
    rm "$LOCAL_DUMP_FILE_PATH" || echo "Warning: Failed to remove local dump file."

    echo "--- Database Pull Complete ---"
    ;;

  push-uploads)
    if [ "$TARGET_ENV" == "production" ]; then confirm_action "$SITE_NAME" "$TARGET_ENV" "uploads"; fi
    echo "--- Pushing Uploads for '$SITE_NAME' from Local to '$TARGET_ENV' (via rclone: $RCLONE_REMOTE) ---"

    echo "1. Syncing local '$LOCAL_UPLOADS_PATH' to '$RCLONE_REMOTE$RCLONE_UPLOADS_PATH'..."
    rclone copy "$LOCAL_UPLOADS_PATH" "$RCLONE_REMOTE$RCLONE_UPLOADS_PATH" --progress || error_exit "rclone copy to remote failed."

    echo "--- Uploads Push Complete ---"
    ;;

  pull-uploads)
    echo "--- Pulling Uploads for '$SITE_NAME' from '$TARGET_ENV' (via rclone: $RCLONE_REMOTE) to Local ---"

    mkdir -p "$LOCAL_UPLOADS_PATH" || error_exit "Failed to create local uploads directory '$LOCAL_UPLOADS_PATH'."

    echo "Syncing '$RCLONE_REMOTE$RCLONE_UPLOADS_PATH' to local '$LOCAL_UPLOADS_PATH'..."
    rclone copy "$RCLONE_REMOTE$RCLONE_UPLOADS_PATH" "$LOCAL_UPLOADS_PATH" --progress || error_exit "rclone copy to local failed."

    echo "--- Uploads Pull Complete ---"
    ;;

  *)
    error_exit "Invalid action '$ACTION'. Use 'setup-new-site', 'deploy', 'push-db', 'pull-db', 'push-uploads', or 'pull-uploads'."
    ;;
esac

echo ""
echo "Operation '$ACTION' for site '$SITE_NAME' on environment '$TARGET_ENV' finished successfully."
exit 0
