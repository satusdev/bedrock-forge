#!/bin/bash
# create-github-repo.sh - Create a new GitHub repo via API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <repo_name> [--private] [--org=orgname]"
  echo "Requires GITHUB_TOKEN env variable."
  echo "If arguments are omitted, you will be prompted interactively."
  exit 1
}

prompt_if_missing() {
  if [ -z "$REPO_NAME" ]; then
    read -rp "Enter repository name: " REPO_NAME
  fi
  if [ -z "$PRIVATE_SET" ]; then
    read -rp "Should the repo be private? [Y/n]: " PRIVATE_ANSWER
    case "$PRIVATE_ANSWER" in
      [Nn]*) PRIVATE=false ;;
      *) PRIVATE=true ;;
    esac
  fi
  if [ -z "$ORG" ]; then
    read -rp "Enter organization (leave blank for personal account): " ORG
  fi
}

parse_arguments() {
  # Help flag
  for arg in "$@"; do
    case $arg in
      -h|--help) usage ;;
    esac
  done

  PRIVATE_SET=""
  PRIVATE=false
  ORG=""
  REPO_NAME="$1"
  shift
  for arg in "$@"; do
    case $arg in
      --private) PRIVATE=true; PRIVATE_SET=1 ;;
      --org=*) ORG="${arg#*=}" ;;
    esac
  done
}

main() {
  parse_arguments "$@"
  prompt_if_missing
  [ -z "$GITHUB_TOKEN" ] && error_exit "GITHUB_TOKEN env variable required."
  API_URL="https://api.github.com/user/repos"
  if [ -n "$ORG" ]; then
    API_URL="https://api.github.com/orgs/$ORG/repos"
  fi
  DATA="{\"name\":\"$REPO_NAME\",\"private\":$PRIVATE}"
  log_info "Creating GitHub repo '$REPO_NAME' (private: $PRIVATE, org: $ORG)..."
  RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
    -d "$DATA" "$API_URL")
  REPO_URL=$(echo "$RESPONSE" | jq -r '.ssh_url // empty')
  if [ -n "$REPO_URL" ] && [[ "$REPO_URL" == git@github.com* ]]; then
    log_success "GitHub repo created: $REPO_URL"
    echo "$REPO_URL"
  else
    log_error "Failed to create repo. Response: $RESPONSE"
    exit 1
  fi
}

main "$@"
