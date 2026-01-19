"""
Invoice database model.

Manages invoices, line items, and payment tracking for clients.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Float, Integer, ForeignKey, Enum, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .client import Client


class InvoiceStatus(str, PyEnum):
    """Invoice status states."""
    DRAFT = "draft"
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class Invoice(Base, TimestampMixin):
    """Invoice model for client billing."""
    
    __tablename__ = "invoices"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Invoice identification
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    
    # Status
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus), default=InvoiceStatus.DRAFT
    )
    
    # Dates
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # Amounts
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    amount_paid: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Payment info
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Content
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Billing period
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # Currency
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    
    # Foreign Keys
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False)
    
    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="invoices")
    items: Mapped[List["InvoiceItem"]] = relationship(
        "InvoiceItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Invoice(id={self.id}, number='{self.invoice_number}', total={self.total})>"
    
    def calculate_totals(self):
        """Calculate invoice totals from line items."""
        self.subtotal = sum(item.total for item in self.items)
        self.tax_amount = self.subtotal * (self.tax_rate / 100)
        self.total = self.subtotal + self.tax_amount - self.discount_amount
    
    @property
    def is_paid(self) -> bool:
        """Check if invoice is fully paid."""
        return self.amount_paid >= self.total
    
    @property
    def balance_due(self) -> float:
        """Get remaining balance."""
        return max(0, self.total - self.amount_paid)


class InvoiceItem(Base):
    """Invoice line item model."""
    
    __tablename__ = "invoice_items"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Description
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Quantities and pricing
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Optional categorization
    item_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Reference to project (optional)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    
    # Foreign Keys
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    
    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="items")
    
    def __repr__(self) -> str:
        return f"<InvoiceItem(id={self.id}, description='{self.description[:30]}...', total={self.total})>"
    
    def calculate_total(self):
        """Calculate line item total."""
        self.total = self.quantity * self.unit_price
