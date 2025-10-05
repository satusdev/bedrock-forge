"""
Celery tasks for automated backup scheduling and monitoring.

This module provides Celery tasks for:
- Scheduled backups with Celery Beat
- Backup status monitoring
- Alert notifications for failed backups
- Backup rotation and cleanup
"""

from celery import Celery
from celery.schedules import crontab
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from ..commands.sync import backup, BackupResult, BackupStatus
from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.config import get_config

# Create Celery app
celery_app = Celery('forge_backups')

# Configure Celery
celery_app.config_from_object({
    'broker_url': 'redis://localhost:6379/0',
    'result_backend': 'redis://localhost:6379/0',
    'task_serializer': 'json',
    'accept_content': ['json'],
    'result_serializer': 'json',
    'timezone': 'UTC',
    'enable_utc': True,
    'beat_schedule': {},
    'task_routes': {
        'forge.tasks.celery_tasks.scheduled_backup': {'queue': 'backups'},
        'forge.tasks.celery_tasks.cleanup_backups': {'queue': 'maintenance'},
        'forge.tasks.celery_tasks.backup_monitor': {'queue': 'monitoring'},
    }
})

# Default backup schedule (daily at 2 AM)
celery_app.conf.beat_schedule.update({
    'daily-backup': {
        'task': 'forge.tasks.celery_tasks.scheduled_backup',
        'schedule': crontab(minute=0, hour=2),
        'args': (".", True, True, True),  # project_dir, db, uploads, gdrive
    },
    'weekly-cleanup': {
        'task': 'forge.tasks.celery_tasks.cleanup_backups',
        'schedule': crontab(minute=30, hour=3, day_of_week=0),  # Sunday 3:30 AM
        'args': (".", 7),  # project_dir, retention
    },
    'backup-monitoring': {
        'task': 'forge.tasks.celery_tasks.backup_monitor',
        'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
        'args': (".",),  # project_dir
    }
})


class BackupAlertManager:
    """Handle backup alert notifications."""

    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or get_config()
        self.smtp_server = self.config.get('smtp_server', 'localhost')
        self.smtp_port = self.config.get('smtp_port', 587)
        self.smtp_user = self.config.get('smtp_user')
        self.smtp_password = self.config.get('smtp_password')
        self.admin_email = self.config.get('admin_email')

    def send_backup_alert(self, result: BackupResult, project_dir: Path) -> bool:
        """Send backup alert email."""
        if not self.admin_email:
            logger.warning("No admin email configured for alerts")
            return False

        try:
            msg = MIMEMultipart()
            msg['From'] = self.smtp_user or "forge-backups@localhost"
            msg['To'] = self.admin_email
            msg['Subject'] = f"Backup {'Success' if result.success else 'Failed'} - {project_dir.name}"

            # Build email body
            body = self._build_alert_email(result, project_dir)
            msg.attach(MIMEText(body, 'html'))

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                if self.smtp_user and self.smtp_password:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"Backup alert sent to {self.admin_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send backup alert: {e}")
            return False

    def _build_alert_email(self, result: BackupResult, project_dir: Path) -> str:
        """Build HTML email content for backup alert."""
        status_color = "green" if result.success else "red"
        status_icon = "✅" if result.success else "❌"

        html = f"""
        <html>
        <body>
            <h2>{status_icon} Backup { 'Success' if result.success else 'Failed' }</h2>

            <h3>Project Information</h3>
            <p><strong>Project:</strong> {project_dir}</p>
            <p><strong>Timestamp:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

            <h3>Backup Details</h3>
            <ul>
                <li><strong>Type:</strong> {result.backup_type}</li>
                <li><strong>Size:</strong> {result.size_bytes:,} bytes ({result.size_bytes / (1024*1024):.1f} MB)</li>
                <li><strong>Duration:</strong> {result.duration_seconds:.2f} seconds</li>
                <li><strong>Files:</strong> {len(result.files)} backup file(s)</li>
            </ul>

            {'<p><strong>☁️ Google Drive:</strong> Synced successfully</p>' if result.gdrive_synced else ''}

            {f'<p><strong>❌ Error:</strong> {result.error_message}</p>' if result.error_message else ''}

            {'<p><strong>Files Created:</strong></p><ul>' + ''.join([f'<li>{file_path.name}</li>' for file_path in result.files]) + '</ul>' if result.files else ''}

            <hr>
            <p><em>Generated by Forge Backup System</em></p>
        </body>
        </html>
        """
        return html


@celery_app.task(bind=True, max_retries=3)
def scheduled_backup(self, project_dir: str, db: bool = True, uploads: bool = True,
                    gdrive: bool = True, gdrive_folder: str = "forge-backups",
                    retention: int = 7, send_alerts: bool = True):
    """
    Scheduled backup task for Celery.

    Args:
        project_dir: Project directory path
        db: Backup database
        uploads: Backup uploads
        gdrive: Sync to Google Drive
        gdrive_folder: Google Drive folder name
        retention: Number of backups to retain
        send_alerts: Send alert notifications
    """
    project_path = Path(project_dir)

    try:
        # Update task state
        self.update_state(
            state='PROGRESS',
            meta={'status': 'Starting backup', 'progress': 0}
        )

        logger.info(f"Starting scheduled backup for {project_path}")

        # Perform backup
        result = backup(
            project_dir=project_path,
            db=db,
            uploads=uploads,
            gdrive=gdrive,
            gdrive_folder=gdrive_folder,
            retention=retention,
            verbose=True
        )

        if result.success:
            # Success
            self.update_state(
                state='SUCCESS',
                meta={
                    'status': 'Backup completed successfully',
                    'backup_type': result.backup_type,
                    'size_bytes': result.size_bytes,
                    'duration_seconds': result.duration_seconds,
                    'gdrive_synced': result.gdrive_synced,
                    'files': [str(f) for f in result.files]
                }
            )

            # Send success alert if configured
            if send_alerts:
                alert_manager = BackupAlertManager()
                alert_manager.send_backup_alert(result, project_path)

            logger.info(f"Scheduled backup completed for {project_path}")
            return {
                'status': 'success',
                'result': {
                    'backup_type': result.backup_type,
                    'size_bytes': result.size_bytes,
                    'duration_seconds': result.duration_seconds,
                    'gdrive_synced': result.gdrive_synced,
                    'files': [str(f) for f in result.files]
                }
            }
        else:
            # Failure
            error_msg = f"Backup failed: {result.error_message}"
            logger.error(error_msg)

            # Send failure alert
            if send_alerts:
                alert_manager = BackupAlertManager()
                alert_manager.send_backup_alert(result, project_path)

            raise Exception(error_msg)

    except Exception as exc:
        logger.error(f"Scheduled backup failed for {project_path}: {exc}")

        # Retry logic
        if self.request.retries < self.max_retries:
            # Exponential backoff
            countdown = 2 ** self.request.retries * 300  # 5, 10, 20 minutes
            logger.info(f"Retrying backup in {countdown} seconds...")
            raise self.retry(exc=exc, countdown=countdown)

        # Final failure - send alert
        if send_alerts:
            failed_result = BackupResult(
                success=False,
                backup_type="scheduled",
                files=[],
                size_bytes=0,
                duration_seconds=0,
                error_message=str(exc),
                gdrive_synced=False
            )
            alert_manager = BackupAlertManager()
            alert_manager.send_backup_alert(failed_result, project_path)

        raise


@celery_app.task
def cleanup_backups(project_dir: str, retention: int = 7):
    """
    Cleanup old backup files based on retention policy.

    Args:
        project_dir: Project directory path
        retention: Number of backups to retain
    """
    project_path = Path(project_dir)
    backup_dir = project_path / ".ddev" / "backups"

    if not backup_dir.exists():
        logger.info(f"No backup directory found at {backup_dir}")
        return {'status': 'skipped', 'reason': 'No backup directory'}

    try:
        # Get all backup files sorted by modification time
        db_files = sorted(backup_dir.glob("db_*.sql"), key=lambda x: x.stat().st_mtime, reverse=True)
        upload_files = sorted(backup_dir.glob("uploads_*.tar.gz"), key=lambda x: x.stat().st_mtime, reverse=True)

        # Determine files to delete
        db_to_delete = db_files[retention:] if len(db_files) > retention else []
        uploads_to_delete = upload_files[retention:] if len(upload_files) > retention else []

        files_to_delete = db_to_delete + uploads_to_delete

        # Delete old files
        deleted_count = 0
        total_size_freed = 0

        for f in files_to_delete:
            file_size = f.stat().st_size
            f.unlink()
            deleted_count += 1
            total_size_freed += file_size
            logger.info(f"Deleted old backup: {f.name}")

        logger.info(f"Backup cleanup completed. Deleted {deleted_count} files, freed {total_size_freed:,} bytes")

        return {
            'status': 'success',
            'deleted_files': deleted_count,
            'size_freed': total_size_freed,
            'files_deleted': [f.name for f in files_to_delete]
        }

    except Exception as e:
        logger.error(f"Backup cleanup failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }


@celery_app.task
def backup_monitor(project_dir: str, max_age_hours: int = 24):
    """
    Monitor backup status and alert if backups are too old or missing.

    Args:
        project_dir: Project directory path
        max_age_hours: Maximum age in hours for last successful backup
    """
    project_path = Path(project_dir)
    backup_status = BackupStatus(project_path)

    try:
        latest_status = backup_status.get_latest_status()

        if not latest_status:
            # No backup history
            logger.warning(f"No backup history found for {project_path}")
            return {
                'status': 'warning',
                'message': 'No backup history found'
            }

        # Check backup age
        timestamp_str = latest_status.get('timestamp')
        if timestamp_str:
            backup_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            age_hours = (datetime.now(backup_time.tzinfo) - backup_time).total_seconds() / 3600

            if age_hours > max_age_hours:
                # Backup is too old
                warning_msg = f"Last backup is {age_hours:.1f} hours old (older than {max_age_hours}h limit)"
                logger.warning(warning_msg)

                # Send alert
                alert_manager = BackupAlertManager()
                old_backup_result = BackupResult(
                    success=False,
                    backup_type="monitor",
                    files=[],
                    size_bytes=0,
                    duration_seconds=0,
                    error_message=f"Backup monitoring alert: {warning_msg}",
                    gdrive_synced=False
                )
                alert_manager.send_backup_alert(old_backup_result, project_path)

                return {
                    'status': 'warning',
                    'message': warning_msg,
                    'age_hours': age_hours
                }

        # Check if last backup failed
        if not latest_status.get('success', False):
            error_msg = latest_status.get('error_message', 'Unknown error')
            logger.warning(f"Last backup failed: {error_msg}")

            return {
                'status': 'failed',
                'message': 'Last backup failed',
                'error': error_msg
            }

        # Everything looks good
        logger.info(f"Backup monitoring passed for {project_path}")
        return {
            'status': 'success',
            'message': 'Backup status is healthy'
        }

    except Exception as e:
        logger.error(f"Backup monitoring failed: {e}")
        return {
            'status': 'error',
            'message': f'Monitoring failed: {str(e)}'
        }


# Helper functions for managing backup schedules
def add_backup_schedule(schedule_name: str, cron_expression: str, project_dir: str,
                       db: bool = True, uploads: bool = True, gdrive: bool = True):
    """
    Add a custom backup schedule to Celery Beat.

    Args:
        schedule_name: Name for the schedule
        cron_expression: Cron expression (e.g., "0 2 * * *")
        project_dir: Project directory path
        db: Backup database
        uploads: Backup uploads
        gdrive: Sync to Google Drive
    """
    # Parse cron expression
    parts = cron_expression.split()
    if len(parts) != 5:
        raise ValueError("Invalid cron expression. Must have 5 parts: minute hour day month weekday")

    minute, hour, day, month, weekday = parts

    celery_app.conf.beat_schedule[schedule_name] = {
        'task': 'forge.tasks.celery_tasks.scheduled_backup',
        'schedule': crontab(minute=minute, hour=hour, day_of_month=day, month_of_year=month, day_of_week=weekday),
        'args': (project_dir, db, uploads, gdrive)
    }

    logger.info(f"Added backup schedule '{schedule_name}' with cron '{cron_expression}'")


def remove_backup_schedule(schedule_name: str):
    """Remove a backup schedule from Celery Beat."""
    if schedule_name in celery_app.conf.beat_schedule:
        del celery_app.conf.beat_schedule[schedule_name]
        logger.info(f"Removed backup schedule '{schedule_name}'")
    else:
        logger.warning(f"Backup schedule '{schedule_name}' not found")


def list_backup_schedules() -> Dict[str, Dict]:
    """List all current backup schedules."""
    return {
        name: config for name, config in celery_app.conf.beat_schedule.items()
        if config.get('task') == 'forge.tasks.celery_tasks.scheduled_backup'
    }


if __name__ == '__main__':
    # Start Celery worker
    celery_app.start()