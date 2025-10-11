"""
Bedrock Forge Dashboard Configuration Management.

This module provides persistent configuration and settings management for the dashboard.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
from ..utils.logging import logger

class DashboardConfig(BaseModel):
    """Dashboard configuration model."""
    # Theme settings
    theme: str = Field(default="light", description="Theme mode: light, dark, auto")
    primary_color: str = Field(default="#3b82f6", description="Primary color hex")
    accent_color: str = Field(default="#10b981", description="Accent color hex")

    # Layout settings
    sidebar_collapsed: bool = Field(default=False, description="Sidebar collapsed state")
    show_advanced_options: bool = Field(default=False, description="Show advanced options")

    # Auto-refresh settings
    auto_refresh_enabled: bool = Field(default=True, description="Enable auto-refresh")
    auto_refresh_interval: int = Field(default=30, description="Auto-refresh interval in seconds")

    # Notification preferences
    notifications_enabled: bool = Field(default=True, description="Enable notifications")
    notification_types: Dict[str, bool] = Field(
        default_factory=lambda: {
            "deployment_complete": True,
            "backup_success": True,
            "backup_failure": True,
            "site_health_warning": True,
            "ssl_expiry_warning": True,
            "plugin_updates": True
        },
        description="Notification type preferences"
    )

    # Widget configuration
    widgets: Dict[str, Dict[str, Any]] = Field(
        default_factory=lambda: {
            "stats_overview": {"enabled": True, "position": "top", "order": 1},
            "project_health": {"enabled": True, "position": "left", "order": 2},
            "recent_activity": {"enabled": True, "position": "right", "order": 3},
            "quick_actions": {"enabled": True, "position": "left", "order": 4},
            "upcoming_tasks": {"enabled": False, "position": "right", "order": 5}
        },
        description="Widget configuration"
    )

    # Project display settings
    default_project_view: str = Field(default="grid", description="Default project view: grid, list, compact")
    projects_per_page: int = Field(default=12, description="Number of projects per page")
    show_project_health_scores: bool = Field(default=True, description="Show health scores")
    show_backup_status: bool = Field(default=True, description="Show backup status")

    # API settings
    api_rate_limit: int = Field(default=100, description="API rate limit per minute")
    request_timeout: int = Field(default=30, description="Request timeout in seconds")

    # Security settings
    session_timeout: int = Field(default=3600, description="Session timeout in seconds")
    require_auth_for_sensitive_actions: bool = Field(default=True, description="Require auth for sensitive actions")

    # Advanced settings
    debug_mode: bool = Field(default=False, description="Enable debug mode")
    log_level: str = Field(default="INFO", description="Log level: DEBUG, INFO, WARNING, ERROR")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UserPreferences(BaseModel):
    """User-specific preferences."""
    user_id: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    timezone: str = Field(default="UTC", description="User timezone")
    date_format: str = Field(default="YYYY-MM-DD", description="Date format")
    time_format: str = Field(default="24h", description="Time format: 12h, 24h")
    language: str = Field(default="en", description="Interface language")

    # Project-specific preferences
    favorite_projects: List[str] = Field(default_factory=list, description="Favorite project IDs")
    project_tags: Dict[str, List[str]] = Field(default_factory=dict, description="Project tags")

    # Custom dashboard settings
    custom_widgets: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Custom widgets")
    custom_filters: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Custom project filters")

class DashboardConfigManager:
    """Manages dashboard configuration and user preferences."""

    def __init__(self, config_dir: Optional[Path] = None):
        """Initialize the configuration manager."""
        self.config_dir = config_dir or Path.home() / ".bedrock-forge" / "dashboard"
        self.config_dir.mkdir(parents=True, exist_ok=True)

        self.config_file = self.config_dir / "config.json"
        self.users_dir = self.config_dir / "users"
        self.users_dir.mkdir(parents=True, exist_ok=True)

        # In-memory cache
        self._config_cache: Optional[DashboardConfig] = None
        self._user_cache: Dict[str, UserPreferences] = {}

        logger.info(f"Dashboard config manager initialized with config dir: {self.config_dir}")

    def get_config(self, force_reload: bool = False) -> DashboardConfig:
        """Get the dashboard configuration."""
        if self._config_cache is None or force_reload:
            self._config_cache = self._load_config()
        return self._config_cache

    def update_config(self, config: DashboardConfig) -> bool:
        """Update the dashboard configuration."""
        try:
            # Validate the config
            DashboardConfig.parse_obj(config.dict())

            # Save to file
            success = self._save_config(config)
            if success:
                self._config_cache = config
                logger.info("Dashboard configuration updated successfully")
                return True
            else:
                logger.error("Failed to save dashboard configuration")
                return False

        except Exception as e:
            logger.error(f"Failed to update dashboard configuration: {e}")
            return False

    def get_user_preferences(self, user_id: str) -> UserPreferences:
        """Get user preferences."""
        if user_id not in self._user_cache:
            self._user_cache[user_id] = self._load_user_preferences(user_id)
        return self._user_cache[user_id]

    def update_user_preferences(self, user_id: str, preferences: UserPreferences) -> bool:
        """Update user preferences."""
        try:
            # Ensure user_id matches
            preferences.user_id = user_id

            # Save to file
            success = self._save_user_preferences(user_id, preferences)
            if success:
                self._user_cache[user_id] = preferences
                logger.info(f"User preferences updated for user: {user_id}")
                return True
            else:
                logger.error(f"Failed to save user preferences for user: {user_id}")
                return False

        except Exception as e:
            logger.error(f"Failed to update user preferences for {user_id}: {e}")
            return False

    def get_widget_config(self, widget_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific widget."""
        config = self.get_config()
        return config.widgets.get(widget_id)

    def update_widget_config(self, widget_id: str, widget_config: Dict[str, Any]) -> bool:
        """Update configuration for a specific widget."""
        try:
            config = self.get_config()
            config.widgets[widget_id] = widget_config
            return self.update_config(config)
        except Exception as e:
            logger.error(f"Failed to update widget config for {widget_id}: {e}")
            return False

    def get_notification_preferences(self, user_id: Optional[str] = None) -> Dict[str, bool]:
        """Get notification preferences."""
        if user_id:
            # User-specific preferences (when implemented)
            pass

        # Global preferences
        config = self.get_config()
        return config.notification_types

    def update_notification_preferences(self, notification_prefs: Dict[str, bool], user_id: Optional[str] = None) -> bool:
        """Update notification preferences."""
        try:
            config = self.get_config()
            config.notification_types.update(notification_prefs)
            return self.update_config(config)
        except Exception as e:
            logger.error(f"Failed to update notification preferences: {e}")
            return False

    def reset_to_defaults(self) -> bool:
        """Reset configuration to defaults."""
        try:
            default_config = DashboardConfig()
            success = self.update_config(default_config)
            if success:
                logger.info("Dashboard configuration reset to defaults")
            return success
        except Exception as e:
            logger.error(f"Failed to reset configuration to defaults: {e}")
            return False

    def export_config(self, export_path: Path) -> bool:
        """Export configuration to a file."""
        try:
            config = self.get_config()
            export_data = {
                "exported_at": datetime.now().isoformat(),
                "version": "1.0.0",
                "config": config.dict()
            }

            with open(export_path, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)

            logger.info(f"Configuration exported to: {export_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to export configuration: {e}")
            return False

    def import_config(self, import_path: Path) -> bool:
        """Import configuration from a file."""
        try:
            if not import_path.exists():
                logger.error(f"Import file does not exist: {import_path}")
                return False

            with open(import_path, 'r') as f:
                import_data = json.load(f)

            # Validate import data structure
            if "config" not in import_data:
                logger.error("Invalid import file structure: missing 'config' key")
                return False

            # Parse and validate the imported config
            imported_config = DashboardConfig.parse_obj(import_data["config"])

            # Update configuration
            success = self.update_config(imported_config)
            if success:
                logger.info(f"Configuration imported from: {import_path}")
            return success

        except Exception as e:
            logger.error(f"Failed to import configuration: {e}")
            return False

    def _load_config(self) -> DashboardConfig:
        """Load configuration from file."""
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    config_data = json.load(f)
                return DashboardConfig.parse_obj(config_data)
            else:
                # Create default config
                default_config = DashboardConfig()
                self._save_config(default_config)
                return default_config

        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            return DashboardConfig()

    def _save_config(self, config: DashboardConfig) -> bool:
        """Save configuration to file."""
        try:
            # Create backup
            if self.config_file.exists():
                backup_file = self.config_file.with_suffix('.json.backup')
                backup_file.write_text(self.config_file.read_text())

            # Save new config
            with open(self.config_file, 'w') as f:
                json.dump(config.dict(), f, indent=2, default=str)

            return True

        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            return False

    def _load_user_preferences(self, user_id: str) -> UserPreferences:
        """Load user preferences from file."""
        try:
            user_file = self.users_dir / f"{user_id}.json"
            if user_file.exists():
                with open(user_file, 'r') as f:
                    user_data = json.load(f)
                return UserPreferences.parse_obj(user_data)
            else:
                # Create default preferences
                default_prefs = UserPreferences(user_id=user_id)
                self._save_user_preferences(user_id, default_prefs)
                return default_prefs

        except Exception as e:
            logger.error(f"Failed to load user preferences for {user_id}: {e}")
            return UserPreferences(user_id=user_id)

    def _save_user_preferences(self, user_id: str, preferences: UserPreferences) -> bool:
        """Save user preferences to file."""
        try:
            user_file = self.users_dir / f"{user_id}.json"

            with open(user_file, 'w') as f:
                json.dump(preferences.dict(), f, indent=2, default=str)

            return True

        except Exception as e:
            logger.error(f"Failed to save user preferences for {user_id}: {e}")
            return False

# Global configuration manager instance
_config_manager: Optional[DashboardConfigManager] = None

def get_config_manager() -> DashboardConfigManager:
    """Get the global configuration manager instance."""
    global _config_manager
    if _config_manager is None:
        _config_manager = DashboardConfigManager()
    return _config_manager

def get_dashboard_config() -> DashboardConfig:
    """Get the current dashboard configuration."""
    return get_config_manager().get_config()

def update_dashboard_config(config: DashboardConfig) -> bool:
    """Update the dashboard configuration."""
    return get_config_manager().update_config(config)