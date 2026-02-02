"""
Forge database package.

Provides async SQLAlchemy models and session management.
"""
from .base import Base, TimestampMixin, SoftDeleteMixin
from .session import (
    get_db,
    init_db,
    close_db,
    AsyncSessionLocal,
    engine
)
from .models import (
    User,
    Project,
    Server,
    Backup,
    BackupSchedule,
    Monitor,
    ProjectServer,
    WPCredential,
    OAuthToken,
    AnalyticsReport,
    # Enums
    ProjectStatus,
    EnvironmentType,
    ServerProvider,
    ServerStatus,
    PanelType,
    BackupType,
    BackupStorageType,
    BackupStatus,
    ScheduleFrequency,
    ScheduleStatus,
    MonitorType,
    MonitorStatus,
    ServerEnvironment,
    OAuthProvider,
    AnalyticsReportType,
)

__all__ = [
    # Base and mixins
    "Base",
    "TimestampMixin",
    "SoftDeleteMixin",
    # Session management
    "get_db",
    "init_db",
    "close_db",
    "AsyncSessionLocal",
    "engine",
    # Models
    "User",
    "Project",
    "Server",
    "Backup",
    "BackupSchedule",
    "Monitor",
    "ProjectServer",
    "WPCredential",
    "OAuthToken",
    "AnalyticsReport",
    # Enums
    "ProjectStatus",
    "EnvironmentType",
    "ServerProvider",
    "ServerStatus",
    "PanelType",
    "BackupType",
    "BackupStorageType",
    "BackupStatus",
    "ScheduleFrequency",
    "ScheduleStatus",
    "MonitorType",
    "MonitorStatus",
    "ServerEnvironment",
    "OAuthProvider",
    "AnalyticsReportType",
]
