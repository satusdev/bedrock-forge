# DDEV Auto-Backup on Stop

To enable automatic backup when stopping a project, add this to your
`.ddev/config.yaml`:

```yaml
hooks:
  post-stop:
    - exec: bash forge/scripts/auto_backup.sh
```

This will:

- Archive the `web` directory
- Export the database to `.ddev/backup_TIMESTAMP/`
- Print the backup location

**Test:**

1. Run `ddev stop` in your project directory.
2. Check `.ddev/backup_TIMESTAMP/` for backup files.
