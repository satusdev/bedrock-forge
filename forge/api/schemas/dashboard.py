"""
Dashboard Pydantic schemas.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel


class ProjectStatus(BaseModel):
    """Status information for a project."""
    project_name: str
    directory: str
    wp_home: str
    ddev_status: str
    git_status: str
    wp_version: Optional[str] = None
    last_deployed: Optional[datetime] = None
    backup_status: Optional[str] = None
    site_health: Optional[str] = None


class DashboardStats(BaseModel):
    """Dashboard statistics."""
    total_projects: int
    active_projects: int
    total_servers: int
    healthy_sites: int
    recent_deployments: int
    failed_backups: int


class QuickAction(BaseModel):
    """Quick action request."""
    action: str
    target: str
    parameters: Optional[Dict[str, Any]] = {}


class ThemeUpdate(BaseModel):
    """Theme update request."""
    theme: str
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None


class WidgetConfigUpdate(BaseModel):
    """Widget configuration update request."""
    widget_id: str
    config: Dict[str, Any]


class NotificationPreferencesUpdate(BaseModel):
    """Notification preferences update request."""
    notification_types: Dict[str, bool]
    notifications_enabled: Optional[bool] = None


class LayoutPreferences(BaseModel):
    """Layout preferences update request."""
    sidebar_collapsed: Optional[bool] = None
    show_advanced_options: Optional[bool] = None
    default_project_view: Optional[str] = None
    projects_per_page: Optional[int] = None


class TaskStatusResponse(BaseModel):
    """Background task status response."""
    task_id: str
    status: str
    message: str = ""
    progress: int = 0
    result: Optional[Any] = None


class LocalStatus(BaseModel):
    """Local development environment status."""
    exists: bool = False
    local_path: Optional[str] = None
    ddev_configured: bool = False
    ddev_running: bool = False
    ddev_url: Optional[str] = None
    last_started: Optional[datetime] = None
    php_version: Optional[str] = None
    wp_version: Optional[str] = None


class CloneLocalOptions(BaseModel):
    """Options for cloning a project locally."""
    github_url: str
    branch: str = "main"
    target_directory: Optional[str] = None  # Defaults to ~/Work/Wordpress/{name}
    run_composer: bool = True
    setup_ddev: bool = True
    start_after_setup: bool = True


class SetupLocalOptions(BaseModel):
    """Options for setting up DDEV for a local project."""
    php_version: str = "8.1"
    project_type: str = "wordpress"
    docroot: str = "web"
    start_after_setup: bool = True


class LocalAvailability(BaseModel):
    """System availability for local development."""
    ddev_installed: bool = False
    ddev_version: Optional[str] = None
    docker_installed: bool = False
    docker_running: bool = False
    git_installed: bool = False
    base_directory: Optional[str] = None
    base_directory_exists: bool = False


class RemoteComposerRequest(BaseModel):
    """Request to run composer on a remote Bedrock site."""
    command: str = "update"  # install, update, require, remove
    packages: Optional[list[str]] = None  # Optional package names
    flags: Optional[list[str]] = None  # e.g., ["--no-dev", "--prefer-dist"]


class RemoteComposerResponse(BaseModel):
    """Response from remote composer command."""
    success: bool
    output: str = ""
    error: Optional[str] = None
    duration_seconds: float = 0.0


class ProjectServerSSHUpdate(BaseModel):
    """Update per-site SSH credentials for a project-server link."""
    ssh_user: Optional[str] = None
    ssh_key_path: Optional[str] = None


