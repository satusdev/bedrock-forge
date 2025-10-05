# Backup and Restore Guide

This guide covers comprehensive backup and restore procedures for your Bedrock Forge WordPress projects.

## Overview

Bedrock Forge provides automated backup capabilities with Google Drive integration, manual backup options, and complete restore functionality.

## Backup Architecture

### Components

- **Local Backups**: Stored in `.forge/backups/`
- **Google Drive Integration**: Cloud storage with automatic sync
- **Database Dumps**: SQL exports with compression
- **File Archives**: Complete WordPress site backups
- **Configuration Backups**: Settings and environment files

### Backup Types

| Type | Description | Frequency | Storage |
|------|-------------|-----------|---------|
| **Database** | MySQL/MariaDB database dumps | Before major changes | Local + Cloud |
| **Files** | Complete WordPress files | Weekly | Local + Cloud |
| **Config** | Configuration files | On change | Local + Cloud |
| **Plugins** | Plugin-specific data | As needed | Local + Cloud |

## Configuration

### Environment Variables

```bash
# Google Drive Integration
GOOGLE_DRIVE_CREDENTIALS_JSON=path/to/credentials.json
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Backup Settings
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_ENCRYPTION=false

# Storage Limits
BACKUP_MAX_SIZE_GB=5
BACKUP_LOCAL_RETENTION=7
BACKUP_REMOTE_RETENTION=30
```

### Backup Configuration File

Create `.forge/config/backup.json`:

```json
{
  "backup": {
    "enabled": true,
    "schedule": "daily",
    "compression": true,
    "encryption": false,
    "retention": {
      "local": 7,
      "remote": 30,
      "max_size_gb": 5
    },
    "storage": {
      "local": {
        "enabled": true,
        "path": ".forge/backups/"
      },
      "google_drive": {
        "enabled": true,
        "credentials_file": "credentials.json",
        "folder_id": "your_folder_id"
      }
    },
    "exclude": {
      "files": [
        ".git/*",
        "node_modules/*",
        "*.log",
        ".forge/tmp/*"
      ],
      "database": [
        "wp_sessions",
        "wp_options_transient_*"
      ]
    }
  }
}
```

## Manual Backups

### Create Full Backup

```bash
# Complete site backup
forge backup create --type full

# Database only
forge backup create --type database

# Files only
forge backup create --type files

# Configuration only
forge backup create --type config
```

### Backup with Custom Name

```bash
forge backup create --name "pre-update-backup" --type full
```

### Backup with Encryption

```bash
forge backup create --encrypt --password-file /path/to/password.txt
```

## Automated Backups

### Schedule Setup

```bash
# Enable scheduled backups
forge backup schedule --enable --frequency daily

# Custom schedule (cron format)
forge backup schedule --cron "0 2 * * 0"  # Weekly at 2 AM

# Set retention policy
forge backup schedule --retention 30 --local-retention 7
```

### Pre/Post Hooks

```bash
# Execute commands before backup
forge backup create --pre-hook "php artisan cache:clear"

# Execute commands after backup
forge backup create --post-hook "curl -X POST https://hooks.slack.com/backup-success"
```

## Google Drive Integration

### Setup Google Drive

1. **Create Google Cloud Project**:
   ```bash
   # Visit: https://console.cloud.google.com/
   # Create new project
   # Enable Google Drive API
   # Create service account credentials
   ```

2. **Configure Credentials**:
   ```bash
   # Download credentials JSON
   mv ~/Downloads/credentials.json .forge/config/

   # Configure in forge.yaml
   google_drive:
     credentials_file: .forge/config/credentials.json
     folder_id: your_google_drive_folder_id
   ```

3. **Test Connection**:
   ```bash
   forge backup test-google-drive
   ```

### Google Drive Operations

```bash
# Sync local backups to Google Drive
forge backup sync --to-google-drive

# Download from Google Drive
forge backup download --from-google-drive --backup-id latest

# List remote backups
forge backup list --remote

# Clean old remote backups
forge backup cleanup --remote --older-than 30d
```

## Restore Procedures

### Database Restore

```bash
# List available database backups
forge backup list --type database

# Restore specific database backup
forge backup restore --type database --backup-id 2024-01-15-db.sql.gz

# Restore with confirmation prompt
forge backup restore --type database --backup-id latest --confirm
```

### File Restore

```bash
# Restore all files
forge backup restore --type files --backup-id 2024-01-15-files.tar.gz

# Restore specific directory
forge backup restore --type files --backup-id latest --path wp-content/uploads

# Restore with overwrite protection
forge backup restore --type files --backup-id latest --no-overwrite
```

### Complete Site Restore

```bash
# Full site restore (database + files)
forge backup restore --type full --backup-id 2024-01-15-full.tar.gz

# Restore to different directory
forge backup restore --type full --backup-id latest --target /tmp/restore-site/

# Restore with environment switch
forge backup restore --type full --backup-id latest --environment staging
```

## Disaster Recovery

### Complete Site Recovery

1. **Assess Damage**:
   ```bash
   # Check backup availability
   forge backup list --all-types

   # Verify backup integrity
   forge backup verify --backup-id latest
   ```

2. **Prepare Environment**:
   ```bash
   # Clean corrupted installation
   forge local destroy --confirm

   # Recreate project structure
   forge local setup
   ```

3. **Restore from Backup**:
   ```bash
   # Restore database
   forge backup restore --type database --backup-id latest

   # Restore files
   forge backup restore --type files --backup-id latest

   # Verify functionality
   forge local status
   ```

### Partial Recovery

```bash
# Restore specific tables
forge backup restore-tables --backup-id 2024-01-15-db.sql.gz --tables wp_posts,wp_postmeta

# Restore specific files
forge backup restore-files --backup-id latest --files "wp-content/themes/*,wp-content/plugins/your-plugin/*"
```

## Backup Management

### List Backups

```bash
# All backups
forge backup list

# Filter by type
forge backup list --type database
forge backup list --type files

# Filter by date range
forge backup list --from "2024-01-01" --to "2024-01-31"

# Detailed information
forge backup list --detailed
```

### Backup Verification

```bash
# Verify backup integrity
forge backup verify --backup-id 2024-01-15-full.tar.gz

# Verify all recent backups
forge backup verify --all --newer-than 7d

# Check backup completeness
forge backup check --backup-id latest --verify-files --verify-database
```

### Backup Cleanup

```bash
# Clean old backups
forge backup cleanup --older-than 30d

# Clean based on retention policy
forge backup cleanup --apply-retention-policy

# Clean specific type
forge backup cleanup --type database --keep-count 10

# Force cleanup (bypass retention)
forge backup cleanup --force --older-than 7d
```

## Best Practices

### Backup Strategy

1. **3-2-1 Rule**: 3 copies, 2 different media, 1 off-site
2. **Regular Testing**: Verify restore procedures monthly
3. **Documentation**: Keep restore procedures documented
4. **Monitoring**: Set up backup failure alerts

### Schedule Optimization

```yaml
# Recommended backup schedule
backup_schedule:
  - type: database
    frequency: "0 2 * * *"  # Daily at 2 AM
    retention: 30 days

  - type: files
    frequency: "0 3 * * 0"  # Weekly Sunday at 3 AM
    retention: 90 days

  - type: config
    frequency: "after_deploy"
    retention: 180 days
```

### Security Considerations

1. **Encryption**: Enable backup encryption for sensitive data
2. **Access Control**: Limit backup file access permissions
3. **Credential Security**: Secure Google Drive credentials
4. **Audit Trail**: Log all backup and restore operations

## Troubleshooting

### Common Issues

**Backup Creation Failed**:
```bash
# Check disk space
df -h

# Check permissions
ls -la .forge/backups/

# Check configuration
forge config show --section backup
```

**Google Drive Sync Failed**:
```bash
# Test connection
forge backup test-google-drive

# Re-authenticate
forge backup auth-google-drive

# Check quota
forge backup google-drive-quota
```

**Restore Failed**:
```bash
# Verify backup integrity
forge backup verify --backup-id <id>

# Check target permissions
ls -la /path/to/restore/

# Restore in steps
forge backup restore --type database --backup-id <id>
forge backup restore --type files --backup-id <id>
```

### Backup Corruption Recovery

```bash
# Check backup file integrity
forge backup check --backup-id <id> --deep-scan

# Attempt repair
forge backup repair --backup-id <id>

# Use previous backup if corrupted
forge backup list --type database --sort date | head -5
```

## Integration Examples

### CI/CD Pipeline Integration

```yaml
# GitHub Actions example
- name: Create Backup
  run: |
    forge backup create --type full --name "pre-deploy-${{ github.sha }}"
    forge backup sync --to-google-drive

- name: Deploy
  run: forge deploy --environment production

- name: Verify Deployment
  run: forge health check --environment production

- name: Rollback on Failure
  if: failure()
  run: |
    forge backup restore --type full --backup-id "pre-deploy-${{ github.sha }}"
```

### Monitoring Integration

```bash
# Backup monitoring script
#!/bin/bash
BACKUP_STATUS=$(forge backup status --latest)
if [[ $BACKUP_STATUS != "SUCCESS" ]]; then
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"Backup failed! Status: '$BACKUP_STATUS'"}' \
    https://hooks.slack.com/your-webhook
fi
```

## API Reference

### Backup Management

```python
# Create backup
backup_id = forge.backup.create(type='full', name='manual-backup')

# List backups
backups = forge.backup.list(type='database', limit=10)

# Restore backup
forge.backup.restore(backup_id='2024-01-15-full.tar.gz', type='full')

# Verify backup
is_valid = forge.backup.verify(backup_id='2024-01-15-db.sql.gz')
```

### Google Drive Operations

```python
# Sync to Google Drive
forge.backup.sync_to_google_drive(backup_id='latest')

# Download from Google Drive
forge.backup.download_from_google_drive(backup_id='2024-01-15-full.tar.gz')

# List remote backups
remote_backups = forge.backup.list_remote()
```

This comprehensive backup and restore guide ensures your WordPress projects are protected and can be quickly recovered in case of any issues.