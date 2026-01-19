"""
Application settings database model.

Stores key-value settings like API tokens that persist across restarts.
"""
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from ..base import Base, TimestampMixin
from ..custom_types import EncryptedString


class AppSetting(Base, TimestampMixin):
    """Key-value settings storage with optional encryption."""
    
    __tablename__ = "app_settings"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Setting identification
    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    
    # Value (encrypted for sensitive data)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_value: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    
    # Metadata
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    
    def __repr__(self) -> str:
        return f"<AppSetting(key='{self.key}')>"
    
    def get_value(self) -> Optional[str]:
        """Get the stored value (encrypted or plain)."""
        if self.is_sensitive:
            return self.encrypted_value
        return self.value
    
    def set_value(self, value: str, sensitive: bool = False):
        """Set the value with optional encryption."""
        self.is_sensitive = sensitive
        if sensitive:
            self.encrypted_value = value
            self.value = None
        else:
            self.value = value
            self.encrypted_value = None
