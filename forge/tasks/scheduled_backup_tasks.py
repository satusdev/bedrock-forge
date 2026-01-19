"""
Scheduled backup tasks for Celery Beat integration.

These tasks work with the BackupSchedule model to execute
automated backups based on configured schedules.
"""
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from celery import shared_task

from ..db import AsyncSessionLocal
from ..services.backup import (
    BackupConfig,
    BackupSchedulerService,
    BackupService,
    RetentionService,
)
from ..utils.logging import logger


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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
    """Process due backup schedules."""
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
            schedule_id = str(schedule.id)
            
            try:
                # Get project path
                if not schedule.project:
                    logger.warning(f"Schedule {schedule_id} has no project")
                    await scheduler.record_run(
                        schedule.id,
                        success=False,
                        error_message="No project associated with schedule",
                    )
                    results["failed"] += 1
                    continue
                
                project_path = Path(schedule.project.local_path or "")
                if not project_path.exists():
                    logger.warning(
                        f"Project path does not exist: {project_path}"
                    )
                    await scheduler.record_run(
                        schedule.id,
                        success=False,
                        error_message=f"Project path not found: {project_path}",
                    )
                    results["failed"] += 1
                    continue
                
                # Create backup config - map model backup_type to BackupType enum
                config = BackupConfig(
                    backup_type=schedule.backup_type,
                    storage_backends=[schedule.storage_type.value],
                )
                
                # Execute backup
                backup_service = BackupService(db)
                result = await backup_service.create_backup(
                    project_path=project_path,
                    schedule=schedule,
                    config=config,
                )
                
                # Record result
                await scheduler.record_run(
                    schedule.id,
                    success=result.success,
                    error_message=result.error,
                )
                
                if result.success:
                    results["success"] += 1
                    logger.info(
                        f"Backup completed for schedule {schedule_id}: "
                        f"{result.size_bytes} bytes"
                    )
                    
                    # Apply retention policy
                    retention = RetentionService(db)
                    ret_result = await retention.apply_retention(
                        schedule, storage_type=schedule.storage_type.value
                    )
                    if ret_result.deleted_count > 0:
                        logger.info(
                            f"Retention cleanup for {schedule_id}: "
                            f"deleted {ret_result.deleted_count} backups"
                        )
                else:
                    results["failed"] += 1
                    logger.error(
                        f"Backup failed for schedule {schedule_id}: "
                        f"{result.error}"
                    )
                
                results["schedules"].append({
                    "schedule_id": schedule_id,
                    "project": schedule.project.name,
                    "success": result.success,
                    "error": result.error,
                    "size_bytes": result.size_bytes,
                })
                
            except Exception as e:
                results["failed"] += 1
                logger.exception(f"Error processing schedule {schedule_id}")
                
                try:
                    await scheduler.record_run(
                        schedule.id,
                        success=False,
                        error_message=str(e),
                    )
                except Exception:
                    pass
                
                results["schedules"].append({
                    "schedule_id": schedule_id,
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
    """Execute backup for a specific schedule."""
    async with AsyncSessionLocal() as db:
        scheduler = BackupSchedulerService(db)
        backup_service = BackupService(db)
        
        schedule = await scheduler.get_schedule(
            schedule_id,
            include_project=True,
        )
        
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
        
        project_path = Path(schedule.project.local_path or "")
        
        # Create config
        config = BackupConfig(
            backup_type=schedule.backup_type,
            storage_backends=[schedule.storage_type.value],
        )
        
        # Execute backup
        result = await backup_service.create_backup(
            project_path=project_path,
            schedule=schedule,
            config=config,
        )
        
        # Record result
        await scheduler.record_run(
            schedule.id,
            success=result.success,
            error_message=result.error,
        )
        
        return result.to_dict()

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
                    schedule, storage_type=schedule.storage_type.value
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
