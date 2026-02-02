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
from ....db.models.project_server import ProjectServer
from sqlalchemy.orm import selectinload
from ....services.backup import BackupSchedulerService, BackupService
from ....services.backup.backup_service import normalize_storage_backend
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
        environment_id=schedule.environment_id,
        environment_name=str(schedule.environment.environment) if schedule.environment and schedule.environment.environment else None,
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
    if not data.environment_id:
        raise HTTPException(status_code=400, detail="Environment is required for scheduled backups")

    env_result = await db.execute(
        select(ProjectServer).where(
            ProjectServer.id == data.environment_id,
            ProjectServer.project_id == data.project_id,
        )
    )
    if not env_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Environment not found for project")

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
        environment_id=data.environment_id,
    )

    # Reload with relationships to avoid MissingGreenlet in _schedule_to_response
    stmt = (
        select(BackupSchedule)
        .where(BackupSchedule.id == schedule.id)
        .options(
            selectinload(BackupSchedule.project),
            selectinload(BackupSchedule.environment)
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one()
    
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

    if data.environment_id is not None:
        schedule = await scheduler.get_schedule(schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        env_result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.id == data.environment_id,
                ProjectServer.project_id == schedule.project_id,
            )
        )
        if not env_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Environment not found for project")
    
    # Get non-None values from update data
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    
    schedule = await scheduler.update_schedule(schedule_id, **updates)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Reload with relationships
    stmt = (
        select(BackupSchedule)
        .where(BackupSchedule.id == schedule.id)
        .options(
            selectinload(BackupSchedule.project),
            selectinload(BackupSchedule.environment)
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one()
    
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

    # Reload with relationships
    stmt = (
        select(BackupSchedule)
        .where(BackupSchedule.id == schedule.id)
        .options(
            selectinload(BackupSchedule.project),
            selectinload(BackupSchedule.environment)
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one()
    
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

    # Reload with relationships
    stmt = (
        select(BackupSchedule)
        .where(BackupSchedule.id == schedule.id)
        .options(
            selectinload(BackupSchedule.project),
            selectinload(BackupSchedule.environment)
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one()
    
    return _schedule_to_response(schedule)


@router.post("/{schedule_id}/run", response_model=ScheduleRunResponse)
async def run_schedule_now(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Manually trigger a backup schedule to run now."""
    from datetime import datetime
    from sqlalchemy.orm import selectinload
    from ....db.models.backup import Backup, BackupStatus, BackupStorageType
    from ....db.models.project_server import ProjectServer
    from ....services.backup.backup_service import normalize_storage_backend
    
    # Load schedule with relationships
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
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if not schedule.project:
        raise HTTPException(status_code=400, detail="No project associated with schedule")
    
    env = schedule.environment
    if not env:
        raise HTTPException(status_code=400, detail="No environment linked to schedule")
    
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
        created_by_id=current_user.id,
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
    
    # Determine storage backends
    storage_backends = ["gdrive"] if storage_type_str == "gdrive" else (
        ["s3"] if storage_type_str == "s3" else ["local"]
    )
    
    # Get override folder ID if set on environment
    override_folder_id = env.gdrive_backups_folder_id if env else None
    
    # Trigger backup via Celery task
    from forge.tasks.backup_tasks import create_environment_backup_task
    
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
        "schedule_id": schedule_id,
        "backup_id": backup_id
    }
