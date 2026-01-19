"""
SSL Certificate database model.

Tracks SSL certificates, expiry dates, providers, and auto-renewal status.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Float, Boolean, ForeignKey, Enum, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .domain import Domain
    from .project import Project
    from .subscription import Subscription


class SSLProvider(str, PyEnum):
    """SSL certificate providers."""
    LETS_ENCRYPT = "letsencrypt"
    CLOUDFLARE = "cloudflare"
    CYBERPANEL = "cyberpanel"
    COMODO = "comodo"
    DIGICERT = "digicert"
    GLOBALSIGN = "globalsign"
    SECTIGO = "sectigo"
    GODADDY = "godaddy"
    NAMECHEAP = "namecheap"
    OTHER = "other"


class CertificateType(str, PyEnum):
    """Types of SSL certificates."""
    DV = "dv"  # Domain Validated
    OV = "ov"  # Organization Validated
    EV = "ev"  # Extended Validation
    WILDCARD = "wildcard"
    MULTI_DOMAIN = "multi_domain"  # SAN certificate


class SSLCertificate(Base, TimestampMixin):
    """SSL certificate tracking model."""
    
    __tablename__ = "ssl_certificates"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Certificate identification
    common_name: Mapped[str] = mapped_column(String(255), nullable=False)  # Primary domain
    san_domains: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of SANs
    
    # Provider info
    provider: Mapped[SSLProvider] = mapped_column(
        Enum(SSLProvider), default=SSLProvider.LETS_ENCRYPT
    )
    certificate_type: Mapped[CertificateType] = mapped_column(
        Enum(CertificateType), default=CertificateType.DV
    )
    
    # Dates
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    is_wildcard: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Certificate details (optional storage)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fingerprint_sha256: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # For paid certificates
    annual_cost: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    
    # Renewal tracking
    last_renewal_attempt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    renewal_failure_count: Mapped[int] = mapped_column(default=0)
    last_renewal_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Notifications
    reminder_days: Mapped[int] = mapped_column(default=14)  # SSL needs quick action
    last_reminder_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign Keys
    domain_id: Mapped[int | None] = mapped_column(ForeignKey("domains.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True)
    
    # Relationships
    domain: Mapped["Domain | None"] = relationship("Domain", back_populates="ssl_certificates")
    project: Mapped["Project | None"] = relationship("Project", back_populates="ssl_certificates")
    subscription: Mapped["Subscription | None"] = relationship("Subscription")
    
    def __repr__(self) -> str:
        return f"<SSLCertificate(id={self.id}, cn='{self.common_name}', expiry='{self.expiry_date}')>"
    
    @property
    def days_until_expiry(self) -> int:
        """Days until certificate expires."""
        if self.expiry_date:
            delta = self.expiry_date - date.today()
            return delta.days
        return 0
    
    @property
    def is_expiring_soon(self) -> bool:
        """Check if cert is expiring within reminder_days."""
        return 0 < self.days_until_expiry <= self.reminder_days
    
    @property
    def is_expired(self) -> bool:
        """Check if certificate has expired."""
        return self.days_until_expiry < 0
    
    @property
    def is_free(self) -> bool:
        """Check if this is a free certificate (Let's Encrypt, etc)."""
        return self.provider in [SSLProvider.LETS_ENCRYPT, SSLProvider.CLOUDFLARE, SSLProvider.CYBERPANEL]
    
    @property
    def validity_days(self) -> int:
        """Total validity period in days."""
        if self.issue_date and self.expiry_date:
            return (self.expiry_date - self.issue_date).days
        return 90  # Default Let's Encrypt validity
