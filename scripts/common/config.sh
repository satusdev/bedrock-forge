#!/bin/bash
# config.sh - Shared configuration loader for Bedrock workflow scripts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "$SCRIPT_DIR/../..")"
CONFIG_DIR="$PROJECT_ROOT/config"
CONFIG_FILE="$CONFIG_DIR/sync-config.json"
ENV_LOCAL="$CONFIG_DIR/.env.local"
ENV_PROD="$CONFIG_DIR/.env.production"

load_env() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -o allexport
    source "$env_file"
    set +o allexport
  fi
}

load_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file '$CONFIG_FILE' not found." >&2
    exit 1
  fi
}

# Usage in scripts:
#   source "$(dirname "$0")/../common/config.sh"
#   load_env "$ENV_LOCAL"
#   load_config
