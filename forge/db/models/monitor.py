"""
Monitor database model for uptime and health tracking.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, Float, Boolean, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .project_server import ProjectServer
    from .heartbeat import Heartbeat
    from .incident import Incident


class MonitorType(str, PyEnum):
    """Monitor check type - Uptime Kuma style."""
    # Basic checks
    UPTIME = "uptime"           # HTTP/HTTPS availability
    PERFORMANCE = "performance"  # Response time monitoring
    SSL = "ssl"                  # SSL certificate expiry
    SECURITY = "security"        # Security scan
    
    # Advanced checks (Uptime Kuma parity)
    TCP = "tcp"                  # TCP port connectivity
    PING = "ping"                # ICMP ping
    DNS = "dns"                  # DNS resolution
    KEYWORD = "keyword"          # Check for keyword presence
    JSON_QUERY = "json_query"    # JSON response validation


class MonitorStatus(str, PyEnum):
    """Current monitor status."""
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    PENDING = "pending"
    MAINTENANCE = "maintenance"


def _enum_values(enum_cls: type[PyEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class Monitor(Base, TimestampMixin):
    """Uptime/health monitor model (Uptime Kuma style)."""
    
    __tablename__ = "monitors"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    monitor_type: Mapped[MonitorType] = mapped_column(
        Enum(
            MonitorType,
            values_callable=_enum_values,
            name="monitortype",
        ),
        default=MonitorType.UPTIME,
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    
    # Check configuration
    interval_seconds: Mapped[int] = mapped_column(Integer, default=300)  # 5 min
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # TCP port (for TCP monitor type)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Keyword check (for KEYWORD monitor type)
    expected_keyword: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # DNS record type (for DNS monitor type)
    dns_record_type: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )  # A, AAAA, CNAME, MX, TXT, etc.
    
    # JSON query path (for JSON_QUERY monitor type)
    json_query_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    json_expected_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Status tracking
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status: Mapped[MonitorStatus | None] = mapped_column(
        Enum(
            MonitorStatus,
            values_callable=_enum_values,
            name="monitorstatus",
        ),
        nullable=True,
    )
    last_response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uptime_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Alert configuration
    alert_on_down: Mapped[bool] = mapped_column(Boolean, default=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    
    # Maintenance window
    maintenance_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    maintenance_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    maintenance_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Notification settings (JSON stored as text)
    notification_channels: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON: ["email", "slack", "telegram"]
    
    # Foreign keys
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    project_server_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_servers.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    
    # Relationships
    project: Mapped["Project | None"] = relationship(
        "Project", back_populates="monitors"
    )
    project_server: Mapped["ProjectServer | None"] = relationship(
        "ProjectServer", back_populates="monitors"
    )
    created_by: Mapped["User"] = relationship("User", back_populates="monitors")
    heartbeats: Mapped[list["Heartbeat"]] = relationship(
        "Heartbeat", back_populates="monitor", cascade="all, delete-orphan"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        "Incident", back_populates="monitor", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Monitor(id={self.id}, name='{self.name}', status={self.last_status})>"
