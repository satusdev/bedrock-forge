#!/bin/bash
# utils.sh - Shared utility functions for Bedrock workflow scripts

error_exit() {
  log_error "$1"
  exit 1
}

check_tool() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 command could not be found. Please install it."
    exit 1
  fi
}

# Usage in scripts:
#   source "$(dirname "$0")/../common/utils.sh"
#   check_tool jq
#   error_exit "Something went wrong"
