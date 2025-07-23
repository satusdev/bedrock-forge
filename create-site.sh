#!/bin/bash

# Creates and optionally initializes a new site based on the template.
# Usage: ./create-site.sh <new_site_name> [options]
# Example: ./create-site.sh my-site --port=8001 --create-db --install-wp --run-composer --switch-dev

# --- Constants ---
TEMPLATE_DIR="websites/template"
WEBSITES_DIR="websites"
SYNC_CONFIG_FILE="scripts/sync-config.json"
SYNC_CONFIG_SAMPLE="scripts/sync-config.sample.json"
CORE_ENV_FILE="core/.env"
CORE_DB_COMPOSE_FILE="core/docker-compose-db.yml"
DEFAULTS_FILE="scripts/site-defaults.env"

# --- Global Variables ---
NEW_SITE_NAME=""
APP_PORT=""
DB_NAME=""
DB_USER=""
DB_PASSWORD=""
WP_HOME=""
WP_SITEURL=""
SERVER_NAME=""
WP_ADMIN_USER=""
WP_ADMIN_PASSWORD=""
WP_ADMIN_EMAIL=""
WP_TITLE=""
CREATE_DB=false
INSTALL_WP=false
RUN_COMPOSER=false
SWITCH_DEV=false
JQ_MISSING=false

# --- Function: Source Defaults ---
source_defaults() {
  if [ -f "$DEFAULTS_FILE" ]; then
    source "$DEFAULTS_FILE"
  else
    echo "Warning: Defaults file '$DEFAULTS_FILE' not found. Using script defaults."
    DEFAULT_SERVER_NAME="localhost"
    DEFAULT_WP_ADMIN_USER="admin"
    DEFAULT_WP_ADMIN_EMAIL="admin@example.com"
    DEFAULT_WP_TITLE="My New Site"
  fi
}

# --- Function: Error Exit ---
error_exit() {
  echo "Error: $1" >&2
  exit 1
}

# --- Function: Usage ---
usage() {
  echo "Usage: $0 <new_site_name> [options]"
  echo ""
  echo "Arguments:"
  echo "  <new_site_name>       Required. Name for the new site directory (e.g., myblog)."
  echo ""
  echo "Options:"
  echo "  --port=<port>         Local port for the site's Nginx container (e.g., 8001). Prompts if omitted."
  echo "  --db-name=<name>      Database name (default: <site_name>_db)."
  echo "  --db-user=<user>      Database user (default: <site_name>_user)."
  echo "  --db-pass=<password>  Database password (default: random)."
  echo "  --wp-home=<url>       WordPress home URL (default: http://localhost:<port>)."
  echo "  --wp-siteurl=<url>    WordPress site URL (WP core files) (default: <wp_home>/wp)."
  echo "  --server-name=<name>  Nginx server_name directive (default: from site-defaults.env or 'localhost')."
  echo "  --wp-admin-user=<user> WordPress admin username for --install-wp (default: from site-defaults.env or 'admin')."
  echo "  --wp-admin-pass=<pass> WordPress admin password for --install-wp (prompts if omitted)."
  echo "  --wp-admin-email=<email> WordPress admin email for --install-wp (default: from site-defaults.env or 'admin@example.com')."
  echo "  --wp-title=<title>    WordPress site title for --install-wp (default: from site-defaults.env or 'My New Site')."
  echo "  --create-db           Flag to automatically create the database and user."
  echo "  --install-wp          Flag to automatically run 'wp core install' (requires --create-db and containers running)."
  echo "  --run-composer        Flag to automatically run 'composer install' after setup."
  echo "  --switch-dev          Flag to automatically switch the site to the development environment."
  echo "  -h, --help            Display this help message."
  exit 0
}

# --- Function: Fetch Salts ---
fetch_salts() {
  local salts_raw
  salts_raw=$(curl -sL --connect-timeout 10 --max-time 20 https://api.wordpress.org/secret-key/1.1/salt/ 2>/dev/null)
  local curl_exit=$?
  if [ $curl_exit -ne 0 ]; then
    echo "Warning: Failed to fetch salts from WordPress API (curl exit code: $curl_exit). Generating locally."
    generate_local_salts
    return
  fi
  local salts_clean
  salts_clean=$(echo "$salts_raw" | grep -E "^define\('(AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)'," | sed "s/define('\([^']*\)',[[:space:]]*'\([^']*\)');/\1='\2'/")
  if [ -z "$salts_clean" ] || [ $(echo "$salts_clean" | wc -l) -ne 8 ]; then
    echo "Warning: Failed to parse salts from WordPress API (got $(echo "$salts_clean" | wc -l) lines). Generating locally."
    generate_local_salts
  else
    echo "$salts_clean"
  fi
}

# --- Function: Generate Local Salts ---
generate_local_salts() {
  local salts=""
  for key in AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT; do
    local salt
    salt=$(openssl rand -base64 48 | tr -d '\n\r' | sed "s/'/\\'/g")
    salts="${salts}${key}='${salt}'\n"
  done
  echo -e "$salts"
}

# --- Function: Check Dependencies ---
check_dependencies() {
  if ! command -v jq &> /dev/null; then
    echo "Warning: jq command could not be found. Sync config update will be skipped."
    JQ_MISSING=true
  fi
}

# --- Function: Parse Arguments ---
parse_arguments() {
  if [ -z "$1" ] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then usage; fi
  NEW_SITE_NAME=$1
  shift
  for arg in "$@"; do
    case $arg in
      --port=*) APP_PORT="${arg#*=}" ;;
      --db-name=*) DB_NAME="${arg#*=}" ;;
      --db-user=*) DB_USER="${arg#*=}" ;;
      --db-pass=*) DB_PASSWORD="${arg#*=}" ;;
      --wp-home=*) WP_HOME="${arg#*=}" ;;
      --wp-siteurl=*) WP_SITEURL="${arg#*=}" ;;
      --server-name=*) SERVER_NAME="${arg#*=}" ;;
      --wp-admin-user=*) WP_ADMIN_USER="${arg#*=}" ;;
      --wp-admin-pass=*) WP_ADMIN_PASSWORD="${arg#*=}" ;;
      --wp-admin-email=*) WP_ADMIN_EMAIL="${arg#*=}" ;;
      --wp-title=*) WP_TITLE="${arg#*=}" ;;
      --create-db) CREATE_DB=true ;;
      --install-wp) INSTALL_WP=true ;;
      --run-composer) RUN_COMPOSER=true ;;
      --switch-dev) SWITCH_DEV=true ;;
      *) echo "Unknown option: $arg"; usage ;;
    esac
  done
}

# --- Function: Validate Inputs ---
validate_inputs() {
  NEW_SITE_DIR="${WEBSITES_DIR}/${NEW_SITE_NAME}"
  if [ ! -d "$TEMPLATE_DIR" ]; then error_exit "Template directory '$TEMPLATE_DIR' not found."; fi
  if [ -d "$NEW_SITE_DIR" ]; then error_exit "Site directory '$NEW_SITE_DIR' already exists."; fi

  if [ -z "$APP_PORT" ]; then
    while true; do
      read -p "Enter the local port number for '$NEW_SITE_NAME' (e.g., 8001): " APP_PORT
      if [[ "$APP_PORT" =~ ^[0-9]+$ ]] && [ "$APP_PORT" -gt 1024 ] && [ "$APP_PORT" -lt 65536 ]; then
        if grep -q "APP_PORT=$APP_PORT" websites/*/.env 2>/dev/null; then
          echo "Warning: Port $APP_PORT might be in use."
          read -p "Continue? (y/n): " confirm_port
          if [[ "$confirm_port" == "y" ]]; then break; fi
        else
          break
        fi
      else
        echo "Invalid port."
      fi
    done
  fi

  # Check if port is already in use
  if command -v netstat &> /dev/null; then
    if netstat -tuln | grep -q ":${APP_PORT}\b"; then
      echo "Warning: Port ${APP_PORT} is already in use."
      read -p "Continue anyway? (y/n): " confirm_port
      if [[ "$confirm_port" != "y" ]]; then
        error_exit "Port ${APP_PORT} is in use. Choose a different port."
      fi
    fi
  elif command -v ss &> /dev/null; then
    if ss -tuln | grep -q ":${APP_PORT}\b"; then
      echo "Warning: Port ${APP_PORT} is already in use."
      read -p "Continue anyway? (y/n): " confirm_port
      if [[ "$confirm_port" != "y" ]]; then
        error_exit "Port ${APP_PORT} is in use. Choose a different port."
      fi
    fi
  else
    echo "Warning: Neither netstat nor ss is available. Cannot check if port ${APP_PORT} is in use."
  fi

  DB_NAME=${DB_NAME:-"${NEW_SITE_NAME}_db"}
  DB_USER=${DB_USER:-"${NEW_SITE_NAME}_user"}
  DB_PASSWORD=${DB_PASSWORD:-$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)}
  WP_HOME=${WP_HOME:-"http://localhost:${APP_PORT}"}
  WP_SITEURL=${WP_SITEURL:-"${WP_HOME}/wp"}
  SERVER_NAME=${SERVER_NAME:-"$DEFAULT_SERVER_NAME"}
  WP_ADMIN_EMAIL=${WP_ADMIN_EMAIL:-"$DEFAULT_WP_ADMIN_EMAIL"}
  WP_TITLE=${WP_TITLE:-"$DEFAULT_WP_TITLE"}
  WP_ADMIN_USER=${WP_ADMIN_USER:-"$DEFAULT_WP_ADMIN_USER"}

  # Log DB credentials for debugging
  echo "DEBUG: Using DB_NAME=$DB_NAME, DB_USER=$DB_USER, DB_PASSWORD=$DB_PASSWORD, DB_HOST=bedrock_shared_db"

  if [ "$INSTALL_WP" = true ] && [ -z "$WP_ADMIN_PASSWORD" ]; then
    read -sp "Enter WordPress admin password for user '$WP_ADMIN_USER': " WP_ADMIN_PASSWORD
    echo ""
    if [ -z "$WP_ADMIN_PASSWORD" ]; then error_exit "Admin password needed for --install-wp."; fi
  fi
}

# --- Function: Create Site Directory ---
create_site_directory() {
  echo "Creating site '$NEW_SITE_NAME' in '$NEW_SITE_DIR'..."
  cp -r "$TEMPLATE_DIR" "$NEW_SITE_DIR" || error_exit "Failed to copy template directory."
}

# --- Function: Rename Template Files ---
rename_template_files() {
  echo "Renaming template files (if any)..."
  find "$NEW_SITE_DIR" -name '*.tpl' -exec bash -c 'mv "$1" "${1%.tpl}"' _ {} \; || true
}

# --- Function: Replace Common Placeholders ---
replace_common_placeholders() {
  local target_files=("${NEW_SITE_DIR}/docker-compose.yml" "${NEW_SITE_DIR}/nginx.conf")
  echo "Replacing common placeholders..."
  for file in "${target_files[@]}"; do
    if [ -f "$file" ]; then
      sed -i \
        -e "s|%%SITE_NAME%%|${NEW_SITE_NAME}|g" \
        -e "s|%%APP_PORT%%|${APP_PORT}|g" \
        -e "s|%%DB_NAME%%|${DB_NAME}|g" \
        -e "s|%%DB_USER%%|${DB_USER}|g" \
        -e "s|%%DB_PASSWORD%%|${DB_PASSWORD}|g" \
        -e "s|%%WP_HOME%%|${WP_HOME}|g" \
        -e "s|%%WP_SITEURL%%|${WP_SITEURL}|g" \
        -e "s|%%SERVER_NAME%%|${SERVER_NAME}|g" \
        -e "s|%%DB_HOST%%|bedrock_shared_db|g" \
        "$file" || echo "Warning: Placeholder replacement failed in $file"
    else
      echo "Warning: Expected file '$file' not found."
    fi
  done
}

# --- Function: Replace Env Placeholders and Salts ---
replace_env_placeholders_and_salts() {
  local file=$1
  local salts=$2
  local env_name=$3

  if [ ! -f "$file" ]; then
    echo "Warning: Env file '$file' not found."
    return 1
  fi

  echo "Replacing placeholders in $file..."
  sed -i \
    -e "s|%%SITE_NAME%%|${NEW_SITE_NAME}|g" \
    -e "s|%%APP_PORT%%|${APP_PORT}|g" \
    -e "s|%%DB_NAME%%|${DB_NAME}|g" \
    -e "s|%%DB_USER%%|${DB_USER}|g" \
    -e "s|%%DB_PASSWORD%%|${DB_PASSWORD}|g" \
    -e "s|%%WP_HOME%%|${WP_HOME}|g" \
    -e "s|%%WP_SITEURL%%|${WP_HOME}/wp|g" \
    -e "s|%%SERVER_NAME%%|${SERVER_NAME}|g" \
    -e "s|%%DB_HOST%%|bedrock_shared_db|g" \
    "$file" || { echo "Warning: Failed to replace placeholders in $file"; return 1; }

  echo "Removing existing salts from $file..."
  sed -i \
    -e "/#.*Salts.*:/d" \
    -e "/^\(AUTH_KEY\|SECURE_AUTH_KEY\|LOGGED_IN_KEY\|NONCE_KEY\|AUTH_SALT\|SECURE_AUTH_SALT\|LOGGED_IN_SALT\|NONCE_SALT\)=/d" \
    -e "/#.*GENERATE SALTS MANUALLY!/d" \
    "$file" || { echo "Warning: Failed to remove existing salts from $file"; return 1; }

  echo "Appending new salts to $file..."
  echo "" >> "$file"
  echo "# ${env_name} Salts (auto-generated):" >> "$file"
  echo "${salts}" >> "$file" || { echo "Warning: Failed to append new salts to $file"; return 1; }
}

# --- Function: Handle Salts ---
handle_salts() {
  echo "Generating salts for all environments..."
  local dev_salts staging_salts prod_salts
  dev_salts=$(fetch_salts)
  staging_salts=$(fetch_salts)
  prod_salts=$(fetch_salts)

  replace_env_placeholders_and_salts "${NEW_SITE_DIR}/.env.development" "$dev_salts" "Development"
  replace_env_placeholders_and_salts "${NEW_SITE_DIR}/.env.staging" "$staging_salts" "Staging"
  replace_env_placeholders_and_salts "${NEW_SITE_DIR}/.env.production" "$prod_salts" "Production"
}

# --- Function: Create Database ---
create_database() {
  if [ "$CREATE_DB" = true ]; then
    echo "Attempting to create database '$DB_NAME' and user '$DB_USER'..."
    
    # Check if core DB compose file exists
    if [ ! -f "$CORE_DB_COMPOSE_FILE" ]; then
      error_exit "Core DB compose file '$CORE_DB_COMPOSE_FILE' not found. Ensure 'core/docker-compose-db.yml' exists."
    fi

    # Check if the shared DB container is running
    if ! docker ps --format '{{.Names}}' | grep -q '^bedrock_shared_db$'; then
      echo "Shared DB container 'bedrock_shared_db' is not running. Attempting to start it..."
      if ! docker-compose -f "$CORE_DB_COMPOSE_FILE" up -d; then
        error_exit "Failed to start shared DB container. Check 'core/docker-compose-db.yml' and Docker setup."
      fi
      # Wait briefly to ensure the container is fully up
      sleep 5
      # Verify it started
      if ! docker ps --format '{{.Names}}' | grep -q '^bedrock_shared_db$'; then
        error_exit "Shared DB container 'bedrock_shared_db' failed to start."
      fi
      echo "Shared DB container started successfully."
    fi

    # Get MySQL root password
    local mysql_root_password=""
    local max_attempts=3
    local attempt=1

    if [ -f "$CORE_ENV_FILE" ]; then
      mysql_root_password=$(grep '^MYSQL_ROOT_PASSWORD=' "$CORE_ENV_FILE" | cut -d '=' -f2)
      if [ -n "$mysql_root_password" ]; then
        echo "Using MYSQL_ROOT_PASSWORD from $CORE_ENV_FILE."
      else
        echo "Error: MYSQL_ROOT_PASSWORD is empty in $CORE_ENV_FILE."
        error_exit "Please set a valid MYSQL_ROOT_PASSWORD in $CORE_ENV_FILE."
      fi
    else
      echo "Error: $CORE_ENV_FILE not found."
      error_exit "Please create $CORE_ENV_FILE with a valid MYSQL_ROOT_PASSWORD."
    fi

    # Test MySQL root connection
    while [ $attempt -le $max_attempts ]; do
      if docker exec -e MYSQL_PWD="$mysql_root_password" bedrock_shared_db mysql -u root -e "SELECT 1" -s >/dev/null 2>&1; then
        break
      else
        echo "Warning: MySQL root password incorrect (attempt $attempt/$max_attempts)."
        attempt=$((attempt + 1))
        if [ $attempt -gt $max_attempts ]; then
          error_exit "Failed to authenticate with MySQL after $max_attempts attempts. Ensure MYSQL_ROOT_PASSWORD in $CORE_ENV_FILE matches the password set in $CORE_DB_COMPOSE_FILE."
        fi
        read -sp "Enter MySQL root password for shared DB container (attempt $attempt/$max_attempts): " mysql_root_password
        echo ""
        if [ -z "$mysql_root_password" ]; then
          error_exit "MySQL root password required for --create-db."
        fi
      fi
    done

    # Create database and user
    local sql_commands="CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; DROP USER IF EXISTS '${DB_USER}'@'%'; CREATE USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}'; GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"
    if ! docker exec -e MYSQL_PWD="$mysql_root_password" bedrock_shared_db mysql -u root -e "${sql_commands}"; then
      error_exit "Failed to create database/user. Check DB container status and SQL syntax."
    fi
    echo "Database '$DB_NAME' and user '$DB_USER' created successfully."

    # Verify database connection
    echo "Verifying database connection for '$DB_USER'..."
    local verify_output
    verify_output=$(docker exec -e MYSQL_PWD="$DB_PASSWORD" bedrock_shared_db mysql -h localhost -u "$DB_USER" -e "SELECT 1" -s 2>&1)
    if [ $? -ne 0 ]; then
      echo "Verification failed with error: $verify_output"
      # Attempt to recreate user
      echo "Retrying user creation..."
      sql_commands="DROP USER IF EXISTS '${DB_USER}'@'%'; CREATE USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}'; GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"
      if ! docker exec -e MYSQL_PWD="$mysql_root_password" bedrock_shared_db mysql -u root -e "${sql_commands}"; then
        error_exit "Failed to recreate user '$DB_USER'. Check MySQL logs."
      fi
      # Retry verification
      verify_output=$(docker exec -e MYSQL_PWD="$DB_PASSWORD" bedrock_shared_db mysql -h localhost -u "$DB_USER" -e "SELECT 1" -s 2>&1)
      if [ $? -ne 0 ]; then
        error_exit "Failed to verify database connection for user '$DB_USER' after retry. Error: $verify_output"
      fi
    fi
    echo "Database connection verified."
  fi
}

# --- Function: Switch Environment ---
switch_environment() {
  if [ "$SWITCH_DEV" = true ]; then
    echo "Switching '$NEW_SITE_NAME' to development environment..."
    ./switch-env.sh "$NEW_SITE_NAME" development || echo "Warning: Failed to switch environment."
  fi
}

# --- Function: Run Composer Install ---
run_composer_install() {
  if [ "$RUN_COMPOSER" = true ]; then
    echo "Running composer install for '$NEW_SITE_NAME'..."
    local site_compose_file="${NEW_SITE_DIR}/docker-compose.yml"
    if [ ! -f "$site_compose_file" ]; then
      echo "Warning: Cannot find $site_compose_file. Skipping composer install."
      return
    fi
    echo "Ensuring containers for '$NEW_SITE_NAME' are running..."
    # Verify Docker Compose file and environment
    if ! (cd "$NEW_SITE_DIR" && docker-compose config >/dev/null 2>&1); then
      echo "Error: Invalid docker-compose.yml in $NEW_SITE_DIR. Check configuration."
      return 1
    fi
    # Attempt to start containers with verbose output
    if ! (cd "$NEW_SITE_DIR" && docker-compose up -d --build app 2>&1); then
      echo "Error: Failed to start containers for composer install."
      echo "Docker Compose logs:"
      cd "$NEW_SITE_DIR" && docker-compose logs app
      return 1
    fi
    # Wait for container to stabilize
    sleep 5
    # Check if app container is running
    if (cd "$NEW_SITE_DIR" && docker-compose ps -q app) > /dev/null 2>&1; then
      if ! (cd "$NEW_SITE_DIR" && docker-compose exec -T app composer install --working-dir=/var/www/html); then
        echo "Warning: Composer install failed. Check container logs:"
        cd "$NEW_SITE_DIR" && docker-compose logs app
        return 1
      fi
    else
      echo "Error: App container for $NEW_SITE_NAME is not running after start attempt."
      echo "Docker Compose logs:"
      cd "$NEW_SITE_DIR" && docker-compose logs app
      return 1
    fi
  fi
}

# --- Function: Install WordPress Core ---
install_wordpress_core() {
  if [ "$INSTALL_WP" = true ]; then
    echo "Running wp core install for '$NEW_SITE_NAME'..."
    local site_compose_file="${NEW_SITE_DIR}/docker-compose.yml"
    if [ ! -f "$site_compose_file" ]; then
      echo "Warning: Cannot find $site_compose_file. Skipping wp core install."
      return
    fi
    echo "Ensuring containers for '$NEW_SITE_NAME' are running..."
    # Verify Docker Compose file and environment
    if ! (cd "$NEW_SITE_DIR" && docker-compose config >/dev/null 2>&1); then
      echo "Error: Invalid docker-compose.yml in $NEW_SITE_DIR. Check configuration."
      return 1
    fi
    # Attempt to start containers with verbose output
    if ! (cd "$NEW_SITE_DIR" && docker-compose up -d --build app 2>&1); then
      echo "Error: Failed to start containers for wp core install."
      echo "Docker Compose logs:"
      cd "$NEW_SITE_DIR" && docker-compose logs app
      return 1
    fi
    # Wait for container to stabilize
    sleep 5
    # Check if app container is running
    if (cd "$NEW_SITE_DIR" && docker-compose ps -q app) > /dev/null 2>&1; then
      # Check if WordPress is already installed
      if (cd "$NEW_SITE_DIR" && docker-compose exec -T app wp core is-installed --allow-root >/dev/null 2>&1); then
        echo "WordPress is already installed. Skipping wp core install."
      else
        if ! (cd "$NEW_SITE_DIR" && docker-compose exec -T app wp core install \
          --url="$WP_HOME" \
          --title="$WP_TITLE" \
          --admin_user="$WP_ADMIN_USER" \
          --admin_password="$WP_ADMIN_PASSWORD" \
          --admin_email="$WP_ADMIN_EMAIL" \
          --skip-email \
          --allow-root); then
          echo "Warning: wp core install failed. Check container logs:"
          cd "$NEW_SITE_DIR" && docker-compose logs app
          return 1
        fi
      fi
    else
      echo "Error: App container for $NEW_SITE_NAME is not running after start attempt."
      echo "Docker Compose logs:"
      cd "$NEW_SITE_DIR" && docker-compose logs app
      return 1
    fi
  fi
}

# --- Function: Update Sync Config ---
update_sync_config() {
  echo "Adding basic entry to '$SYNC_CONFIG_FILE' (if it exists)..."
  if [ -f "$SYNC_CONFIG_FILE" ]; then
    if [ "$JQ_MISSING" = false ]; then
      local site_arg="$NEW_SITE_NAME"
      local uploads_arg="websites/$NEW_SITE_NAME/www/web/app/uploads/"
      local dbdump_arg="scripts/db_sync/$NEW_SITE_NAME/"
      local staging_ssh_arg="user@staging.${NEW_SITE_NAME}.com"
      local staging_path_arg="/path/to/staging/${NEW_SITE_NAME}/www"
      local staging_rclone_remote_arg="your_rclone_remote:"
      local staging_rclone_path_arg="cloud/path/${NEW_SITE_NAME}/staging/uploads"
      local prod_ssh_arg="user@${NEW_SITE_NAME}.com"
      local prod_path_arg="/path/to/production/${NEW_SITE_NAME}/www"
      local prod_rclone_remote_arg="your_rclone_remote:"
      local prod_rclone_path_arg="cloud/path/${NEW_SITE_NAME}/production/uploads"

      local new_site_json
      new_site_json=$(jq -n \
        --arg site "$site_arg" \
        --arg uploads "$uploads_arg" \
        --arg dbdump "$dbdump_arg" \
        --arg staging_ssh "$staging_ssh_arg" \
        --arg staging_path "$staging_path_arg" \
        --arg staging_rclone_remote "$staging_rclone_remote_arg" \
        --arg staging_rclone_path "$staging_rclone_path_arg" \
        --arg prod_ssh "$prod_ssh_arg" \
        --arg prod_path "$prod_path_arg" \
        --arg prod_rclone_remote "$prod_rclone_remote_arg" \
        --arg prod_rclone_path "$prod_rclone_path.arg" \
        '{ ($site): { "local": {"uploads_path": $uploads, "db_dump_path": $dbdump}, "staging": {"ssh_host": $staging_ssh, "remote_path": $staging_path, "rclone_remote": $staging_rclone_remote, "rclone_uploads_path": $staging_rclone_path}, "production": {"ssh_host": $prod_ssh, "remote_path": $prod_path, "rclone_remote": $prod_rclone_remote, "rclone_uploads_path": $prod_rclone_path} }}')

      if command -v sponge &> /dev/null; then
        jq --indent 4 ". += ${new_site_json}" "$SYNC_CONFIG_FILE" | sponge "$SYNC_CONFIG_FILE" && echo "Added placeholder entry for '$NEW_SITE_NAME' to '$SYNC_CONFIG_FILE'."
      else
        jq --indent 4 ". += ${new_site_json}" "$SYNC_CONFIG_FILE" > tmp_sync_config.json && mv tmp_sync_config.json "$SYNC_CONFIG_FILE" && echo "Added placeholder entry for '$NEW_SITE_NAME' to '$SYNC_CONFIG_FILE'." || echo "Warning: Failed to update '$SYNC_CONFIG_FILE'."
      fi
    else
      echo "Skipping sync config update because jq is missing."
    fi
  elif [ -f "$SYNC_CONFIG_SAMPLE" ]; then
    echo "Warning: '$SYNC_CONFIG_FILE' not found. Copied sample."
    cp "$SYNC_CONFIG_SAMPLE" "$SYNC_CONFIG_FILE"
  else
    echo "Warning: Cannot find '$SYNC_CONFIG_FILE' or sample."
  fi
}

# --- Function: Display Final Instructions ---
display_final_instructions() {
  # ANSI color codes
  local BOLD="\033[1m"
  local GREEN="\033[32m"
  local CYAN="\033[36m"
  local YELLOW="\033[33m"
  local RED="\033[31m"
  local RESET="\033[0m"

  echo -e "${GREEN}🎉 Your WordPress site '${NEW_SITE_NAME}' is ready!${RESET}"
  echo -e "${BOLD}--------------------------------------------------${RESET}"
  echo -e "${CYAN}${BOLD}Site Details:${RESET}"
  echo -e "  Site URL: ${YELLOW}${WP_HOME}${RESET} (Click to visit)"
  echo -e "  Admin URL: ${YELLOW}${WP_HOME}/wp-admin${RESET}"
  echo -e "  Directory: ${NEW_SITE_DIR}"
  echo -e ""
  echo -e "${CYAN}${BOLD}WordPress Admin Credentials:${RESET}"
  echo -e "  Username: ${YELLOW}${WP_ADMIN_USER}${RESET}"
  echo -e "  Password: ${YELLOW}${WP_ADMIN_PASSWORD}${RESET}"
  echo -e "  Email: ${YELLOW}${WP_ADMIN_EMAIL}${RESET}"
  echo -e ""
  echo -e "${CYAN}${BOLD}Database Credentials:${RESET}"
  echo -e "  Database: ${YELLOW}${DB_NAME}${RESET}"
  echo -e "  User: ${YELLOW}${DB_USER}${RESET}"
  echo -e "  Password: ${YELLOW}${DB_PASSWORD}${RESET}"
  echo -e "  Host: ${YELLOW}bedrock_shared_db${RESET}"
  echo -e ""
  echo -e "${CYAN}${BOLD}Next Steps:${RESET}"
  echo -e "  1. Visit your site at ${YELLOW}${WP_HOME}${RESET}"
  echo -e "  2. Log in to the admin panel at ${YELLOW}${WP_HOME}/wp-admin${RESET}"
  echo -e "  3. Review ${NEW_SITE_DIR}/.env.* files for salts and settings"
  echo -e "  4. Update ${SYNC_CONFIG_FILE} with remote sync details (if needed)"
  if [ "$RUN_COMPOSER" = false ]; then
    echo -e "  5. Run composer install: ${YELLOW}make composer site=$NEW_SITE_NAME cmd=\"install --working-dir=/var/www/html\"${RESET}"
  fi
  if [ "$INSTALL_WP" = false ]; then
    echo -e "  6. Complete WordPress setup via ${YELLOW}${WP_HOME}${RESET}"
  fi
  if [ "$SWITCH_DEV" = false ]; then
    echo -e "  7. Switch to development env: ${YELLOW}make switch-env site=$NEW_SITE_NAME env=development${RESET}"
  fi
  echo -e "${BOLD}--------------------------------------------------${RESET}"
  echo -e "${GREEN}Happy building with WordPress! 🚀${RESET}"
}

# --- Main Execution ---
main() {
  trap 'echo "Script interrupted."; exit 1' INT
  source_defaults
  check_dependencies
  parse_arguments "$@"
  validate_inputs
  create_site_directory
  rename_template_files
  replace_common_placeholders
  handle_salts
  create_database
  switch_environment
  run_composer_install
  install_wordpress_core
  update_sync_config
  display_final_instructions
}

main "$@"
exit 0
