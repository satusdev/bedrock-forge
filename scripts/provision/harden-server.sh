#!/bin/bash
# harden-server.sh - Basic server hardening for Ubuntu (UFW, fail2ban, updates, SSH config)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 <user@host> [--disable-root] [--timezone=Europe/Berlin]"
  exit 1
}

parse_arguments() {
  if [ -z "$1" ]; then
    log_error "Missing user@host argument."
    usage
  fi
  SSH_TARGET="$1"
  DISABLE_ROOT=false
  TIMEZONE=""
  shift
  for arg in "$@"; do
    case $arg in
      --disable-root) DISABLE_ROOT=true ;;
      --timezone=*) TIMEZONE="${arg#*=}" ;;
    esac
  done
}

setup_ufw() {
  log_info "Setting up UFW firewall on $SSH_TARGET"
  ssh "$SSH_TARGET" "sudo apt-get update && sudo apt-get install -y ufw"
  ssh "$SSH_TARGET" "sudo ufw allow OpenSSH && sudo ufw allow http && sudo ufw allow https && sudo ufw --force enable"
  log_success "UFW configured"
}

setup_fail2ban() {
  log_info "Installing fail2ban on $SSH_TARGET"
  ssh "$SSH_TARGET" "sudo apt-get install -y fail2ban"
  ssh "$SSH_TARGET" "sudo systemctl enable fail2ban && sudo systemctl restart fail2ban"
  log_success "fail2ban installed and running"
}

disable_root_ssh() {
  log_info "Disabling root SSH login on $SSH_TARGET"
  ssh "$SSH_TARGET" "sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl reload sshd"
  log_success "Root SSH login disabled"
}

setup_auto_updates() {
  log_info "Enabling automatic security updates on $SSH_TARGET"
  ssh "$SSH_TARGET" "sudo apt-get install -y unattended-upgrades"
  ssh "$SSH_TARGET" "sudo dpkg-reconfigure -f noninteractive unattended-upgrades"
  log_success "Automatic security updates enabled"
}

set_timezone() {
  if [ -n "$TIMEZONE" ]; then
    log_info "Setting timezone to $TIMEZONE on $SSH_TARGET"
    ssh "$SSH_TARGET" "sudo timedatectl set-timezone '$TIMEZONE'"
    log_success "Timezone set to $TIMEZONE"
  fi
}

main() {
  parse_arguments "$@"
  setup_ufw
  setup_fail2ban
  setup_auto_updates
  set_timezone
  if [ "$DISABLE_ROOT" = true ]; then
    disable_root_ssh
  fi
  log_success "Server hardening complete for $SSH_TARGET"
}

main "$@"
