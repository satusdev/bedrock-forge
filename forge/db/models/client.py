"""
Client database model.

Manages client/customer information, billing status, and project associations.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Float, Integer, Boolean, ForeignKey, Enum, DateTime, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .invoice import Invoice
    from .subscription import Subscription
    from .domain import Domain
    from .client_user import ClientUser
    from .ticket import Ticket
    from .tag import Tag


class BillingStatus(str, PyEnum):
    """Client billing status states."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    TRIAL = "trial"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class Client(Base, TimestampMixin):
    """Client/customer model for project billing and management."""
    
    __tablename__ = "clients"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Basic Info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Billing contact (if different from primary)
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Addresses
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str] = mapped_column(String(100), default="US")
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Billing configuration
    billing_status: Mapped[BillingStatus] = mapped_column(
        Enum(BillingStatus), default=BillingStatus.ACTIVE
    )
    payment_terms: Mapped[str] = mapped_column(String(50), default="NET30")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    auto_billing: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Contract
    contract_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    contract_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    monthly_rate: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Tracking
    total_revenue: Mapped[float] = mapped_column(Float, default=0.0)
    outstanding_balance: Mapped[float] = mapped_column(Float, default=0.0)
    last_invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # Notes and metadata
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    
    # Invoice settings
    invoice_prefix: Mapped[str] = mapped_column(String(20), default="INV")
    next_invoice_number: Mapped[int] = mapped_column(Integer, default=1)
    
    # Foreign Keys
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="clients")
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="client"
    )
    invoices: Mapped[List["Invoice"]] = relationship(
        "Invoice", back_populates="client", cascade="all, delete-orphan"
    )
    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription", back_populates="client", cascade="all, delete-orphan"
    )
    domains: Mapped[List["Domain"]] = relationship(
        "Domain", back_populates="client", cascade="all, delete-orphan"
    )
    portal_users: Mapped[List["ClientUser"]] = relationship(
        "ClientUser", back_populates="client", cascade="all, delete-orphan"
    )
    tickets: Mapped[List["Ticket"]] = relationship(
        "Ticket", back_populates="client", cascade="all, delete-orphan"
    )

    # Tag relationships (many-to-many)
    tag_objects: Mapped[List["Tag"]] = relationship(
        "Tag", secondary="client_tags", back_populates="clients"
    )
    
    def __repr__(self) -> str:
        return f"<Client(id={self.id}, name='{self.name}', company='{self.company}')>"
    
    def generate_invoice_number(self) -> str:
        """Generate the next invoice number for this client."""
        number = f"{self.invoice_prefix}-{self.next_invoice_number:04d}"
        self.next_invoice_number += 1
        return number
