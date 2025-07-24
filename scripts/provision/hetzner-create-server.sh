#!/bin/bash
# hetzner-create-server.sh - Create a new Hetzner Cloud server via API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <server_name> [--type=cx21] [--image=ubuntu-22.04] [--ssh-key=~/.ssh/id_rsa.pub] [--location=fsn1]"
  echo "Requires HETZNER_TOKEN env variable."
  exit 1
}

parse_arguments() {
  SERVER_TYPE="cx21"
  IMAGE="ubuntu-22.04"
  SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"
  LOCATION="fsn1"
  if [ -z "$1" ]; then
    log_error "Missing server_name argument."
    usage
  fi
  SERVER_NAME="$1"
  shift
  for arg in "$@"; do
    case $arg in
      --type=*) SERVER_TYPE="${arg#*=}" ;;
      --image=*) IMAGE="${arg#*=}" ;;
      --ssh-key=*) SSH_KEY_PATH="${arg#*=}" ;;
      --location=*) LOCATION="${arg#*=}" ;;
    esac
  done
}

main() {
  parse_arguments "$@"
  [ -z "$HETZNER_TOKEN" ] && error_exit "HETZNER_TOKEN env variable required."
  [ -f "$SSH_KEY_PATH" ] || error_exit "SSH key file $SSH_KEY_PATH not found."
  SSH_KEY_CONTENT=$(cat "$SSH_KEY_PATH")

  # Upload SSH key to Hetzner (if not already present)
  log_info "Uploading SSH key to Hetzner (if needed)..."
  EXISTING_KEY_ID=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" "https://api.hetzner.cloud/v1/ssh_keys" | jq -r ".ssh_keys[] | select(.public_key==\"$SSH_KEY_CONTENT\") | .id")
  if [ -z "$EXISTING_KEY_ID" ]; then
    KEY_NAME="auto-key-$(date +%s)"
    RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $HETZNER_TOKEN" -H "Content-Type: application/json" \
      -d "{\"name\":\"$KEY_NAME\",\"public_key\":\"$SSH_KEY_CONTENT\"}" \
      "https://api.hetzner.cloud/v1/ssh_keys")
    KEY_ID=$(echo "$RESPONSE" | jq -r '.ssh_key.id // empty')
    [ -z "$KEY_ID" ] && error_exit "Failed to upload SSH key: $RESPONSE"
    log_success "SSH key uploaded to Hetzner (id: $KEY_ID)"
  else
    KEY_ID="$EXISTING_KEY_ID"
    log_info "SSH key already present in Hetzner (id: $KEY_ID)"
  fi

  # Create server
  log_info "Creating Hetzner server '$SERVER_NAME'..."
  RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $HETZNER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$SERVER_NAME\",\"server_type\":\"$SERVER_TYPE\",\"image\":\"$IMAGE\",\"location\":\"$LOCATION\",\"ssh_keys\":[\"$KEY_ID\"]}" \
    "https://api.hetzner.cloud/v1/servers")
  SERVER_IP=$(echo "$RESPONSE" | jq -r '.server.public_net.ipv4.ip // empty')
  SERVER_ID=$(echo "$RESPONSE" | jq -r '.server.id // empty')
  if [ -n "$SERVER_IP" ] && [ -n "$SERVER_ID" ]; then
    log_success "Hetzner server created: $SERVER_NAME ($SERVER_IP, id: $SERVER_ID)"
    echo "$SERVER_IP"
  else
    log_error "Failed to create server. Response: $RESPONSE"
    exit 1
  fi
}

main "$@"
