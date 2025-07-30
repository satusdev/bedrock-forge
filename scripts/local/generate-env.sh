#!/bin/bash
# generate-env.sh - Update a .env file for a Bedrock site with secure credentials

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <environment> [--db-name=...] [--db-user=...] [--db-pass=...]"
  echo "If arguments are omitted, you will be prompted interactively."
  echo "This script now works directly with .env.<environment> files (not .tpl)."
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
  # Expand ~ to $HOME if present
  if [[ "$SITE_NAME" == ~* ]]; then
    SITE_NAME="${HOME}${SITE_NAME:1}"
  fi
  # Determine if SITE_NAME is a path or just a name
  if [[ "$SITE_NAME" == /* || "$SITE_NAME" == ./* ]]; then
    SITE_DIR="$(realpath -m "$SITE_NAME")"
  else
    SITE_DIR="$PROJECT_ROOT/websites/$SITE_NAME"
  fi
  ENV_FILE="$SITE_DIR/.env.$ENV"
  [ -f "$ENV_FILE" ] || error_exit "Env file $ENV_FILE not found. (Did you run site-init.sh?)"
  DB_NAME="${DB_NAME:-${SITE_NAME}_db}"
  DB_USER="${DB_USER:-${SITE_NAME}_user}"
  DB_PASS="${DB_PASS:-$(generate_random)}"
  log_info "Updating .env file for $SITE_NAME ($ENV)..."
  sed -i "s|^DB_NAME=.*$|DB_NAME=$DB_NAME|" "$ENV_FILE"
  sed -i "s|^DB_USER=.*$|DB_USER=$DB_USER|" "$ENV_FILE"
  sed -i "s|^DB_PASSWORD=.*$|DB_PASSWORD=$DB_PASS|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log_success ".env file updated at $ENV_FILE"
}

main "$@"
