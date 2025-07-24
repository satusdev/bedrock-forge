#!/usr/bin/env bash

# provision-hetzner.sh
# Provision a Hetzner Cloud VPS for WordPress/CyberPanel deployment.
# Usage: ./provision-hetzner.sh <server_name> [--type=<server_type>] [--image=<image>] [--ssh-key=<ssh_key_name>]
# Requires: HETZNER_TOKEN (env), curl, jq

set -e

if ! command -v curl >/dev/null || ! command -v jq >/dev/null; then
  echo "Error: curl and jq are required." >&2
  exit 1
fi

if [[ -z "$HETZNER_TOKEN" ]]; then
  echo "Error: HETZNER_TOKEN environment variable is required." >&2
  exit 1
fi

usage() {
  echo "Usage: $0 <server_name> [--type=<server_type>] [--image=<image>] [--ssh-key=<ssh_key_name>]"
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [[ -z "$SERVER_NAME" ]]; then
    read -rp "Enter server name: " SERVER_NAME
  fi
  if [[ -z "$SERVER_TYPE" ]]; then
    read -rp "Enter server type [cx21]: " SERVER_TYPE
    SERVER_TYPE="${SERVER_TYPE:-cx21}"
  fi
  if [[ -z "$IMAGE" ]]; then
    read -rp "Enter image [ubuntu-22.04]: " IMAGE
    IMAGE="${IMAGE:-ubuntu-22.04}"
  fi
  if [[ -z "$SSH_KEY_NAME" ]]; then
    read -rp "Enter SSH key name (must exist in Hetzner Cloud): " SSH_KEY_NAME
  fi
}

# Help flag and argument parsing
SERVER_NAME=""
SERVER_TYPE=""
IMAGE=""
SSH_KEY_NAME=""
for arg in "$@"; do
  case $arg in
    -h|--help) usage ;;
    --type=*) SERVER_TYPE="${arg#*=}" ;;
    --image=*) IMAGE="${arg#*=}" ;;
    --ssh-key=*) SSH_KEY_NAME="${arg#*=}" ;;
    *)
      if [[ -z "$SERVER_NAME" ]]; then
        SERVER_NAME="$arg"
      fi
      ;;
  esac
done

prompt_if_missing

echo "Provisioning Hetzner server: $SERVER_NAME"
echo "Type: $SERVER_TYPE, Image: $IMAGE, SSH Key: $SSH_KEY_NAME"

# Get SSH key ID if provided
SSH_KEY_ID=""
if [[ -n "$SSH_KEY_NAME" ]]; then
  SSH_KEY_ID=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" \
    "https://api.hetzner.cloud/v1/ssh_keys" | jq -r ".ssh_keys[] | select(.name==\"$SSH_KEY_NAME\") | .id")
  if [[ -z "$SSH_KEY_ID" ]]; then
    echo "Error: SSH key '$SSH_KEY_NAME' not found in Hetzner account." >&2
    exit 1
  fi
fi

# Create server
CREATE_PAYLOAD="{\"name\":\"$SERVER_NAME\",\"server_type\":\"$SERVER_TYPE\",\"image\":\"$IMAGE\""
if [[ -n "$SSH_KEY_ID" ]]; then
  CREATE_PAYLOAD+=",\"ssh_keys\":[$SSH_KEY_ID]"
fi
CREATE_PAYLOAD+="}"

CREATE_RESULT=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD" \
  "https://api.hetzner.cloud/v1/servers")

SERVER_ID=$(echo "$CREATE_RESULT" | jq -r '.server.id')
if [[ "$SERVER_ID" == "null" || -z "$SERVER_ID" ]]; then
  echo "Error: Failed to create server. Response:" >&2
  echo "$CREATE_RESULT" >&2
  exit 1
fi

echo "Server created. ID: $SERVER_ID"
echo "Waiting for server to become active..."

# Wait for server to be running and get IP
for i in {1..30}; do
  SERVER_INFO=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" \
    "https://api.hetzner.cloud/v1/servers/$SERVER_ID")
  STATUS=$(echo "$SERVER_INFO" | jq -r '.server.status')
  if [[ "$STATUS" == "running" ]]; then
    IPV4=$(echo "$SERVER_INFO" | jq -r '.server.public_net.ipv4.ip')
    echo "Server is running. IP: $IPV4"
    echo "You can now SSH to the server (if your SSH key was added):"
    echo "  ssh root@$IPV4"
    exit 0
  fi
  sleep 5
done

echo "Server did not become active in time. Please check the Hetzner Cloud Console."
exit 1
