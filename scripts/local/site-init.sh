#!/bin/bash
# site-init.sh - Initialize a new Bedrock-based WordPress site (local development, modular)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/config.sh"
source "$COMMON_DIR/utils.sh"

TEMPLATE_DIR="core/template"
WEBSITES_DIR="websites"

usage() {
  echo "Usage: $0 <new_site_name> --port=<port>"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [ -z "$NEW_SITE_NAME" ]; then
    read -rp "Enter new site name: " NEW_SITE_NAME
  fi
  if [ -z "$APP_PORT" ]; then
    read -rp "Enter port for the site [8005]: " APP_PORT
    APP_PORT="${APP_PORT:-8005}"
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
      --parent-dir=*) PARENT_DIR="${arg#*=}" ;;
      *) usage ;;
    esac
  done
}

create_site_directory() {
  # Validate parent dir
  if [ ! -d "$PARENT_DIR" ]; then error_exit "Parent directory '$PARENT_DIR' does not exist."; fi
  if [ ! -w "$PARENT_DIR" ]; then error_exit "Parent directory '$PARENT_DIR' is not writable."; fi
  NEW_SITE_DIR="${PARENT_DIR%/}/${WEBSITES_DIR}/${NEW_SITE_NAME}"
  if [ ! -d "$TEMPLATE_DIR" ]; then error_exit "Template directory '$TEMPLATE_DIR' not found."; fi
  if [ -d "$NEW_SITE_DIR" ]; then error_exit "Site directory '$NEW_SITE_DIR' already exists."; fi
  log_info "Creating site '$NEW_SITE_NAME' in '$NEW_SITE_DIR'..."
  mkdir -p "$(dirname "$NEW_SITE_DIR")"
  cp -r "$TEMPLATE_DIR" "$NEW_SITE_DIR" || error_exit "Failed to copy template directory."
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
