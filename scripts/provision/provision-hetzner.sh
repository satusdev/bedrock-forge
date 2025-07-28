#!/usr/bin/env bash

# provision-hetzner.sh
# Provision a Hetzner Cloud VPS for WordPress/CyberPanel deployment.
# Usage: ./provision-hetzner.sh <server_name>
# Requires: hcloud CLI (https://github.com/hetznercloud/cli)

set -e

if ! command -v hcloud >/dev/null; then
  echo "Error: hcloud CLI is required. Install from https://github.com/hetznercloud/cli" >&2
  exit 1
fi

# Check for active hcloud context
if ! hcloud context active >/dev/null 2>&1; then
  echo "Error: No active hcloud context or token. Run: hcloud context create <name>" >&2
  exit 1
fi

usage() {
  echo "Usage: $0 <server_name>"
  echo "You will be prompted interactively for all options."
  exit 1
}

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
fi

echo "Choose server provisioning mode:"
echo "1) Create new server"
echo "2) Use existing server"
read -rp "Select option [1/2]: " SERVER_MODE

if [[ "$SERVER_MODE" == "2" ]]; then
  echo "Listing existing Hetzner servers:"
  hcloud server list -o columns=id,name,public_ipv4,status
  read -rp "Enter existing server name: " SERVER_NAME
  SERVER_JSON=$(hcloud server describe "$SERVER_NAME" --output json)
  echo "$SERVER_JSON" > "server-info.json"
  echo "Server info saved to server-info.json"
  SERVER_IP=$(echo "$SERVER_JSON" | jq -r '.public_net.ipv4')
  SERVER_ID=$(echo "$SERVER_JSON" | jq -r '.id')
  SERVER_HOSTNAME=$(echo "$SERVER_JSON" | jq -r '.name')
  SERVER_OS=$(echo "$SERVER_JSON" | jq -r '.image.os_flavor')
  SERVER_PROVIDER="hetzner"
  jq \
    --arg ip "$SERVER_IP" \
    --arg hostname "$SERVER_HOSTNAME" \
    --arg provider "$SERVER_PROVIDER" \
    --arg os "$SERVER_OS" \
    --arg date "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    '.server.ip = $ip | .server.hostname = $hostname | .server.provider = $provider | .server.os = $os | .provisioned_at = $date' \
    project-info.json > project-info.json.tmp && mv project-info.json.tmp project-info.json
  echo "Project info updated in project-info.json"
  echo "Server ID: $SERVER_ID"
  echo "Server IP: $SERVER_IP"
  echo "You can SSH to the server:"
  echo "  ssh root@$SERVER_IP"
  exit 0
fi

SERVER_NAME="$1"
if [[ -z "$SERVER_NAME" ]]; then
  read -rp "Enter server name: " SERVER_NAME
fi

# SSH key selection (required)
echo "Available SSH keys:"
hcloud ssh-key list -o columns=id,name
read -rp "Enter SSH key name (as shown above): " SSH_KEY_NAME

# Image selection (default: ubuntu-22.04)
DEFAULT_IMAGE="ubuntu-22.04"
echo "Available images (showing Ubuntu, Debian, CentOS):"
hcloud image list -o columns=name,description,os_flavor,os_version | grep -E 'ubuntu|debian|centos'
read -rp "Enter image name [${DEFAULT_IMAGE}]: " IMAGE
IMAGE="${IMAGE:-$DEFAULT_IMAGE}"

# Server type selection (default: cx22)
DEFAULT_TYPE="cx22"
echo "Available server types:"
hcloud server-type list -o columns=name,cores,memory,disk
read -rp "Enter server type [${DEFAULT_TYPE}]: " SERVER_TYPE
SERVER_TYPE="${SERVER_TYPE:-$DEFAULT_TYPE}"

# Location selection (default: fsn1)
DEFAULT_LOCATION="fsn1"
echo "Available locations:"
hcloud location list -o columns=name,description
read -rp "Enter location [${DEFAULT_LOCATION}]: " LOCATION
LOCATION="${LOCATION:-$DEFAULT_LOCATION}"

echo "Provisioning Hetzner server: $SERVER_NAME"
echo "Type: $SERVER_TYPE, Image: $IMAGE, SSH Key: $SSH_KEY_NAME, Location: $LOCATION"

hcloud server create --name "$SERVER_NAME" \
  --ssh-key "$SSH_KEY_NAME" \
  --image "$IMAGE" \
  --type "$SERVER_TYPE" \
  --location "$LOCATION"

echo "Server creation initiated. Fetching server info..."

# Wait for server to be ready and fetch info
sleep 5
SERVER_JSON=$(hcloud server describe "$SERVER_NAME" --output json)
echo "$SERVER_JSON" > "server-info.json"
echo "Server info saved to server-info.json"

SERVER_IP=$(echo "$SERVER_JSON" | jq -r '.public_net.ipv4')
SERVER_ID=$(echo "$SERVER_JSON" | jq -r '.id')
SERVER_HOSTNAME=$(echo "$SERVER_JSON" | jq -r '.name')
SERVER_OS=$(echo "$SERVER_JSON" | jq -r '.image.os_flavor')
SERVER_PROVIDER="hetzner"

# Update project-info.json
jq \
  --arg ip "$SERVER_IP" \
  --arg hostname "$SERVER_HOSTNAME" \
  --arg provider "$SERVER_PROVIDER" \
  --arg os "$SERVER_OS" \
  --arg date "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.server.ip = $ip | .server.hostname = $hostname | .server.provider = $provider | .server.os = $os | .provisioned_at = $date' \
  project-info.json > project-info.json.tmp && mv project-info.json.tmp project-info.json

echo "Project info updated in project-info.json"

echo "Server ID: $SERVER_ID"
echo "Server IP: $SERVER_IP"
echo "You can SSH to the server when ready:"
echo "  ssh root@$SERVER_IP"
