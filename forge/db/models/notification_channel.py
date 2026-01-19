"""
Notification channel database model.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Boolean, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class ChannelType(str, PyEnum):
    """Notification channel types."""
    EMAIL = "email"
    SLACK = "slack"
    TELEGRAM = "telegram"
    WEBHOOK = "webhook"
    DISCORD = "discord"


class NotificationChannel(Base, TimestampMixin):
    """Notification channel for alerts (Uptime Kuma style)."""
    
    __tablename__ = "notification_channels"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    channel_type: Mapped[ChannelType] = mapped_column(
        Enum(ChannelType, values_callable=lambda obj: [e.value for e in obj]), default=ChannelType.EMAIL
    )
    
    # Configuration (JSON stored as text)
    # Email: {"to": "admin@example.com", "smtp_host": "..."}
    # Slack: {"webhook_url": "..."}
    # Telegram: {"bot_token": "...", "chat_id": "..."}
    # Webhook: {"url": "...", "method": "POST"}
    config: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Last notification
    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Owner
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="notification_channels")
    
    def __repr__(self) -> str:
        return f"<NotificationChannel(id={self.id}, name='{self.name}', type={self.channel_type})>"
