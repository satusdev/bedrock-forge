#!/bin/bash
# logging.sh - Shared logging utility for Bedrock workflow scripts

LOG_DIR="$(dirname "$(dirname "$(dirname "${BASH_SOURCE[0]}")")")/scripts/logs"
LOG_FILE="$LOG_DIR/bedrock-workflow.log"

mkdir -p "$LOG_DIR"

log() {
  local level="$1"
  shift
  local msg="$*"
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] [$level] $msg" | tee -a "$LOG_FILE"
}

log_info()    { log "INFO" "$@"; }
log_warn()    { log "WARN" "$@"; }
log_error()   { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Usage in scripts:
#   source "$(dirname "$0")/../common/logging.sh"
#   log_info "Starting script"
#   log_error "Something went wrong"
