"""
Role and Permission database models for RBAC.

Implements role-based access control with:
- Roles (admin, manager, developer, viewer)
- Permissions (page/action based)
- User-Role junction table
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Boolean, ForeignKey, Table, Column, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


# Junction table for Role-Permission many-to-many
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

# Junction table for User-Role many-to-many
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base, TimestampMixin):
    """Permission model for granular access control."""
    
    __tablename__ = "permissions"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Permission identification
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Grouping for UI
    category: Mapped[str] = mapped_column(String(100), default="general")
    
    # Relationships
    roles: Mapped[List["Role"]] = relationship(
        "Role", secondary=role_permissions, back_populates="permissions"
    )
    
    def __repr__(self) -> str:
        return f"<Permission(code='{self.code}')>"


class Role(Base, TimestampMixin):
    """Role model for grouping permissions."""
    
    __tablename__ = "roles"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Role identification
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Visual
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")  # Hex color
    
    # System role (cannot be deleted)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Relationships
    permissions: Mapped[List["Permission"]] = relationship(
        "Permission", secondary=role_permissions, back_populates="roles"
    )
    users: Mapped[List["User"]] = relationship(
        "User", secondary=user_roles, back_populates="roles"
    )
    
    def __repr__(self) -> str:
        return f"<Role(name='{self.name}')>"
    
    def has_permission(self, permission_code: str) -> bool:
        """Check if role has a specific permission."""
        return any(p.code == permission_code for p in self.permissions)


# Default permissions to seed
DEFAULT_PERMISSIONS = [
    # Projects
    {"code": "projects.view", "name": "View Projects", "category": "projects", "description": "View project list and details"},
    {"code": "projects.create", "name": "Create Projects", "category": "projects", "description": "Create new projects"},
    {"code": "projects.edit", "name": "Edit Projects", "category": "projects", "description": "Modify project settings"},
    {"code": "projects.delete", "name": "Delete Projects", "category": "projects", "description": "Delete projects permanently"},
    
    # Servers
    {"code": "servers.view", "name": "View Servers", "category": "servers", "description": "View server list and details"},
    {"code": "servers.manage", "name": "Manage Servers", "category": "servers", "description": "Add, edit, and remove servers"},
    {"code": "servers.scan", "name": "Scan Servers", "category": "servers", "description": "Scan servers for sites"},
    
    # Clients
    {"code": "clients.view", "name": "View Clients", "category": "clients", "description": "View client list and details"},
    {"code": "clients.manage", "name": "Manage Clients", "category": "clients", "description": "Add, edit, and remove clients"},
    
    # Deployments
    {"code": "deployments.view", "name": "View Deployments", "category": "deployments", "description": "View deployment history"},
    {"code": "deployments.execute", "name": "Execute Deployments", "category": "deployments", "description": "Trigger and manage deployments"},
    {"code": "deployments.rollback", "name": "Rollback Deployments", "category": "deployments", "description": "Rollback to previous versions"},
    
    # Backups
    {"code": "backups.view", "name": "View Backups", "category": "backups", "description": "View backup list and status"},
    {"code": "backups.manage", "name": "Manage Backups", "category": "backups", "description": "Create, restore, and delete backups"},
    {"code": "backups.restore", "name": "Restore Backups", "category": "backups", "description": "Restore from backup files"},
    
    # Monitoring
    {"code": "monitoring.view", "name": "View Monitoring", "category": "monitoring", "description": "View monitoring dashboards"},
    {"code": "monitoring.manage", "name": "Manage Monitors", "category": "monitoring", "description": "Configure monitoring rules"},
    {"code": "monitoring.alerts", "name": "Manage Alerts", "category": "monitoring", "description": "Configure alert notifications"},
    
    # Tags
    {"code": "tags.view", "name": "View Tags", "category": "tags", "description": "View tag list"},
    {"code": "tags.manage", "name": "Manage Tags", "category": "tags", "description": "Create, edit, and delete tags"},
    
    # Sync
    {"code": "sync.view", "name": "View Sync Status", "category": "sync", "description": "View sync history and status"},
    {"code": "sync.execute", "name": "Execute Sync", "category": "sync", "description": "Trigger sync operations"},
    
    # Reports
    {"code": "reports.view", "name": "View Reports", "category": "reports", "description": "View system reports"},
    {"code": "reports.export", "name": "Export Reports", "category": "reports", "description": "Export reports to files"},
    
    # Audit
    {"code": "audit.view", "name": "View Audit Logs", "category": "audit", "description": "View system audit logs"},
    {"code": "audit.export", "name": "Export Audit Logs", "category": "audit", "description": "Export audit logs to files"},
    
    # Templates
    {"code": "templates.view", "name": "View Templates", "category": "templates", "description": "View project templates"},
    {"code": "templates.manage", "name": "Manage Templates", "category": "templates", "description": "Create and edit templates"},
    
    # Settings
    {"code": "settings.view", "name": "View Settings", "category": "settings", "description": "View system settings"},
    {"code": "settings.manage", "name": "Manage Settings", "category": "settings", "description": "Modify system settings"},
    
    # Users & Roles
    {"code": "users.view", "name": "View Users", "category": "users", "description": "View user list"},
    {"code": "users.manage", "name": "Manage Users", "category": "users", "description": "Add, edit, and remove users"},
    {"code": "roles.view", "name": "View Roles", "category": "users", "description": "View role list"},
    {"code": "roles.manage", "name": "Manage Roles", "category": "users", "description": "Create and edit roles"},
]

# Default roles to seed
DEFAULT_ROLES = [
    {
        "name": "admin",
        "display_name": "Administrator",
        "description": "Full system access",
        "color": "#ef4444",
        "is_system": True,
        "permissions": ["*"],  # All permissions
    },
    {
        "name": "manager",
        "display_name": "Manager",
        "description": "Project and client management",
        "color": "#f59e0b",
        "is_system": True,
        "permissions": [
            "projects.*", "clients.*", "deployments.*", 
            "backups.*", "servers.view"
        ],
    },
    {
        "name": "developer",
        "display_name": "Developer",
        "description": "Development and deployment",
        "color": "#3b82f6",
        "is_system": True,
        "permissions": [
            "projects.view", "projects.edit", "deployments.*",
            "backups.view", "monitoring.view"
        ],
    },
    {
        "name": "viewer",
        "display_name": "Viewer",
        "description": "Read-only access",
        "color": "#6b7280",
        "is_system": True,
        "permissions": [
            "projects.view", "servers.view", "clients.view",
            "deployments.view", "backups.view", "monitoring.view"
        ],
    },
]
