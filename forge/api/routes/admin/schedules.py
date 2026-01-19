"""
Backup Schedules API routes.

Manage automated backup schedules with Celery Beat integration.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ....db import get_db
from ....db.models import User, BackupSchedule, ScheduleStatus, ScheduleFrequency
from ....services.backup import BackupSchedulerService, BackupService
from ...deps import get_current_active_user
from ...schemas.backup import (
    ScheduleCreate,
    ScheduleUpdate,
    ScheduleRead,
    ScheduleListResponse,
    ScheduleRunResponse,
)

router = APIRouter()


def _schedule_to_response(schedule: BackupSchedule) -> ScheduleRead:
    """Convert BackupSchedule model to ScheduleRead response."""
    # Generate human-readable cron display
    freq_display = {
        ScheduleFrequency.HOURLY: f"Every hour at minute {schedule.minute}",
        ScheduleFrequency.DAILY: f"Daily at {schedule.hour:02d}:{schedule.minute:02d}",
        ScheduleFrequency.WEEKLY: f"Weekly on {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][schedule.day_of_week or 0]} at {schedule.hour:02d}:{schedule.minute:02d}",
        ScheduleFrequency.MONTHLY: f"Monthly on day {schedule.day_of_month or 1} at {schedule.hour:02d}:{schedule.minute:02d}",
        ScheduleFrequency.CUSTOM: schedule.cron_expression or "Custom",
    }
    
    return ScheduleRead(
        id=schedule.id,
        name=schedule.name,
        description=schedule.description,
        project_id=schedule.project_id,
        project_name=schedule.project.name if schedule.project else None,
        frequency=schedule.frequency,
        hour=schedule.hour,
        minute=schedule.minute,
        day_of_week=schedule.day_of_week,
        day_of_month=schedule.day_of_month,
        timezone=schedule.timezone,
        cron_expression=schedule.cron_expression,
        cron_display=freq_display.get(schedule.frequency, "Unknown"),
        backup_type=schedule.backup_type,
        storage_type=schedule.storage_type,
        retention_count=schedule.retention_count,
        retention_days=schedule.retention_days,
        status=schedule.status,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        last_run_success=schedule.last_run_success,
        last_run_error=schedule.last_run_error,
        run_count=schedule.run_count,
        failure_count=schedule.failure_count,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
    )


@router.get("/", response_model=ScheduleListResponse)
async def list_schedules(
    project_id: Optional[int] = Query(None, description="Filter by project"),
    status: Optional[ScheduleStatus] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all backup schedules with optional filtering."""
    scheduler = BackupSchedulerService(db)
    
    # Get total count
    count_query = select(func.count(BackupSchedule.id))
    if project_id:
        count_query = count_query.where(BackupSchedule.project_id == project_id)
    if status:
        count_query = count_query.where(BackupSchedule.status == status)
    
    result = await db.execute(count_query)
    total = result.scalar() or 0
    
    # Get paginated schedules
    schedules = await scheduler.list_schedules(
        project_id=project_id,
        status=status,
        limit=page_size,
        offset=(page - 1) * page_size,
    )
    
    return ScheduleListResponse(
        items=[_schedule_to_response(s) for s in schedules],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/", response_model=ScheduleRead, status_code=201)
async def create_schedule(
    data: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new backup schedule."""
    scheduler = BackupSchedulerService(db)
    
    schedule = await scheduler.create_schedule(
        project_id=data.project_id,
        created_by_id=current_user.id,
        name=data.name,
        frequency=data.frequency,
        backup_type=data.backup_type,
        storage_type=data.storage_type,
        hour=data.hour,
        minute=data.minute,
        day_of_week=data.day_of_week,
        day_of_month=data.day_of_month,
        timezone=data.timezone,
        cron_expression=data.cron_expression,
        retention_count=data.retention_count,
        retention_days=data.retention_days,
        description=data.description,
        config=data.config,
    )
    
    return _schedule_to_response(schedule)


@router.get("/{schedule_id}", response_model=ScheduleRead)
async def get_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a backup schedule by ID."""
    scheduler = BackupSchedulerService(db)
    schedule = await scheduler.get_schedule(schedule_id)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return _schedule_to_response(schedule)


@router.patch("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(
    schedule_id: int,
    data: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a backup schedule."""
    scheduler = BackupSchedulerService(db)
    
    # Get non-None values from update data
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    
    schedule = await scheduler.update_schedule(schedule_id, **updates)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return _schedule_to_response(schedule)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a backup schedule."""
    scheduler = BackupSchedulerService(db)
    deleted = await scheduler.delete_schedule(schedule_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"status": "success", "message": "Schedule deleted"}


@router.post("/{schedule_id}/pause", response_model=ScheduleRead)
async def pause_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Pause a backup schedule."""
    scheduler = BackupSchedulerService(db)
    schedule = await scheduler.pause_schedule(schedule_id)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return _schedule_to_response(schedule)


@router.post("/{schedule_id}/resume", response_model=ScheduleRead)
async def resume_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Resume a paused backup schedule."""
    scheduler = BackupSchedulerService(db)
    schedule = await scheduler.resume_schedule(schedule_id)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return _schedule_to_response(schedule)


@router.post("/{schedule_id}/run", response_model=ScheduleRunResponse)
async def run_schedule_now(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Manually trigger a backup schedule to run now."""
    scheduler = BackupSchedulerService(db)
    schedule = await scheduler.get_schedule(schedule_id)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    try:
        # Execute backup directly
        backup_service = BackupService(db)
        backup = await backup_service.create_backup(
            project_id=schedule.project_id,
            backup_type=schedule.backup_type,
            storage_type=schedule.storage_type,
            created_by_id=current_user.id,
            config=schedule.config,
            schedule_id=schedule.id,
        )
        
        # Record the run
        await scheduler.record_run(schedule_id, success=True)
        
        return ScheduleRunResponse(
            success=True,
            message="Backup completed successfully",
            schedule_id=schedule_id,
            backup_id=backup.id,
        )
        
    except Exception as e:
        # Record failure
        await scheduler.record_run(schedule_id, success=False, error_message=str(e))
        
        return ScheduleRunResponse(
            success=False,
            message=f"Backup failed: {str(e)}",
            schedule_id=schedule_id,
        )

