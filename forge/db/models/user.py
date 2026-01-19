"""
User database model.
"""
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .project import Project
    from .server import Server
    from .backup import Backup
    from .backup_schedule import BackupSchedule
    from .monitor import Monitor
    from .wp_credential import WPCredential
    from .notification_channel import NotificationChannel
    from .client import Client
    from .audit import AuditLog
    from .role import Role
    from .cyberpanel_user import CyberPanelUser
    from .oauth_token import OAuthToken


class User(Base, TimestampMixin):
    """User model for authentication and ownership."""
    
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Avatar URL
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Relationships
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="owner", cascade="all, delete-orphan"
    )
    servers: Mapped[list["Server"]] = relationship(
        "Server", back_populates="owner", cascade="all, delete-orphan"
    )
    backups: Mapped[list["Backup"]] = relationship(
        "Backup", back_populates="created_by"
    )
    backup_schedules: Mapped[list["BackupSchedule"]] = relationship(
        "BackupSchedule", back_populates="created_by"
    )
    monitors: Mapped[list["Monitor"]] = relationship(
        "Monitor", back_populates="created_by"
    )
    wp_credentials: Mapped[list["WPCredential"]] = relationship(
        "WPCredential", back_populates="user", cascade="all, delete-orphan"
    )
    notification_channels: Mapped[list["NotificationChannel"]] = relationship(
        "NotificationChannel", back_populates="owner", cascade="all, delete-orphan"
    )
    clients: Mapped[list["Client"]] = relationship(
        "Client", back_populates="owner", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user", cascade="all, delete-orphan"
    )
    
    # CyberPanel users created by this user
    created_cyberpanel_users: Mapped[list["CyberPanelUser"]] = relationship(
        "CyberPanelUser", back_populates="created_by"
    )
    
    # Roles (many-to-many via user_roles junction)
    roles: Mapped[List["Role"]] = relationship(
        "Role", secondary="user_roles", back_populates="users"
    )
    
    # OAuth tokens for external integrations
    oauth_tokens: Mapped[list["OAuthToken"]] = relationship(
        "OAuthToken", back_populates="user", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}')>"
    
    def has_permission(self, permission_code: str) -> bool:
        """Check if user has a specific permission through any role."""
        if self.is_superuser:
            return True
        return any(role.has_permission(permission_code) for role in self.roles)
    
    def get_all_permissions(self) -> set:
        """Get all permission codes for this user."""
        if self.is_superuser:
            return {"*"}
        permissions = set()
        for role in self.roles:
            for perm in role.permissions:
                permissions.add(perm.code)
        return permissions
