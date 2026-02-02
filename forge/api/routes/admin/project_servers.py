"""
ProjectServer API routes.

CRUD operations for linking projects to servers with environment context,
and triggering sync operations between environments.
"""
from datetime import datetime
from typing import Annotated, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ....db import get_db, User, Server, Project
from ....db.models.project_server import ProjectServer, ServerEnvironment
from ....utils.logging import logger
from ...deps import get_current_active_user, update_task_status
from ...schemas.project_server import (
    ProjectServerCreate,
    ProjectServerUpdate,
    ProjectServerRead,
    ProjectServerWithCredentials,
    SyncOptions,
    SyncResult
)

router = APIRouter()


async def _get_project_or_404(
    project_id: int,
    db: AsyncSession,
    current_user: User
) -> Project:
    """Get project by ID or raise 404."""
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


async def _get_project_server_or_404(
    link_id: int,
    project_id: int,
    db: AsyncSession,
    current_user: User
) -> ProjectServer:
    """Get project-server link by ID or raise 404."""
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(
            ProjectServer.id == link_id,
            ProjectServer.project_id == project_id,
            Project.owner_id == current_user.id
        )
        .options(selectinload(ProjectServer.server))
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server link not found"
        )
    return link


@router.get("/{project_id}/servers", response_model=List[ProjectServerRead])
async def list_project_servers(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    environment: Optional[ServerEnvironment] = None
):
    """List all servers linked to a project."""
    # Verify project ownership
    await _get_project_or_404(project_id, db, current_user)
    
    query = (
        select(ProjectServer)
        .where(ProjectServer.project_id == project_id)
        .options(selectinload(ProjectServer.server))
    )
    
    if environment:
        query = query.where(ProjectServer.environment == environment)
    
    result = await db.execute(query)
    links = result.scalars().all()
    
    # Enrich with server names
    return [
        ProjectServerRead(
            id=link.id,
            project_id=link.project_id,
            server_id=link.server_id,
            environment=link.environment,
            wp_path=link.wp_path,
            wp_url=link.wp_url,
            notes=link.notes,
            is_primary=link.is_primary,
            server_name=link.server.name if link.server else None,
            gdrive_backups_folder_id=link.gdrive_backups_folder_id,
            created_at=link.created_at,
            updated_at=link.updated_at
        )
        for link in links
    ]


@router.post("/{project_id}/servers", response_model=ProjectServerRead, status_code=status.HTTP_201_CREATED)
async def link_server_to_project(
    project_id: int,
    link_data: ProjectServerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Link a server to a project with environment context."""
    # Verify project ownership
    await _get_project_or_404(project_id, db, current_user)
    
    # Verify server ownership
    result = await db.execute(
        select(Server).where(
            Server.id == link_data.server_id,
            Server.owner_id == current_user.id
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found or not owned by user"
        )
    
    # Check for existing link with same environment
    existing = await db.execute(
        select(ProjectServer).where(
            ProjectServer.project_id == project_id,
            ProjectServer.server_id == link_data.server_id,
            ProjectServer.environment == link_data.environment
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Server already linked to project for {link_data.environment.value} environment"
        )
    
    # If this is set as primary, unset other primaries for same environment
    if link_data.is_primary:
        await db.execute(
            select(ProjectServer)
            .where(
                ProjectServer.project_id == project_id,
                ProjectServer.environment == link_data.environment,
                ProjectServer.is_primary == True
            )
        )
        # Update existing primaries
        result = await db.execute(
            select(ProjectServer).where(
                ProjectServer.project_id == project_id,
                ProjectServer.environment == link_data.environment,
                ProjectServer.is_primary == True
            )
        )
        for existing_primary in result.scalars():
            existing_primary.is_primary = False
    
    # Create the link
    link = ProjectServer(
        project_id=project_id,
        server_id=link_data.server_id,
        environment=link_data.environment,
        wp_path=link_data.wp_path,
        wp_url=link_data.wp_url,
        notes=link_data.notes,
        is_primary=link_data.is_primary,
        # New fields
        ssh_user=link_data.ssh_user,
        ssh_key_path=link_data.ssh_key_path,
        gdrive_backups_folder_id=link_data.gdrive_backups_folder_id
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    
    logger.info(f"Server {server.name} linked to project {project_id} as {link_data.environment.value}")
    
    return ProjectServerRead(
        id=link.id,
        project_id=link.project_id,
        server_id=link.server_id,
        environment=link.environment,
        wp_path=link.wp_path,
        wp_url=link.wp_url,
        notes=link.notes,
        is_primary=link.is_primary,
        server_name=server.name,
        created_at=link.created_at,
        updated_at=link.updated_at
    )


@router.get("/{project_id}/servers/{link_id}", response_model=ProjectServerWithCredentials)
async def get_project_server(
    project_id: int,
    link_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get project-server link details with credentials count."""
    link = await _get_project_server_or_404(link_id, project_id, db, current_user)
    
    # Count associated credentials
    credentials_count = len(link.wp_credentials) if hasattr(link, 'wp_credentials') else 0
    
    return ProjectServerWithCredentials(
        id=link.id,
        project_id=link.project_id,
        server_id=link.server_id,
        environment=link.environment,
        wp_path=link.wp_path,
        wp_url=link.wp_url,
        notes=link.notes,
        is_primary=link.is_primary,
        server_name=link.server.name if link.server else None,
        created_at=link.created_at,
        updated_at=link.updated_at,
        credentials_count=credentials_count
    )


@router.put("/{project_id}/servers/{link_id}", response_model=ProjectServerRead)
async def update_project_server(
    project_id: int,
    link_id: int,
    update_data: ProjectServerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update a project-server link."""
    link = await _get_project_server_or_404(link_id, project_id, db, current_user)
    
    # Update fields if provided
    if update_data.environment is not None:
        link.environment = update_data.environment
    if update_data.wp_path is not None:
        link.wp_path = update_data.wp_path
    if update_data.wp_url is not None:
        link.wp_url = update_data.wp_url
    if update_data.notes is not None:
        link.notes = update_data.notes
    if update_data.ssh_user is not None:
        link.ssh_user = update_data.ssh_user
    if update_data.ssh_key_path is not None:
        link.ssh_key_path = update_data.ssh_key_path
    if update_data.gdrive_backups_folder_id is not None:
        link.gdrive_backups_folder_id = update_data.gdrive_backups_folder_id
    if update_data.database_name is not None:
        link.database_name = update_data.database_name
    if update_data.database_user is not None:
        link.database_user = update_data.database_user
    if update_data.database_password is not None:
        link.database_password = update_data.database_password
    
    if update_data.is_primary is not None:
        # If setting as primary, unset other primaries for same environment
        if update_data.is_primary:
            result = await db.execute(
                select(ProjectServer).where(
                    ProjectServer.project_id == project_id,
                    ProjectServer.environment == link.environment,
                    ProjectServer.is_primary == True,
                    ProjectServer.id != link_id
                )
            )
            for existing_primary in result.scalars():
                existing_primary.is_primary = False
        link.is_primary = update_data.is_primary
    
    await db.flush()
    await db.refresh(link)
    
    logger.info(f"Project-server link {link_id} updated")
    
    return ProjectServerRead(
        id=link.id,
        project_id=link.project_id,
        server_id=link.server_id,
        environment=link.environment,
        wp_path=link.wp_path,
        wp_url=link.wp_url,
        notes=link.notes,
        is_primary=link.is_primary,
        server_name=link.server.name if link.server else None,
        created_at=link.created_at,
        updated_at=link.updated_at
    )


@router.delete("/{project_id}/servers/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_server_from_project(
    project_id: int,
    link_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Remove server link from project."""
    link = await _get_project_server_or_404(link_id, project_id, db, current_user)
    
    await db.delete(link)
    logger.info(f"Project-server link {link_id} deleted")


@router.post("/{project_id}/servers/{link_id}/sync")
async def sync_environment(
    project_id: int,
    link_id: int,
    options: SyncOptions,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Sync files/database from one environment to another.
    
    This endpoint creates a background task for the sync operation.
    Returns a task_id to track progress.
    """
    link = await _get_project_server_or_404(link_id, project_id, db, current_user)
    
    # Create task ID for tracking
    task_id = str(uuid.uuid4())
    update_task_status(
        task_id, 
        "pending", 
        f"Preparing sync for {link.environment.value} environment"
    )
    
    # Prepare sync info
    sync_info = {
        "task_id": task_id,
        "project_id": project_id,
        "project_server_id": link_id,
        "server_id": link.server_id,
        "environment": link.environment.value,
        "wp_path": link.wp_path,
        "wp_url": link.wp_url,
        "options": {
            "sync_database": options.sync_database,
            "sync_uploads": options.sync_uploads,
            "sync_plugins": options.sync_plugins,
            "sync_themes": options.sync_themes,
            "dry_run": options.dry_run,
            "exclude_paths": options.exclude_paths
        }
    }
    
    # Queue the sync task
    # Note: This will be handled by Celery in sync_tasks.py
    # For now, we log and return the task_id
    logger.info(f"Sync task queued: {task_id} for project-server {link_id}")
    
    # Import and call Celery task (if available)
    try:
        from ....tasks.sync_tasks import full_environment_sync
        full_environment_sync.delay(
            source_ps_id=link_id,
            target_ps_id=None,  # Local is the target
            options=sync_info["options"]
        )
    except ImportError:
        # Celery not available, mark as pending
        update_task_status(task_id, "pending", "Sync task queued (Celery worker required)")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "message": f"Sync operation started for {link.environment.value} environment",
        "dry_run": options.dry_run
    }


@router.get("/{project_id}/environments")
async def list_project_environments(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Get a summary of all environments for a project.
    
    Returns local + all linked remote environments.
    """
    # Verify project ownership
    project = await _get_project_or_404(project_id, db, current_user)
    
    # Get all linked servers
    result = await db.execute(
        select(ProjectServer)
        .where(ProjectServer.project_id == project_id)
        .options(selectinload(ProjectServer.server))
    )
    links = result.scalars().all()
    
    environments = {
        "local": {
            "available": True,
            "directory": project.directory if hasattr(project, 'directory') else None,
            "is_primary": True
        }
    }
    
    for link in links:
        env_key = link.environment.value
        if env_key not in environments:
            environments[env_key] = []
        
        environments[env_key] = {
            "link_id": link.id,
            "server_id": link.server_id,
            "server_name": link.server.name if link.server else None,
            "server_status": link.server.status.value if link.server else None,
            "wp_path": link.wp_path,
            "wp_url": link.wp_url,
            "is_primary": link.is_primary
        }
    
    return {
        "project_id": project_id,
        "environments": environments
    }
