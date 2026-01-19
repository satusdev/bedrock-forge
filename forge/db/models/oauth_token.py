"""
OAuth Token model for storing OAuth credentials.

Stores access tokens, refresh tokens, and metadata for OAuth integrations
like Google Drive and GitHub.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin


class OAuthProvider(str, PyEnum):
    """Supported OAuth providers."""
    GOOGLE_DRIVE = "google_drive"
    GITHUB = "github"


class OAuthToken(Base, TimestampMixin):
    """OAuth token storage for external integrations."""
    
    __tablename__ = "oauth_tokens"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # User association
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Provider information
    provider: Mapped[OAuthProvider] = mapped_column(
        Enum(OAuthProvider), nullable=False
    )
    
    # Token data (encrypted in production)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_type: Mapped[str] = mapped_column(String(50), default="Bearer")
    
    # Token metadata
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Provider-specific account info
    account_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="oauth_tokens")
    
    def __repr__(self) -> str:
        return f"<OAuthToken(id={self.id}, provider={self.provider}, user_id={self.user_id})>"
    
    @property
    def is_expired(self) -> bool:
        """Check if token is expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
