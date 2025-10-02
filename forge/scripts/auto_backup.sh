#!/bin/bash
# Auto-backup script for DDEV post-stop hook
BACKUP_DIR=".ddev/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
tar czf "$BACKUP_DIR/site_files.tar.gz" web
ddev export-db --file "$BACKUP_DIR/db.sql"
echo "Backup completed: $BACKUP_DIR"
