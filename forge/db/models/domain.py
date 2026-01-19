"""
Domain database model.

Manages domain registration tracking, expiry dates, and DNS information.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Float, Boolean, ForeignKey, Enum, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List, Optional

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .client import Client
    from .project import Project
    from .subscription import Subscription
    from .ssl_certificate import SSLCertificate


class DomainStatus(str, PyEnum):
    """Domain status states."""
    ACTIVE = "active"
    EXPIRED = "expired"
    PENDING_TRANSFER = "pending_transfer"
    LOCKED = "locked"
    REDEMPTION = "redemption"
    PENDING_DELETE = "pending_delete"


class Registrar(str, PyEnum):
    """Common domain registrars."""
    NAMECHEAP = "namecheap"
    GODADDY = "godaddy"
    CLOUDFLARE = "cloudflare"
    GOOGLE_DOMAINS = "google_domains"
    NAME_COM = "name_com"
    PORKBUN = "porkbun"
    HOVER = "hover"
    DYNADOT = "dynadot"
    OTHER = "other"


class Domain(Base, TimestampMixin):
    """Domain registration tracking model."""
    
    __tablename__ = "domains"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Domain identification
    domain_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    tld: Mapped[str] = mapped_column(String(50), nullable=False)  # .com, .org, etc.
    
    # Registrar information
    registrar: Mapped[Registrar] = mapped_column(
        Enum(Registrar), default=Registrar.OTHER
    )
    registrar_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    registrar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Important dates
    registration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    last_renewed: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # DNS Configuration
    nameservers: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    dns_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dns_zone_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Status and settings
    status: Mapped[DomainStatus] = mapped_column(
        Enum(DomainStatus), default=DomainStatus.ACTIVE
    )
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    privacy_protection: Mapped[bool] = mapped_column(Boolean, default=True)
    transfer_lock: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Costs
    annual_cost: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    
    # WHOIS data cache
    whois_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    last_whois_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Notifications
    reminder_days: Mapped[int] = mapped_column(default=60)  # Domains need more notice
    last_reminder_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign Keys
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True)
    
    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="domains")
    project: Mapped["Project | None"] = relationship("Project", back_populates="domains")
    subscription: Mapped["Subscription | None"] = relationship("Subscription")
    ssl_certificates: Mapped[List["SSLCertificate"]] = relationship(
        "SSLCertificate", back_populates="domain", cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Domain(id={self.id}, name='{self.domain_name}', expiry='{self.expiry_date}')>"
    
    @property
    def days_until_expiry(self) -> int:
        """Days until domain expires."""
        if self.expiry_date:
            delta = self.expiry_date - date.today()
            return delta.days
        return 0
    
    @property
    def is_expiring_soon(self) -> bool:
        """Check if domain is expiring within reminder_days."""
        return 0 < self.days_until_expiry <= self.reminder_days
    
    @property
    def is_expired(self) -> bool:
        """Check if domain has expired."""
        return self.days_until_expiry < 0
    
    @property
    def primary_nameserver(self) -> str | None:
        """Get the primary nameserver."""
        import json
        if self.nameservers:
            try:
                ns_list = json.loads(self.nameservers)
                return ns_list[0] if ns_list else None
            except (json.JSONDecodeError, IndexError):
                return None
        return None
