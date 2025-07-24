#!/bin/bash
# ssh-setup.sh - Generate SSH key and copy to remote server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <user@host> [--key-path=~/.ssh/id_rsa]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing user@host argument."
    usage
  fi
  SSH_TARGET="$1"
  KEY_PATH="$HOME/.ssh/id_rsa"
  shift
  for arg in "$@"; do
    case $arg in
      --key-path=*) KEY_PATH="${arg#*=}" ;;
    esac
  done
}

generate_ssh_key() {
  if [ ! -f "$KEY_PATH" ]; then
    log_info "Generating SSH key at $KEY_PATH"
    ssh-keygen -t rsa -b 4096 -f "$KEY_PATH" -N "" || error_exit "Failed to generate SSH key"
    log_success "SSH key generated at $KEY_PATH"
  else
    log_info "SSH key already exists at $KEY_PATH"
  fi
}

copy_ssh_key() {
  log_info "Copying SSH public key to $SSH_TARGET"
  if command -v ssh-copy-id >/dev/null 2>&1; then
    ssh-copy-id -i "$KEY_PATH.pub" "$SSH_TARGET" || error_exit "ssh-copy-id failed"
  else
    PUB_KEY=$(cat "$KEY_PATH.pub")
    ssh "$SSH_TARGET" "mkdir -p ~/.ssh && echo '$PUB_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  fi
  log_success "SSH key copied to $SSH_TARGET"
}

main() {
  parse_arguments "$@"
  generate_ssh_key
  copy_ssh_key
}

main "$@"
