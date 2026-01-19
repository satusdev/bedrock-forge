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
    timezone="UTC",
    enable_utc=True,
    
    # Task settings
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    task_soft_time_limit=3300,  # Soft limit 55 minutes
    
    # Result backend settings
    result_expires=86400,  # 24 hours
    
    # Task routing
    task_routes={
        "forge.tasks.monitor_tasks.*": {"queue": "monitoring"},
        "forge.tasks.backup_tasks.*": {"queue": "backups"},
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
    
    # Daily backups - 2 AM
    "daily-backups": {
        "task": "forge.tasks.backup_tasks.run_scheduled_backups",
        "schedule": crontab(minute=0, hour=2),
    },
    
    # Weekly cleanup - Sunday 3 AM
    "weekly-cleanup": {
        "task": "forge.tasks.backup_tasks.cleanup_old_backups",
        "schedule": crontab(minute=0, hour=3, day_of_week=0),
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
    "forge.tasks.sync_tasks",
    "forge.tasks.wp_tasks",
    "forge.tasks.expiry_tasks",
])

