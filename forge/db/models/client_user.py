"""
ClientUser model for client portal authentication.

Separate from admin Users - clients can only view their own data.
"""
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .client import Client


class ClientUser(Base, TimestampMixin):
    """
    Client portal user account.
    
    Links to a Client record for project/billing access.
    Separate auth from admin Users.
    """
    
    __tablename__ = "client_users"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Link to client
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    
    # Auth fields
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    
    # Profile
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Tracking
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="portal_users")
    
    def __repr__(self) -> str:
        return f"<ClientUser(id={self.id}, email='{self.email}')>"
