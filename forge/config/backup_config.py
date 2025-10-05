"""
Backup system configuration and settings.

This module provides centralized configuration management for the
backup system, including email alerts, scheduling, and provider settings.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from dataclasses_json import dataclass_json

from ..utils.logging import logger
from ..utils.errors import ForgeError


@dataclass_json
@dataclass
class EmailConfig:
    """Email notification configuration."""
    smtp_server: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    admin_email: str = ""
    alert_on_success: bool = True
    alert_on_failure: bool = True
    alert_on_warning: bool = False


@dataclass_json
@dataclass
class CloudProviderConfig:
    """Cloud storage provider configuration."""
    name: str
    enabled: bool = True
    config: Dict[str, Any] = None

    def __post_init__(self):
        if self.config is None:
            self.config = {}


@dataclass_json
@dataclass
class BackupSchedule:
    """Backup schedule configuration."""
    name: str
    enabled: bool = True
    cron_expression: str = "0 2 * * *"  # Daily at 2 AM
    backup_db: bool = True
    backup_uploads: bool = True
    backup_to_cloud: bool = True
    cloud_folder: str = "forge-backups"
    retention_days: int = 7
    project_dir: str = "."


@dataclass_json
@dataclass
class MonitoringConfig:
    """Backup monitoring configuration."""
    max_backup_age_hours: int = 24
    consecutive_failure_threshold: int = 3
    success_rate_threshold: float = 80.0
    storage_warning_mb: float = 1000.0
    prometheus_enabled: bool = False
    prometheus_port: int = 9095
    health_check_interval_hours: int = 6


@dataclass_json
@dataclass
class BackupConfig:
    """Main backup configuration."""
    email: EmailConfig
    cloud_providers: List[CloudProviderConfig]
    schedules: List[BackupSchedule]
    monitoring: MonitoringConfig
    backup_directory: str = ".ddev/backups"
    compression_level: int = 6
    parallel_uploads: bool = True
    dry_run_default: bool = False
    verbose_default: bool = False

    @classmethod
    def default_config(cls) -> 'BackupConfig':
        """Create default backup configuration."""
        return cls(
            email=EmailConfig(),
            cloud_providers=[
                CloudProviderConfig(
                    name="google_drive",
                    enabled=True,
                    config={
                        "folder": "forge-backups",
                        "service_account": "keyring"  # Use system keyring
                    }
                ),
                CloudProviderConfig(
                    name="aws_s3",
                    enabled=False,
                    config={
                        "bucket": "",
                        "region": "us-east-1",
                        "access_key": "",
                        "secret_key": ""
                    }
                )
            ],
            schedules=[
                BackupSchedule(
                    name="daily_backup",
                    enabled=True,
                    cron_expression="0 2 * * *",
                    backup_db=True,
                    backup_uploads=True,
                    backup_to_cloud=True
                ),
                BackupSchedule(
                    name="weekly_full",
                    enabled=True,
                    cron_expression="0 1 * * 0",  # Sunday 1 AM
                    backup_db=True,
                    backup_uploads=True,
                    backup_to_cloud=True,
                    retention_days=30
                )
            ],
            monitoring=MonitoringConfig()
        )


class BackupConfigManager:
    """Manage backup configuration files."""

    def __init__(self, config_file: Optional[Path] = None):
        if config_file is None:
            # Default config location
            config_file = Path.cwd() / ".ddev" / "backup_config.json"
        self.config_file = config_file
        self.config = self.load_config()

    def load_config(self) -> BackupConfig:
        """Load backup configuration from file."""
        if not self.config_file.exists():
            logger.info("No backup config found, creating default configuration")
            return BackupConfig.default_config()

        try:
            with open(self.config_file, 'r') as f:
                config_data = json.load(f)
            return BackupConfig.from_dict(config_data)
        except Exception as e:
            logger.error(f"Failed to load backup config: {e}")
            logger.info("Using default configuration")
            return BackupConfig.default_config()

    def save_config(self) -> None:
        """Save backup configuration to file."""
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_file, 'w') as f:
                json.dump(asdict(self.config), f, indent=2)
            logger.info(f"Backup configuration saved to {self.config_file}")
        except Exception as e:
            raise ForgeError(f"Failed to save backup config: {e}")

    def get_email_config(self) -> EmailConfig:
        """Get email configuration."""
        return self.config.email

    def get_cloud_provider(self, name: str) -> Optional[CloudProviderConfig]:
        """Get cloud provider configuration."""
        for provider in self.config.cloud_providers:
            if provider.name == name:
                return provider
        return None

    def get_enabled_cloud_providers(self) -> List[CloudProviderConfig]:
        """Get all enabled cloud providers."""
        return [p for p in self.config.cloud_providers if p.enabled]

    def get_schedule(self, name: str) -> Optional[BackupSchedule]:
        """Get backup schedule by name."""
        for schedule in self.config.schedules:
            if schedule.name == name:
                return schedule
        return None

    def get_enabled_schedules(self) -> List[BackupSchedule]:
        """Get all enabled backup schedules."""
        return [s for s in self.config.schedules if s.enabled]

    def add_cloud_provider(self, provider: CloudProviderConfig) -> None:
        """Add a new cloud provider configuration."""
        # Remove existing provider with same name
        self.config.cloud_providers = [
            p for p in self.config.cloud_providers if p.name != provider.name
        ]
        self.config.cloud_providers.append(provider)

    def remove_cloud_provider(self, name: str) -> bool:
        """Remove cloud provider by name."""
        original_count = len(self.config.cloud_providers)
        self.config.cloud_providers = [
            p for p in self.config.cloud_providers if p.name != name
        ]
        return len(self.config.cloud_providers) < original_count

    def add_schedule(self, schedule: BackupSchedule) -> None:
        """Add a new backup schedule."""
        # Remove existing schedule with same name
        self.config.schedules = [
            s for s in self.config.schedules if s.name != schedule.name
        ]
        self.config.schedules.append(schedule)

    def remove_schedule(self, name: str) -> bool:
        """Remove backup schedule by name."""
        original_count = len(self.config.schedules)
        self.config.schedules = [
            s for s in self.config.schedules if s.name != name
        ]
        return len(self.config.schedules) < original_count

    def update_email_config(self, email_config: EmailConfig) -> None:
        """Update email configuration."""
        self.config.email = email_config

    def update_monitoring_config(self, monitoring_config: MonitoringConfig) -> None:
        """Update monitoring configuration."""
        self.config.monitoring = monitoring_config

    def validate_config(self) -> List[str]:
        """Validate configuration and return list of issues."""
        issues = []

        # Validate email config
        if self.config.email.alert_on_success or self.config.email.alert_on_failure:
            if not self.config.email.admin_email:
                issues.append("Admin email is required when alerts are enabled")

        # Validate cloud providers
        for provider in self.config.cloud_providers:
            if provider.enabled:
                if provider.name == "google_drive":
                    if not provider.config.get("service_account"):
                        issues.append(f"Service account configuration required for {provider.name}")
                elif provider.name == "aws_s3":
                    if not provider.config.get("bucket"):
                        issues.append(f"Bucket name required for {provider.name}")

        # Validate schedules
        for schedule in self.config.schedules:
            if schedule.enabled:
                try:
                    # Basic cron validation
                    parts = schedule.cron_expression.split()
                    if len(parts) != 5:
                        issues.append(f"Invalid cron expression for schedule '{schedule.name}'")
                except:
                    issues.append(f"Invalid cron expression for schedule '{schedule.name}'")

                if not schedule.backup_db and not schedule.backup_uploads:
                    issues.append(f"Schedule '{schedule.name}' must backup either database or uploads")

        return issues

    def export_config(self, output_file: Path) -> None:
        """Export configuration to file."""
        try:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w') as f:
                json.dump(asdict(self.config), f, indent=2)
            logger.info(f"Configuration exported to {output_file}")
        except Exception as e:
            raise ForgeError(f"Failed to export configuration: {e}")

    def import_config(self, input_file: Path) -> None:
        """Import configuration from file."""
        try:
            with open(input_file, 'r') as f:
                config_data = json.load(f)
            self.config = BackupConfig.from_dict(config_data)
            logger.info(f"Configuration imported from {input_file}")
        except Exception as e:
            raise ForgeError(f"Failed to import configuration: {e}")


def get_backup_config(project_dir: Optional[Path] = None) -> BackupConfigManager:
    """Get backup configuration manager for project."""
    if project_dir is None:
        project_dir = Path.cwd()
    config_file = project_dir / ".ddev" / "backup_config.json"
    return BackupConfigManager(config_file)


def initialize_config(project_dir: Path, email_config: Optional[EmailConfig] = None) -> BackupConfigManager:
    """Initialize backup configuration for a project."""
    config_file = project_dir / ".ddev" / "backup_config.json"

    if config_file.exists():
        return BackupConfigManager(config_file)

    # Create default config with custom email settings
    config = BackupConfig.default_config()
    if email_config:
        config.email = email_config

    manager = BackupConfigManager(config_file)
    manager.config = config
    manager.save_config()

    return manager


# Environment variable overrides
def get_env_config() -> Dict[str, Any]:
    """Get configuration from environment variables."""
    env_config = {}

    # Email settings
    if os.getenv('FORGE_SMTP_SERVER'):
        env_config['email'] = {
            'smtp_server': os.getenv('FORGE_SMTP_SERVER'),
            'smtp_port': int(os.getenv('FORGE_SMTP_PORT', 587)),
            'smtp_user': os.getenv('FORGE_SMTP_USER', ''),
            'smtp_password': os.getenv('FORGE_SMTP_PASSWORD', ''),
            'admin_email': os.getenv('FORGE_ADMIN_EMAIL', ''),
            'alert_on_success': os.getenv('FORGE_ALERT_ON_SUCCESS', 'true').lower() == 'true',
            'alert_on_failure': os.getenv('FORGE_ALERT_ON_FAILURE', 'true').lower() == 'true'
        }

    # Cloud provider settings
    if os.getenv('FORGE_GDRIVE_FOLDER'):
        env_config['cloud_providers'] = [{
            'name': 'google_drive',
            'enabled': True,
            'config': {
                'folder': os.getenv('FORGE_GDRIVE_FOLDER'),
                'service_account': os.getenv('FORGE_GDRIVE_SERVICE_ACCOUNT', 'keyring')
            }
        }]

    # Monitoring settings
    if os.getenv('FORGE_MONITORING_ENABLED'):
        env_config['monitoring'] = {
            'max_backup_age_hours': int(os.getenv('FORGE_MAX_BACKUP_AGE', 24)),
            'prometheus_enabled': os.getenv('FORGE_PROMETHEUS_ENABLED', 'false').lower() == 'true',
            'prometheus_port': int(os.getenv('FORGE_PROMETHEUS_PORT', 9095))
        }

    return env_config


def apply_env_overrides(config: BackupConfig) -> BackupConfig:
    """Apply environment variable overrides to configuration."""
    env_config = get_env_config()

    if 'email' in env_config:
        config.email = EmailConfig.from_dict(env_config['email'])

    if 'cloud_providers' in env_config:
        # Replace existing cloud providers
        config.cloud_providers = [
            CloudProviderConfig.from_dict(p) for p in env_config['cloud_providers']
        ]

    if 'monitoring' in env_config:
        monitoring_dict = {**config.monitoring.to_dict(), **env_config['monitoring']}
        config.monitoring = MonitoringConfig.from_dict(monitoring_dict)

    return config