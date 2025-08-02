#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a
for env in .env.development .env.local .env.production c; do
  [ -f "$SCRIPT_DIR/../../$env" ] && source "$SCRIPT_DIR/../../$env" && break
done
set +a

echo "Using DB_CONTAINER=${DB_CONTAINER}, DB_USER=${DB_USER}, DB_PASSWORD=${DB_PASSWORD}"

MAX_WAIT=60
COUNT=0
until docker exec "${DB_CONTAINER}" bash -c "mysql -h 127.0.0.1 -u '${DB_USER}' -p'${DB_PASSWORD}' -e 'SHOW DATABASES;'" 2>/dev/null; do
  echo "Waiting for MySQL..."
  sleep 2
  COUNT=$((COUNT+2))
  if [ $COUNT -ge $MAX_WAIT ]; then
    echo "MySQL not ready after $MAX_WAIT seconds, aborting."
    exit 1
  fi
done

ALLOW_ROOT_FLAG=""
if [ "${WP_ALLOW_ROOT}" = "true" ]; then
  ALLOW_ROOT_FLAG="--allow-root"
fi

docker exec "${WP_CONTAINER}" wp core install \
  --url="${WP_HOME}" \
  --title="${SITE_TITLE}" \
  --admin_user="${ADMIN_USER}" \
  --admin_password="${ADMIN_PASSWORD}" \
  --admin_email="${ADMIN_EMAIL}" \
  --skip-email \
  $ALLOW_ROOT_FLAG

echo "WordPress installed automatically."
