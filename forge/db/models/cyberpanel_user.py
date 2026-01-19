"""
CyberPanel User model for storing panel user credentials.

Stores encrypted passwords for CyberPanel users managed via Forge.
CyberPanel is the source of truth - this is a local cache for passwords
and metadata that CyberPanel doesn't expose via API.
"""
from enum import Enum as PyEnum
from datetime import datetime

from sqlalchemy import String, Text, ForeignKey, Boolean, Enum, DateTime, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional

from ..base import Base, TimestampMixin
from ..custom_types import EncryptedString

if TYPE_CHECKING:
    from .server import Server
    from .user import User


class CyberPanelUserStatus(str, PyEnum):
    """Status of a CyberPanel user."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_SYNC = "pending_sync"  # Created in Forge, not yet synced to CyberPanel
    SYNC_ERROR = "sync_error"  # Failed to sync with CyberPanel
    DELETED = "deleted"  # Deleted from CyberPanel but kept for audit


class CyberPanelUserType(str, PyEnum):
    """Type of CyberPanel user (ACL level)."""
    ADMIN = "admin"  # Full admin access
    RESELLER = "reseller"  # Can create users and websites
    USER = "user"  # Standard user, can manage own websites


class CyberPanelUser(Base, TimestampMixin):
    """
    CyberPanel user credentials cache.
    
    CyberPanel is the source of truth for user existence and properties.
    This model caches:
    - Encrypted passwords (CyberPanel doesn't expose these via API)
    - Metadata for Forge management
    - Resource limits and quotas
    - Audit trail of user operations
    
    Passwords are encrypted using Fernet with server owner's key derivation.
    
    Sync Strategy:
    - list_users() from CyberPanel updates local cache
    - Users created via Forge are marked synced_from_panel=False
    - Users discovered during sync are marked synced_from_panel=True
    - Only Forge-created users have stored passwords
    """
    
    __tablename__ = "cyberpanel_users"
    
    # Unique constraint: one username per server
    __table_args__ = (
        UniqueConstraint('server_id', 'username', name='uq_server_username'),
    )
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Foreign keys
    server_id: Mapped[int] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    
    # ===== CyberPanel User Info (synced from CyberPanel) =====
    username: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    user_type: Mapped[CyberPanelUserType] = mapped_column(
        Enum(CyberPanelUserType), 
        default=CyberPanelUserType.USER
    )
    
    # ACL name in CyberPanel (e.g., "user", "reseller", "admin")
    acl_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # ===== Password Management =====
    # Encrypted password - only available for users created via Forge
    password_encrypted: Mapped[Optional[str]] = mapped_column(
        EncryptedString, nullable=True
    )
    password_set_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_last_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Track if password was changed outside Forge (detected during sync)
    password_out_of_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # ===== Status and Sync Tracking =====
    status: Mapped[CyberPanelUserStatus] = mapped_column(
        Enum(CyberPanelUserStatus), 
        default=CyberPanelUserStatus.ACTIVE
    )
    
    # Sync metadata
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    synced_from_panel: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # True if discovered during sync, False if created via Forge
    sync_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # ===== CyberPanel Resource Limits =====
    # Website limits
    websites_limit: Mapped[int] = mapped_column(
        Integer, default=0
    )  # 0 = unlimited
    websites_count: Mapped[int] = mapped_column(
        Integer, default=0
    )  # Current count from sync
    
    # Disk quota (MB)
    disk_limit: Mapped[int] = mapped_column(
        Integer, default=0
    )  # 0 = unlimited, in MB
    disk_used: Mapped[int] = mapped_column(
        Integer, default=0
    )  # Current usage in MB
    
    # Bandwidth limit (MB/month)
    bandwidth_limit: Mapped[int] = mapped_column(
        Integer, default=0
    )  # 0 = unlimited, in MB
    bandwidth_used: Mapped[int] = mapped_column(
        Integer, default=0
    )  # Current month usage in MB
    
    # Database limits
    databases_limit: Mapped[int] = mapped_column(Integer, default=0)
    databases_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Email limits
    email_accounts_limit: Mapped[int] = mapped_column(Integer, default=0)
    email_accounts_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # FTP limits
    ftp_accounts_limit: Mapped[int] = mapped_column(Integer, default=0)
    ftp_accounts_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # ===== Package/Plan Info =====
    package_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # CyberPanel package assigned to user
    
    # ===== Audit and Notes =====
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Last login tracking (if available from CyberPanel)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    
    # ===== Relationships =====
    server: Mapped["Server"] = relationship(
        "Server", back_populates="cyberpanel_users"
    )
    created_by: Mapped[Optional["User"]] = relationship(
        "User", back_populates="created_cyberpanel_users"
    )
    
    def __repr__(self) -> str:
        return f"<CyberPanelUser(id={self.id}, username='{self.username}', server_id={self.server_id}, type={self.user_type.value})>"
    
    @property
    def has_password(self) -> bool:
        """Check if we have the password stored."""
        return self.password_encrypted is not None
    
    @property
    def full_name(self) -> str:
        """Get full name or username if not available."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        return self.username
    
    @property
    def disk_usage_percent(self) -> Optional[float]:
        """Calculate disk usage percentage."""
        if self.disk_limit and self.disk_limit > 0:
            return round((self.disk_used / self.disk_limit) * 100, 1)
        return None
    
    @property
    def bandwidth_usage_percent(self) -> Optional[float]:
        """Calculate bandwidth usage percentage."""
        if self.bandwidth_limit and self.bandwidth_limit > 0:
            return round((self.bandwidth_used / self.bandwidth_limit) * 100, 1)
        return None
    
    @property
    def is_over_quota(self) -> bool:
        """Check if user is over any quota."""
        if self.disk_limit > 0 and self.disk_used >= self.disk_limit:
            return True
        if self.bandwidth_limit > 0 and self.bandwidth_used >= self.bandwidth_limit:
            return True
        if self.websites_limit > 0 and self.websites_count >= self.websites_limit:
            return True
        return False
    
    def to_dict(self, include_password: bool = False) -> dict:
        """Convert to dictionary for API responses."""
        data = {
            "id": self.id,
            "server_id": self.server_id,
            "username": self.username,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "user_type": self.user_type.value,
            "acl_name": self.acl_name,
            "status": self.status.value,
            "has_password": self.has_password,
            "password_set_at": self.password_set_at.isoformat() if self.password_set_at else None,
            "password_out_of_sync": self.password_out_of_sync,
            "synced_from_panel": self.synced_from_panel,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "package_name": self.package_name,
            "limits": {
                "websites": {"limit": self.websites_limit, "used": self.websites_count},
                "disk_mb": {"limit": self.disk_limit, "used": self.disk_used, "percent": self.disk_usage_percent},
                "bandwidth_mb": {"limit": self.bandwidth_limit, "used": self.bandwidth_used, "percent": self.bandwidth_usage_percent},
                "databases": {"limit": self.databases_limit, "used": self.databases_count},
                "email_accounts": {"limit": self.email_accounts_limit, "used": self.email_accounts_count},
                "ftp_accounts": {"limit": self.ftp_accounts_limit, "used": self.ftp_accounts_count},
            },
            "is_over_quota": self.is_over_quota,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "last_login_ip": self.last_login_ip,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        
        # Only include password if explicitly requested and available
        if include_password and self.has_password:
            data["password"] = self.password_encrypted  # Will be decrypted by caller
        
        return data
