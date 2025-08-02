#!/bin/bash
set -e


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/config.sh"
source "$COMMON_DIR/utils.sh"

TEMPLATE_DIR="$PROJECT_ROOT/core/template"
WEBSITES_DIR="$PROJECT_ROOT/websites"

usage() {
  echo "Usage: $0 <new_site_name> --port=<port>"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

# Load environment variables
set -a
if [ -f config/.env.local ]; then
  source config/.env.local
elif [ -f config/.env.production ]; then
  source config/.env.production
fi
set +a

prompt_if_missing() {
  if [ -z "$NEW_SITE_NAME" ]; then
    read -rp "Enter new site name: " NEW_SITE_NAME
  fi
  if [ -z "$APP_PORT" ]; then
    read -rp "Enter port for the site [8005]: " APP_PORT
    APP_PORT="${APP_PORT:-8005}"
  fi
  if [ -z "$PARENT_DIR" ] || [ "$PARENT_DIR" = "." ]; then
    read -rp "Do you want to use a different parent directory? [y/N]: " USE_PARENT
    if [[ "$USE_PARENT" =~ ^[Yy]$ ]]; then
      while true; do
        read -rp "Enter parent directory path [~/Work/Wordpress]: " PARENT_DIR
        PARENT_DIR="${PARENT_DIR:-~/Work/Wordpress}"
        # Expand ~ to $HOME
        if [[ "$PARENT_DIR" == ~* ]]; then
          PARENT_DIR="${HOME}${PARENT_DIR:1}"
        fi
        if [ ! -d "$PARENT_DIR" ]; then
          read -rp "Directory '$PARENT_DIR' does not exist. Create it? [y/N]: " CREATE_DIR
          if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
            mkdir -p "$PARENT_DIR" && break
            echo "Created directory '$PARENT_DIR'."
          else
            echo "Please enter a valid parent directory."
          fi
        else
          break
        fi
      done
    else
      PARENT_DIR="."
    fi
  fi
  if [ -z "$SITE_DIR_NAME" ]; then
    read -rp "Enter directory name for the new site [$NEW_SITE_NAME]: " SITE_DIR_NAME
    SITE_DIR_NAME="${SITE_DIR_NAME:-$NEW_SITE_NAME}"
  fi
  echo "Summary:"
  echo "  Site name: $NEW_SITE_NAME"
  echo "  Port: $APP_PORT"
  echo "  Parent directory: $PARENT_DIR"
  echo "  Site directory: $SITE_DIR_NAME"
  read -rp "Proceed with these settings? [Y/n]: " CONFIRM
  if [[ "$CONFIRM" =~ ^[Nn]$ ]]; then
    echo "Aborted."
    exit 1
  fi
}

parse_arguments() {
  # Help flag
  for arg in "$@"; do
    case $arg in
      -h|--help) usage ;;
    esac
  done

  NEW_SITE_NAME="$1"
  shift
  PARENT_DIR="."
  for arg in "$@"; do
    case $arg in
      --port=*) APP_PORT="${arg#*=}" ;;
      --parent-dir=*) 
        PARENT_DIR="${arg#*=}"
        # Expand ~ to $HOME if present
        if [[ "$PARENT_DIR" == ~* ]]; then
          PARENT_DIR="${HOME}${PARENT_DIR:1}"
        fi
        ;;
      *) usage ;;
    esac
  done
}

create_site_directory() {
  # Validate parent dir
  if [ ! -d "$PARENT_DIR" ]; then error_exit "Parent directory '$PARENT_DIR' does not exist."; fi
  if [ ! -w "$PARENT_DIR" ]; then error_exit "Parent directory '$PARENT_DIR' is not writable."; fi
  NEW_SITE_DIR="${PARENT_DIR%/}/${SITE_DIR_NAME}"
  if [ ! -d "$TEMPLATE_DIR" ]; then error_exit "Template directory '$TEMPLATE_DIR' not found."; fi
  if [ -d "$NEW_SITE_DIR" ]; then error_exit "Site directory '$NEW_SITE_DIR' already exists."; fi
  log_info "Creating site '$NEW_SITE_NAME' in '$NEW_SITE_DIR'..."
  mkdir -p "$NEW_SITE_DIR"
  cp -r "$TEMPLATE_DIR"/. "$NEW_SITE_DIR"/ || error_exit "Failed to copy template directory."

  # Ensure Dockerfile is next to docker-compose.yml in the new site directory
  DOCKERFILE_SRC="$PROJECT_ROOT/core/Dockerfile"
  DOCKERFILE_DEST="$NEW_SITE_DIR/Dockerfile"
  if [ -f "$DOCKERFILE_SRC" ]; then
    cp "$DOCKERFILE_SRC" "$DOCKERFILE_DEST" || log_warn "Failed to copy Dockerfile to site directory."
  else
    log_warn "Core Dockerfile not found at $DOCKERFILE_SRC"
  fi

  # Update build context in docker-compose.yml to '.'
  COMPOSE_FILE="$NEW_SITE_DIR/docker-compose.yml"
  if [ -f "$COMPOSE_FILE" ]; then
    sed -i 's|context: ../../core|context: .|' "$COMPOSE_FILE"
    sed -i 's|dockerfile: Dockerfile|dockerfile: ./Dockerfile|' "$COMPOSE_FILE"
  else
    log_warn "docker-compose.yml not found in $NEW_SITE_DIR"
  fi

  # Copy support scripts
  log_info "Copying support scripts into new project..."
  if [ "$(realpath "$PROJECT_ROOT/scripts")" != "$(realpath "$NEW_SITE_DIR/scripts")" ]; then
    cp -r "$PROJECT_ROOT/scripts" "$NEW_SITE_DIR/" || error_exit "Failed to copy scripts directory."
  fi
  find "$NEW_SITE_DIR/scripts" -type f -name "*.sh" -exec chmod +x {} \;
}

rename_template_files() {
  log_info "Renaming template files..."
  find "$NEW_SITE_DIR" -name '*.tpl' -exec bash -c 'mv "$1" "${1%.tpl}"' _ {} \; || true
}

replace_common_placeholders() {
  log_info "Replacing common placeholders in config files and all .env* files..."
  local target_files=("${NEW_SITE_DIR}/docker-compose.yml" "${NEW_SITE_DIR}/nginx.conf")
  # Add all .env* files in the site directory
  for envfile in "${NEW_SITE_DIR}"/.env*; do
    [ -f "$envfile" ] && target_files+=("$envfile")
  done
  for file in "${target_files[@]}"; do
    if [ -f "$file" ]; then
      sed -i \
        -e "s|%%SITE_NAME%%|${NEW_SITE_NAME}|g" \
        -e "s|%%APP_PORT%%|${APP_PORT}|g" \
        -e "s|%%WP_HOME%%|http://localhost:${APP_PORT}|g" \
        -e "s|%%WP_SITEURL%%|http://localhost:${APP_PORT}/wp|g" \
        "$file" || log_warn "Placeholder replacement failed in $file"
      # Warn if any %%...%% placeholders remain
      if grep -q '%%.*%%' "$file"; then
        log_warn "Unreplaced placeholder(s) found in $file"
      fi
    else
      log_warn "Expected file '$file' not found."
    fi
  done
}

fetch_salts() {
  local salts_raw
  salts_raw=$(curl -sL --connect-timeout 10 --max-time 20 https://api.wordpress.org/secret-key/1.1/salt/ 2>/dev/null)
  local curl_exit=$?
  if [ $curl_exit -ne 0 ]; then
    log_warn "Failed to fetch salts from WordPress API (curl exit code: $curl_exit). Generating locally."
    generate_local_salts
    return
  fi
  local salts_clean
  salts_clean=$(echo "$salts_raw" | grep -E "^define\('(AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)'," | sed "s/define('\([^']*\)',[[:space:]]*'\([^']*\)');/\1='\2'/")
  if [ -z "$salts_clean" ] || [ $(echo "$salts_clean" | wc -l) -ne 8 ]; then
    log_warn "Failed to parse salts from WordPress API. Generating locally."
    generate_local_salts
  else
    echo "$salts_clean"
  fi
}

generate_local_salts() {
  local salts=""
  for key in AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT; do
    local salt
    salt=$(openssl rand -base64 48 | tr -d '\n\r' | sed "s/'/\\'/g")
    salts="${salts}${key}='${salt}'\n"
  done
  echo -e "$salts"
}

replace_env_placeholders_and_salts() {
  local file=$1
  local salts=$2
  if [ ! -f "$file" ]; then
    log_warn "Env file '$file' not found."
    return 1
  fi
  log_info "Replacing placeholders in $file..."
  sed -i \
    -e "s|%%SITE_NAME%%|${NEW_SITE_NAME}|g" \
    -e "s|%%APP_PORT%%|${APP_PORT}|g" \
    "$file" || { log_warn "Failed to replace placeholders in $file"; return 1; }
  sed -i \
    -e "/#.*Salts.*:/d" \
    -e "/^\(AUTH_KEY\|SECURE_AUTH_KEY\|LOGGED_IN_KEY\|NONCE_KEY\|AUTH_SALT\|SECURE_AUTH_SALT\|LOGGED_IN_SALT\|NONCE_SALT\)=/d" \
    -e "/#.*GENERATE SALTS MANUALLY!/d" \
    "$file" || { log_warn "Failed to remove existing salts from $file"; return 1; }
  echo "" >> "$file"
  echo "# Salts (auto-generated):" >> "$file"
  echo "${salts}" >> "$file" || { log_warn "Failed to append new salts to $file"; return 1; }
}

handle_salts() {
  log_info "Generating salts for all environments..."
  for env in development staging production; do
    local env_file="${NEW_SITE_DIR}/.env.${env}"
    local salts
    salts=$(fetch_salts)
    replace_env_placeholders_and_salts "$env_file" "$salts"
  done
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  create_site_directory
  rename_template_files

  # Generate per-site DB credentials
  DB_NAME="${NEW_SITE_NAME}_db"
  DB_USER="${NEW_SITE_NAME}_user"
  DB_PASSWORD="$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)"

  # Generate dynamic init.sql for MySQL user/db creation
  INIT_SQL="${NEW_SITE_DIR}/init.sql"
  cat > "$INIT_SQL" <<EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME};
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
EOF

  # Update .env files with per-site DB creds and WP_CONTAINER
  for envfile in "${NEW_SITE_DIR}"/.env*; do
    [ -f "$envfile" ] && sed -i \
      -e "s|%%DB_NAME%%|${DB_NAME}|g" \
      -e "s|%%DB_USER%%|${DB_USER}|g" \
      -e "s|%%DB_PASSWORD%%|${DB_PASSWORD}|g" \
      -e "s|%%DB_CONTAINER%%|${NEW_SITE_NAME}_db|g" \
      -e "s|%%SITE_TITLE%%|${NEW_SITE_NAME}|g" \
      -e "s|%%ADMIN_USER%%|admin|g" \
      -e "s|%%ADMIN_PASSWORD%%|$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)|g" \
      -e "s|%%ADMIN_EMAIL%%|admin@${NEW_SITE_NAME}.local|g" \
      -e "s|%%WP_ALLOW_ROOT%%|true|g" \
      "$envfile"
    # Add WP_CONTAINER if not present
    if ! grep -q "^WP_CONTAINER=" "$envfile"; then
      echo "WP_CONTAINER=${NEW_SITE_NAME}_app" >> "$envfile"
    fi
  done

  # Add DB service to docker-compose.yml if not present
  COMPOSE_FILE="${NEW_SITE_DIR}/docker-compose.yml"
  if ! grep -q "db:" "$COMPOSE_FILE"; then
    # Insert db service before networks: section
    awk '
      BEGIN {in_services=0}
      /^services:/ {in_services=1; print; next}
      /^networks:/ && in_services {
        print "  db:\n    image: mysql:8.0\n    container_name: '"${NEW_SITE_NAME}_db"'\n    restart: unless-stopped\n    environment:\n      MYSQL_DATABASE: '"${DB_NAME}"'\n      MYSQL_USER: '"${DB_USER}"'\n      MYSQL_PASSWORD: '"${DB_PASSWORD}"'\n      MYSQL_ROOT_PASSWORD: rootpw_'"${NEW_SITE_NAME}"'\n    volumes:\n      - dbdata:/var/lib/mysql\n    networks:\n      - bedrock_shared_network\n";
        in_services=0
      }
      {print}
    ' "$COMPOSE_FILE" > "${COMPOSE_FILE}.tmp" && mv "${COMPOSE_FILE}.tmp" "$COMPOSE_FILE"

    # Add volumes: section if not present
    if ! grep -q "^volumes:" "$COMPOSE_FILE"; then
      cat <<EOF >> "$COMPOSE_FILE"

volumes:
  dbdata:
    driver: local
EOF
    fi
  fi

  replace_common_placeholders
  handle_salts

  # Install Bedrock/WordPress core files
  if [ -d "${NEW_SITE_DIR}/www" ]; then
    log_info "Running composer install in ${NEW_SITE_DIR}/www..."
    (cd "${NEW_SITE_DIR}/www" && composer install)
    if [ $? -ne 0 ]; then
      log_warn "composer install failed in ${NEW_SITE_DIR}/www"
    fi
  else
    log_warn "Directory ${NEW_SITE_DIR}/www does not exist, skipping composer install."
  fi

  log_success "Site '$NEW_SITE_NAME' initialized at '$NEW_SITE_DIR'."
}

main "$@"
