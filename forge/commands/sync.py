import typer
import os
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import json

from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from forge.utils.shell import run_shell
from tqdm import tqdm
import shutil
import keyring
import gettext

_ = gettext.gettext
BACKUP_DIR = ".ddev/backups"

@dataclass
class BackupResult:
    """Result of a backup operation."""
    success: bool
    backup_type: str
    files: List[Path]
    size_bytes: int
    duration_seconds: float
    error_message: Optional[str] = None
    gdrive_synced: bool = False
    metadata: Dict[str, Any] = None

class BackupStatus:
    """Track backup status for dashboard integration."""

    def __init__(self, project_dir: Path):
        self.project_dir = project_dir
        self.status_file = project_dir / ".ddev" / "backup_status.json"

    def save_status(self, result: BackupResult) -> None:
        """Save backup status to JSON file."""
        status_data = {
            "timestamp": datetime.now().isoformat(),
            "success": result.success,
            "backup_type": result.backup_type,
            "files": [str(f) for f in result.files],
            "size_bytes": result.size_bytes,
            "duration_seconds": result.duration_seconds,
            "error_message": result.error_message,
            "gdrive_synced": result.gdrive_synced,
            "metadata": result.metadata or {}
        }

        try:
            self.status_file.parent.mkdir(exist_ok=True)
            with open(self.status_file, 'w') as f:
                json.dump(status_data, f, indent=2)
            logger.info(f"Backup status saved to {self.status_file}")
        except Exception as e:
            logger.error(f"Failed to save backup status: {e}")

    def get_latest_status(self) -> Optional[Dict[str, Any]]:
        """Get latest backup status."""
        try:
            if self.status_file.exists():
                with open(self.status_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read backup status: {e}")
        return None

app = typer.Typer()

def check_rclone_config(dry_run: bool = False) -> None:
    if dry_run:
        return
    try:
        subprocess.run("rclone config show", shell=True, check=True, capture_output=True)
    except subprocess.CalledProcessError:
        logger.warning(_("rclone not configured. Run 'rclone config' to set up Google Drive."))
        if typer.confirm(_("Configure now?"), default=False):
            subprocess.run("rclone config", shell=True)

def get_gdrive_creds() -> Path:
    creds_str = keyring.get_password("forge", "gdrive_service_account_json")
    if not creds_str:
        raise ForgeError(_("Google Drive service account credentials not found in keyring."))
    from tempfile import NamedTemporaryFile
    with NamedTemporaryFile(delete=False, mode="w", suffix=".json") as f:
        f.write(creds_str)
        return Path(f.name)

def run_rclone(cmd: str, gdrive_creds_file: Path = None, dry_run: bool = False, verbose: bool = False) -> str:
    if dry_run:
        logger.info(_(f"Dry run: rclone {cmd}"))
        return ""
    env = os.environ.copy()
    if gdrive_creds_file:
        env["GOOGLE_APPLICATION_CREDENTIALS"] = str(gdrive_creds_file)
    if verbose:
        cmd += " -v"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise ForgeError(_(f"rclone failed: {result.stderr}"))
    return result.stdout

def backup(
    project_dir: Path = Path.cwd(),
    db: bool = True,
    uploads: bool = True,
    gdrive: bool = False,
    gdrive_folder: str = "forge-backups",
    retention: int = 7,
    dry_run: bool = False,
    verbose: bool = False
) -> BackupResult:
    """Backup DB and/or uploads, optionally to Google Drive."""
    start_time = datetime.now()
    backup_status = BackupStatus(project_dir)

    try:
        os.chdir(project_dir)
        backup_dir = project_dir / BACKUP_DIR
        backup_dir.mkdir(exist_ok=True)
        timestamp = start_time.strftime("%Y%m%d_%H%M%S")
        backup_files = []

        check_rclone_config(dry_run)

        # Determine backup type
        backup_type = []
        if db: backup_type.append("db")
        if uploads: backup_type.append("uploads")
        backup_type = "+".join(backup_type) if backup_type else "none"

        # Backup database
        if db:
            db_file = backup_dir / f"db_{timestamp}.sql"
            logger.info(_(f"Backing up DB to {db_file}"))
            if not dry_run:
                run_shell("ddev export-db --file " + str(db_file), dry_run)
            backup_files.append(db_file)

        # Backup uploads
        if uploads:
            uploads_file = backup_dir / f"uploads_{timestamp}.tar.gz"
            logger.info(_(f"Archiving uploads to {uploads_file}"))
            if not dry_run:
                with tqdm(desc=_("Archiving uploads"), total=1, disable=not verbose) as pbar:
                    shutil.make_archive(str(uploads_file).replace(".tar.gz", ""), "gztar", "web/app/uploads")
                    pbar.update(1)
            backup_files.append(uploads_file)

        # Calculate total size
        total_size = sum(f.stat().st_size for f in backup_files if f.exists())

        # Sync to Google Drive
        gdrive_synced = False
        if gdrive:
            logger.info(_("Syncing backup(s) to Google Drive via rclone..."))
            gdrive_creds_file = get_gdrive_creds()
            try:
                for f in tqdm(backup_files, desc=_("Uploading to GDrive"), disable=not verbose):
                    if not dry_run:
                        run_rclone(f"rclone copy {f} gdrive:{gdrive_folder}/", gdrive_creds_file)
                gdrive_synced = True
            except Exception as e:
                logger.error(f"Google Drive sync failed: {e}")
                # Continue with backup even if GDrive fails
            finally:
                if gdrive_creds_file.exists():
                    os.unlink(gdrive_creds_file)  # Clean up temp creds

        # Apply retention policy
        cleanup_old_backups(backup_dir, retention, dry_run, verbose)

        # Calculate duration
        duration = (datetime.now() - start_time).total_seconds()

        # Create result
        result = BackupResult(
            success=True,
            backup_type=backup_type,
            files=backup_files,
            size_bytes=total_size,
            duration_seconds=duration,
            gdrive_synced=gdrive_synced,
            metadata={
                "timestamp": start_time.isoformat(),
                "gdrive_folder": gdrive_folder,
                "retention_applied": retention
            }
        )

        # Save status
        backup_status.save_status(result)

        if verbose:
            logger.info(_(f"Backup completed successfully in {duration:.2f}s"))
            logger.info(_(f"Total size: {total_size:,} bytes"))
            if gdrive_synced:
                logger.info(_("Synced to Google Drive"))

        return result

    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        result = BackupResult(
            success=False,
            backup_type=backup_type if 'backup_type' in locals() else "unknown",
            files=backup_files if 'backup_files' in locals() else [],
            size_bytes=0,
            duration_seconds=duration,
            error_message=str(e),
            gdrive_synced=False
        )
        backup_status.save_status(result)
        logger.error(f"Backup failed: {e}")
        return result

def cleanup_old_backups(backup_dir: Path, retention: int, dry_run: bool = False, verbose: bool = False) -> None:
    """Clean up old backup files based on retention policy."""
    try:
        # Get all backup files sorted by modification time
        db_files = sorted(backup_dir.glob("db_*.sql"), key=lambda x: x.stat().st_mtime, reverse=True)
        upload_files = sorted(backup_dir.glob("uploads_*.tar.gz"), key=lambda x: x.stat().st_mtime, reverse=True)

        # Keep only the most recent N files of each type
        db_to_delete = db_files[retention:] if len(db_files) > retention else []
        uploads_to_delete = upload_files[retention:] if len(upload_files) > retention else []

        files_to_delete = db_to_delete + uploads_to_delete

        if files_to_delete:
            for f in tqdm(files_to_delete, desc=_("Deleting old backups"), disable=not verbose):
                logger.warning(_(f"Deleting old backup: {f}"))
                if not dry_run:
                    f.unlink()

            if verbose:
                logger.info(_(f"Cleaned up {len(files_to_delete)} old backup files"))
        else:
            if verbose:
                logger.info(_("No old backups to clean up"))

    except Exception as e:
        logger.error(f"Backup cleanup failed: {e}")

@app.command()
def backup_command(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    db: bool = typer.Option(True, "--db/--no-db", help=_("Backup database")),
    uploads: bool = typer.Option(True, "--uploads/--no-uploads", help=_("Backup uploads")),
    gdrive: bool = typer.Option(False, "--gdrive", help=_("Backup to Google Drive")),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help=_("Google Drive folder")),
    retention: int = typer.Option(7, "--retention", help=_("Number of backups to keep")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    result = backup(Path(project_dir).resolve(), db, uploads, gdrive, gdrive_folder, retention, dry_run, verbose)

    if result.success:
        typer.secho(_("✅ Backup completed successfully!"), fg=typer.colors.GREEN)
        typer.echo(_(f"Type: {result.backup_type}"))
        typer.echo(_(f"Size: {result.size_bytes:,} bytes"))
        typer.echo(_(f"Duration: {result.duration_seconds:.2f}s"))
        if result.gdrive_synced:
            typer.echo(_("☁️ Synced to Google Drive"))
        for file_path in result.files:
            typer.echo(_(f"📁 {file_path}"))
    else:
        typer.secho(_("❌ Backup failed!"), fg=typer.colors.RED)
        typer.echo(result.error_message)
        raise typer.Exit(1)

@app.command()
def restore(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    db_file: str = typer.Option(None, "--db-file", help=_("DB backup file")),
    uploads_file: str = typer.Option(None, "--uploads-file", help=_("Uploads backup file")),
    gdrive: bool = typer.Option(False, "--gdrive", help=_("Restore from Google Drive")),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help=_("Google Drive folder")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Restore DB and/or uploads from backup (local or Google Drive)."""
    os.chdir(Path(project_dir).resolve())
    backup_dir = Path(project_dir).resolve() / BACKUP_DIR
    if gdrive:
        logger.info(_("Fetching backup(s) from Google Drive via rclone..."))
        check_rclone_config(dry_run)
        gdrive_creds_file = get_gdrive_creds()
        files_to_fetch = []
        if db_file:
            files_to_fetch.append(db_file)
        if uploads_file:
            files_to_fetch.append(uploads_file)
        for f in tqdm(files_to_fetch, desc=_("Downloading from GDrive"), disable=not verbose):
            if not dry_run:
                run_rclone(f"rclone copy gdrive:{gdrive_folder}/{f} {backup_dir}/", gdrive_creds_file)
        os.unlink(gdrive_creds_file)
    if db_file:
        db_path = backup_dir / db_file
        logger.info(_(f"Restoring DB from {db_path}"))
        if not dry_run:
            run_shell(f"ddev import-db --file {db_path}", dry_run)
    if uploads_file:
        uploads_path = backup_dir / uploads_file
        logger.info(_(f"Restoring uploads from {uploads_path}"))
        if not dry_run:
            with tqdm(desc=_("Extracting uploads"), total=1, disable=not verbose) as pbar:
                shutil.unpack_archive(uploads_path, "web/app/uploads", "gztar")
                pbar.update(1)

@app.command()
def db(
    project_dir: str = typer.Option(".", "--project-dir")
):
    """Backup only the database."""
    backup(Path(project_dir).resolve(), db=True, uploads=False)

@app.command()
def uploads(
    project_dir: str = typer.Option(".", "--project-dir")
):
    """Backup only uploads."""
    backup(Path(project_dir).resolve(), db=False, uploads=True)

@app.command()
def status(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    detailed: bool = typer.Option(False, "--detailed", help=_("Show detailed information"))
):
    """Show backup status and history."""
    project_path = Path(project_dir).resolve()
    backup_status = BackupStatus(project_path)

    latest_status = backup_status.get_latest_status()

    if not latest_status:
        typer.secho(_("No backup history found"), fg=typer.colors.YELLOW)
        return

    # Display latest backup status
    timestamp = latest_status.get("timestamp", "Unknown")
    success = latest_status.get("success", False)

    if success:
        typer.secho(_("✅ Latest backup successful"), fg=typer.colors.GREEN)
    else:
        typer.secho(_("❌ Latest backup failed"), fg=typer.colors.RED)

    typer.echo(_(f"Timestamp: {timestamp}"))
    typer.echo(_(f"Type: {latest_status.get('backup_type', 'Unknown')}"))
    typer.echo(_(f"Size: {latest_status.get('size_bytes', 0):,} bytes"))
    typer.echo(_(f"Duration: {latest_status.get('duration_seconds', 0):.2f}s"))

    if latest_status.get('gdrive_synced', False):
        typer.echo(_("☁️ Synced to Google Drive"))

    if latest_status.get('error_message'):
        typer.secho(_(f"Error: {latest_status['error_message']}"), fg=typer.colors.RED)

    if detailed and latest_status.get('metadata'):
        typer.echo(_("\n📊 Metadata:"))
        for key, value in latest_status['metadata'].items():
            typer.echo(f"  {key}: {value}")

@app.command()
def list_backups(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    backup_type: str = typer.Option("all", "--type", help=_("Backup type: db, uploads, or all"))
):
    """List available backup files."""
    project_path = Path(project_dir).resolve()
    backup_dir = project_path / BACKUP_DIR

    if not backup_dir.exists():
        typer.secho(_("No backup directory found"), fg=typer.colors.YELLOW)
        return

    if backup_type == "all":
        files = sorted(backup_dir.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True)
    elif backup_type == "db":
        files = sorted(backup_dir.glob("db_*.sql"), key=lambda x: x.stat().st_mtime, reverse=True)
    elif backup_type == "uploads":
        files = sorted(backup_dir.glob("uploads_*.tar.gz"), key=lambda x: x.stat().st_mtime, reverse=True)
    else:
        typer.secho(_("Invalid backup type. Use: db, uploads, or all"), fg=typer.colors.RED)
        return

    if not files:
        typer.secho(_("No backup files found"), fg=typer.colors.YELLOW)
        return

    typer.secho(_(f"📁 Available backups ({len(files)} files):"), fg=typer.colors.BLUE)
    for f in files:
        size_mb = f.stat().st_size / (1024 * 1024)
        mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        typer.echo(f"  {f.name} ({size_mb:.1f}MB, {mtime})")

@app.command()
def schedule(
    cron: str = typer.Option("0 0 * * *", "--cron", help=_("Cron expression for scheduling")),
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    gdrive: bool = typer.Option(True, "--gdrive"),
    use_celery: bool = typer.Option(False, "--celery", help=_("Generate Celery task instead of cron"))
):
    """Generate backup scheduling configuration."""
    project_path = Path(project_dir).resolve()
    cmd = f"cd {project_path} && python -m forge sync backup --gdrive={gdrive}"

    if use_celery:
        # Generate Celery task configuration
        celery_config = f'''
# Add to your Celery tasks.py
from celery import Celery
from forge.commands.sync import backup

@celery.task(bind=True)
def scheduled_backup(self, project_dir: str, db: bool = True, uploads: bool = True, gdrive: bool = True):
    """Scheduled backup task for Celery."""
    result = backup(
        project_dir=Path(project_dir),
        db=db,
        uploads=uploads,
        gdrive=gdrive,
        verbose=True
    )

    if result.success:
        self.update_state(
            state='SUCCESS',
            meta={{
                'backup_type': result.backup_type,
                'size_bytes': result.size_bytes,
                'duration_seconds': result.duration_seconds,
                'gdrive_synced': result.gdrive_synced
            }}
        )
        return {{'status': 'success', 'result': result.__dict__}}
    else:
        self.update_state(
            state='FAILURE',
            meta={{'error': result.error_message}}
        )
        return {{'status': 'failed', 'error': result.error_message}}

# Schedule with Celery Beat:
# CELERYBEAT_SCHEDULE = {{
#     'daily-backup': {{
#         'task': 'scheduled_backup',
#         'schedule': crontab(minute=0, hour=0),  # Daily at midnight
#         'args': ("{project_path}",)
#     }},
# }}
        '''

        typer.secho(_("🐬 Celery task configuration:"), fg=typer.colors.BLUE)
        typer.echo(celery_config)
    else:
        # Traditional cron scheduling
        typer.secho(_("⏰ Add to crontab:"), fg=typer.colors.BLUE)
        typer.echo(f"{cron} {cmd}")
        typer.echo(_("\nOr use:"))
        typer.echo(f"(crontab -l 2>/dev/null; echo '{cron} {cmd}') | crontab -")

@app.command()
def configure(
    smtp_server: str = typer.Option("", "--smtp-server", help=_("SMTP server for alerts")),
    smtp_port: int = typer.Option(587, "--smtp-port", help=_("SMTP port")),
    smtp_user: str = typer.Option("", "--smtp-user", help=_("SMTP username")),
    smtp_password: str = typer.Option("", "--smtp-password", help=_("SMTP password")),
    admin_email: str = typer.Option("", "--admin-email", help=_("Admin email for alerts")),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help=_("Google Drive folder")),
    retention_days: int = typer.Option(7, "--retention", help=_("Default retention days")),
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory"))
):
    """Configure backup system settings."""
    project_path = Path(project_dir).resolve()

    # Import backup config
    from ..config.backup_config import BackupConfigManager, EmailConfig, initialize_config

    try:
        # Initialize or load config
        manager = BackupConfigManager(project_path / ".ddev" / "backup_config.json")

        # Update email configuration if provided
        if smtp_server or admin_email:
            email_config = manager.get_email_config()
            if smtp_server:
                email_config.smtp_server = smtp_server
            if smtp_port != 587:
                email_config.smtp_port = smtp_port
            if smtp_user:
                email_config.smtp_user = smtp_user
            if smtp_password:
                email_config.smtp_password = smtp_password
            if admin_email:
                email_config.admin_email = admin_email
            manager.update_email_config(email_config)

        # Update Google Drive configuration
        gdrive_provider = manager.get_cloud_provider("google_drive")
        if gdrive_provider:
            gdrive_provider.config["folder"] = gdrive_folder

        # Update default schedule retention
        default_schedule = manager.get_schedule("daily_backup")
        if default_schedule:
            default_schedule.retention_days = retention_days

        # Save configuration
        manager.save_config()

        typer.secho(_("✅ Backup configuration updated successfully!"), fg=typer.colors.GREEN)
        typer.echo(_(f"Configuration saved to: {manager.config_file}"))

        # Show current configuration
        typer.echo(_("\n📋 Current Configuration:"))
        email_config = manager.get_email_config()
        typer.echo(f"📧 Email alerts: {'Enabled' if email_config.admin_email else 'Disabled'}")
        if email_config.admin_email:
            typer.echo(f"   Admin email: {email_config.admin_email}")
            typer.echo(f"   SMTP server: {email_config.smtp_server}:{email_config.smtp_port}")

        gdrive_provider = manager.get_cloud_provider("google_drive")
        if gdrive_provider and gdrive_provider.enabled:
            typer.echo(f"☁️ Google Drive: Enabled (folder: {gdrive_provider.config.get('folder', 'N/A')})")

        schedules = manager.get_enabled_schedules()
        typer.echo(f"⏰ Active schedules: {len(schedules)}")
        for schedule in schedules:
            typer.echo(f"   - {schedule.name}: {schedule.cron_expression}")

    except Exception as e:
        typer.secho(f"❌ Configuration failed: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

@app.command()
def config_show(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    detailed: bool = typer.Option(False, "--detailed", help=_("Show detailed configuration"))
):
    """Show current backup configuration."""
    project_path = Path(project_dir).resolve()

    from ..config.backup_config import BackupConfigManager

    try:
        manager = BackupConfigManager(project_path / ".ddev" / "backup_config.json")
        config = manager.config

        typer.secho(_("🔧 Backup Configuration"), fg=typer.colors.BLUE)
        typer.echo(f"Project: {project_path}")
        typer.echo(f"Config file: {manager.config_file}")
        typer.echo(f"Backup directory: {config.backup_directory}")

        typer.echo(_("\n📧 Email Configuration"))
        email = config.email
        if email.admin_email:
            typer.echo(f"Status: ✅ Enabled")
            typer.echo(f"Admin email: {email.admin_email}")
            typer.echo(f"SMTP: {email.smtp_server}:{email.smtp_port}")
            typer.echo(f"Alert on success: {'Yes' if email.alert_on_success else 'No'}")
            typer.echo(f"Alert on failure: {'Yes' if email.alert_on_failure else 'No'}")
        else:
            typer.echo(f"Status: ❌ Disabled")

        typer.echo(_("\n☁️ Cloud Providers"))
        for provider in config.cloud_providers:
            status = "✅ Enabled" if provider.enabled else "❌ Disabled"
            typer.echo(f"- {provider.name}: {status}")
            if provider.enabled and detailed:
                for key, value in provider.config.items():
                    typer.echo(f"  {key}: {value}")

        typer.echo(_("\n⏰ Backup Schedules"))
        for schedule in config.schedules:
            status = "✅ Active" if schedule.enabled else "❌ Inactive"
            typer.echo(f"- {schedule.name}: {status}")
            typer.echo(f"  Cron: {schedule.cron_expression}")
            typer.echo(f"  Database: {'Yes' if schedule.backup_db else 'No'}")
            typer.echo(f"  Uploads: {'Yes' if schedule.backup_uploads else 'No'}")
            typer.echo(f"  Cloud sync: {'Yes' if schedule.backup_to_cloud else 'No'}")
            typer.echo(f"  Retention: {schedule.retention_days} days")

        if detailed:
            typer.echo(_("\n🔍 Monitoring Configuration"))
            monitoring = config.monitoring
            typer.echo(f"Max backup age: {monitoring.max_backup_age_hours} hours")
            typer.echo(f"Failure threshold: {monitoring.consecutive_failure_threshold}")
            typer.echo(f"Success rate threshold: {monitoring.success_rate_threshold}%")
            typer.echo(f"Storage warning: {monitoring.storage_warning_mb} MB")
            typer.echo(f"Prometheus: {'Enabled' if monitoring.prometheus_enabled else 'Disabled'}")

    except Exception as e:
        typer.secho(f"❌ Failed to show configuration: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

@app.command()
def health(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    max_age_hours: int = typer.Option(24, "--max-age", help=_("Maximum backup age in hours")),
    output_file: str = typer.Option("", "--output", help=_("Save health report to file"))
):
    """Check backup system health."""
    project_path = Path(project_dir).resolve()

    from ..monitoring.backup_monitor import BackupMonitor, generate_health_report

    try:
        if output_file:
            report = generate_health_report(project_path, Path(output_file))
            typer.secho(_("📊 Health report generated"), fg=typer.colors.GREEN)
            typer.echo(f"Report saved to: {output_file}")
        else:
            monitor = BackupMonitor(project_path)
            health = monitor.health_check(max_age_hours)

            if health.healthy:
                typer.secho(_("✅ Backup system is healthy"), fg=typer.colors.GREEN)
            else:
                typer.secho(_("❌ Backup system has issues"), fg=typer.colors.RED)

            typer.echo(_(f"\n📈 Key Metrics:"))
            typer.echo(f"Last backup age: {health.last_backup_age_hours:.1f} hours")
            typer.echo(f"Success rate: {health.success_rate:.1f}%")
            typer.echo(f"Consecutive failures: {health.consecutive_failures}")
            typer.echo(f"Storage usage: {health.storage_usage_mb:.1f} MB")

            if health.issues:
                typer.secho(_("\n❌ Issues:"), fg=typer.colors.RED)
                for issue in health.issues:
                    typer.echo(f"  • {issue}")

            if health.warnings:
                typer.secho(_("\n⚠️ Warnings:"), fg=typer.colors.YELLOW)
                for warning in health.warnings:
                    typer.echo(f"  • {warning}")

            if health.recommendations:
                typer.secho(_("\n💡 Recommendations:"), fg=typer.colors.BLUE)
                for rec in health.recommendations:
                    typer.echo(f"  • {rec}")

    except Exception as e:
        typer.secho(f"❌ Health check failed: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

if __name__ == "__main__":
    app()