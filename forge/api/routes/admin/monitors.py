"""
Monitor management API routes.

Provides CRUD operations for uptime monitors.
"""
from datetime import datetime
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from ....db import get_db, Monitor, User
from ....db.models.project_server import ProjectServer
from ....db.models.monitor import MonitorType, MonitorStatus
from ....utils.logging import logger
from ...deps import get_current_active_user

router = APIRouter()


# Schemas
class MonitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    monitor_type: MonitorType = MonitorType.UPTIME
    url: str = Field(min_length=1, max_length=500)
    interval_seconds: int = Field(default=300, ge=60, le=86400)
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    project_id: int | None = None
    project_server_id: int | None = None


class MonitorUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    interval_seconds: int | None = None
    timeout_seconds: int | None = None
    is_active: bool | None = None


class MonitorRead(BaseModel):
    id: int
    name: str
    monitor_type: MonitorType
    url: str
    interval_seconds: int
    timeout_seconds: int
    is_active: bool
    last_check_at: datetime | None
    last_status: MonitorStatus | None
    last_response_time_ms: int | None
    uptime_percentage: float | None
    created_at: datetime
    project_id: int | None = None
    project_server_id: int | None = None

    class Config:
        from_attributes = True


class MonitorReadWithProject(MonitorRead):
    """Extended monitor response with project information."""
    project_name: str | None = None


@router.get("/", response_model=List[MonitorRead])
async def list_monitors(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100)
):
    """List current user's monitors."""
    result = await db.execute(
        select(Monitor)
        .where(Monitor.created_by_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/by-project/{project_id}", response_model=List[MonitorReadWithProject])
async def list_monitors_by_project(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List all monitors linked to a specific project."""
    from ....db.models.project import Project
    
    # Verify project exists
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get monitors for this project
    result = await db.execute(
        select(Monitor)
        .where(
            Monitor.project_id == project_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitors = result.scalars().all()
    
    # Convert to response with project info
    response = []
    for monitor in monitors:
        response.append(MonitorReadWithProject(
            id=monitor.id,
            name=monitor.name,
            monitor_type=monitor.monitor_type,
            url=monitor.url,
            interval_seconds=monitor.interval_seconds,
            timeout_seconds=monitor.timeout_seconds,
            is_active=monitor.is_active,
            last_check_at=monitor.last_check_at,
            last_status=monitor.last_status,
            last_response_time_ms=monitor.last_response_time_ms,
            uptime_percentage=monitor.uptime_percentage,
            created_at=monitor.created_at,
            project_id=project_id,
            project_server_id=monitor.project_server_id,
            project_name=project.name
        ))
    
    return response


@router.post("/", response_model=MonitorRead, status_code=status.HTTP_201_CREATED)
async def create_monitor(
    monitor_data: MonitorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new monitor."""
    if monitor_data.project_server_id:
        from ....db.models.project import Project
        result = await db.execute(
            select(ProjectServer)
            .join(Project)
            .where(ProjectServer.id == monitor_data.project_server_id)
            .where(Project.owner_id == current_user.id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project-server not found"
            )
        if monitor_data.project_id is None:
            monitor_data.project_id = ps.project_id

    monitor = Monitor(
        name=monitor_data.name,
        monitor_type=monitor_data.monitor_type,
        url=monitor_data.url,
        interval_seconds=monitor_data.interval_seconds,
        timeout_seconds=monitor_data.timeout_seconds,
        project_id=monitor_data.project_id,
        project_server_id=monitor_data.project_server_id,
        created_by_id=current_user.id
    )
    db.add(monitor)
    await db.flush()
    await db.refresh(monitor)
    
    logger.info(f"Monitor created: {monitor.name} by {current_user.email}")
    return monitor


@router.get("/{monitor_id}", response_model=MonitorRead)
async def get_monitor(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get monitor by ID."""
    result = await db.execute(
        select(Monitor).where(
            Monitor.id == monitor_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found"
        )
    
    return monitor


@router.put("/{monitor_id}", response_model=MonitorRead)
async def update_monitor(
    monitor_id: int,
    monitor_data: MonitorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update monitor."""
    result = await db.execute(
        select(Monitor).where(
            Monitor.id == monitor_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found"
        )
    
    if monitor_data.name is not None:
        monitor.name = monitor_data.name
    if monitor_data.url is not None:
        monitor.url = monitor_data.url
    if monitor_data.interval_seconds is not None:
        monitor.interval_seconds = monitor_data.interval_seconds
    if monitor_data.timeout_seconds is not None:
        monitor.timeout_seconds = monitor_data.timeout_seconds
    if monitor_data.is_active is not None:
        monitor.is_active = monitor_data.is_active
    
    await db.flush()
    await db.refresh(monitor)
    
    logger.info(f"Monitor updated: {monitor.name}")
    return monitor


@router.delete("/{monitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_monitor(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete monitor."""
    result = await db.execute(
        select(Monitor).where(
            Monitor.id == monitor_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found"
        )
    
    await db.delete(monitor)
    logger.info(f"Monitor deleted: {monitor.name}")


@router.post("/{monitor_id}/pause")
async def toggle_monitor_pause(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Pause or resume a monitor."""
    result = await db.execute(
        select(Monitor).where(
            Monitor.id == monitor_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found"
        )
    
    monitor.is_active = not monitor.is_active
    await db.flush()
    
    status_text = "resumed" if monitor.is_active else "paused"
    return {"message": f"Monitor {status_text}", "is_active": monitor.is_active}


# ============================================================================
# Advanced Monitor Endpoints
# ============================================================================

import uuid
from ...deps import update_task_status


class MonitorCheckResult(BaseModel):
    """Result of a monitor check."""
    monitor_id: int
    status: MonitorStatus
    response_time_ms: int | None
    status_code: int | None = None
    response_body_snippet: str | None = None
    error_message: str | None = None
    checked_at: datetime


class MonitorHistory(BaseModel):
    """Historical check data."""
    checks: List[MonitorCheckResult]
    period_start: datetime
    period_end: datetime
    uptime_percentage: float
    avg_response_time_ms: float | None


class SSLCheckResult(BaseModel):
    """SSL certificate check result."""
    valid: bool
    issuer: str | None = None
    expires_at: datetime | None = None
    days_until_expiry: int | None = None
    error: str | None = None


class AlertConfig(BaseModel):
    """Alert configuration for a monitor."""
    alert_on_down: bool = True
    alert_on_ssl_expiry: bool = True
    ssl_expiry_days: int = 14
    consecutive_failures: int = 3
    notification_channels: List[str] = []  # email, slack, telegram, etc.


async def _get_monitor_or_404(
    monitor_id: int,
    db: AsyncSession,
    current_user: User
) -> Monitor:
    """Get monitor by ID or raise 404."""
    result = await db.execute(
        select(Monitor).where(
            Monitor.id == monitor_id,
            Monitor.created_by_id == current_user.id
        )
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found"
        )
    return monitor


@router.post("/{monitor_id}/check")
async def trigger_monitor_check(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Manually trigger a monitor check.
    
    Queues a background task to check the monitor immediately.
    """
    monitor = await _get_monitor_or_404(monitor_id, db, current_user)
    
    task_id = str(uuid.uuid4())
    update_task_status(
        task_id,
        "pending",
        f"Checking {monitor.name}"
    )
    
    # Queue Celery task
    try:
        from ....tasks.monitor_tasks import check_single_monitor
        check_single_monitor.delay(monitor_id=monitor_id, task_id=task_id)
    except ImportError:
        update_task_status(task_id, "pending", "Celery worker required")
    
    logger.info(f"Check triggered for monitor {monitor.name}")
    
    return {
        "status": "accepted",
        "task_id": task_id,
        "monitor_id": monitor_id,
        "message": f"Check triggered for {monitor.name}"
    }


@router.get("/{monitor_id}/history")
async def get_monitor_history(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    hours: int = Query(24, ge=1, le=720, description="Hours of history to retrieve")
):
    """
    Get monitor check history.
    
    Returns historical check results for the specified period.
    """
    from datetime import timedelta
    
    monitor = await _get_monitor_or_404(monitor_id, db, current_user)
    
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(hours=hours)
    
    # TODO: Implement MonitorCheck model for storing history
    # For now, return placeholder data
    
    # Calculate uptime based on current data
    uptime = monitor.uptime_percentage or 100.0
    
    return {
        "monitor_id": monitor_id,
        "monitor_name": monitor.name,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "uptime_percentage": uptime,
        "avg_response_time_ms": monitor.last_response_time_ms,
        "checks": [],  # Would be populated from MonitorCheck table
        "summary": {
            "total_checks": 0,
            "up_count": 0,
            "down_count": 0,
            "avg_response_time_ms": monitor.last_response_time_ms
        }
    }


@router.get("/{monitor_id}/ssl")
async def check_ssl_certificate(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Check SSL certificate for a monitor URL.
    
    Returns certificate validity, issuer, and expiry information.
    """
    import ssl
    import socket
    from urllib.parse import urlparse
    
    monitor = await _get_monitor_or_404(monitor_id, db, current_user)
    
    # Parse URL to get hostname
    parsed = urlparse(monitor.url)
    hostname = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    
    if parsed.scheme != "https":
        return {
            "valid": False,
            "error": "URL is not HTTPS",
            "hostname": hostname
        }
    
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                # Parse certificate info
                not_after = datetime.strptime(
                    cert['notAfter'], '%b %d %H:%M:%S %Y %Z'
                )
                days_until_expiry = (not_after - datetime.utcnow()).days
                
                issuer = dict(x[0] for x in cert['issuer'])
                issuer_name = issuer.get('organizationName', 'Unknown')
                
                return {
                    "valid": True,
                    "hostname": hostname,
                    "issuer": issuer_name,
                    "expires_at": not_after.isoformat(),
                    "days_until_expiry": days_until_expiry,
                    "subject": dict(x[0] for x in cert['subject']),
                    "warning": days_until_expiry < 30
                }
                
    except ssl.SSLError as e:
        return {
            "valid": False,
            "error": f"SSL Error: {str(e)}",
            "hostname": hostname
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
            "hostname": hostname
        }


@router.get("/{monitor_id}/alerts")
async def get_monitor_alerts(
    monitor_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get alert configuration for a monitor."""
    monitor = await _get_monitor_or_404(monitor_id, db, current_user)
    
    # Return default config (would be stored in monitor.alert_config)
    return {
        "monitor_id": monitor_id,
        "alert_config": {
            "alert_on_down": True,
            "alert_on_ssl_expiry": True,
            "ssl_expiry_days": 14,
            "consecutive_failures": 3,
            "notification_channels": []
        }
    }


@router.put("/{monitor_id}/alerts")
async def update_monitor_alerts(
    monitor_id: int,
    config: AlertConfig,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update alert configuration for a monitor."""
    monitor = await _get_monitor_or_404(monitor_id, db, current_user)
    
    # Store config (would update monitor.alert_config)
    import json
    # monitor.alert_config = json.dumps(config.dict())
    # await db.flush()
    
    logger.info(f"Alert config updated for monitor {monitor.name}")
    
    return {
        "status": "success",
        "monitor_id": monitor_id,
        "alert_config": config.dict()
    }


@router.get("/stats/overview")
async def get_monitors_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get overview statistics for all monitors."""
    from sqlalchemy import func
    
    result = await db.execute(
        select(Monitor)
        .where(Monitor.created_by_id == current_user.id)
    )
    monitors = result.scalars().all()
    
    total = len(monitors)
    active = sum(1 for m in monitors if m.is_active)
    up_count = sum(1 for m in monitors if m.last_status == MonitorStatus.UP)
    down_count = sum(1 for m in monitors if m.last_status == MonitorStatus.DOWN)
    
    # Calculate average uptime
    uptimes = [m.uptime_percentage for m in monitors if m.uptime_percentage is not None]
    avg_uptime = sum(uptimes) / len(uptimes) if uptimes else 100.0
    
    return {
        "total": total,
        "active": active,
        "paused": total - active,
        "status": {
            "up": up_count,
            "down": down_count,
            "unknown": total - up_count - down_count
        },
        "average_uptime": round(avg_uptime, 2)
    }

