"""
Enhanced Project Models for Dashboard (ManageWP Replacement).

This module defines comprehensive project models that include all features
needed for a complete WordPress management platform.
"""

from datetime import datetime, date
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import json

class ProjectStatus(Enum):
    """Project status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    ARCHIVED = "archived"
    ERROR = "error"

class EnvironmentType(Enum):
    """Environment type enumeration."""
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"

class HostingProvider(Enum):
    """Hosting provider enumeration."""
    HETZNER = "hetzner"
    CYBERPANEL = "cyberpanel"
    LIBYANSPIDER = "libyanspider"
    DIGITALOCEAN = "digitalocean"
    VULTR = "vultr"
    AWS = "aws"
    CUSTOM = "custom"

class SSLStatus(Enum):
    """SSL certificate status enumeration."""
    VALID = "valid"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    NOT_INSTALLED = "not_installed"
    ERROR = "error"

@dataclass
class GitHubIntegration:
    """GitHub integration details."""
    repository_url: str
    branch: str = "main"
    commit_hash: Optional[str] = None
    last_sync: Optional[datetime] = None
    webhook_id: Optional[str] = None
    auto_deploy: bool = False
    access_token: Optional[str] = None  # Encrypted storage

@dataclass
class GoogleDriveIntegration:
    """Google Drive integration details."""
    backup_folder_id: Optional[str] = None
    backup_folder_url: Optional[str] = None
    auto_backup: bool = True
    backup_schedule: str = "daily"  # daily, weekly, monthly
    last_backup: Optional[datetime] = None
    storage_used: int = 0  # in bytes
    credentials_path: Optional[str] = None

@dataclass
class Environment:
    """Environment details (local, staging, production)."""
    type: EnvironmentType
    url: str
    ddev_status: Optional[str] = None
    wordpress_version: Optional[str] = None
    php_version: Optional[str] = None
    database_host: Optional[str] = None
    database_name: Optional[str] = None
    last_updated: Optional[datetime] = None
    health_score: float = 0.0  # 0-100

@dataclass
class ServerInfo:
    """Server information."""
    provider: HostingProvider
    server_ip: str
    ssh_user: str
    ssh_port: int = 22
    ssh_key_path: Optional[str] = None
    server_name: Optional[str] = None
    location: Optional[str] = None
    specs: Dict[str, Any] = field(default_factory=dict)
    resource_usage: Dict[str, float] = field(default_factory=dict)
    monthly_cost: float = 0.0
    renewal_date: Optional[date] = None

@dataclass
class SSLCertificate:
    """SSL certificate information."""
    domain: str
    status: SSLStatus
    issuer: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    auto_renewal: bool = False
    certificate_path: Optional[str] = None
    private_key_path: Optional[str] = None

@dataclass
class PluginInfo:
    """Plugin information."""
    name: str
    version: str
    status: str  # active, inactive, update_available
    last_updated: Optional[datetime] = None
    source: str = "wordpress"  # wordpress, custom, premium

@dataclass
class ThemeInfo:
    """Theme information."""
    name: str
    version: str
    status: str  # active, inactive
    child_theme: bool = False
    customizations: List[str] = field(default_factory=list)
    last_updated: Optional[datetime] = None

@dataclass
class ClientInfo:
    """Client information."""
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    billing_status: str = "active"  # active, overdue, cancelled
    monthly_rate: float = 0.0
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    notes: str = ""
    contact_person: Optional[str] = None

@dataclass
class BackupInfo:
    """Backup information."""
    last_backup: Optional[datetime] = None
    backup_locations: List[str] = field(default_factory=list)
    backup_schedule: str = "daily"
    retention_days: int = 30
    total_backups: int = 0
    backup_size: int = 0  # in bytes
    google_drive_sync: bool = True
    local_backup_path: Optional[str] = None

@dataclass
class AnalyticsInfo:
    """Analytics and performance information."""
    monthly_visitors: int = 0
    page_load_time: float = 0.0  # in seconds
    uptime_percentage: float = 100.0
    last_uptime_check: Optional[datetime] = None
    error_count_24h: int = 0
    server_response_time: float = 0.0  # in milliseconds

@dataclass
class DashboardProject:
    """
    Comprehensive project model for dashboard (ManageWP replacement).

    This model includes all information needed for complete WordPress project management.
    """
    # Basic project information
    project_name: str
    directory: str
    status: ProjectStatus = ProjectStatus.ACTIVE
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    # Client information
    client: Optional[ClientInfo] = None

    # Environment information
    environments: Dict[EnvironmentType, Environment] = field(default_factory=dict)

    # GitHub integration
    github: Optional[GitHubIntegration] = None

    # Google Drive integration
    google_drive: Optional[GoogleDriveIntegration] = None

    # Server information
    server: Optional[ServerInfo] = None

    # SSL certificate
    ssl_certificate: Optional[SSLCertificate] = None

    # WordPress assets
    plugins: List[PluginInfo] = field(default_factory=list)
    themes: List[ThemeInfo] = field(default_factory=list)

    # Backup information
    backup: BackupInfo = field(default_factory=BackupInfo)

    # Analytics and performance
    analytics: AnalyticsInfo = field(default_factory=AnalyticsInfo)

    # Additional metadata
    tags: List[str] = field(default_factory=list)
    notes: str = ""
    health_score: float = 0.0  # 0-100 overall health

    def get_primary_url(self) -> str:
        """Get the primary URL for the project (production or local if no production)."""
        if EnvironmentType.PRODUCTION in self.environments:
            return self.environments[EnvironmentType.PRODUCTION].url
        elif EnvironmentType.LOCAL in self.environments:
            return self.environments[EnvironmentType.LOCAL].url
        elif self.environments:
            return list(self.environments.values())[0].url
        return ""

    def get_environment(self, env_type: EnvironmentType) -> Optional[Environment]:
        """Get environment by type."""
        return self.environments.get(env_type)

    def has_environment(self, env_type: EnvironmentType) -> bool:
        """Check if project has specific environment."""
        return env_type in self.environments

    def is_ssl_valid(self) -> bool:
        """Check if SSL certificate is valid."""
        if not self.ssl_certificate:
            return False
        return self.ssl_certificate.status in [SSLStatus.VALID, SSLStatus.EXPIRING_SOON]

    def needs_ssl_renewal(self) -> bool:
        """Check if SSL certificate needs renewal."""
        if not self.ssl_certificate or not self.ssl_certificate.expiry_date:
            return False
        days_until_expiry = (self.ssl_certificate.expiry_date - date.today()).days
        return days_until_expiry <= 30

    def get_latest_backup_age_days(self) -> Optional[int]:
        """Get age of latest backup in days."""
        if not self.backup.last_backup:
            return None
        return (datetime.now() - self.backup.last_backup).days

    def has_recent_backup(self, max_days: int = 7) -> bool:
        """Check if project has recent backup."""
        age = self.get_latest_backup_age_days()
        return age is not None and age <= max_days

    def get_total_monthly_cost(self) -> float:
        """Get total monthly cost (server + any other costs)."""
        total = 0.0
        if self.server:
            total += self.server.monthly_cost
        if self.client:
            total += self.client.monthly_rate
        return total

    def get_plugin_update_count(self) -> int:
        """Get count of plugins with updates available."""
        return len([p for p in self.plugins if p.status == "update_available"])

    def has_security_issues(self) -> bool:
        """Check if project has security issues."""
        # SSL issues
        if self.ssl_certificate and self.ssl_certificate.status in [SSLStatus.EXPIRED, SSLStatus.ERROR]:
            return True

        # Old backups
        if not self.has_recent_backup():
            return True

        # Could add more security checks here
        return False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        data = {
            "project_name": self.project_name,
            "directory": self.directory,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "primary_url": self.get_primary_url(),
            "health_score": self.health_score,
            "tags": self.tags,
            "notes": self.notes,
        }

        if self.client:
            data["client"] = {
                "name": self.client.name,
                "email": self.client.email,
                "company": self.client.company,
                "billing_status": self.client.billing_status,
                "monthly_rate": self.client.monthly_rate,
            }

        if self.github:
            data["github"] = {
                "repository_url": self.github.repository_url,
                "branch": self.github.branch,
                "last_sync": self.github.last_sync.isoformat() if self.github.last_sync else None,
                "auto_deploy": self.github.auto_deploy,
            }

        if self.google_drive:
            data["google_drive"] = {
                "backup_folder_url": self.google_drive.backup_folder_url,
                "auto_backup": self.google_drive.auto_backup,
                "last_backup": self.google_drive.last_backup.isoformat() if self.google_drive.last_backup else None,
                "storage_used": self.google_drive.storage_used,
            }

        if self.server:
            data["server"] = {
                "provider": self.server.provider.value,
                "server_ip": self.server.server_ip,
                "server_name": self.server.server_name,
                "monthly_cost": self.server.monthly_cost,
                "renewal_date": self.server.renewal_date.isoformat() if self.server.renewal_date else None,
            }

        if self.ssl_certificate:
            data["ssl_certificate"] = {
                "domain": self.ssl_certificate.domain,
                "status": self.ssl_certificate.status.value,
                "expiry_date": self.ssl_certificate.expiry_date.isoformat() if self.ssl_certificate.expiry_date else None,
                "auto_renewal": self.ssl_certificate.auto_renewal,
            }

        # Environments
        data["environments"] = {
            env_type.value: {
                "url": env.url,
                "health_score": env.health_score,
                "wordpress_version": env.wordpress_version,
                "last_updated": env.last_updated.isoformat() if env.last_updated else None,
            }
            for env_type, env in self.environments.items()
        }

        # Backup
        data["backup"] = {
            "last_backup": self.backup.last_backup.isoformat() if self.backup.last_backup else None,
            "backup_schedule": self.backup.backup_schedule,
            "total_backups": self.backup.total_backups,
            "backup_size": self.backup.backup_size,
        }

        # Analytics
        data["analytics"] = {
            "monthly_visitors": self.analytics.monthly_visitors,
            "page_load_time": self.analytics.page_load_time,
            "uptime_percentage": self.analytics.uptime_percentage,
            "error_count_24h": self.analytics.error_count_24h,
        }

        # Plugins and themes
        data["plugins"] = [
            {
                "name": p.name,
                "version": p.version,
                "status": p.status,
            }
            for p in self.plugins
        ]

        data["themes"] = [
            {
                "name": t.name,
                "version": t.version,
                "status": t.status,
            }
            for t in self.themes
        ]

        return data