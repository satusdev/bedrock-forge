"""
Analytics report model.

Stores GA4 and Lighthouse reports for reference.
"""
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, Integer, ForeignKey, DateTime, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin


class AnalyticsReportType(str, PyEnum):
    """Analytics report types."""
    GA4 = "ga4"
    LIGHTHOUSE = "lighthouse"


def _enum_values(enum_cls: type[PyEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class AnalyticsReport(Base, TimestampMixin):
    """Analytics report record for GA4 and Lighthouse runs."""

    __tablename__ = "analytics_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )

    environment_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_servers.id", ondelete="SET NULL"), index=True, nullable=True
    )

    report_type: Mapped[AnalyticsReportType] = mapped_column(
        Enum(
            AnalyticsReportType,
            values_callable=_enum_values,
            name="analyticsreporttype",
        ),
        index=True,
        nullable=False,
    )

    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    property_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    device: Mapped[str | None] = mapped_column(String(20), nullable=True)

    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    project = relationship("Project", backref="analytics_reports")

    def __repr__(self) -> str:
        return f"<AnalyticsReport(id={self.id}, type={self.report_type})>"
