"""
Subscription database model.

Manages recurring subscriptions for hosting, domains, SSL, maintenance, etc.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Float, Integer, Boolean, ForeignKey, Enum, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .client import Client
    from .project import Project


class SubscriptionType(str, PyEnum):
    """Types of recurring subscriptions."""
    HOSTING = "hosting"
    DOMAIN = "domain"
    SSL = "ssl"
    MAINTENANCE = "maintenance"
    SUPPORT = "support"
    BACKUP = "backup"
    CDN = "cdn"
    EMAIL = "email"
    OTHER = "other"


class BillingCycle(str, PyEnum):
    """Billing frequency options."""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    BIANNUAL = "biannual"  # 6 months
    YEARLY = "yearly"
    BIENNIAL = "biennial"  # 2 years
    TRIENNIAL = "triennial"  # 3 years


class SubscriptionStatus(str, PyEnum):
    """Subscription status states."""
    ACTIVE = "active"
    PENDING = "pending"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


def _enum_values(enum_cls: type[PyEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class Subscription(Base, TimestampMixin):
    """Recurring subscription model for any billable service."""
    
    __tablename__ = "subscriptions"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Type and identification
    subscription_type: Mapped[SubscriptionType] = mapped_column(
        Enum(
            SubscriptionType,
            values_callable=_enum_values,
            name="subscriptiontype",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # External reference (e.g., hosting account ID, domain name)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Billing configuration
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(
            BillingCycle,
            values_callable=_enum_values,
            name="billingcycle",
        ),
        default=BillingCycle.YEARLY,
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    
    # Dates
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_billing_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Status and renewal
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            values_callable=_enum_values,
            name="subscriptionstatus",
        ),
        default=SubscriptionStatus.ACTIVE,
    )
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Notification settings
    reminder_days: Mapped[int] = mapped_column(Integer, default=30)
    last_reminder_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Invoice tracking
    last_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True
    )
    total_invoiced: Mapped[float] = mapped_column(Float, default=0.0)
    total_paid: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign Keys
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    
    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="subscriptions")
    project: Mapped["Project | None"] = relationship("Project", back_populates="subscriptions")
    
    def __repr__(self) -> str:
        return f"<Subscription(id={self.id}, type='{self.subscription_type.value}', name='{self.name}')>"
    
    @property
    def days_until_renewal(self) -> int:
        """Days until next billing date."""
        if self.next_billing_date:
            delta = self.next_billing_date - date.today()
            return delta.days
        return 0
    
    @property
    def is_expiring_soon(self) -> bool:
        """Check if subscription is expiring within reminder_days."""
        return 0 < self.days_until_renewal <= self.reminder_days
    
    @property
    def is_expired(self) -> bool:
        """Check if subscription has expired."""
        return self.days_until_renewal < 0
    
    def get_yearly_cost(self) -> float:
        """Calculate annualized cost regardless of billing cycle."""
        multiplier = {
            BillingCycle.MONTHLY: 12,
            BillingCycle.QUARTERLY: 4,
            BillingCycle.BIANNUAL: 2,
            BillingCycle.YEARLY: 1,
            BillingCycle.BIENNIAL: 0.5,
            BillingCycle.TRIENNIAL: 0.33,
        }
        return self.amount * multiplier.get(self.billing_cycle, 1)
