"""
Celery application configuration.

Centralized Celery app with Redis broker, task routing, and Beat schedules.
"""
from celery import Celery
from celery.schedules import crontab

from .config import settings

# Create Celery app
celery_app = Celery(
    "bedrock_forge",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# Configure Celery
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone=settings.APP_TIMEZONE,
    enable_utc=True,
    
    # Task settings
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    task_soft_time_limit=3300,  # Soft limit 55 minutes

    # Worker settings
    worker_prefetch_multiplier=1,  # Disable prefetching for long tasks
    worker_concurrency=4,
    
    # Result backend settings
    result_expires=86400,  # 24 hours

    # Beat scheduler - use in-memory scheduler with DB polling task
    beat_max_loop_interval=60,  # Check for new schedules every minute
    
    # Task routing
    task_routes={
        "forge.tasks.monitor_tasks.*": {"queue": "monitoring"},
        "forge.tasks.server_monitors.*": {"queue": "monitoring"},
        "forge.tasks.backup_tasks.*": {"queue": "backups"},
        "forge.tasks.scheduled_backup_tasks.*": {"queue": "backups"},
        "forge.tasks.celery_tasks.*": {"queue": "backups"},
        "forge.tasks.deploy_tasks.*": {"queue": "deploy"},
        "forge.tasks.clone_tasks.*": {"queue": "clone"},
        "forge.tasks.sync_tasks.*": {"queue": "sync"},
    },
    
    # Default queue
    task_default_queue="default",
)

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    # Monitor checks - every 5 minutes
    "check-all-monitors": {
        "task": "forge.tasks.monitor_tasks.run_all_monitors",
        "schedule": crontab(minute="*/5"),
    },
    
    # Server health checks - hourly
    "check-server-health": {
        "task": "forge.tasks.sync_tasks.check_all_servers",
        "schedule": crontab(minute=0),
    },
    
    # Scheduled backups are handled by scheduled_backup_tasks.process_due_schedules

    # Process due schedules (checks DB every minute)
    "process-backup-schedules": {
        "task": "forge.tasks.scheduled_backup_tasks.process_due_schedules",
        "schedule": 60.0,
    },
    
    # Weekly cleanup - Sunday 3 AM
    "weekly-cleanup": {
        "task": "forge.tasks.backup_tasks.cleanup_old_backups",
        "schedule": crontab(minute=0, hour=3, day_of_week=0),
    },

    # Cleanup orphaned backups daily
    "cleanup-orphaned-backups": {
        "task": "forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups",
        "schedule": crontab(minute=30, hour=3),
        "args": ("local",),
    },

    # Apply retention policies hourly
    "apply-retention-policies": {
        "task": "forge.tasks.scheduled_backup_tasks.apply_retention_all",
        "schedule": crontab(minute=0),
    },

    # Backup monitoring every 6 hours
    "backup-monitoring": {
        "task": "forge.tasks.celery_tasks.backup_monitor",
        "schedule": crontab(minute=0, hour="*/6"),
        "args": (".",),
    },
    
    # Calculate uptime stats - daily at midnight
    "calculate-uptime": {
        "task": "forge.tasks.monitor_tasks.calculate_uptime_stats",
        "schedule": crontab(minute=0, hour=0),
    },
    
    # SSL certificate checks - daily at 6 AM
    "check-ssl-certificates": {
        "task": "forge.tasks.monitor_tasks.check_ssl_certificates",
        "schedule": crontab(minute=0, hour=6),
    },
    
    # WP site scans - daily at 4 AM
    "scan-all-wp-sites": {
        "task": "forge.tasks.wp_tasks.scan_all_sites",
        "schedule": crontab(minute=0, hour=4),
    },
    
    # Heartbeat cleanup - daily at 4 AM (keep 30 days)
    "cleanup-old-heartbeats": {
        "task": "forge.tasks.monitor_tasks.cleanup_old_heartbeats",
        "schedule": crontab(minute=0, hour=4),
        "args": [30],  # 30-day retention
    },
    
    # Domain/SSL expiry check - daily at 8 AM
    "check-expiring-domains-ssl": {
        "task": "forge.tasks.expiry_tasks.check_expiring_domains_ssl",
        "schedule": crontab(minute=0, hour=8),
    },
}

# Auto-discover tasks
celery_app.autodiscover_tasks([
    "forge.tasks.monitor_tasks",
    "forge.tasks.backup_tasks",
    "forge.tasks.scheduled_backup_tasks",
    "forge.tasks.celery_tasks",
    "forge.tasks.deploy_tasks",
    "forge.tasks.clone_tasks",
    "forge.tasks.sync_tasks",
    "forge.tasks.server_monitors",
    "forge.tasks.wp_tasks",
    "forge.tasks.expiry_tasks",
])

