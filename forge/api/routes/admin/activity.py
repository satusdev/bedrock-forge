"""
Activity Feed API routes.

Provides endpoints for viewing recent system activity.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ....db import get_db, User
from ....db.models.audit import AuditLog, AuditAction
from ...deps import get_current_active_user

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class ActivityItem(BaseModel):
    """Single activity item."""
    id: int
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime


class ActivityFeedResponse(BaseModel):
    """Activity feed response."""
    items: List[ActivityItem]
    total: int
    has_more: bool


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/", response_model=ActivityFeedResponse)
async def get_activity_feed(
    limit: int = Query(default=50, le=100),
    offset: int = 0,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    hours: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get recent activity feed.
    
    Filters:
    - action: Filter by action type (create, update, delete, etc.)
    - entity_type: Filter by entity (project, server, etc.)
    - hours: Only show activity from last N hours
    """
    query = select(AuditLog).options(selectinload(AuditLog.user))
    
    # Apply filters
    if action:
        try:
            action_enum = AuditAction(action)
            query = query.where(AuditLog.action == action_enum)
        except ValueError:
            pass
    
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)

    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    
    if hours:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        query = query.where(AuditLog.created_at >= cutoff)
    
    # Get total count
    count_query = select(AuditLog)
    if action:
        try:
            count_query = count_query.where(AuditLog.action == AuditAction(action))
        except ValueError:
            pass
    if entity_type:
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        count_query = count_query.where(AuditLog.entity_id == entity_id)
    if hours:
        count_query = count_query.where(AuditLog.created_at >= cutoff)
    
    result = await db.execute(count_query)
    total = len(result.all())
    
    # Get paginated results
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    items = [
        ActivityItem(
            id=log.id,
            action=log.action.value if log.action else "unknown",
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            user_id=log.user_id,
            user_name=log.user.full_name or log.user.username if log.user else None,
            ip_address=log.ip_address,
            created_at=log.created_at
        )
        for log in logs
    ]
    
    return ActivityFeedResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total
    )


@router.get("/summary")
async def get_activity_summary(
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get activity summary for dashboard widget.
    
    Returns counts by action type for the specified period.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    result = await db.execute(
        select(AuditLog).where(AuditLog.created_at >= cutoff)
    )
    logs = result.scalars().all()
    
    # Count by action
    action_counts = {}
    for log in logs:
        action = log.action.value if log.action else "unknown"
        action_counts[action] = action_counts.get(action, 0) + 1
    
    # Count by entity type
    entity_counts = {}
    for log in logs:
        if log.entity_type:
            entity_counts[log.entity_type] = entity_counts.get(log.entity_type, 0) + 1
    
    return {
        "period_hours": hours,
        "total_activities": len(logs),
        "by_action": action_counts,
        "by_entity": entity_counts,
        "unique_users": len(set(log.user_id for log in logs if log.user_id))
    }
