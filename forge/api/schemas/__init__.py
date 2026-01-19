"""
API Schemas package.
"""
from .auth import (
    UserLogin,
    UserRegister,
    Token,
    TokenRefresh,
    PasswordChange,
    UserCreate,
    UserUpdate,
    UserRead,
)
from .server import (
    ServerCreate,
    ServerUpdate,
    ServerRead,
    ServerTestResult,
    DirectoryScanResult,
    ServerDirectory,
)
from .dashboard import (
    ProjectStatus,
    DashboardStats,
    QuickAction,
    ThemeUpdate,
    WidgetConfigUpdate,
    NotificationPreferencesUpdate,
    LayoutPreferences,
    TaskStatusResponse,
    LocalStatus,
    CloneLocalOptions,
    SetupLocalOptions,
    LocalAvailability,
)
from .project_server import (
    ProjectServerCreate,
    ProjectServerUpdate,
    ProjectServerRead,
    ProjectServerWithCredentials,
    SyncOptions,
    SyncResult,
)
from .wp_credential import (
    WPCredentialCreate,
    WPCredentialUpdate,
    WPCredentialRead,
    WPCredentialWithContext,
    QuickLoginRequest,
    QuickLoginResponse,
)
from .project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectRead,
    ProjectSummary,
    LocalProject,
    TagsResponse,
    EnvironmentCreate,
    EnvironmentUpdate,
    EnvironmentRead,
)

__all__ = [
    # Auth
    "UserLogin",
    "UserRegister",
    "Token",
    "TokenRefresh",
    "PasswordChange",
    # Users
    "UserCreate",
    "UserUpdate",
    "UserRead",
    # Servers
    "ServerCreate",
    "ServerUpdate",
    "ServerRead",
    "ServerTestResult",
    "DirectoryScanResult",
    "ServerDirectory",
    # Dashboard
    "ProjectStatus",
    "DashboardStats",
    "QuickAction",
    "ThemeUpdate",
    "WidgetConfigUpdate",
    "NotificationPreferencesUpdate",
    "LayoutPreferences",
    "TaskStatusResponse",
    # Project-Server
    "ProjectServerCreate",
    "ProjectServerUpdate",
    "ProjectServerRead",
    "ProjectServerWithCredentials",
    "SyncOptions",
    "SyncResult",
    # WP Credentials
    "WPCredentialCreate",
    "WPCredentialUpdate",
    "WPCredentialRead",
    "WPCredentialWithContext",
    "QuickLoginRequest",
    "QuickLoginResponse",
    # Projects
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectRead",
    "ProjectSummary",
    "LocalProject",
    "TagsResponse",
    # Environments
    "EnvironmentCreate",
    "EnvironmentUpdate",
    "EnvironmentRead",
]
