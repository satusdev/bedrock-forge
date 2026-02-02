from datetime import datetime
from typing import Annotated, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ....db import get_db, User, Project
from ....db.models.project_server import ProjectServer
from ....utils.logging import logger
from ...deps import get_current_active_user, update_task_status

router = APIRouter()


class UrlReplaceRequest(BaseModel):
    project_server_id: int
    source_url: str = Field(..., min_length=3)
    target_url: str = Field(..., min_length=3)
    backup_before: bool = True
    download_backup: bool = True
    dry_run: bool = False


class DriveCloneRequest(BaseModel):
    project_id: int
    target_server_id: int
    target_domain: str
    environment: str
    backup_timestamp: str
    source_url: Optional[str] = None
    target_url: Optional[str] = None
    create_cyberpanel_site: bool = True
    include_database: bool = True
    include_files: bool = True
    set_shell_user: Optional[str] = None
    run_composer_install: bool = True
    run_composer_update: bool = False
    run_wp_plugin_update: bool = False
    dry_run: bool = False


async def _get_project_server(
    project_server_id: int,
    db: AsyncSession,
    current_user: User
) -> ProjectServer:
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


@router.post("/url-replace", status_code=status.HTTP_202_ACCEPTED)
async def migrate_url_replace(
    request: UrlReplaceRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    ps = await _get_project_server(request.project_server_id, db, current_user)

    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Preparing URL migration for {ps.wp_url} → {request.target_url}"
    )

    try:
        from ....tasks.migration_tasks import run_url_migration
        run_url_migration.delay(
            project_server_id=ps.id,
            source_url=request.source_url,
            target_url=request.target_url,
            backup_before=request.backup_before,
            download_backup=request.download_backup,
            dry_run=request.dry_run,
            task_id=task_id
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required")

    logger.info(f"URL migration task created: {task_id}")

    return {
        "status": "accepted",
        "task_id": task_id,
        "project_server_id": ps.id,
        "source_url": request.source_url,
        "target_url": request.target_url,
        "backup_before": request.backup_before,
        "download_backup": request.download_backup,
        "dry_run": request.dry_run
    }


@router.post("/drive/clone", status_code=status.HTTP_202_ACCEPTED)
async def clone_from_drive(
    request: DriveCloneRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    project_result = await db.execute(
        select(Project).where(
            Project.id == request.project_id,
            Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Preparing Drive clone to {request.target_domain}"
    )

    try:
        from ....tasks.clone_tasks import clone_site_from_drive
        clone_site_from_drive.delay(
            project_id=request.project_id,
            user_id=current_user.id,
            target_server_id=request.target_server_id,
            target_domain=request.target_domain,
            environment=request.environment,
            backup_timestamp=request.backup_timestamp,
            source_url=request.source_url,
            target_url=request.target_url,
            create_cyberpanel_site=request.create_cyberpanel_site,
            include_database=request.include_database,
            include_files=request.include_files,
            set_shell_user=request.set_shell_user,
            run_composer_install=request.run_composer_install,
            run_composer_update=request.run_composer_update,
            run_wp_plugin_update=request.run_wp_plugin_update,
            dry_run=request.dry_run,
            task_id=task_id
        )
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required")

    logger.info(f"Drive clone task created: {task_id}")

    return {
        "status": "accepted",
        "task_id": task_id,
        "project_id": request.project_id,
        "target_domain": request.target_domain,
        "environment": request.environment,
        "backup_timestamp": request.backup_timestamp
    }