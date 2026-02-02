"""
Analytics API routes.

Provides on-demand GA4 and Lighthouse reports with persistence.
"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional, Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db import get_db, Project, User
from ....db.models.project_server import ProjectServer
from ....db.models.analytics_report import AnalyticsReport, AnalyticsReportType
from ....utils.analytics_collector import GoogleAnalyticsCollector
from ....utils.performance_tester import PerformanceTester
from ....utils.exceptions import ForgeException
from ....utils.logging import logger
from ...deps import get_current_active_user

router = APIRouter()


class Ga4RunRequest(BaseModel):
    project_id: int
    environment_id: Optional[int] = None
    property_id: Optional[str] = None
    credentials_path: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    days: int = Field(default=30, ge=1, le=365)


class LighthouseRunRequest(BaseModel):
    project_id: int
    environment_id: Optional[int] = None
    url: Optional[str] = None
    device: str = Field(default="desktop", pattern="^(desktop|mobile)$")


class AnalyticsReportRead(BaseModel):
    id: int
    project_id: int
    environment_id: Optional[int] = None
    report_type: AnalyticsReportType
    url: Optional[str] = None
    property_id: Optional[str] = None
    device: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    summary: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AnalyticsReportDetail(AnalyticsReportRead):
    payload: Optional[Dict[str, Any]] = None


class ReportHistoryResponse(BaseModel):
    items: List[AnalyticsReportRead]
    count: int


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if is_dataclass(value):
        return {k: _serialize(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    return value


def _summarize_ga4(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {
            "total_sessions": 0,
            "total_users": 0,
            "total_pageviews": 0,
            "avg_bounce_rate": 0,
            "avg_session_duration": 0,
            "new_users": 0,
        }

    total_sessions = sum(row.get("sessions", 0) for row in rows)
    total_users = sum(row.get("users", 0) for row in rows)
    total_pageviews = sum(row.get("pageviews", 0) for row in rows)
    new_users = sum(row.get("newUsers", 0) for row in rows)
    avg_bounce_rate = sum(row.get("bounceRate", 0) for row in rows) / len(rows)
    avg_session_duration = sum(row.get("averageSessionDuration", 0) for row in rows) / len(rows)

    return {
        "total_sessions": total_sessions,
        "total_users": total_users,
        "total_pageviews": total_pageviews,
        "new_users": new_users,
        "avg_bounce_rate": round(avg_bounce_rate, 2),
        "avg_session_duration": round(avg_session_duration, 2),
    }


async def _get_project_environment(
    db: AsyncSession,
    project_id: int,
    environment_id: Optional[int],
    owner_id: int,
) -> Optional[ProjectServer]:
    if not environment_id:
        return None

    result = await db.execute(
        select(ProjectServer)
        .join(Project, Project.id == ProjectServer.project_id)
        .where(
            ProjectServer.id == environment_id,
            Project.id == project_id,
            Project.owner_id == owner_id,
        )
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


def _normalize_url(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        return trimmed
    parsed = urlparse(trimmed)
    if not parsed.scheme:
        trimmed = f"https://{trimmed}"
        parsed = urlparse(trimmed)
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL provided")
    return trimmed


@router.post("/ga4/run", response_model=AnalyticsReportDetail)
async def run_ga4_report(
    payload: Ga4RunRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Run an on-demand GA4 report and persist results."""
    project_result = await db.execute(
        select(Project).where(Project.id == payload.project_id, Project.owner_id == current_user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    env_link = await _get_project_environment(
        db, project.id, payload.environment_id, current_user.id
    )

    start_date = payload.start_date
    end_date = payload.end_date
    if not start_date or not end_date:
        end_date = date.today()
        start_date = end_date - timedelta(days=payload.days - 1)

    collector = GoogleAnalyticsCollector(
        property_id=payload.property_id or "demo",
        credentials_path=payload.credentials_path or "",
    )

    ga_data = await collector.get_traffic_data(
        datetime.combine(start_date, datetime.min.time()),
        datetime.combine(end_date, datetime.min.time()),
    )
    rows = (ga_data or {}).get("rows", [])
    summary = _summarize_ga4(rows)

    report = AnalyticsReport(
        project_id=project.id,
        environment_id=env_link.id if env_link else None,
        report_type=AnalyticsReportType.GA4,
        url=env_link.wp_url if env_link else project.wp_home,
        property_id=payload.property_id,
        start_date=datetime.combine(start_date, datetime.min.time()),
        end_date=datetime.combine(end_date, datetime.min.time()),
        summary=summary,
        payload=_serialize(ga_data or {}),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return AnalyticsReportDetail(
        id=report.id,
        project_id=report.project_id,
        environment_id=report.environment_id,
        report_type=report.report_type,
        url=report.url,
        property_id=report.property_id,
        device=report.device,
        start_date=report.start_date,
        end_date=report.end_date,
        summary=report.summary,
        created_at=report.created_at,
        payload=report.payload,
    )


@router.post("/lighthouse/run", response_model=AnalyticsReportDetail)
async def run_lighthouse_report(
    payload: LighthouseRunRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Run an on-demand Lighthouse SEO report and persist results."""
    project_result = await db.execute(
        select(Project).where(Project.id == payload.project_id, Project.owner_id == current_user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    env_link = await _get_project_environment(
        db, project.id, payload.environment_id, current_user.id
    )

    target_url = payload.url or (env_link.wp_url if env_link else project.wp_home)
    if not target_url:
        raise HTTPException(status_code=400, detail="Project has no URL configured")

    target_url = _normalize_url(target_url)

    base_path = Path(project.path) if project.path else Path.home() / ".forge" / "analytics"
    tester = PerformanceTester(project_path=base_path)
    try:
        result = await tester.run_lighthouse_test(url=target_url, device=payload.device)
    except ForgeException as exc:
        logger.warning(f"Lighthouse run failed: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))

    summary = {
        "performance_score": result.performance_score,
        "accessibility_score": result.accessibility_score,
        "best_practices_score": result.best_practices_score,
        "seo_score": result.seo_score,
        "pwa_score": result.pwa_score,
        "core_web_vitals": _serialize(result.core_web_vitals),
        "test_duration": result.test_duration,
    }

    report = AnalyticsReport(
        project_id=project.id,
        environment_id=env_link.id if env_link else None,
        report_type=AnalyticsReportType.LIGHTHOUSE,
        url=target_url,
        device=payload.device,
        summary=summary,
        payload=_serialize(result),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return AnalyticsReportDetail(
        id=report.id,
        project_id=report.project_id,
        environment_id=report.environment_id,
        report_type=report.report_type,
        url=report.url,
        property_id=report.property_id,
        device=report.device,
        start_date=report.start_date,
        end_date=report.end_date,
        summary=report.summary,
        created_at=report.created_at,
        payload=report.payload,
    )


@router.get("/reports", response_model=ReportHistoryResponse)
async def list_reports(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    project_id: int = Query(..., ge=1),
    environment_id: Optional[int] = Query(None, ge=1),
    report_type: Optional[AnalyticsReportType] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """List analytics reports for a project."""
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    stmt = select(AnalyticsReport).where(AnalyticsReport.project_id == project_id)
    if environment_id:
        stmt = stmt.where(AnalyticsReport.environment_id == environment_id)
    if report_type:
        stmt = stmt.where(AnalyticsReport.report_type == report_type)

    result = await db.execute(stmt.order_by(AnalyticsReport.created_at.desc()).limit(limit))
    items = result.scalars().all()

    return ReportHistoryResponse(items=items, count=len(items))


@router.get("/reports/{report_id}", response_model=AnalyticsReportDetail)
async def get_report(
    report_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Fetch a single report with payload."""
    result = await db.execute(
        select(AnalyticsReport)
        .join(Project, AnalyticsReport.project_id == Project.id)
        .where(AnalyticsReport.id == report_id, Project.owner_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return AnalyticsReportDetail(
        id=report.id,
        project_id=report.project_id,
        report_type=report.report_type,
        url=report.url,
        property_id=report.property_id,
        device=report.device,
        start_date=report.start_date,
        end_date=report.end_date,
        summary=report.summary,
        created_at=report.created_at,
        payload=report.payload,
    )
