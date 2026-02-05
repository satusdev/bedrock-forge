"""
WordPress Management API routes.

Provides endpoints for viewing WP site state and triggering updates.
"""
from datetime import datetime
import uuid
import json
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ....db import get_db, User
from ....db.models.project import Project
from ....db.models.project_server import ProjectServer
from ....db.models.wp_site_management import WPSiteState, WPUpdate, UpdateStatus
from ....db.models.audit import AuditLog, AuditAction
from ...deps import get_current_active_user, update_task_status
from ....utils.logging import logger

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class PluginInfo(BaseModel):
    """Plugin information."""
    name: str
    version: str
    update_available: Optional[str] = None
    active: bool = True


class ThemeInfo(BaseModel):
    """Theme information."""
    name: str
    version: str
    update_available: Optional[str] = None
    active: bool = False


class WPSiteStateResponse(BaseModel):
    """WordPress site state response."""
    project_server_id: int
    project_name: Optional[str] = None
    server_name: Optional[str] = None
    environment: str
    wp_version: Optional[str] = None
    wp_update_available: Optional[str] = None
    php_version: Optional[str] = None
    plugins_count: int = 0
    plugins_update_count: int = 0
    themes_count: int = 0
    themes_update_count: int = 0
    users_count: int = 0
    last_scanned_at: Optional[datetime] = None
    scan_error: Optional[str] = None


class WPUpdateItem(BaseModel):
    """Pending update item."""
    project_server_id: int
    project_name: str
    server_name: str
    environment: str
    update_type: str  # core, plugin, theme
    package_name: str
    current_version: str
    available_version: str


class PendingUpdatesResponse(BaseModel):
    """List of all pending updates."""
    total_sites: int
    sites_with_updates: int
    total_updates: int
    updates: List[WPUpdateItem]


class BulkUpdateRequest(BaseModel):
    """Request for bulk update."""
    update_type: str = "all"  # core, plugin, theme, or all
    project_server_ids: Optional[List[int]] = None  # None = all sites


class BulkUpdateResponse(BaseModel):
    """Response for bulk update."""
    task_id: str
    sites_queued: int
    message: str


class RunCommandRequest(BaseModel):
    """Request to run a WP-CLI command."""
    project_server_id: int
    command: str
    args: Optional[List[str]] = None


class RunCommandResponse(BaseModel):
    """Response for WP-CLI command run."""
    task_id: str
    status: str
    message: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/sites/{project_server_id}/state", response_model=WPSiteStateResponse)
async def get_wp_site_state(
    project_server_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get WordPress site state (cached versions and update info)."""
    # Verify ownership
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(ProjectServer.id == project_server_id)
        .where(Project.owner_id == current_user.id)
        .options(
            selectinload(ProjectServer.project),
            selectinload(ProjectServer.server),
            selectinload(ProjectServer.wp_site_state)
        )
    )
    ps = result.scalar_one_or_none()
    
    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server not found"
        )
    
    state = ps.wp_site_state
    
    return WPSiteStateResponse(
        project_server_id=ps.id,
        project_name=ps.project.name if ps.project else None,
        server_name=ps.server.name if ps.server else None,
        environment=ps.environment.value,
        wp_version=state.wp_version if state else None,
        wp_update_available=state.wp_version_available if state else None,
        php_version=state.php_version if state else None,
        plugins_count=state.plugins_count if state else 0,
        plugins_update_count=state.plugins_update_count if state else 0,
        themes_count=state.themes_count if state else 0,
        themes_update_count=state.themes_update_count if state else 0,
        users_count=state.users_count if state else 0,
        last_scanned_at=state.last_scanned_at if state else None,
        scan_error=state.scan_error if state else None
    )


@router.post("/sites/{project_server_id}/scan")
async def trigger_wp_scan(
    project_server_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Trigger a fresh WP site scan."""
    # Verify ownership
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(ProjectServer.id == project_server_id)
        .where(Project.owner_id == current_user.id)
    )
    ps = result.scalar_one_or_none()
    
    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server not found"
        )
    
    # Queue scan task
    try:
        from ....tasks.wp_tasks import scan_wp_site
        scan_wp_site.delay(project_server_id)
    except ImportError:
        pass
    
    return {"status": "queued", "message": "WP scan queued"}


@router.post("/runner/command", response_model=RunCommandResponse)
async def run_wp_cli_command(
    request: RunCommandRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Run an allowlisted WP-CLI command asynchronously."""
    # Verify ownership
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(ProjectServer.id == request.project_server_id)
        .where(Project.owner_id == current_user.id)
    )
    ps = result.scalar_one_or_none()

    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server not found"
        )

    try:
        from ....tasks.wp_tasks import (
            run_wp_cli_command as run_wp_cli_command_task,
            normalize_wp_cli_command,
            ALLOWED_WP_CLI_COMMANDS
        )
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WP-CLI runner unavailable"
        )

    normalized_command = normalize_wp_cli_command(request.command)
    if normalized_command not in ALLOWED_WP_CLI_COMMANDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Command not allowed"
        )

    task_id = str(uuid.uuid4())
    update_task_status(task_id, "pending", f"Queued wp {normalized_command}")

    run_wp_cli_command_task.delay(
        project_server_id=request.project_server_id,
        command=normalized_command,
        args=request.args or [],
        task_id=task_id
    )

    return RunCommandResponse(
        task_id=task_id,
        status="queued",
        message="WP-CLI command queued"
    )


@router.get("/updates", response_model=PendingUpdatesResponse)
async def get_pending_updates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all pending WordPress updates across all sites."""
    import json
    
    # Get all project-servers with WP state for this user
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(Project.owner_id == current_user.id)
        .options(
            selectinload(ProjectServer.project),
            selectinload(ProjectServer.server),
            selectinload(ProjectServer.wp_site_state)
        )
    )
    project_servers = result.scalars().all()
    
    updates = []
    sites_with_updates = 0
    
    for ps in project_servers:
        state = ps.wp_site_state
        if not state:
            continue
        
        has_updates = False
        
        # Check core update
        if state.wp_version_available:
            updates.append(WPUpdateItem(
                project_server_id=ps.id,
                project_name=ps.project.name,
                server_name=ps.server.name,
                environment=ps.environment.value,
                update_type="core",
                package_name="wordpress",
                current_version=state.wp_version or "unknown",
                available_version=state.wp_version_available
            ))
            has_updates = True
        
        # Check plugin updates
        if state.plugins:
            try:
                plugins = json.loads(state.plugins)
                for plugin in plugins:
                    if plugin.get("update") == "available":
                        updates.append(WPUpdateItem(
                            project_server_id=ps.id,
                            project_name=ps.project.name,
                            server_name=ps.server.name,
                            environment=ps.environment.value,
                            update_type="plugin",
                            package_name=plugin.get("name", "unknown"),
                            current_version=plugin.get("version", "unknown"),
                            available_version=plugin.get("new_version", "available")
                        ))
                        has_updates = True
            except json.JSONDecodeError:
                pass
        
        # Check theme updates
        if state.themes:
            try:
                themes = json.loads(state.themes)
                for theme in themes:
                    if theme.get("update") == "available":
                        updates.append(WPUpdateItem(
                            project_server_id=ps.id,
                            project_name=ps.project.name,
                            server_name=ps.server.name,
                            environment=ps.environment.value,
                            update_type="theme",
                            package_name=theme.get("name", "unknown"),
                            current_version=theme.get("version", "unknown"),
                            available_version=theme.get("new_version", "available")
                        ))
                        has_updates = True
            except json.JSONDecodeError:
                pass
        
        if has_updates:
            sites_with_updates += 1
    
    return PendingUpdatesResponse(
        total_sites=len(project_servers),
        sites_with_updates=sites_with_updates,
        total_updates=len(updates),
        updates=updates
    )


@router.post("/commands/run", response_model=RunCommandResponse)
async def run_wp_cli_command(
    payload: RunCommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Run an allowlisted WP-CLI command asynchronously."""
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(ProjectServer.id == payload.project_server_id)
        .where(Project.owner_id == current_user.id)
    )
    ps = result.scalar_one_or_none()

    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server not found"
        )

    task_id = str(uuid.uuid4())
    update_task_status(task_id, "pending", f"Queued wp {payload.command}")

    audit_details = {
        "command": payload.command,
        "args": payload.args or [],
        "status": "queued",
        "task_id": task_id
    }
    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COMMAND,
        entity_type="wp_cli",
        entity_id=str(payload.project_server_id),
        details=json.dumps(audit_details),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    ))
    await db.commit()

    try:
        from ....tasks.wp_tasks import run_wp_cli_command as run_wp_cli_command_task
        run_wp_cli_command_task.delay(
            payload.project_server_id,
            payload.command,
            payload.args,
            task_id,
            current_user.id
        )
        return RunCommandResponse(
            task_id=task_id,
            status="queued",
            message="Command queued"
        )
    except Exception as e:
        update_task_status(task_id, "failed", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue command"
        )


@router.post("/updates/bulk", response_model=BulkUpdateResponse)
async def trigger_bulk_update(
    request: BulkUpdateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Trigger bulk WordPress updates across multiple sites."""
    import uuid
    
    # Get sites to update
    query = (
        select(ProjectServer)
        .join(Project)
        .where(Project.owner_id == current_user.id)
    )
    
    if request.project_server_ids:
        query = query.where(ProjectServer.id.in_(request.project_server_ids))
    
    result = await db.execute(query)
    project_servers = result.scalars().all()
    
    if not project_servers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No sites found to update"
        )
    
    task_id = str(uuid.uuid4())
    
    # Queue update tasks
    queued = 0
    try:
        from ....tasks.wp_tasks import safe_update_wp
        for ps in project_servers:
            if request.update_type in ["core", "all"]:
                safe_update_wp.delay(ps.id, "core", "wordpress")
                queued += 1
            # Plugin/theme updates would need specific package names
    except ImportError:
        pass
    
    update_task_status(task_id, "running", f"Updating {queued} sites")
    
    logger.info(f"Bulk update triggered: {queued} sites by user {current_user.id}")
    
    return BulkUpdateResponse(
        task_id=task_id,
        sites_queued=queued,
        message=f"Update queued for {queued} sites"
    )


@router.get("/updates/history")
async def get_update_history(
    project_server_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get history of WordPress updates."""
    query = (
        select(WPUpdate)
        .join(ProjectServer)
        .join(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(WPUpdate.created_at.desc())
        .limit(limit)
    )
    
    if project_server_id:
        query = query.where(WPUpdate.project_server_id == project_server_id)
    
    result = await db.execute(query)
    updates = result.scalars().all()
    
    return {
        "total": len(updates),
        "updates": [
            {
                "id": u.id,
                "project_server_id": u.project_server_id,
                "update_type": u.update_type.value,
                "package_name": u.package_name,
                "from_version": u.from_version,
                "to_version": u.to_version,
                "status": u.status.value,
                "applied_at": u.applied_at,
                "error_message": u.error_message
            }
            for u in updates
        ]
    }
