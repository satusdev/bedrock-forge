# Backup Script Usage

This document explains how to use the backup script to create and restore
backups for your Bedrock site.

## Script Location

`scripts/sync/backup.sh`

## Purpose

Creates backups of your site's database and uploads to the configured rclone
remote.

## Usage

```sh
# Backup DB and uploads to rclone remote
./scripts/sync/backup.sh <site> <environment>
```

- `<site>`: The site name (e.g., `mysite`)
- `<environment>`: The environment (e.g., `production`, `staging`)

## Example

```sh
./scripts/sync/backup.sh mysite production
```

## Expected Output

- Success message with backup location and timestamp.
- Errors if rclone is not configured or credentials are missing.

## Troubleshooting

- Ensure rclone is installed and configured.
- Check permissions for the backup destination.
- See [docs/troubleshooting.md](./troubleshooting.md) for backup errors.

## Related Scripts

- Restore: `./scripts/sync/restore.sh`
