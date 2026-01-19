"""
Ticket and TicketMessage models for support system.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .client import Client
    from .project import Project
    from .client_user import ClientUser


class TicketStatus(str, PyEnum):
    """Ticket status states."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_REPLY = "waiting_reply"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, PyEnum):
    """Ticket priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class SenderType(str, PyEnum):
    """Message sender type."""
    CLIENT = "client"
    ADMIN = "admin"


class Ticket(Base, TimestampMixin):
    """Support ticket from a client."""
    
    __tablename__ = "tickets"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Client link
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    
    # Optional project reference
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    
    # Ticket content
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Status
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus), default=TicketStatus.OPEN
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority), default=TicketPriority.MEDIUM
    )
    
    # Tracking
    last_reply_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="tickets")
    project: Mapped["Project | None"] = relationship("Project")
    messages: Mapped[list["TicketMessage"]] = relationship(
        "TicketMessage", back_populates="ticket", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Ticket(id={self.id}, subject='{self.subject[:30]}...', status={self.status})>"


class TicketMessage(Base, TimestampMixin):
    """Message within a support ticket."""
    
    __tablename__ = "ticket_messages"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Ticket link
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    
    # Sender
    sender_type: Mapped[SenderType] = mapped_column(
        Enum(SenderType), nullable=False
    )
    sender_id: Mapped[int | None] = mapped_column(nullable=True)  # ClientUser or User ID
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Content
    message: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Attachments (JSON array of file paths)
    attachments: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationship
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="messages")
    
    def __repr__(self) -> str:
        return f"<TicketMessage(id={self.id}, ticket={self.ticket_id}, sender={self.sender_type})>"
