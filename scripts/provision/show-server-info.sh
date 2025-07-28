#!/usr/bin/env bash

# show-server-info.sh
# Display Hetzner server info from server-info.json in a human-friendly way.

INFO_FILE="server-info.json"

if [ ! -f "$INFO_FILE" ]; then
  echo "Error: $INFO_FILE not found in current directory."
  exit 1
fi

echo "Hetzner Server Info:"
echo "--------------------"
jq '
  {
    "ID": .id,
    "Name": .name,
    "Status": .status,
    "Public IPv4": .public_net.ipv4,
    "Public IPv6": .public_net.ipv6,
    "Location": .datacenter.location.name,
    "Type": .server_type.name,
    "Image": .image.name,
    "Created": .created,
    "SSH Keys": [.ssh_keys[].name]
  }
' "$INFO_FILE"
