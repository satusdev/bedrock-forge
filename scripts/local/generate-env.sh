#!/bin/bash
# generate-env.sh - Generate a .env file for a Bedrock site with secure credentials

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment> [--db-name=...] [--db-user=...] [--db-pass=...]"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [ -z "$SITE_NAME" ]; then
    read -rp "Enter site name: " SITE_NAME
  fi
  if [ -z "$ENV" ]; then
    read -rp "Enter environment [development]: " ENV
    ENV="${ENV:-development}"
  fi
}

parse_arguments() {
  # Help flag
  for arg in "$@"; do
    case $arg in
      -h|--help) usage ;;
    esac
  done

  SITE_NAME="$1"
  ENV="$2"
  shift $(( $# > 0 ? 1 : 0 ))
  shift $(( $# > 0 ? 1 : 0 ))
  for arg in "$@"; do
    case $arg in
      --db-name=*) DB_NAME="${arg#*=}" ;;
      --db-user=*) DB_USER="${arg#*=}" ;;
      --db-pass=*) DB_PASS="${arg#*=}" ;;
    esac
  done
}

generate_random() {
  openssl rand -base64 16 | tr -d '\n\r'
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  SITE_DIR="websites/$SITE_NAME"
  ENV_FILE="$SITE_DIR/.env.$ENV"
  TEMPLATE_FILE="$SITE_DIR/.env.$ENV.tpl"
  [ -f "$TEMPLATE_FILE" ] || error_exit "Template file $TEMPLATE_FILE not found."
  DB_NAME="${DB_NAME:-${SITE_NAME}_db}"
  DB_USER="${DB_USER:-${SITE_NAME}_user}"
  DB_PASS="${DB_PASS:-$(generate_random)}"
  log_info "Generating .env file for $SITE_NAME ($ENV)..."
  cp "$TEMPLATE_FILE" "$ENV_FILE"
  sed -i "s|%%DB_NAME%%|$DB_NAME|g" "$ENV_FILE"
  sed -i "s|%%DB_USER%%|$DB_USER|g" "$ENV_FILE"
  sed -i "s|%%DB_PASSWORD%%|$DB_PASS|g" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log_success ".env file generated at $ENV_FILE"
}

main "$@"
