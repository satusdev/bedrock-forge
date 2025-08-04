#!/bin/bash
set -e

# Load environment variables from .env.local or fallback to .env.production
ENV_FILE=""
if [ -f "$(dirname "$0")/../../config/.env.local" ]; then
  ENV_FILE="$(dirname "$0")/../../config/.env.local"
elif [ -f "$(dirname "$0")/../../config/.env.production" ]; then
  ENV_FILE="$(dirname "$0")/../../config/.env.production"
fi

if [ -n "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Default values if not set
DB_NAME="${DB_NAME:-wp-jaam_db}"
DB_USER="${DB_USER:-jaam_user}"
DB_PASSWORD="${DB_PASSWORD:-B50L1pkSY4GIMJJM}"

TEMPLATE_PATH="init.sql.tpl"
OUTPUT_PATH="init.sql"

sed \
  -e "s/{{DB_NAME}}/$DB_NAME/g" \
  -e "s/{{DB_USER}}/$DB_USER/g" \
  -e "s/{{DB_PASSWORD}}/$DB_PASSWORD/g" \
  "$TEMPLATE_PATH" > "$OUTPUT_PATH"

echo "Generated $OUTPUT_PATH from $TEMPLATE_PATH using env: $ENV_FILE"
