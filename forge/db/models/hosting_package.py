"""
Hosting Package database model.

Defines hosting packages with resource limits and pricing tiers.
"""
from datetime import datetime
from sqlalchemy import String, Text, Float, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from typing import List
import json

from ..base import Base, TimestampMixin


class HostingPackage(Base, TimestampMixin):
    """Hosting package/plan definition model."""
    
    __tablename__ = "hosting_packages"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Package identification
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Resource limits
    disk_space_gb: Mapped[int] = mapped_column(Integer, default=10)
    bandwidth_gb: Mapped[int] = mapped_column(Integer, default=100)
    domains_limit: Mapped[int] = mapped_column(Integer, default=1)
    subdomains_limit: Mapped[int] = mapped_column(Integer, default=5)
    databases_limit: Mapped[int] = mapped_column(Integer, default=1)
    email_accounts_limit: Mapped[int] = mapped_column(Integer, default=5)
    ftp_accounts_limit: Mapped[int] = mapped_column(Integer, default=1)
    
    # Performance
    php_workers: Mapped[int] = mapped_column(Integer, default=2)
    ram_mb: Mapped[int] = mapped_column(Integer, default=512)
    cpu_cores: Mapped[float] = mapped_column(Float, default=0.5)
    
    # Pricing (all prices in the default currency)
    monthly_price: Mapped[float] = mapped_column(Float, default=0.0)
    quarterly_price: Mapped[float] = mapped_column(Float, default=0.0)
    yearly_price: Mapped[float] = mapped_column(Float, default=0.0)
    biennial_price: Mapped[float] = mapped_column(Float, default=0.0)
    setup_fee: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Hosting/support split pricing
    hosting_yearly_price: Mapped[float] = mapped_column(Float, default=0.0)
    support_monthly_price: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Features (JSON array of feature strings)
    features: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    
    def __repr__(self) -> str:
        return f"<HostingPackage(id={self.id}, name='{self.name}', yearly={self.yearly_price})>"
    
    @property
    def features_list(self) -> List[str]:
        """Parse features JSON to list."""
        if self.features:
            try:
                return json.loads(self.features)
            except json.JSONDecodeError:
                return []
        return []
    
    @features_list.setter
    def features_list(self, value: List[str]):
        """Set features from list."""
        self.features = json.dumps(value)
    
    def get_price_for_cycle(self, cycle: str) -> float:
        """Get price for a specific billing cycle."""
        prices = {
            "monthly": self.monthly_price,
            "quarterly": self.quarterly_price,
            "yearly": self.yearly_price,
            "biennial": self.biennial_price,
        }
        return prices.get(cycle, self.yearly_price)
    
    def get_monthly_equivalent(self, cycle: str) -> float:
        """Calculate monthly equivalent price for comparison."""
        months = {
            "monthly": 1,
            "quarterly": 3,
            "yearly": 12,
            "biennial": 24,
        }
        price = self.get_price_for_cycle(cycle)
        return price / months.get(cycle, 12)
    
    def get_savings_percentage(self, cycle: str) -> float:
        """Calculate savings percentage vs monthly price."""
        if self.monthly_price == 0:
            return 0
        monthly_total = self.monthly_price * {"monthly": 1, "quarterly": 3, "yearly": 12, "biennial": 24}.get(cycle, 12)
        actual_price = self.get_price_for_cycle(cycle)
        if monthly_total == 0:
            return 0
        return ((monthly_total - actual_price) / monthly_total) * 100
