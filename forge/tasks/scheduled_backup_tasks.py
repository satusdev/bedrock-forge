"""
Scheduled backup tasks for Celery Beat integration.

These tasks work with the BackupSchedule model to execute
automated backups based on configured schedules.
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from celery import shared_task

from ..db import AsyncSessionLocal
from ..services.backup import (
    BackupConfig,
    BackupConfigFactory,
    BackupSchedulerService,
    BackupService,
    RetentionService,
)
from ..services.backup.backup_service import normalize_storage_backend
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


@shared_task(
    name="forge.tasks.scheduled_backup_tasks.process_due_schedules",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_due_schedules(self):
    """
    Process all backup schedules that are due to run.
    
    This task should be run frequently (e.g., every minute) by Celery Beat.
    It checks for schedules where next_run <= now and triggers backups.
    """
    return run_async(_process_due_schedules())


async def _process_due_schedules() -> dict:
    """Process due backup schedules by delegating to _execute_single_backup."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from ..db.models.backup_schedule import BackupSchedule
    from ..db.models.project_server import ProjectServer
    
    results = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "schedules": [],
    }
    
    async with AsyncSessionLocal() as db:
        scheduler = BackupSchedulerService(db)
        
        # Get schedules that are due
        due_schedules = await scheduler.get_due_schedules(buffer_minutes=1)
        
        if not due_schedules:
            logger.debug("No backup schedules due")
            return results
        
        logger.info(f"Found {len(due_schedules)} backup schedules due")
        
        for schedule in due_schedules:
            results["processed"] += 1
            schedule_id = schedule.id
            
            try:
                # Delegate to unified execution function
                result = await _execute_single_backup(schedule_id, force=True)
                
                if result.get("success"):
                    results["success"] += 1
                    logger.info(f"Backup queued for schedule {schedule_id}")
                    
                    # Record success and update next_run
                    await scheduler.record_run(
                        schedule_id,
                        success=True,
                        error_message=None,
                    )
                    
                    # Apply retention policy asynchronously
                    retention = RetentionService(db)
                    try:
                        ret_result = await retention.apply_retention(
                            schedule, storage_type=normalize_storage_backend(schedule.storage_type)
                        )
                        if ret_result.deleted_count > 0:
                            logger.info(
                                f"Retention cleanup for {schedule_id}: "
                                f"deleted {ret_result.deleted_count} backups"
                            )
                    except Exception as ret_err:
                        logger.warning(f"Retention cleanup failed for {schedule_id}: {ret_err}")
                else:
                    results["failed"] += 1
                    error_msg = result.get("error", "Unknown error")
                    logger.error(f"Backup failed for schedule {schedule_id}: {error_msg}")
                    
                    await scheduler.record_run(
                        schedule_id,
                        success=False,
                        error_message=error_msg,
                    )
                
                results["schedules"].append({
                    "schedule_id": str(schedule_id),
                    "project": schedule.project.name if schedule.project else "Unknown",
                    "success": result.get("success", False),
                    "error": result.get("error"),
                    "backup_id": result.get("backup_id"),
                })
                
            except Exception as e:
                results["failed"] += 1
                logger.exception(f"Error processing schedule {schedule_id}")
                
                try:
                    await scheduler.record_run(
                        schedule_id,
                        success=False,
                        error_message=str(e),
                    )
                except Exception:
                    pass
                
                results["schedules"].append({
                    "schedule_id": str(schedule_id),
                    "success": False,
                    "error": str(e),
                })
    
    return results


@shared_task(
    name="forge.tasks.scheduled_backup_tasks.execute_single_backup",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def execute_single_backup(
    self,
    schedule_id: int,
    force: bool = False,
):
    """
    Execute a backup for a specific schedule.
    
    This task is called by Celery Beat based on the schedule's
    cron configuration loaded from the database.
    
    Args:
        schedule_id: ID of the backup schedule (int)
        force: If True, run even if not due
    """
    logger.info(f"Executing backup for schedule {schedule_id} (force={force})")
    return run_async(_execute_single_backup(schedule_id, force))


async def _execute_single_backup(schedule_id: int, force: bool = False) -> dict:
    """Execute backup for a specific schedule by creating a Backup record and delegating."""
    from datetime import datetime
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload, selectinload
    from ..db.models.backup import Backup, BackupStatus, BackupStorageType
    from ..db.models.backup_schedule import BackupSchedule
    from ..db.models.project_server import ProjectServer
    from .backup_tasks import create_environment_backup_task
    
    async with AsyncSessionLocal() as db:
        # Load schedule with all relationships
        stmt = (
            select(BackupSchedule)
            .where(BackupSchedule.id == schedule_id)
            .options(
                selectinload(BackupSchedule.project),
                selectinload(BackupSchedule.environment).selectinload(ProjectServer.server)
            )
        )
        result = await db.execute(stmt)
        schedule = result.scalar_one_or_none()
        
        if not schedule:
            return {
                "success": False,
                "error": f"Schedule {schedule_id} not found",
            }
        
        if not schedule.project:
            return {
                "success": False,
                "error": "No project associated with schedule",
            }
        
        env = schedule.environment
        if not env:
            return {
                "success": False, 
                "error": "No environment linked to schedule",
            }
        
        logger.info(f"Creating backup record for schedule {schedule_id} ({schedule.name})")
        
        # Determine storage backend
        storage_type_str = normalize_storage_backend(schedule.storage_type)
        storage_type = BackupStorageType.GOOGLE_DRIVE if storage_type_str == "gdrive" else (
            BackupStorageType.S3 if storage_type_str == "s3" else BackupStorageType.LOCAL
        )
        
        # Determine backup type string
        backup_type_str = schedule.backup_type.value if hasattr(schedule.backup_type, 'value') else str(schedule.backup_type)
        
        # Generate backup name
        env_label = env.environment.value.upper() if hasattr(env.environment, 'value') else str(env.environment).upper()
        backup_name = f"Backup {env_label} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        
        # Create Backup record
        backup = Backup(
            project_id=schedule.project_id,
            created_by_id=schedule.created_by_id,
            name=backup_name,
            backup_type=schedule.backup_type,
            storage_type=storage_type,
            storage_path="",  # Will be populated by task
            status=BackupStatus.PENDING,
            notes=f"Scheduled backup: {schedule.name}",
            project_server_id=env.id,
            started_at=datetime.utcnow()
        )
        db.add(backup)
        await db.flush()
        await db.refresh(backup)
        
        backup_id = backup.id
        await db.commit()
        
        logger.info(f"Created backup record {backup_id}, delegating to create_environment_backup_task")
        
        # Determine storage backends
        storage_backends = ["gdrive"] if storage_type_str == "gdrive" else (
            ["s3"] if storage_type_str == "s3" else ["local"]
        )
        
        # Get override folder ID if set on environment
        override_folder_id = env.gdrive_backups_folder_id if env else None
        
        # Delegate to the unified backup task
        create_environment_backup_task.delay(
            project_id=schedule.project_id,
            env_id=env.id,
            backup_id=backup_id,
            backup_type=backup_type_str,
            storage_backends=storage_backends,
            override_gdrive_folder_id=override_folder_id
        )
        
        return {
            "success": True,
            "message": "Backup started in background",
            "backup_id": backup_id,
            "schedule_id": schedule_id
        }

@shared_task(name="forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups")
def cleanup_orphaned_backups(storage_type: str = "local"):
    """
    Clean up backups for deleted schedules.
    
    Runs periodically to remove backup files that no longer
    have an associated schedule.
    """
    return run_async(_cleanup_orphaned_backups(storage_type))


async def _cleanup_orphaned_backups(storage_type: str) -> dict:
    """Clean up orphaned backups."""
    async with AsyncSessionLocal() as db:
        retention = RetentionService(db)
        result = await retention.cleanup_orphaned_backups(storage_type)
        
        return {
            "deleted_count": result.deleted_count,
            "deleted_size_bytes": result.deleted_size_bytes,
            "kept_count": result.kept_count,
            "errors": result.errors,
        }


@shared_task(name="forge.tasks.scheduled_backup_tasks.apply_retention_all")
def apply_retention_all():
    """
    Apply retention policies to all active schedules.
    
    This task ensures old backups are cleaned up according to
    each schedule's retention settings.
    """
    return run_async(_apply_retention_all())


async def _apply_retention_all() -> dict:
    """Apply retention to all schedules."""
    results = {
        "processed": 0,
        "deleted_total": 0,
        "freed_bytes": 0,
        "errors": [],
    }
    
    async with AsyncSessionLocal() as db:
        scheduler = BackupSchedulerService(db)
        retention = RetentionService(db)
        
        # Get all active schedules
        schedules = await scheduler.list_schedules(limit=1000)
        
        for schedule in schedules:
            results["processed"] += 1
            
            try:
                # Apply retention for the schedule's storage type
                ret_result = await retention.apply_retention(
                    schedule, storage_type=normalize_storage_backend(schedule.storage_type)
                )
                results["deleted_total"] += ret_result.deleted_count
                results["freed_bytes"] += ret_result.deleted_size_bytes
                results["errors"].extend(ret_result.errors)
                    
            except Exception as e:
                results["errors"].append(
                    f"Schedule {schedule.id}: {str(e)}"
                )
    
    return results


# Celery Beat schedule configuration
CELERY_BEAT_SCHEDULE = {
    "process-backup-schedules": {
        "task": "forge.tasks.scheduled_backup_tasks.process_due_schedules",
        "schedule": 60.0,  # Every minute
    },
    "cleanup-orphaned-backups": {
        "task": "forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups",
        "schedule": 86400.0,  # Daily
        "args": ("local",),
    },
    "apply-retention-policies": {
        "task": "forge.tasks.scheduled_backup_tasks.apply_retention_all",
        "schedule": 3600.0,  # Hourly
    },
}
