"""
Celery application configuration for Forge.

This module configures the main Celery app with:
- Redis broker and backend
- Database scheduler for dynamic backup schedules
- Task routes and queues
- Beat schedule for system tasks
"""
import os
from celery import Celery
from celery.schedules import crontab

# Create Celery app
celery_app = Celery(
    "forge",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
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
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 min soft limit
    
    # Result settings
    result_expires=86400,  # 24 hours
    
    # Worker settings
    worker_prefetch_multiplier=1,  # Disable prefetching for long tasks
    worker_concurrency=4,
    
    # Beat scheduler - use database scheduler for dynamic schedules
    beat_scheduler="forge.api.celery_schedule_loader:DatabaseScheduler",
    beat_max_loop_interval=60,  # Check for new schedules every minute
    
    # Task routes
    task_routes={
        "forge.tasks.scheduled_backup_tasks.*": {"queue": "backups"},
        "forge.tasks.backup_tasks.*": {"queue": "backups"},
        "forge.tasks.celery_tasks.scheduled_backup": {"queue": "backups"},
        "forge.tasks.celery_tasks.cleanup_backups": {"queue": "maintenance"},
        "forge.tasks.celery_tasks.backup_monitor": {"queue": "monitoring"},
        "forge.tasks.deploy_tasks.*": {"queue": "deploy"},
        "forge.tasks.sync_tasks.*": {"queue": "sync"},
        "forge.tasks.clone_tasks.*": {"queue": "clone"},
    },
    
    # Static beat schedule for system tasks
    # Note: Backup schedules are loaded dynamically from database
    beat_schedule={
        # Process due schedules (checks DB every minute)
        "process-backup-schedules": {
            "task": "forge.tasks.scheduled_backup_tasks.process_due_schedules",
            "schedule": 60.0,  # Every minute
        },
        # Cleanup orphaned backups daily
        "cleanup-orphaned-backups": {
            "task": "forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups",
            "schedule": crontab(minute=30, hour=3),  # 3:30 AM daily
            "args": ("local",),
        },
        # Apply retention policies hourly
        "apply-retention-policies": {
            "task": "forge.tasks.scheduled_backup_tasks.apply_retention_all",
            "schedule": crontab(minute=0),  # Every hour
        },
        # Backup monitoring every 6 hours
        "backup-monitoring": {
            "task": "forge.tasks.celery_tasks.backup_monitor",
            "schedule": crontab(minute=0, hour="*/6"),
            "args": (".",),
        },
    },
)

# Auto-discover tasks
celery_app.autodiscover_tasks([
    "forge.tasks.scheduled_backup_tasks",
    "forge.tasks.backup_tasks",
    "forge.tasks.celery_tasks",
    "forge.tasks.deploy_tasks",
    "forge.tasks.sync_tasks",
    "forge.tasks.clone_tasks",
    "forge.tasks.monitor_tasks",
    "forge.tasks.server_monitors",
    "forge.tasks.wp_tasks",
    "forge.tasks.expiry_tasks",
])


# Export for use in other modules
__all__ = ["celery_app"]
