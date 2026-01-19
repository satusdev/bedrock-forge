"""
Seed Data Module

Provides demo or real data based on SEED_DEMO_MODE environment variable.
When SEED_DEMO_MODE=true (default), uses fake but functional demo data.
When SEED_DEMO_MODE=false, uses credentials from environment variables.

Usage:
    from forge.db.seed_data import get_seed_users, get_seed_servers
    
    users = get_seed_users()
    servers = get_seed_servers()
"""

import os
from typing import List, Dict, Any, Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class SeedSettings(BaseSettings):
    """Settings for database seeding"""
    
    # Demo mode toggle
    SEED_DEMO_MODE: bool = Field(default=True, description="Use demo data instead of real credentials")
    
    # Admin user credentials
    SEED_ADMIN_EMAIL: str = Field(default="", description="Admin email for real seeding")
    SEED_ADMIN_PASSWORD: str = Field(default="", description="Admin password for real seeding")
    SEED_ADMIN_FULL_NAME: str = Field(default="Administrator", description="Admin full name")
    
    # Server credentials
    SEED_SERVER_NAME: str = Field(default="", description="Server display name")
    SEED_SERVER_HOSTNAME: str = Field(default="", description="Server hostname/domain")
    SEED_SERVER_IP: str = Field(default="", description="Server IP address")
    SEED_SERVER_SSH_USER: str = Field(default="root", description="SSH username")
    SEED_SERVER_SSH_PORT: int = Field(default=22, description="SSH port")
    SEED_SERVER_SSH_KEY_PATH: str = Field(default="", description="Path to SSH private key")
    
    # CyberPanel
    SEED_CYBERPANEL_USER: str = Field(default="", description="CyberPanel admin username")
    SEED_CYBERPANEL_PASSWORD: str = Field(default="", description="CyberPanel admin password")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Global settings instance
_seed_settings: Optional[SeedSettings] = None


def get_seed_settings() -> SeedSettings:
    """Get or create seed settings instance"""
    global _seed_settings
    if _seed_settings is None:
        _seed_settings = SeedSettings()
    return _seed_settings


def is_demo_mode() -> bool:
    """Check if demo mode is enabled"""
    return get_seed_settings().SEED_DEMO_MODE


# =================================
# DEMO DATA
# =================================

DEMO_USERS = [
    {
        "email": "wd@lamah.com",
        "password": "demo123456",
        "full_name": "WD Administrator",
        "is_superuser": True,
        "is_active": True,
    }
]

DEMO_ROLES = [
    {
        "name": "admin",
        "description": "Full system access",
        "permissions": [
            "projects:read", "projects:write", "projects:delete",
            "servers:read", "servers:write", "servers:delete",
            "users:read", "users:write", "users:delete",
            "settings:read", "settings:write",
            "backups:read", "backups:write",
            "deployments:read", "deployments:write",
        ]
    },
    {
        "name": "developer",
        "description": "Project and deployment access",
        "permissions": [
            "projects:read", "projects:write",
            "servers:read",
            "users:read",
            "backups:read", "backups:write",
            "deployments:read", "deployments:write",
        ]
    },
    {
        "name": "viewer",
        "description": "Read-only access",
        "permissions": [
            "projects:read",
            "servers:read",
            "users:read",
            "backups:read",
            "deployments:read",
        ]
    },
]

DEMO_SERVERS = [
    {
        "name": "LamaHost Production",
        "hostname": "cp.lamahost.ly",
        "ip_address": "78.46.41.81",
        "provider": "hetzner",
        "ssh_user": "root",
        "ssh_port": 22,
        "ssh_key_path": "~/.ssh/id_rsa",
        "panel_type": "cyberpanel",
        "panel_url": "https://cp.lamahost.ly:8090",
        "status": "online",
    },
    {
        "name": "Lamah Production",
        "hostname": "cp.lamah.ly",
        "ip_address": "128.140.1.61",
        "provider": "hetzner",
        "ssh_user": "root",
        "ssh_port": 22,
        "ssh_key_path": "~/.ssh/id_rsa",
        "panel_type": "cyberpanel",
        "panel_url": "https://cp.lamah.ly:8090",
        "status": "online",
    },
    {
        "name": "Staging Server",
        "hostname": "cp.staging.ly",
        "ip_address": "78.47.141.179",
        "provider": "hetzner",
        "ssh_user": "root",
        "ssh_port": 22,
        "ssh_key_path": "~/.ssh/id_rsa",
        "panel_type": "cyberpanel",
        "panel_url": "https://cp.staging.ly:8090",
        "status": "online",
    },
]

DEMO_PROJECTS = [
    # {
    #     "name": "Demo Blog",
    #     "slug": "demo-blog",
    #     "description": "A demo WordPress blog project",
    #     "project_type": "wordpress",
    #     "status": "active",
    #     "directory": "/var/www/demo-blog",
    #     "environments": {
    #         "local": {
    #             "url": "http://demo-blog.ddev.site",
    #             "type": "local",
    #         },
    #         "staging": {
    #             "url": "https://staging.demo-blog.example.com",
    #             "type": "staging",
    #         },
    #         "production": {
    #             "url": "https://demo-blog.example.com",
    #             "type": "production",
    #         }
    #     }
    # },
]

DEMO_MONITORS = [
    {
        "name": "LamaHost Panel",
        "url": "https://cp.lamahost.ly:8090",
        "monitor_type": "uptime",
        "interval_seconds": 300,
        "timeout_seconds": 30,
    },
    {
        "name": "Lamah Production Panel",
        "url": "https://cp.lamah.ly:8090",
        "monitor_type": "uptime",
        "interval_seconds": 300,
        "timeout_seconds": 30,
    },
    {
        "name": "Staging Panel",
        "url": "https://cp.staging.ly:8090",
        "monitor_type": "uptime",
        "interval_seconds": 300,
        "timeout_seconds": 30,
    },
]


# =================================
# SEED DATA GETTERS
# =================================

def get_seed_users() -> List[Dict[str, Any]]:
    """Get users for seeding based on demo mode"""
    settings = get_seed_settings()
    
    if settings.SEED_DEMO_MODE:
        return DEMO_USERS
    
    # Real mode - use environment credentials
    if not settings.SEED_ADMIN_EMAIL or not settings.SEED_ADMIN_PASSWORD:
        raise ValueError(
            "SEED_DEMO_MODE is false but SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is not set"
        )
    
    return [
        {
            "email": settings.SEED_ADMIN_EMAIL,
            "password": settings.SEED_ADMIN_PASSWORD,
            "full_name": settings.SEED_ADMIN_FULL_NAME or "Administrator",
            "is_superuser": True,
            "is_active": True,
        }
    ]


def get_seed_roles() -> List[Dict[str, Any]]:
    """Get roles for seeding (same for demo and real)"""
    return DEMO_ROLES


def get_seed_servers() -> List[Dict[str, Any]]:
    """Get servers for seeding based on demo mode"""
    settings = get_seed_settings()
    
    if settings.SEED_DEMO_MODE:
        return DEMO_SERVERS
    
    # Real mode - only create server if credentials provided
    if not settings.SEED_SERVER_HOSTNAME:
        return []  # No servers to seed in real mode without config
    
    return [
        {
            "name": settings.SEED_SERVER_NAME or settings.SEED_SERVER_HOSTNAME,
            "hostname": settings.SEED_SERVER_HOSTNAME,
            "ip_address": settings.SEED_SERVER_IP or "",
            "provider": "custom",
            "ssh_user": settings.SEED_SERVER_SSH_USER,
            "ssh_port": settings.SEED_SERVER_SSH_PORT,
            "ssh_key_path": settings.SEED_SERVER_SSH_KEY_PATH,
            "panel_type": "cyberpanel" if settings.SEED_CYBERPANEL_USER else None,
            "status": "unknown",
        }
    ]


def get_seed_projects() -> List[Dict[str, Any]]:
    """Get projects for seeding based on demo mode"""
    if is_demo_mode():
        return DEMO_PROJECTS
    
    # In real mode, don't seed any projects
    return []


def get_seed_monitors() -> List[Dict[str, Any]]:
    """Get monitors for seeding based on demo mode"""
    if is_demo_mode():
        return DEMO_MONITORS
    
    # In real mode, don't seed any monitors
    return []


def get_user_role_assignments() -> List[Dict[str, str]]:
    """Get user-role assignments for demo mode"""
    if is_demo_mode():
        return [
            {"email": "admin@example.com", "role": "admin"},
            {"email": "developer@example.com", "role": "developer"},
            {"email": "viewer@example.com", "role": "viewer"},
        ]
    return []

