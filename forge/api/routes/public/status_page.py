"""
Public Status Page API routes.

Provides unauthenticated endpoints for viewing project/monitor status.
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ....db import AsyncSessionLocal
from ....db.models.project import Project
from ....db.models.monitor import Monitor, MonitorStatus
from ....db.models.heartbeat import Heartbeat, HeartbeatStatus
from ....db.models.incident import Incident, IncidentStatus

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class MonitorStatusResponse(BaseModel):
    """Status of a single monitor."""
    name: str
    status: str
    uptime_24h: float
    uptime_30d: float
    response_time_ms: Optional[int] = None
    last_check: Optional[datetime] = None


class IncidentSummary(BaseModel):
    """Summary of an incident."""
    title: str
    status: str
    started_at: datetime
    resolved_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


class StatusPageResponse(BaseModel):
    """Public status page response."""
    project_name: str
    overall_status: str  # operational, degraded, major_outage
    monitors: List[MonitorStatusResponse]
    recent_incidents: List[IncidentSummary]
    last_updated: datetime


class UptimeHistoryPoint(BaseModel):
    """Single point in uptime history."""
    date: str
    uptime_percentage: float
    checks_total: int
    checks_up: int


class StatusHistoryResponse(BaseModel):
    """Uptime history for status page."""
    project_name: str
    period_days: int
    history: List[UptimeHistoryPoint]
    average_uptime: float


# ============================================================================
# Helper Functions
# ============================================================================

async def calculate_uptime(
    db: AsyncSession, 
    monitor_id: int, 
    hours: int
) -> float:
    """Calculate uptime percentage for a monitor over given hours."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    result = await db.execute(
        select(
            func.count(Heartbeat.id).label("total"),
            func.count(Heartbeat.id).filter(
                Heartbeat.status == HeartbeatStatus.UP
            ).label("up_count")
        )
        .where(Heartbeat.monitor_id == monitor_id)
        .where(Heartbeat.checked_at >= cutoff)
    )
    row = result.one()
    
    if row.total == 0:
        return 100.0  # No data, assume up
    
    return round((row.up_count / row.total) * 100, 2)


def determine_overall_status(monitors: list) -> str:
    """Determine overall status from monitor list."""
    if not monitors:
        return "unknown"
    
    down_count = sum(1 for m in monitors if m.last_status == MonitorStatus.DOWN)
    degraded_count = sum(1 for m in monitors if m.last_status == MonitorStatus.DEGRADED)
    
    if down_count == len(monitors):
        return "major_outage"
    elif down_count > 0 or degraded_count > 0:
        return "degraded"
    return "operational"


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{project_id}", response_model=StatusPageResponse)
async def get_status_page(project_id: int):
    """
    Get public status page for a project.
    
    No authentication required.
    Returns current status of all monitors and recent incidents.
    """
    async with AsyncSessionLocal() as db:
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Get monitors for this project
        result = await db.execute(
            select(Monitor)
            .where(Monitor.project_id == project_id)
            .where(Monitor.is_active == True)
        )
        monitors = result.scalars().all()
        
        # Build monitor status list
        monitor_statuses = []
        for monitor in monitors:
            uptime_24h = await calculate_uptime(db, monitor.id, 24)
            uptime_30d = await calculate_uptime(db, monitor.id, 24 * 30)
            
            monitor_statuses.append(MonitorStatusResponse(
                name=monitor.name,
                status=monitor.last_status.value if monitor.last_status else "pending",
                uptime_24h=uptime_24h,
                uptime_30d=uptime_30d,
                response_time_ms=monitor.last_response_time_ms,
                last_check=monitor.last_check_at
            ))
        
        # Get recent incidents (last 30 days)
        cutoff = datetime.utcnow() - timedelta(days=30)
        monitor_ids = [m.id for m in monitors]
        
        recent_incidents = []
        if monitor_ids:
            result = await db.execute(
                select(Incident)
                .where(Incident.monitor_id.in_(monitor_ids))
                .where(Incident.started_at >= cutoff)
                .order_by(Incident.started_at.desc())
                .limit(10)
            )
            incidents = result.scalars().all()
            
            recent_incidents = [
                IncidentSummary(
                    title=inc.title,
                    status=inc.status.value,
                    started_at=inc.started_at,
                    resolved_at=inc.resolved_at,
                    duration_seconds=inc.duration_seconds
                )
                for inc in incidents
            ]
        
        return StatusPageResponse(
            project_name=project.name,
            overall_status=determine_overall_status(monitors),
            monitors=monitor_statuses,
            recent_incidents=recent_incidents,
            last_updated=datetime.utcnow()
        )


@router.get("/{project_id}/history", response_model=StatusHistoryResponse)
async def get_status_history(project_id: int, days: int = 30):
    """
    Get uptime history for a project.
    
    Returns daily uptime percentages for the specified period.
    """
    if days > 90:
        days = 90  # Cap at 90 days
    
    async with AsyncSessionLocal() as db:
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Get monitor IDs
        result = await db.execute(
            select(Monitor.id)
            .where(Monitor.project_id == project_id)
            .where(Monitor.is_active == True)
        )
        monitor_ids = [row[0] for row in result.all()]
        
        if not monitor_ids:
            return StatusHistoryResponse(
                project_name=project.name,
                period_days=days,
                history=[],
                average_uptime=100.0
            )
        
        # Calculate daily uptime
        history = []
        total_uptime = 0.0
        
        for day_offset in range(days):
            date = datetime.utcnow().date() - timedelta(days=day_offset)
            start = datetime.combine(date, datetime.min.time())
            end = datetime.combine(date, datetime.max.time())
            
            # Get heartbeats for this day
            result = await db.execute(
                select(
                    func.count(Heartbeat.id).label("total"),
                    func.count(Heartbeat.id).filter(
                        Heartbeat.status == HeartbeatStatus.UP
                    ).label("up_count")
                )
                .where(Heartbeat.monitor_id.in_(monitor_ids))
                .where(Heartbeat.checked_at >= start)
                .where(Heartbeat.checked_at <= end)
            )
            row = result.one()
            
            if row.total > 0:
                uptime = round((row.up_count / row.total) * 100, 2)
            else:
                uptime = 100.0  # No data, assume up
            
            history.append(UptimeHistoryPoint(
                date=date.isoformat(),
                uptime_percentage=uptime,
                checks_total=row.total,
                checks_up=row.up_count
            ))
            total_uptime += uptime
        
        return StatusHistoryResponse(
            project_name=project.name,
            period_days=days,
            history=list(reversed(history)),  # Oldest first
            average_uptime=round(total_uptime / days, 2) if days > 0 else 100.0
        )
