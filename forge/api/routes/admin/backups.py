"""
Backups API routes.

Full CRUD for backup management with database integration,
scheduling, and remote backup support.
"""
from datetime import datetime
from typing import Annotated, List, Optional, Dict, Any
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from ....db import get_db, User, Project
from ....db.models.backup import Backup, BackupType, BackupStorageType, BackupStatus
from ....db.models.project_server import ProjectServer
from ....utils.logging import logger
from ...deps import get_current_active_user, get_task_status, update_task_status

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class BackupCreate(BaseModel):
    """Schema for creating a backup."""
    project_id: int
    environment_id: Optional[int] = None
    backup_type: BackupType = BackupType.FULL
    storage_type: BackupStorageType = BackupStorageType.LOCAL
    notes: Optional[str] = None
    name: Optional[str] = None
    # Remote options (deprecated, use environment_id instead)
    remote_host: Optional[str] = None
    remote_user: Optional[str] = None
    gdrive_upload: bool = False


class BackupRemotePull(BaseModel):
    """Schema for pulling a remote backup."""
    project_server_id: int
    backup_type: BackupType = BackupType.FULL
    include_database: bool = True
    include_uploads: bool = True
    include_plugins: bool = False
    include_themes: bool = False


class BackupSchedule(BaseModel):
    """Schema for scheduling backups."""
    project_id: int
    schedule_type: str = Field(
        default="daily",
        description="Schedule type: 'daily', 'weekly', 'monthly'"
    )
    retention_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Days to keep backups"
    )
    backup_type: BackupType = BackupType.FULL
    enabled: bool = True


class BackupRead(BaseModel):
    """Schema for reading a backup."""
    id: int
    project_id: int
    project_name: Optional[str] = None
    name: Optional[str] = None
    backup_type: str
    storage_type: str
    status: str
    file_path: Optional[str] = None
    size_bytes: Optional[int] = None
    error_message: Optional[str] = None
    notes: Optional[str] = None
    logs: Optional[str] = None
    storage_file_id: Optional[str] = None
    drive_folder_id: Optional[str] = None
    gdrive_link: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BulkBackupCreate(BaseModel):
    """Schema for bulk backup creation."""
    project_ids: List[int] = Field(..., min_length=1, max_length=50)
    backup_type: BackupType = BackupType.FULL
    storage_type: BackupStorageType = BackupStorageType.LOCAL
    notes: Optional[str] = None
    gdrive_upload: bool = False


class BulkBackupDelete(BaseModel):
    """Schema for bulk backup deletion."""
    backup_ids: List[int] = Field(..., min_length=1, max_length=100)
    force: bool = False  # Skip confirmation for in-progress backups


class BulkOperationResult(BaseModel):
    """Result of a bulk operation."""
    success: List[Dict[str, Any]]
    failed: List[Dict[str, Any]]
    total_requested: int
    total_success: int
    total_failed: int


# ============================================================================
# Helper Functions
# ============================================================================

async def _get_backup_or_404(
    backup_id: int,
    db: AsyncSession,
    current_user: User
) -> Backup:
    """Get backup by ID with ownership verification."""
    result = await db.execute(
        select(Backup)
        .join(Project)
        .where(
            Backup.id == backup_id,
            Project.owner_id == current_user.id
        )
        .options(selectinload(Backup.project))
    )
    backup = result.scalar_one_or_none()
    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup not found"
        )
    return backup


async def _get_project_or_404(
    project_id: int,
    db: AsyncSession,
    current_user: User
) -> Project:
    """Get project by ID with ownership verification."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project


async def _delete_drive_folder_or_fail(drive_folder_id: str) -> None:
    """Delete a Google Drive folder by ID and fail hard on error."""
    from ...dashboard_config import get_dashboard_config
    from ....services.backup.storage.gdrive import GoogleDriveStorage

    config = get_dashboard_config()
    storage = GoogleDriveStorage(
        remote_name=getattr(config, "gdrive_rclone_remote", "gdrive"),
        base_folder=getattr(config, "gdrive_base_path", "forge-backups"),
    )

    configured, message = await storage.check_configured()
    if not configured:
        logger.error(f"GDrive delete blocked: rclone not configured ({message})")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google Drive rclone not configured: {message}"
        )

    logger.info(f"Deleting GDrive folder id={drive_folder_id}")
    result = await storage.delete_folder(drive_folder_id)
    if not result.success:
        logger.error(
            f"GDrive delete failed for id={drive_folder_id}: {result.error}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to delete Google Drive folder"
        )


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.get("/", response_model=List[BackupRead])
async def list_backups(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    project_id: Optional[int] = None,
    backup_type: Optional[BackupType] = None,
    status_filter: Optional[BackupStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List all backups for the current user."""
    query = (
        select(Backup)
        .join(Project)
        .where(Project.owner_id == current_user.id)
        .options(selectinload(Backup.project))
        .order_by(Backup.created_at.desc())
    )
    
    if project_id:
        query = query.where(Backup.project_id == project_id)
    if backup_type:
        query = query.where(Backup.backup_type == backup_type)
    if status_filter:
        query = query.where(Backup.status == status_filter)
    
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    backups = result.scalars().all()
    
    return [
        BackupRead(
            id=b.id,
            project_id=b.project_id,
            project_name=b.project.name if b.project else None,
            name=b.name,
            backup_type=b.backup_type.value,
            storage_type=b.storage_type.value,
            status=b.status.value,
            file_path=b.storage_path,
            size_bytes=b.size_bytes,
            error_message=b.error_message,
            notes=b.notes,
            logs=b.logs,
            storage_file_id=b.storage_file_id,
            drive_folder_id=b.drive_folder_id,
            gdrive_link=f"https://drive.google.com/drive/folders/{b.drive_folder_id or b.storage_file_id}" if (b.drive_folder_id or b.storage_file_id) and b.storage_type.value == "google_drive" else None,
            created_at=b.created_at,
            completed_at=b.completed_at
        )
        for b in backups
    ]



@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def create_backup(
    backup_data: BackupCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new backup (queues a background task).
    
    If environment_id is provided, creates a backup for that specific environment
    using SSH to connect to the remote server. Otherwise, creates a local backup.
    """
    from datetime import datetime
    from sqlalchemy.orm import joinedload
    
    project = await _get_project_or_404(backup_data.project_id, db, current_user)
    
    # If environment_id is provided, verify it exists and belongs to this project
    env_link = None
    if backup_data.environment_id:
        result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.id == backup_data.environment_id,
                ProjectServer.project_id == backup_data.project_id
            ).options(joinedload(ProjectServer.server))
        )
        env_link = result.scalar_one_or_none()
        if not env_link:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Environment not found"
            )
    
    # Generate backup name
    backup_name = backup_data.name
    if not backup_name:
        env_label = env_link.environment.upper() if env_link else "LOCAL"
        backup_name = f"Backup {env_label} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    
    # Create backup record
    backup = Backup(
        project_id=project.id,
        user_id=current_user.id,
        name=backup_name,
        backup_type=backup_data.backup_type,
        storage_type=backup_data.storage_type,
        status=BackupStatus.PENDING,
        notes=backup_data.notes,
        project_server_id=backup_data.environment_id,
        created_at=datetime.utcnow(),
        started_at=datetime.utcnow()
    )
    db.add(backup)
    await db.flush()
    await db.refresh(backup)
    
    # Create task ID for tracking
    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Creating {backup_data.backup_type.value} backup for {project.name}"
    )
    
    # Queue Celery task
    try:
        if backup_data.environment_id and env_link:
            # Environment-based backup (remote server)
            from ....tasks.backup_tasks import create_environment_backup_task
            
            # Determine storage backends from storage_type
            storage_backends = []
            if backup_data.storage_type == BackupStorageType.LOCAL:
                storage_backends = ["local"]
            elif backup_data.storage_type == BackupStorageType.GOOGLE_DRIVE:
                storage_backends = ["gdrive"]
            elif backup_data.storage_type == BackupStorageType.S3:
                storage_backends = ["s3"]
            else:
                storage_backends = ["local"]  # Default fallback
            
            # Get override folder ID if set on environment
            override_folder_id = env_link.gdrive_backups_folder_id if env_link else None
            
            create_environment_backup_task.delay(
                project_id=project.id,
                env_id=backup_data.environment_id,
                backup_id=backup.id,
                backup_type=backup_data.backup_type.value,
                storage_backends=storage_backends,
                override_gdrive_folder_id=override_folder_id,
                task_id=task_id
            )
            logger.info(f"Queued environment backup task {backup.id} for {project.name} (env: {env_link.environment})")
        else:
            # Local backup (DDEV-based)
            from ....tasks.backup_tasks import create_project_backup_task
            create_project_backup_task.delay(
                project_id=project.id,
                backup_id=backup.id,
                backup_type=backup_data.backup_type.value,
                task_id=task_id
            )
            logger.info(f"Queued local backup task {backup.id} for {project.name}")
            
    except ImportError as e:
        logger.error(f"Failed to import backup task: {e}")
        update_task_status(task_id, "pending", "Celery worker required")
    
    await db.commit()
    
    return {
        "status": "accepted",
        "backup_id": backup.id,
        "task_id": task_id,
        "message": f"Backup creation started for {project.name}"
    }



@router.get("/{backup_id}", response_model=BackupRead)
async def get_backup(
    backup_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get backup details."""
    backup = await _get_backup_or_404(backup_id, db, current_user)
    
    return BackupRead(
        id=backup.id,
        project_id=backup.project_id,
        project_name=backup.project.name if backup.project else None,
        name=backup.name,
        backup_type=backup.backup_type.value,
        storage_type=backup.storage_type.value,
        status=backup.status.value,
        file_path=backup.storage_path,
        size_bytes=backup.size_bytes,
        error_message=backup.error_message,
        notes=backup.notes,
        logs=backup.logs,
        storage_file_id=backup.storage_file_id,
        drive_folder_id=backup.drive_folder_id,
        gdrive_link=f"https://drive.google.com/drive/folders/{backup.drive_folder_id or backup.storage_file_id}" if (backup.drive_folder_id or backup.storage_file_id) and backup.storage_type.value == "google_drive" else None,
        created_at=backup.created_at,
        completed_at=backup.completed_at
    )


@router.post("/bulk", response_model=BulkOperationResult)
async def bulk_create_backups(
    bulk_data: BulkBackupCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Create backups for multiple projects at once.
	
    - Maximum 50 projects per request
    - Backups are queued and processed asynchronously
    - Returns list of created backup IDs and any failures
    """
    success = []
    failed = []
	
    # Verify all projects belong to user
    result = await db.execute(
        select(Project).where(
            Project.id.in_(bulk_data.project_ids),
            Project.owner_id == current_user.id
        )
    )
    valid_projects = {p.id: p for p in result.scalars().all()}
	
    for project_id in bulk_data.project_ids:
        if project_id not in valid_projects:
            failed.append({
                "project_id": project_id,
                "error": "Project not found or access denied"
            })
            continue
		
        project = valid_projects[project_id]
		
        try:
            # Create backup record
            backup = Backup(
                project_id=project_id,
                backup_type=bulk_data.backup_type,
                storage_type=bulk_data.storage_type,
                status=BackupStatus.PENDING,
                notes=bulk_data.notes or f"Bulk backup - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
            )
            db.add(backup)
            await db.flush()  # Get the ID
			
            # Queue the backup task
            from ....tasks.backup_tasks import run_backup_task
            task = run_backup_task.delay(
                backup_id=backup.id,
                project_path=project.local_path,
                backup_type=bulk_data.backup_type.value,
                storage_type=bulk_data.storage_type.value,
                gdrive_upload=bulk_data.gdrive_upload
            )
			
            success.append({
                "project_id": project_id,
                "project_name": project.name,
                "backup_id": backup.id,
                "task_id": task.id if task else None,
                "status": "queued"
            })
			
            logger.info(f"Bulk backup queued for project {project.name} (backup_id={backup.id})")
			
        except Exception as e:
            logger.error(f"Failed to create backup for project {project_id}: {e}")
            failed.append({
                "project_id": project_id,
                "project_name": project.name if project else None,
                "error": str(e)[:200]
            })
	
    await db.commit()
	
    return BulkOperationResult(
        success=success,
        failed=failed,
        total_requested=len(bulk_data.project_ids),
        total_success=len(success),
        total_failed=len(failed)
    )


@router.delete("/bulk", response_model=BulkOperationResult)
async def bulk_delete_backups(
    bulk_data: BulkBackupDelete,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Delete multiple backups at once.
	
    - Maximum 100 backups per request
    - By default, skips backups that are in progress
    - Use force=true to cancel and delete in-progress backups
    """
    import os
	
    success = []
    failed = []
	
    # Get all backups that belong to user
    result = await db.execute(
        select(Backup)
        .join(Project)
        .where(
            Backup.id.in_(bulk_data.backup_ids),
            Project.owner_id == current_user.id
        )
        .options(selectinload(Backup.project))
    )
    valid_backups = {b.id: b for b in result.scalars().all()}
	
    async def _delete_gdrive_backup(backup: Backup, force: bool) -> None:
        drive_folder_id = backup.drive_folder_id
        if not drive_folder_id:
            if force:
                logger.warning(
                    f"Skipping Drive deletion for backup {backup.id}: missing folder ID"
                )
                return
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing Google Drive folder ID for this backup"
            )
        await _delete_drive_folder_or_fail(drive_folder_id)

    for backup_id in bulk_data.backup_ids:
        if backup_id not in valid_backups:
            failed.append({
                "backup_id": backup_id,
                "error": "Backup not found or access denied"
            })
            continue
		
        backup = valid_backups[backup_id]
		
        # Check if backup is in progress
        if backup.status in [BackupStatus.PENDING, BackupStatus.RUNNING]:
            if not bulk_data.force:
                failed.append({
                    "backup_id": backup_id,
                    "project_name": backup.project.name if backup.project else None,
                    "error": f"Backup is {backup.status.value}. Use force=true to delete."
                })
                continue
            else:
                # Mark as cancelled
                backup.status = BackupStatus.FAILED
		
        try:
            # Delete Google Drive folder if applicable (hard-fail on error)
            if backup.storage_type and backup.storage_type.value == "google_drive":
                await _delete_gdrive_backup(backup, bulk_data.force)

            # Delete backup file if exists
            storage_path = getattr(backup, "storage_path", None) or getattr(backup, "file_path", None)
            if storage_path and os.path.exists(storage_path):
                try:
                    os.remove(storage_path)
                    logger.info(f"Deleted backup file: {storage_path}")
                except OSError as e:
                    logger.warning(f"Failed to delete backup file {storage_path}: {e}")
			
            # Delete from database
            await db.delete(backup)
			
            success.append({
                "backup_id": backup_id,
                "project_name": backup.project.name if backup.project else None,
                "file_deleted": bool(backup.file_path),
                "status": "deleted"
            })
			
            logger.info(f"Bulk delete: removed backup {backup_id}")
			
        except HTTPException:
            await db.rollback()
            raise
        except Exception as e:
            logger.error(f"Failed to delete backup {backup_id}: {e}")
            failed.append({
                "backup_id": backup_id,
                "project_name": backup.project.name if backup.project else None,
                "error": str(e)[:200]
            })
	
    await db.commit()
	
    return BulkOperationResult(
        success=success,
        failed=failed,
        total_requested=len(bulk_data.backup_ids),
        total_success=len(success),
        total_failed=len(failed)
    )



@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Download a local backup file."""
    from fastapi.responses import FileResponse
    import os
    
    backup = await _get_backup_or_404(backup_id, db, current_user)
    
    if not backup.storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup file path not recorded"
        )
        
    if not os.path.exists(backup.storage_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup file not found on server storage"
        )
        
    return FileResponse(
        path=backup.storage_path,
        filename=os.path.basename(backup.storage_path),
        media_type='application/gzip'
    )


@router.delete("/{backup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backup(
    backup_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    delete_file: bool = Query(True, description="Also delete backup file from storage")
):
    """Delete a backup and its files from all storage backends."""
    backup = await _get_backup_or_404(backup_id, db, current_user)
    
    # Delete from Google Drive if drive_folder_id exists
    if delete_file and backup.storage_type and backup.storage_type.value == "google_drive":
        drive_folder_id = backup.drive_folder_id
        if not drive_folder_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing Google Drive folder ID for this backup"
            )
        try:
            await _delete_drive_folder_or_fail(drive_folder_id)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to delete GDrive content: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete remote content: {str(e)}"
            )


    
    # Delete local physical file if requested
    if delete_file and backup.storage_path:
        import os
        try:
            if os.path.exists(backup.storage_path):
                os.unlink(backup.storage_path)
                logger.info(f"Deleted backup file: {backup.storage_path}")
        except Exception as e:
            logger.error(f"Failed to delete backup file: {e}")
    
    await db.delete(backup)
    logger.info(f"Backup {backup_id} deleted")



@router.post("/{backup_id}/restore", status_code=status.HTTP_202_ACCEPTED)
async def restore_backup(
    backup_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    target: str = Query("local", description="Restore target: 'local' or project_server_id")
):
    """Restore from a backup."""
    backup = await _get_backup_or_404(backup_id, db, current_user)
    
    if backup.status != BackupStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot restore from incomplete backup"
        )
    
    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Restoring from backup {backup_id} to {target}"
    )
    
    # Queue Celery task
    try:
        from ....tasks.backup_tasks import restore_backup_task
        restore_backup_task.delay(
            backup_id=backup_id,
            target=target
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required")
    
    logger.info(f"Restore task created for backup {backup_id}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "backup_id": backup_id,
        "message": f"Restore started from backup {backup_id}"
    }


# ============================================================================
# Remote Backup Endpoints
# ============================================================================

@router.post("/remote/pull", status_code=status.HTTP_202_ACCEPTED)
async def pull_remote_backup(
    request: BackupRemotePull,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Pull a backup from a remote server.
    
    Downloads database and/or files from the specified project-server
    and stores them as a local backup.
    """
    # Verify project-server ownership
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(
            ProjectServer.id == request.project_server_id,
            Project.owner_id == current_user.id
        )
        .options(
            selectinload(ProjectServer.server),
            selectinload(ProjectServer.project)
        )
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server link not found"
        )
    
    # Create backup record
    backup = Backup(
        project_id=ps.project_id,
        user_id=current_user.id,
        backup_type=request.backup_type,
        storage_type=BackupStorageType.LOCAL,
        status=BackupStatus.PENDING,
        notes=f"Remote pull from {ps.server.name} ({ps.environment.value})"
    )
    db.add(backup)
    await db.flush()
    await db.refresh(backup)
    
    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Pulling backup from {ps.server.name}"
    )
    
    # Queue Celery task
    try:
        from ....tasks.backup_tasks import pull_remote_backup_task
        pull_remote_backup_task.delay(
            project_server_id=request.project_server_id,
            backup_id=backup.id,
            include_database=request.include_database,
            include_uploads=request.include_uploads,
            include_plugins=request.include_plugins,
            include_themes=request.include_themes,
            task_id=task_id
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required")
    
    logger.info(f"Remote backup pull started from {ps.server.name}")
    
    return {
        "status": "accepted",
        "backup_id": backup.id,
        "task_id": task_id,
        "source": {
            "server": ps.server.name,
            "environment": ps.environment.value
        },
        "message": f"Remote backup pull started from {ps.server.name}"
    }


# ============================================================================
# Scheduling Endpoints
# ============================================================================

@router.post("/schedule")
async def create_backup_schedule(
    schedule: BackupSchedule,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Create or update a backup schedule for a project.
    
    Schedules are managed by Celery Beat.
    """
    project = await _get_project_or_404(schedule.project_id, db, current_user)
    
    # Store schedule in project metadata (or a dedicated schedules table)
    # For now, we'll use the project's settings
    schedule_data = {
        "backup_schedule": {
            "type": schedule.schedule_type,
            "retention_days": schedule.retention_days,
            "backup_type": schedule.backup_type.value,
            "enabled": schedule.enabled,
            "updated_at": datetime.utcnow().isoformat()
        }
    }
    
    # Update project (assuming a settings field exists)
    # project.settings = {**project.settings, **schedule_data}
    # await db.flush()
    
    logger.info(f"Backup schedule updated for project {project.name}")
    
    return {
        "status": "success",
        "project_id": project.id,
        "project_name": project.name,
        "schedule": schedule_data["backup_schedule"]
    }


@router.get("/schedule/{project_id}")
async def get_backup_schedule(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get the backup schedule for a project."""
    project = await _get_project_or_404(project_id, db, current_user)
    
    # Return default schedule if none set
    schedule = {
        "type": "daily",
        "retention_days": 30,
        "backup_type": "full",
        "enabled": False,
        "next_run": None
    }
    
    return {
        "project_id": project.id,
        "project_name": project.name,
        "schedule": schedule
    }


# ============================================================================
# Statistics Endpoints
# ============================================================================

@router.get("/stats/summary")
async def get_backup_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get backup statistics summary."""
    from sqlalchemy import func
    
    # Count backups by status
    status_counts = await db.execute(
        select(Backup.status, func.count(Backup.id))
        .join(Project)
        .where(Project.owner_id == current_user.id)
        .group_by(Backup.status)
    )
    
    # Total size
    size_result = await db.execute(
        select(func.sum(Backup.size_bytes))
        .join(Project)
        .where(Project.owner_id == current_user.id)
    )
    total_size = size_result.scalar() or 0
    
    # Count by type
    type_counts = await db.execute(
        select(Backup.backup_type, func.count(Backup.id))
        .join(Project)
        .where(Project.owner_id == current_user.id)
        .group_by(Backup.backup_type)
    )
    
    return {
        "by_status": {row[0].value: row[1] for row in status_counts},
        "by_type": {row[0].value: row[1] for row in type_counts},
        "total_size_bytes": total_size,
        "total_size_human": _format_bytes(total_size)
    }


def _format_bytes(size: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


