from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from ..base import Base

class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    DEPLOY = "deploy"
    BACKUP = "backup"
    RESTORE = "restore"
    SYNC = "sync"
    PROVISION = "provision"
    COMMAND = "command"
    OTHER = "other"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]

class AuditLog(Base):
    """Audit log model for tracking user actions and system events."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(
        Enum(
            AuditAction,
            values_callable=_enum_values,
            name="auditaction",
        ),
        nullable=False,
    )
    entity_type = Column(String(50), nullable=True)  # e.g., "project", "server", "user"
    entity_id = Column(String(50), nullable=True)    # ID of the affected entity
    details = Column(Text, nullable=True)            # JSON string or text description
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog(action='{self.action}', entity='{self.entity_type}', user_id={self.user_id})>"
