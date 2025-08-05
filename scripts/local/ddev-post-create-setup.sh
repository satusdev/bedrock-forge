#!/bin/bash
# ddev-post-create-setup.sh - Copy automation scripts, Jenkinsfile, and configs into new DDEV project

# Usage: ./ddev-post-create-setup.sh <target_project_dir>
set -e

TARGET_DIR="$1"
if [ -z "$TARGET_DIR" ]; then
  echo "Usage: $0 <target_project_dir>"
  exit 1
fi

SCRIPT_LIST=(
  "scripts/deploy/deploy.sh"
  "scripts/sync/sync-db.sh"
  "scripts/sync/sync-uploads.sh"
  "scripts/sync/backup.sh"
  "scripts/sync/restore.sh"
  "scripts/local/create-github-repo.sh"
  "scripts/ci/jenkins-connect.sh"
  "scripts/monitoring/kuma-register.sh"
  "scripts/provision/provision-cyberpanel.sh"
)

CONFIG_LIST=(
  "config/sync-config.json"
  "project-info.json"
)

mkdir -p "$TARGET_DIR/scripts"
for SCRIPT in "${SCRIPT_LIST[@]}"; do
  cp "$SCRIPT" "$TARGET_DIR/scripts/"
  chmod +x "$TARGET_DIR/scripts/$(basename "$SCRIPT")"
done

for CONFIG in "${CONFIG_LIST[@]}"; do
  cp "$CONFIG" "$TARGET_DIR/"
done

# Copy latest Jenkinsfile template
cp scripts/deploy/jenkins/Jenkinsfile "$TARGET_DIR/Jenkinsfile"

echo "Automation scripts, Jenkinsfile, and config files copied to $TARGET_DIR"
