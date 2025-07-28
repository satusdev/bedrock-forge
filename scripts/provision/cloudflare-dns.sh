#!/usr/bin/env bash

# cloudflare-dns.sh
# Add or remove DNS records (A, CNAME) using cloudflared CLI.
# Usage:
#   ./cloudflare-dns.sh add --zone <zone> --type <A|CNAME> --name <subdomain> --content <ip-or-target>
#   ./cloudflare-dns.sh remove --zone <zone> --type <A|CNAME> --name <subdomain>
# Or run interactively with no arguments.

set -e

ACTION="$1"
shift

prompt() {
  read -rp "Zone (example.com): " ZONE
  read -rp "Record type (A/CNAME): " TYPE
  read -rp "Name (subdomain): " NAME
  if [[ "$ACTION" == "add" ]]; then
    read -rp "Content (IP for A, target for CNAME): " CONTENT
  fi
}

if [[ -z "$ACTION" ]]; then
  echo "No action specified. Choose: add or remove"
  read -rp "Action (add/remove): " ACTION
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zone) ZONE="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --content) CONTENT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$ZONE" || -z "$TYPE" || -z "$NAME" || ( "$ACTION" == "add" && -z "$CONTENT" ) ]]; then
  prompt
fi

if [[ "$ACTION" == "add" ]]; then
  echo "Adding $TYPE record: $NAME.$ZONE -> $CONTENT"
  cloudflared dns create --zone "$ZONE" --type "$TYPE" --name "$NAME" --content "$CONTENT"
elif [[ "$ACTION" == "remove" ]]; then
  echo "Removing $TYPE record: $NAME.$ZONE"
  cloudflared dns delete --zone "$ZONE" --name "$NAME"
else
  echo "Unknown action: $ACTION"
  exit 1
fi
