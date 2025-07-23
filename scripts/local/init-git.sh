#!/bin/bash
# init-git.sh - Initialize git repo, add remote, and push for a Bedrock site

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <site_name> <github_repo_url>"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    log_error "Missing arguments: site_name, github_repo_url."
    usage
  fi
  SITE_NAME="$1"
  REPO_URL="$2"
}

main() {
  parse_arguments "$@"
  SITE_DIR="websites/$SITE_NAME"
  [ -d "$SITE_DIR" ] || error_exit "Site directory $SITE_DIR not found."
  cd "$SITE_DIR" || error_exit "Failed to cd into $SITE_DIR"
  if [ -d ".git" ]; then
    log_info "Git repo already initialized in $SITE_DIR"
  else
    git init || error_exit "git init failed"
    log_info "Initialized git repo in $SITE_DIR"
  fi
  git add . || error_exit "git add failed"
  git commit -m "Initial commit" || log_warn "Nothing to commit or commit failed"
  git remote add origin "$REPO_URL" 2>/dev/null || log_info "Remote 'origin' already set"
  git branch -M main || true
  git push -u origin main || log_warn "git push failed (check credentials or remote repo)"
  log_success "Git repo initialized and pushed for $SITE_NAME"
}

main "$@"
