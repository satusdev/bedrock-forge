"""
WordPress Credential model for quick login functionality.

Stores encrypted WordPress admin credentials for direct dashboard access.
"""
from enum import Enum as PyEnum

from sqlalchemy import String, Text, ForeignKey, Boolean, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project_server import ProjectServer


class CredentialStatus(str, PyEnum):
    """Status of a WordPress credential."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXPIRED = "expired"


class WPCredential(Base, TimestampMixin):
    """
    Encrypted WordPress admin credentials for quick login.
    
    Credentials are encrypted using Fernet symmetric encryption
    with user-specific key derivation for security.
    """
    
    __tablename__ = "wp_credentials"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Foreign keys
    project_server_id: Mapped[int] = mapped_column(
        ForeignKey("project_servers.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    
    # Credential label for identification
    label: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Admin"
    )  # e.g., "Admin", "Editor", "Client Account"
    
    # Encrypted credentials (Fernet encrypted)
    username_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    username_salt: Mapped[str] = mapped_column(String(100), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    password_salt: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Status
    status: Mapped[CredentialStatus] = mapped_column(
        Enum(CredentialStatus, values_callable=lambda obj: [e.value for e in obj]), default=CredentialStatus.ACTIVE
    )
    
    # Is this the primary/default credential for this user on this project-server?
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Optional notes
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Relationships
    project_server: Mapped["ProjectServer"] = relationship(
        "ProjectServer", back_populates="wp_credentials"
    )
    user: Mapped["User"] = relationship(
        "User", back_populates="wp_credentials"
    )
    
    def __repr__(self) -> str:
        return f"<WPCredential(id={self.id}, label='{self.label}', user_id={self.user_id})>"

