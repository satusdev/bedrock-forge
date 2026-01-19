"""
Sync API routes.

Provides endpoints for database and file synchronization between
local development and remote servers.
"""
from datetime import datetime
from typing import Annotated, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from ....db import get_db, User, Server, Project
from ....db.models.project_server import ProjectServer
from ....db.models.server import PanelType
from ....utils.logging import logger
from ...deps import get_current_active_user, task_status, update_task_status

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class DatabasePullRequest(BaseModel):
    """Request for pulling database from remote server."""
    source_project_server_id: int
    target: str = "local"  # "local" or project_server_id
    search_replace: bool = True  # Auto search-replace URLs


class DatabasePushRequest(BaseModel):
    """Request for pushing database to remote server."""
    source: str = "local"  # "local" or project_server_id
    target_project_server_id: int
    search_replace: bool = True
    backup_first: bool = True  # Backup target before pushing


class FilePullRequest(BaseModel):
    """Request for pulling files from remote server."""
    source_project_server_id: int
    paths: List[str] = Field(
        default_factory=lambda: ["uploads"],
        description="Paths to sync: 'uploads', 'plugins', 'themes', or custom paths"
    )
    target: str = "local"
    dry_run: bool = False


class FilePushRequest(BaseModel):
    """Request for pushing files to remote server."""
    source: str = "local"
    target_project_server_id: int
    paths: List[str] = Field(
        default_factory=lambda: ["uploads"],
        description="Paths to sync: 'uploads', 'plugins', 'themes', or custom paths"
    )
    dry_run: bool = False
    delete_extra: bool = False  # Delete files on target not in source


class SyncStatusResponse(BaseModel):
    """Response for sync operation status."""
    task_id: str
    status: str
    progress: int = 0
    message: str = ""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[dict] = None


# ============================================================================
# Helper Functions
# ============================================================================

async def _get_project_server(
    project_server_id: int,
    db: AsyncSession,
    current_user: User
) -> ProjectServer:
    """Get ProjectServer with ownership verification."""
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(
            ProjectServer.id == project_server_id,
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
    return ps


def _get_panel_sync_method(panel_type: PanelType) -> str:
    """Determine sync method based on panel type."""
    if panel_type == PanelType.NONE:
        return "ssh_wp_cli"  # Direct WP-CLI via SSH
    elif panel_type == PanelType.CYBERPANEL:
        return "ssh_mysql"  # SSH + mysql commands
    elif panel_type == PanelType.CPANEL:
        return "uapi_or_ssh"  # cPanel UAPI or SSH fallback
    elif panel_type == PanelType.PLESK:
        return "ssh_mysql"  # Plesk usually allows SSH
    elif panel_type == PanelType.DIRECTADMIN:
        return "ssh_mysql"
    else:
        return "ssh_wp_cli"


# ============================================================================
# Database Sync Endpoints
# ============================================================================

@router.post("/database/pull")
async def pull_database(
    request: DatabasePullRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Pull database from remote server to local.
    
    Steps:
    1. SSH to server
    2. Export database (method depends on panel type)
    3. Download SQL file via SCP
    4. Import to local DDEV
    5. Run search-replace if enabled
    """
    ps = await _get_project_server(request.source_project_server_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    sync_method = _get_panel_sync_method(ps.server.panel_type)
    
    update_task_status(
        task_id,
        "pending",
        f"Preparing database pull from {ps.server.name} ({sync_method})"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import sync_database_pull
        sync_database_pull.delay(
            server_id=ps.server_id,
            project_server_id=ps.id,
            local_path=ps.project.directory if hasattr(ps.project, 'directory') else None,
            search_replace=request.search_replace
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for database sync")
    
    logger.info(f"Database pull task created: {task_id} from {ps.server.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "source": {
            "server": ps.server.name,
            "environment": ps.environment.value,
            "wp_url": ps.wp_url
        },
        "target": request.target,
        "sync_method": sync_method
    }


@router.post("/database/push")
async def push_database(
    request: DatabasePushRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Push local database to remote server.
    
    Steps:
    1. Export local DB with ddev export-db
    2. Optionally backup remote DB first
    3. Upload SQL file via SCP
    4. Import on remote server
    5. Run search-replace for URL changes
    """
    ps = await _get_project_server(request.target_project_server_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    sync_method = _get_panel_sync_method(ps.server.panel_type)
    
    update_task_status(
        task_id,
        "pending",
        f"Preparing database push to {ps.server.name} ({sync_method})"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import sync_database_push
        sync_database_push.delay(
            project_server_id=ps.id,
            local_path=ps.project.directory if hasattr(ps.project, 'directory') else None,
            backup_first=request.backup_first,
            search_replace=request.search_replace
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for database sync")
    
    logger.info(f"Database push task created: {task_id} to {ps.server.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "source": request.source,
        "target": {
            "server": ps.server.name,
            "environment": ps.environment.value,
            "wp_url": ps.wp_url
        },
        "sync_method": sync_method,
        "backup_first": request.backup_first
    }


# ============================================================================
# File Sync Endpoints
# ============================================================================

@router.post("/files/pull")
async def pull_files(
    request: FilePullRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Pull files from remote server.
    
    Uses rsync for efficient file transfer.
    Supports pulling uploads, plugins, themes, or custom paths.
    """
    ps = await _get_project_server(request.source_project_server_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    
    update_task_status(
        task_id,
        "pending",
        f"Preparing file pull from {ps.server.name}: {', '.join(request.paths)}"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import sync_files_pull
        sync_files_pull.delay(
            project_server_id=ps.id,
            paths=request.paths,
            dry_run=request.dry_run
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for file sync")
    
    logger.info(f"File pull task created: {task_id} from {ps.server.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "source": {
            "server": ps.server.name,
            "environment": ps.environment.value,
            "wp_path": ps.wp_path
        },
        "target": request.target,
        "paths": request.paths,
        "dry_run": request.dry_run
    }


@router.post("/files/push")
async def push_files(
    request: FilePushRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Push files to remote server.
    
    Uses rsync for efficient file transfer.
    Supports pushing uploads, plugins, themes, or custom paths.
    """
    ps = await _get_project_server(request.target_project_server_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    
    update_task_status(
        task_id,
        "pending",
        f"Preparing file push to {ps.server.name}: {', '.join(request.paths)}"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import sync_files_push
        sync_files_push.delay(
            project_server_id=ps.id,
            paths=request.paths,
            dry_run=request.dry_run,
            delete_extra=request.delete_extra
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for file sync")
    
    logger.info(f"File push task created: {task_id} to {ps.server.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "source": request.source,
        "target": {
            "server": ps.server.name,
            "environment": ps.environment.value,
            "wp_path": ps.wp_path
        },
        "paths": request.paths,
        "dry_run": request.dry_run,
        "delete_extra": request.delete_extra
    }


# ============================================================================
# Status Endpoint
# ============================================================================

@router.get("/status/{task_id}")
async def get_sync_status(
    task_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Get status of a sync operation.
    
    Returns current status, progress, and any results or errors.
    """
    # Check in-memory task status first
    if task_id in task_status:
        status_info = task_status[task_id]
        return SyncStatusResponse(
            task_id=task_id,
            status=status_info.get("status", "unknown"),
            progress=status_info.get("progress", 0),
            message=status_info.get("message", ""),
            started_at=status_info.get("started_at"),
            completed_at=status_info.get("completed_at"),
            result=status_info.get("result")
        )
    
    # Check Celery for task status
    try:
        from ....tasks.celery_tasks import celery_app
        result = celery_app.AsyncResult(task_id)
        
        if result.state == "PENDING":
            return SyncStatusResponse(
                task_id=task_id,
                status="pending",
                message="Task is waiting to be processed"
            )
        elif result.state == "STARTED":
            return SyncStatusResponse(
                task_id=task_id,
                status="running",
                progress=result.info.get("progress", 0) if result.info else 0,
                message=result.info.get("message", "Task is running") if result.info else "Task is running"
            )
        elif result.state == "SUCCESS":
            return SyncStatusResponse(
                task_id=task_id,
                status="completed",
                progress=100,
                message="Task completed successfully",
                result=result.result
            )
        elif result.state == "FAILURE":
            return SyncStatusResponse(
                task_id=task_id,
                status="failed",
                message=str(result.result) if result.result else "Task failed"
            )
        else:
            return SyncStatusResponse(
                task_id=task_id,
                status=result.state.lower(),
                message=f"Task state: {result.state}"
            )
    except ImportError:
        pass
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Task {task_id} not found"
    )


# ============================================================================
# Bulk Operations
# ============================================================================

@router.post("/full")
async def full_sync(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    source_project_server_id: int,
    target_project_server_id: Optional[int] = None,
    sync_database: bool = True,
    sync_uploads: bool = True,
    sync_plugins: bool = False,
    sync_themes: bool = False,
    dry_run: bool = False,
):
    """
    Full sync: database + uploads + optionally plugins/themes.
    
    If target_project_server_id is None, syncs to local.
    """
    source_ps = await _get_project_server(source_project_server_id, db, current_user)
    
    if target_project_server_id:
        target_ps = await _get_project_server(target_project_server_id, db, current_user)
        target_name = target_ps.server.name
    else:
        target_ps = None
        target_name = "local"
    
    task_id = str(uuid.uuid4())
    
    update_task_status(
        task_id,
        "pending",
        f"Preparing full sync from {source_ps.server.name} to {target_name}"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import full_environment_sync
        full_environment_sync.delay(
            source_ps_id=source_project_server_id,
            target_ps_id=target_project_server_id,
            options={
                "sync_database": sync_database,
                "sync_uploads": sync_uploads,
                "sync_plugins": sync_plugins,
                "sync_themes": sync_themes,
                "dry_run": dry_run
            }
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for full sync")
    
    logger.info(f"Full sync task created: {task_id}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "source": {
            "server": source_ps.server.name,
            "environment": source_ps.environment.value
        },
        "target": target_name,
        "operations": {
            "database": sync_database,
            "uploads": sync_uploads,
            "plugins": sync_plugins,
            "themes": sync_themes
        },
        "dry_run": dry_run
    }


# ============================================================================
# Remote Composer (Bedrock)
# ============================================================================

class RemoteComposerRequest(BaseModel):
    """Request to run composer on a remote Bedrock site."""
    project_server_id: int
    command: str = "update"  # install, update, require, remove
    packages: Optional[List[str]] = None  # Optional package names
    flags: Optional[List[str]] = None  # e.g., ["--no-dev", "--prefer-dist"]


@router.post("/composer")
async def run_remote_composer(
    request: RemoteComposerRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Run composer command on a remote Bedrock site.
    
    Supported commands: install, update, require, remove
    Uses per-site SSH credentials when available.
    """
    ps = await _get_project_server(request.project_server_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    
    # Validate command
    allowed_commands = ["install", "update", "require", "remove", "dump-autoload"]
    if request.command not in allowed_commands:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid composer command. Allowed: {', '.join(allowed_commands)}"
        )
    
    update_task_status(
        task_id,
        "pending",
        f"Running composer {request.command} on {ps.server.name}"
    )
    
    # Queue the Celery task
    try:
        from ....tasks.sync_tasks import run_remote_composer as composer_task
        composer_task.delay(
            project_server_id=ps.id,
            command=request.command,
            packages=request.packages,
            flags=request.flags
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required for remote composer")
    
    logger.info(f"Remote composer task created: {task_id} on {ps.server.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "server": ps.server.name,
        "environment": ps.environment.value,
        "command": request.command,
        "packages": request.packages,
        "flags": request.flags
    }

