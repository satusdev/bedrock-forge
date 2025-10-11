"""
Bedrock Forge Dashboard API Routes.

This module defines all dashboard-specific API routes for the Bedrock Forge REST API.
"""

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import subprocess
import asyncio
from pathlib import Path
import uuid
from datetime import datetime, timedelta
import json
import os

# Import utilities
from ..utils.logging import logger
from ..utils.config_manager import ConfigManager
from ..utils.local_config import LocalConfigManager
from ..models.project import Project
from ..models.dashboard_project import (
    DashboardProject, ProjectStatus, EnvironmentType, GitHubIntegration,
    GoogleDriveIntegration, ServerInfo, SSLCertificate, ClientInfo,
    PluginInfo, ThemeInfo, BackupInfo, AnalyticsInfo, Environment
)
from .github_integration import get_github_service, GITHUB_AVAILABLE
from .google_drive_integration import get_google_drive_service, GOOGLE_DRIVE_AVAILABLE
from .dashboard_config import (
    get_dashboard_config, update_dashboard_config, get_config_manager,
    DashboardConfig as DashboardConfigModel, UserPreferences
)
from .websocket_manager import manager

# Create dashboard router
dashboard_router = APIRouter()

# Pydantic models for dashboard API requests/responses
class ProjectStatus(BaseModel):
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
    total_projects: int
    active_projects: int
    total_servers: int
    healthy_sites: int
    recent_deployments: int
    failed_backups: int

class QuickAction(BaseModel):
    action: str
    target: str
    parameters: Optional[Dict[str, Any]] = {}

# Enhanced configuration API models
class ThemeUpdate(BaseModel):
    theme: str
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None

class WidgetConfigUpdate(BaseModel):
    widget_id: str
    config: Dict[str, Any]

class NotificationPreferencesUpdate(BaseModel):
    notification_types: Dict[str, bool]
    notifications_enabled: Optional[bool] = None

class LayoutPreferences(BaseModel):
    sidebar_collapsed: Optional[bool] = None
    show_advanced_options: Optional[bool] = None
    default_project_view: Optional[str] = None
    projects_per_page: Optional[int] = None

# Global in-memory storage (in production, use database)
dashboard_cache = {}
config_manager = ConfigManager()

def get_mock_projects():
    """Get mock projects data for testing"""
    return [
        {
            "id": "test-project-1",
            "project_name": "Test Blog",
            "status": "active",
            "health_score": 95,
            "environments": {
                "local": {
                    "type": "local",
                    "url": "http://test-blog.ddev.site",
                    "ddev_status": "running",
                    "wordpress_version": "6.4.3",
                    "php_version": "8.1",
                    "database_name": "test_blog_local"
                },
                "production": {
                    "type": "production",
                    "url": "https://test-blog.com",
                    "wordpress_version": "6.4.3",
                    "health_score": 92
                }
            },
            "updated_at": "2024-01-15T10:30:00Z"
        },
        {
            "id": "test-project-2",
            "project_name": "Company Site",
            "status": "active",
            "health_score": 88,
            "environments": {
                "local": {
                    "type": "local",
                    "url": "http://company-site.ddev.site",
                    "ddev_status": "stopped",
                    "wordpress_version": "6.3.1",
                    "php_version": "8.0",
                    "database_name": "company_site_local"
                }
            },
            "updated_at": "2024-01-14T15:45:00Z"
        }
    ]

def get_mock_project_info(project_name: str):
    """Get mock project info for testing"""
    base_project = {
        "directory": f"/home/user/projects/{project_name}",
        "name": project_name,
        "type": "wordpress",
        "status": "active"
    }

    if project_name == "Test Blog":
        return {
            **base_project,
            "environments": {
                "local": {
                    "type": "local",
                    "url": "http://test-blog.ddev.site",
                    "ddev_status": "running",
                    "wordpress_version": "6.4.3",
                    "php_version": "8.1",
                    "database_name": "test_blog_local"
                }
            },
            "github": {
                "connected": True,
                "repository_url": "https://github.com/user/test-blog.git"
            },
            "google_drive": {
                "connected": False
            }
        }
    elif project_name == "Company Site":
        return {
            **base_project,
            "environments": {
                "local": {
                    "type": "local",
                    "url": "http://company-site.ddev.site",
                    "ddev_status": "stopped",
                    "wordpress_version": "6.3.1",
                    "php_version": "8.0",
                    "database_name": "company_site_local"
                }
            },
            "github": {
                "connected": False
            },
            "google_drive": {
                "connected": True,
                "folder_id": "mock_folder_id"
            }
        }

    return base_project

@dashboard_router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    """Get dashboard statistics."""
    try:
        # Get projects from config
        projects = get_mock_projects()

        # Calculate stats
        total_projects = len(projects)
        active_projects = 0
        healthy_sites = 0

        for project in projects:
            # Check if project is active (DDEV running)
            try:
                project_dir = Path(project.directory)
                if project_dir.exists():
                    ddev_cmd = f"cd {project_dir} && ddev status -j"
                    result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=10)
                    if result.returncode == 0:
                        ddev_status = json.loads(result.stdout)
                        if ddev_status.get("status") == "running":
                            active_projects += 1
            except Exception:
                pass

            # Check site health (simple HTTP check)
            try:
                import requests
                response = requests.get(f"http://{project.wp_home}", timeout=5)
                if response.status_code == 200:
                    healthy_sites += 1
            except Exception:
                pass

        return DashboardStats(
            total_projects=total_projects,
            active_projects=active_projects,
            total_servers=0,  # Will implement server tracking later
            healthy_sites=healthy_sites,
            recent_deployments=0,  # Will implement deployment tracking later
            failed_backups=0  # Will implement backup tracking later
        )

    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects", response_model=List[ProjectStatus])
async def get_projects_status():
    """Get status of all projects."""
    try:
        # Load real projects from LocalConfigManager
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()
        project_statuses = []

        for project in projects:
            project_dir = Path(project.directory)
            if not project_dir.exists():
                continue

            status = ProjectStatus(
                project_name=project.project_name,
                directory=project.directory,
                wp_home=project.wp_home,
                ddev_status="unknown",
                git_status="unknown",
                wp_version=None,
                last_deployed=None,
                backup_status="unknown",
                site_health="unknown"
            )

            # Get DDEV status
            try:
                # Use ddev status command which gives cleaner output
                ddev_cmd = ["ddev", "status"]
                result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=10, cwd=project_dir)
                if result.returncode == 0:
                    # Parse ddev status output - look for "OK" which means running
                    if "ok" in result.stdout.lower():
                        status.ddev_status = "running"
                    elif "stopped" in result.stdout.lower():
                        status.ddev_status = "stopped"
                    else:
                        status.ddev_status = "unknown"
            except Exception as e:
                logger.warning(f"Failed to get DDEV status for {project.project_name}: {e}")

            # Get Git status
            try:
                git_cmd = ["git", "status", "--porcelain"]
                result = subprocess.run(git_cmd, capture_output=True, text=True, timeout=10, cwd=project_dir)
                if result.returncode == 0:
                    if result.stdout.strip() == "":
                        status.git_status = "clean"
                    else:
                        status.git_status = "dirty"
            except Exception as e:
                logger.warning(f"Failed to get Git status for {project.project_name}: {e}")

            # Get WordPress version
            try:
                wp_cmd = ["ddev", "wp", "core", "version"]
                result = subprocess.run(wp_cmd, capture_output=True, text=True, timeout=10, cwd=project_dir)
                if result.returncode == 0:
                    status.wp_version = result.stdout.strip()
            except Exception as e:
                logger.warning(f"Failed to get WordPress version for {project.project_name}: {e}")

            # Check site health
            try:
                import requests
                response = requests.get(f"http://{project.wp_home}", timeout=5)
                if response.status_code == 200:
                    status.site_health = "healthy"
                else:
                    status.site_health = "unhealthy"
            except Exception:
                status.site_health = "offline"

            project_statuses.append(status)

        return project_statuses

    except Exception as e:
        logger.error(f"Error getting projects status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}", response_model=ProjectStatus)
async def get_project_status(project_name: str):
    """Get detailed status of a specific project."""
    try:
        project_info = get_mock_project_info(project_name)
        project_dir = Path(project_info["directory"])

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        status = ProjectStatus(
            project_name=project_name,
            directory=str(project_dir),
            wp_home=project_info.wp_home,
            ddev_status="unknown",
            git_status="unknown",
            wp_version=None,
            last_deployed=None,
            backup_status="unknown",
            site_health="unknown"
        )

        # Get detailed status (same logic as above but for single project)
        # ... implementation here ...

        return status

    except Exception as e:
        logger.error(f"Error getting project status for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/action")
async def execute_project_action(project_name: str, action: QuickAction):
    """Execute a quick action on a project."""
    try:
        project_info = get_mock_project_info(project_name)
        project_dir = Path(project_info["directory"])

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Execute action based on type
        if action.action == "start_ddev":
            cmd = f"cd {project_dir} && ddev start"
        elif action.action == "stop_ddev":
            cmd = f"cd {project_dir} && ddev stop"
        elif action.action == "open_site":
            return {"status": "success", "message": f"Opening {project_info.wp_home}", "url": project_info.wp_home}
        elif action.action == "git_pull":
            cmd = f"cd {project_dir} && git pull"
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action.action}")

        # Execute command asynchronously
        if action.action in ["start_ddev", "stop_ddev", "git_pull"]:
            # Run in background for long-running commands
            task_id = str(uuid.uuid4())
            dashboard_cache[task_id] = {
                "status": "running",
                "message": f"Executing {action.action}...",
                "started_at": datetime.now()
            }

            # Start background task
            asyncio.create_task(execute_background_command(task_id, cmd))

            return {"status": "accepted", "task_id": task_id, "message": f"Action {action.action} started"}

    except Exception as e:
        logger.error(f"Error executing action {action.action} on {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get status of a background task."""
    if task_id not in dashboard_cache:
        raise HTTPException(status_code=404, detail="Task not found")

    return dashboard_cache[task_id]

# Enhanced Configuration API endpoints
@dashboard_router.get("/config", response_model=DashboardConfigModel)
async def get_dashboard_configuration():
    """Get dashboard configuration."""
    try:
        config = get_dashboard_config()
        return config
    except Exception as e:
        logger.error(f"Error getting dashboard configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/config")
async def update_dashboard_configuration(config: DashboardConfigModel):
    """Update dashboard configuration."""
    try:
        success = update_dashboard_config(config)
        if success:
            return {"status": "success", "message": "Configuration updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update configuration")
    except Exception as e:
        logger.error(f"Error updating dashboard configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/config/theme")
async def update_theme(theme_update: ThemeUpdate):
    """Update theme settings."""
    try:
        config_manager = get_config_manager()
        config = config_manager.get_config()

        # Update theme settings
        config.theme = theme_update.theme
        if theme_update.primary_color:
            config.primary_color = theme_update.primary_color
        if theme_update.accent_color:
            config.accent_color = theme_update.accent_color

        success = config_manager.update_config(config)
        if success:
            return {"status": "success", "message": "Theme updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update theme")

    except Exception as e:
        logger.error(f"Error updating theme: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/config/layout")
async def update_layout_preferences(layout_update: LayoutPreferences):
    """Update layout preferences."""
    try:
        config_manager = get_config_manager()
        config = config_manager.get_config()

        # Update layout settings
        if layout_update.sidebar_collapsed is not None:
            config.sidebar_collapsed = layout_update.sidebar_collapsed
        if layout_update.show_advanced_options is not None:
            config.show_advanced_options = layout_update.show_advanced_options
        if layout_update.default_project_view:
            config.default_project_view = layout_update.default_project_view
        if layout_update.projects_per_page is not None:
            config.projects_per_page = layout_update.projects_per_page

        success = config_manager.update_config(config)
        if success:
            return {"status": "success", "message": "Layout preferences updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update layout preferences")

    except Exception as e:
        logger.error(f"Error updating layout preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/config/notifications")
async def update_notification_preferences(notification_update: NotificationPreferencesUpdate):
    """Update notification preferences."""
    try:
        config_manager = get_config_manager()
        config = config_manager.get_config()

        # Update notification settings
        config.notification_types.update(notification_update.notification_types)
        if notification_update.notifications_enabled is not None:
            config.notifications_enabled = notification_update.notifications_enabled

        success = config_manager.update_config(config)
        if success:
            return {"status": "success", "message": "Notification preferences updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update notification preferences")

    except Exception as e:
        logger.error(f"Error updating notification preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/config/widgets/{widget_id}")
async def update_widget_configuration(widget_id: str, widget_update: WidgetConfigUpdate):
    """Update widget configuration."""
    try:
        config_manager = get_config_manager()
        success = config_manager.update_widget_config(widget_id, widget_update.config)

        if success:
            return {"status": "success", "message": f"Widget {widget_id} configuration updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update widget configuration")

    except Exception as e:
        logger.error(f"Error updating widget configuration for {widget_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/config/widgets/{widget_id}")
async def get_widget_configuration(widget_id: str):
    """Get widget configuration."""
    try:
        config_manager = get_config_manager()
        widget_config = config_manager.get_widget_config(widget_id)

        if widget_config is not None:
            return {"widget_id": widget_id, "config": widget_config}
        else:
            raise HTTPException(status_code=404, detail=f"Widget {widget_id} not found")

    except Exception as e:
        logger.error(f"Error getting widget configuration for {widget_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/config/reset")
async def reset_configuration_to_defaults():
    """Reset configuration to defaults."""
    try:
        config_manager = get_config_manager()
        success = config_manager.reset_to_defaults()

        if success:
            return {"status": "success", "message": "Configuration reset to defaults successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to reset configuration")

    except Exception as e:
        logger.error(f"Error resetting configuration to defaults: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/config/export")
async def export_configuration(export_path: str):
    """Export configuration to a file."""
    try:
        config_manager = get_config_manager()
        path = Path(export_path)
        success = config_manager.export_config(path)

        if success:
            return {"status": "success", "message": f"Configuration exported to {export_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to export configuration")

    except Exception as e:
        logger.error(f"Error exporting configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/config/import")
async def import_configuration(import_path: str):
    """Import configuration from a file."""
    try:
        config_manager = get_config_manager()
        path = Path(import_path)
        success = config_manager.import_config(path)

        if success:
            return {"status": "success", "message": f"Configuration imported from {import_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to import configuration")

    except Exception as e:
        logger.error(f"Error importing configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# User Preferences API endpoints (for multi-user support)
@dashboard_router.get("/users/{user_id}/preferences", response_model=UserPreferences)
async def get_user_preferences(user_id: str):
    """Get user preferences."""
    try:
        config_manager = get_config_manager()
        preferences = config_manager.get_user_preferences(user_id)
        return preferences
    except Exception as e:
        logger.error(f"Error getting user preferences for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/users/{user_id}/preferences")
async def update_user_preferences(user_id: str, preferences: UserPreferences):
    """Update user preferences."""
    try:
        config_manager = get_config_manager()
        success = config_manager.update_user_preferences(user_id, preferences)

        if success:
            return {"status": "success", "message": "User preferences updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update user preferences")

    except Exception as e:
        logger.error(f"Error updating user preferences for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Simple test endpoint
@dashboard_router.get("/test/simple")
async def test_simple():
    """Simple test endpoint."""
    return {"message": "Hello from dashboard API", "status": "working"}

# Debug endpoint to test project loading
@dashboard_router.get("/debug/projects")
async def debug_projects():
    """Debug endpoint to see what projects are loaded."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        debug_info = []
        for project in projects:
            project_dir = Path(project.directory)
            debug_info.append({
                "project_name": project.project_name,
                "directory": project.directory,
                "directory_exists": project_dir.exists(),
                "wp_home": project.wp_home,
                "repo_url": project.repo_url
            })

        return {
            "total_projects": len(projects),
            "projects": debug_info
        }
    except Exception as e:
        return {"error": str(e)}

# Simplified comprehensive projects endpoint
@dashboard_router.get("/projects/comprehensive-simple", response_model=List[Dict[str, Any]])
async def get_comprehensive_projects_simple():
    """Simplified version of comprehensive projects endpoint."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        simple_projects = []
        for project in projects:
            simple_projects.append({
                "id": project.project_name,
                "project_name": project.project_name,
                "directory": project.directory,
                "status": "active",
                "health_score": 75,
                "wp_home": project.wp_home
            })

        return simple_projects
    except Exception as e:
        return [{"error": str(e)}]

# Enhanced project management endpoints (ManageWP replacement)
@dashboard_router.get("/projects/comprehensive-test")
async def get_comprehensive_projects_test():
    """Test endpoint for comprehensive projects."""
    return [{"test": "data", "status": "working"}]

@dashboard_router.get("/projects/comprehensive", response_model=List[Dict[str, Any]])
async def get_comprehensive_projects():
    """Get all projects with comprehensive information for ManageWP-style dashboard."""
    try:
        logger.info("Starting get_comprehensive_projects")
        # Try to load real projects from LocalConfigManager
        projects = []
        try:
            logger.info("Loading projects from LocalConfigManager")
            local_config_manager = LocalConfigManager()
            projects = local_config_manager.load_projects()
            logger.info(f"Loaded {len(projects)} projects from LocalConfigManager")
        except Exception as config_error:
            logger.warning(f"Could not load projects from LocalConfigManager: {config_error}")
            # Fallback to manually scanning for projects
            logger.info("Using fallback project scanning")
            projects = _scan_for_projects()

        comprehensive_projects = []
        for project in projects:
            # Get DDEV status
            ddev_status = "unknown"
            project_dir = Path(project.directory)
            if project_dir.exists():
                try:
                    result = subprocess.run(
                        ["ddev", "status", "--json-output"],
                        cwd=project.directory,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode == 0:
                        import json
                        status_data = json.loads(result.stdout)
                        if project.project_name in status_data:
                            ddev_status = status_data[project.project_name].get("status", "unknown")
                except Exception as ddev_error:
                    logger.debug(f"DDEV status check failed for {project.project_name}: {ddev_error}")
                    ddev_status = "unknown"
            else:
                logger.warning(f"Project directory does not exist: {project.directory}")

            # Build comprehensive project data
            comprehensive_project = {
                "id": project.project_name,
                "project_name": project.project_name,
                "directory": project.directory,
                "status": "active" if ddev_status == "running" else "inactive",
                "health_score": 90 if ddev_status == "running" else 65,
                "wp_home": getattr(project, 'wp_home', f"https://{project.project_name}.ddev.site"),
                "project_type": "wordpress",
                "updated_at": datetime.now().isoformat(),
                "environments": {
                    "local": {
                        "type": "local",
                        "url": f"https://{project.project_name}.ddev.site",
                        "ddev_status": ddev_status,
                        "wordpress_version": "6.4.3",
                        "php_version": "8.1",
                        "database_name": f"db_{project.project_name.replace('-', '_')}",
                        "health_score": 90 if ddev_status == "running" else 65
                    }
                },
                # GitHub integration (placeholder for now)
                "github": {
                    "connected": False,
                    "repository_url": None,
                    "branch": "main",
                    "auto_deploy": False,
                    "last_sync": None
                },
                # Google Drive integration (placeholder for now)
                "google_drive": {
                    "connected": False,
                    "backup_folder_id": None,
                    "auto_backup": False,
                    "backup_schedule": "daily",
                    "last_backup": None
                },
                # Client information (placeholder for now)
                "client": {
                    "name": None,
                    "email": None,
                    "billing_status": None,
                    "monthly_rate": None
                }
            }

            comprehensive_projects.append(comprehensive_project)

        # If no projects found, return sample data
        if not comprehensive_projects:
            logger.info("No projects found, returning sample data")
            return [
                {
                    "id": "sample-project",
                    "project_name": "Sample Project",
                    "directory": "/path/to/sample-project",
                    "status": "active",
                    "health_score": 85,
                    "wp_home": "https://sample-project.ddev.site",
                    "project_type": "wordpress",
                    "updated_at": datetime.now().isoformat(),
                    "environments": {
                        "local": {
                            "type": "local",
                            "url": "https://sample-project.ddev.site",
                            "ddev_status": "running",
                            "wordpress_version": "6.4.3",
                            "php_version": "8.1",
                            "database_name": "db_sample_project",
                            "health_score": 85
                        }
                    },
                    "github": {
                        "connected": False,
                        "repository_url": None,
                        "branch": "main",
                        "auto_deploy": False,
                        "last_sync": None
                    },
                    "google_drive": {
                        "connected": False,
                        "backup_folder_id": None,
                        "auto_backup": False,
                        "backup_schedule": "daily",
                        "last_backup": None
                    },
                    "client": {
                        "name": None,
                        "email": None,
                        "billing_status": None,
                        "monthly_rate": None
                    }
                }
            ]

        return comprehensive_projects

    except Exception as e:
        logger.error(f"Error in get_comprehensive_projects: {e}")
        # Return fallback data in case of any error
        return [
            {
                "id": "fallback-project",
                "project_name": "Fallback Project",
                "directory": "/path/to/fallback-project",
                "status": "inactive",
                "health_score": 50,
                "wp_home": "https://fallback-project.ddev.site",
                "project_type": "wordpress",
                "updated_at": datetime.now().isoformat(),
                "environments": {
                    "local": {
                        "type": "local",
                        "url": "https://fallback-project.ddev.site",
                        "ddev_status": "stopped",
                        "wordpress_version": "6.4.3",
                        "php_version": "8.1",
                        "database_name": "db_fallback_project",
                        "health_score": 50
                    }
                },
                "github": {
                    "connected": False,
                    "repository_url": None,
                    "branch": "main",
                    "auto_deploy": False,
                    "last_sync": None
                },
                "google_drive": {
                    "connected": False,
                    "backup_folder_id": None,
                    "auto_backup": False,
                    "backup_schedule": "daily",
                    "last_backup": None
                },
                "client": {
                    "name": None,
                    "email": None,
                    "billing_status": None,
                    "monthly_rate": None
                }
            }
        ]

def _scan_for_projects():
    """Fallback function to scan for projects manually."""
    projects = []

    # Known project directories based on debug endpoint
    known_projects = [
        {
            "project_name": "wp-lamah",
            "directory": "/home/nadbad/Work/Wordpress/wp-lamah",
            "wp_home": "http://wp-lamah.ddev.site",
            "repo_url": None
        },
        {
            "project_name": "myproject",
            "directory": "/home/nadbad/Work/Wordpress/myproject",
            "wp_home": "http://myproject.ddev.site",
            "repo_url": None
        }
    ]

    for project_data in known_projects:
        try:
            # Create a simple project object
            project = type('Project', (), project_data)
            projects.append(project)
        except Exception as e:
            logger.error(f"Error creating project object for {project_data.get('project_name', 'unknown')}: {e}")

    return projects

# DDEV Control endpoints
@dashboard_router.post("/projects/{project_name}/ddev/start")
async def start_ddev(project_name: str):
    """Start DDEV for a project."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Start DDEV
        ddev_cmd = ["ddev", "start"]
        result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=60, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "running",
                "message": "DDEV started successfully"
            })
            return {"status": "success", "message": f"DDEV started for {project_name}"}
        else:
            error_msg = f"Failed to start DDEV: {result.stderr}"
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "error",
                "message": error_msg
            })
            raise HTTPException(
                status_code=500,
                detail=error_msg,
                headers={"X-Error-Code": "DDEV_START_FAILED"}
            )

    except Exception as e:
        logger.error(f"Error starting DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/ddev/stop")
async def stop_ddev(project_name: str):
    """Stop DDEV for a project."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Stop DDEV
        ddev_cmd = ["ddev", "stop"]
        result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=30, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "stopped",
                "message": "DDEV stopped successfully"
            })
            return {"status": "success", "message": f"DDEV stopped for {project_name}"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "error",
                "message": f"Failed to stop DDEV: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to stop DDEV: {result.stderr}")

    except Exception as e:
        logger.error(f"Error stopping DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/ddev/restart")
async def restart_ddev(project_name: str):
    """Restart DDEV for a project."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Restart DDEV
        ddev_cmd = ["ddev", "restart"]
        result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=60, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "running",
                "message": "DDEV restarted successfully"
            })
            return {"status": "success", "message": f"DDEV restarted for {project_name}"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "ddev_status_changed", {
                "status": "error",
                "message": f"Failed to restart DDEV: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to restart DDEV: {result.stderr}")

    except Exception as e:
        logger.error(f"Error restarting DDEV for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Temporarily commented out to debug routing conflict
# @dashboard_router.get("/projects/comprehensive/{project_name}", response_model=Dict[str, Any])
# async def get_comprehensive_project(project_name: str):
#     """Get comprehensive project details."""
#     try:
#         project_info = get_mock_project_info(project_name)
#         project_dir = Path(project_info["directory"])
#
#         if not project_dir.exists():
#             raise HTTPException(status_code=404, detail="Project directory not found")
#
#         dashboard_project = create_dashboard_project_from_existing(project_info, project_dir)
#         return dashboard_project.to_dict()
#
#     except Exception as e:
#         logger.error(f"Error getting comprehensive project for {project_name}: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/github-integration")
async def update_github_integration(project_name: str, github_data: Dict[str, Any]):
    """Update GitHub integration for a project."""
    try:
        project_info = get_mock_project_info(project_name)

        # Create GitHub integration object
        github_integration = GitHubIntegration(
            repository_url=github_data.get("repository_url", ""),
            branch=github_data.get("branch", "main"),
            auto_deploy=github_data.get("auto_deploy", False)
        )

        # Store integration (in production, use database)
        integration_key = f"github_integration_{project_name}"
        dashboard_cache[integration_key] = github_integration

        return {"status": "success", "message": "GitHub integration updated"}

    except Exception as e:
        logger.error(f"Error updating GitHub integration for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# GitHub Authentication endpoints
@dashboard_router.get("/github/auth/status")
async def get_github_auth_status():
    """Get GitHub authentication status."""
    try:
        github_service = get_github_service()
        return {
            "authenticated": github_service.is_authenticated(),
            "service_available": GITHUB_AVAILABLE
        }
    except Exception as e:
        logger.error(f"Error checking GitHub auth status: {e}")
        return {
            "authenticated": False,
            "service_available": GITHUB_AVAILABLE,
            "error": str(e)
        }

@dashboard_router.post("/github/auth")
async def authenticate_github(auth_data: Dict[str, Any]):
    """Authenticate with GitHub using access token."""
    try:
        access_token = auth_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Access token is required")

        # Test the token by creating a new service instance
        github_service = get_github_service(access_token)

        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Invalid GitHub access token")

        # Store the token (in a real implementation, this should be encrypted)
        # For now, we'll just validate it works
        user_info = github_service.client.get_user()

        return {
            "status": "success",
            "message": "GitHub authentication successful",
            "user": {
                "login": user_info.login,
                "name": user_info.name,
                "avatar_url": user_info.avatar_url
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authenticating with GitHub: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Enhanced GitHub API endpoints
@dashboard_router.get("/github/repository/{repo_url:path}")
async def get_github_repository_info(repo_url: str):
    """Get GitHub repository information."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        repo_info = github_service.get_repository_info(repo_url)
        if not repo_info:
            raise HTTPException(status_code=404, detail="Repository not found")

        return repo_info

    except Exception as e:
        logger.error(f"Error getting GitHub repository info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/github/repository/{repo_url:path}/branches")
async def get_github_branches(repo_url: str):
    """Get GitHub repository branches."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        branches = github_service.get_branches(repo_url)
        return {"branches": branches}

    except Exception as e:
        logger.error(f"Error getting GitHub branches: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/github/repository/{repo_url:path}/commits")
async def get_github_commits(repo_url: str, branch: str = "main", limit: int = 10):
    """Get GitHub repository commits."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        commits = github_service.get_commits(repo_url, branch, limit)
        return {"commits": commits}

    except Exception as e:
        logger.error(f"Error getting GitHub commits: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/github/repository/{repo_url:path}/pulls")
async def get_github_pull_requests(repo_url: str, state: str = "open"):
    """Get GitHub repository pull requests."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        prs = github_service.get_pull_requests(repo_url, state)
        return {"pull_requests": prs}

    except Exception as e:
        logger.error(f"Error getting GitHub pull requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/github/repository/{repo_url:path}/deployments")
async def get_github_deployments(repo_url: str, environment: str = None):
    """Get GitHub repository deployments."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        deployments = github_service.get_deployments(repo_url, environment)
        return {"deployments": deployments}

    except Exception as e:
        logger.error(f"Error getting GitHub deployments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/github/repository/{repo_url:path}/clone")
async def clone_github_repository(repo_url: str, clone_data: Dict[str, Any]):
    """Clone GitHub repository to local directory."""
    try:
        github_service = get_github_service()

        target_path = clone_data.get("target_path")
        branch = clone_data.get("branch", "main")

        if not target_path:
            raise HTTPException(status_code=400, detail="Target path is required")

        target_dir = Path(target_path)
        success = github_service.clone_repository(repo_url, target_dir, branch)

        if success:
            return {"status": "success", "message": f"Repository cloned to {target_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to clone repository")

    except Exception as e:
        logger.error(f"Error cloning GitHub repository: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/git/pull")
async def pull_project_changes(project_name: str, pull_data: Dict[str, Any] = None):
    """Pull latest changes for a project repository."""
    try:
        project_info = get_mock_project_info(project_name)
        project_dir = Path(project_info["directory"])

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        github_service = get_github_service()
        branch = pull_data.get("branch", "main") if pull_data else "main"

        success = github_service.pull_repository(project_dir, branch)

        if success:
            return {"status": "success", "message": f"Changes pulled for {project_name}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to pull changes")

    except Exception as e:
        logger.error(f"Error pulling changes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}/git/status")
async def get_project_git_status(project_name: str):
    """Get Git status for a project."""
    try:
        project_info = get_mock_project_info(project_name)
        project_dir = Path(project_info["directory"])

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        github_service = get_github_service()
        status = github_service.get_repository_status(project_dir)

        return status

    except Exception as e:
        logger.error(f"Error getting Git status for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/github/webhook/create")
async def create_github_webhook(webhook_data: Dict[str, Any]):
    """Create a GitHub webhook."""
    try:
        repo_url = webhook_data.get("repository_url")
        webhook_url = webhook_data.get("webhook_url")
        events = webhook_data.get("events", ["push", "pull_request"])

        if not repo_url or not webhook_url:
            raise HTTPException(status_code=400, detail="Repository URL and webhook URL are required")

        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        webhook = github_service.create_webhook(repo_url, webhook_url, events)

        if webhook:
            return {"status": "success", "webhook": webhook}
        else:
            raise HTTPException(status_code=500, detail="Failed to create webhook")

    except Exception as e:
        logger.error(f"Error creating GitHub webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/github/webhooks/{repo_url:path}")
async def get_github_webhooks(repo_url: str):
    """Get GitHub repository webhooks."""
    try:
        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        webhooks = github_service.get_webhooks(repo_url)
        return {"webhooks": webhooks}

    except Exception as e:
        logger.error(f"Error getting GitHub webhooks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/github/deployment/create")
async def create_github_deployment(deployment_data: Dict[str, Any]):
    """Create a GitHub deployment."""
    try:
        repo_url = deployment_data.get("repository_url")
        ref = deployment_data.get("ref")
        environment = deployment_data.get("environment")
        description = deployment_data.get("description", "")

        if not all([repo_url, ref, environment]):
            raise HTTPException(status_code=400, detail="Repository URL, ref, and environment are required")

        github_service = get_github_service()
        if not github_service.is_authenticated():
            raise HTTPException(status_code=401, detail="GitHub not authenticated")

        deployment = github_service.create_deployment(repo_url, ref, environment, description)

        if deployment:
            return {"status": "success", "deployment": deployment}
        else:
            raise HTTPException(status_code=500, detail="Failed to create deployment")

    except Exception as e:
        logger.error(f"Error creating GitHub deployment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/google-drive-integration")
async def update_google_drive_integration(project_name: str, drive_data: Dict[str, Any]):
    """Update Google Drive integration for a project."""
    try:
        # Implementation for Google Drive integration update
        drive_integration = GoogleDriveIntegration(
            backup_folder_id=drive_data.get("backup_folder_id"),
            backup_folder_url=drive_data.get("backup_folder_url"),
            auto_backup=drive_data.get("auto_backup", True),
            backup_schedule=drive_data.get("backup_schedule", "daily")
        )

        # Store integration
        integration_key = f"drive_integration_{project_name}"
        dashboard_cache[integration_key] = drive_integration

        return {"status": "success", "message": "Google Drive integration updated"}

    except Exception as e:
        logger.error(f"Error updating Google Drive integration for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/client-info")
async def update_client_info(project_name: str, client_data: Dict[str, Any]):
    """Update client information for a project."""
    try:
        client_info = ClientInfo(
            name=client_data.get("name", ""),
            email=client_data.get("email", ""),
            company=client_data.get("company"),
            phone=client_data.get("phone"),
            billing_status=client_data.get("billing_status", "active"),
            monthly_rate=client_data.get("monthly_rate", 0.0),
            contract_start=datetime.fromisoformat(client_data["contract_start"]).date() if client_data.get("contract_start") else None,
            contract_end=datetime.fromisoformat(client_data["contract_end"]).date() if client_data.get("contract_end") else None,
            notes=client_data.get("notes", "")
        )

        # Store client info
        client_key = f"client_info_{project_name}"
        dashboard_cache[client_key] = client_info

        return {"status": "success", "message": "Client information updated"}

    except Exception as e:
        logger.error(f"Error updating client info for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}/plugins")
async def get_project_plugins(project_name: str):
    """Get plugins for a project."""
    try:
        # Load real projects from LocalConfigManager
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Get plugin list from WordPress
        plugins = []
        try:
            cmd = ["ddev", "wp", "plugin", "list", "--format=json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=project_dir)
            if result.returncode == 0:
                plugin_data = json.loads(result.stdout)
                for plugin_info in plugin_data:
                    plugins.append({
                        "name": plugin_info.get("name", ""),
                        "status": plugin_info.get("status", ""),
                        "version": plugin_info.get("version", ""),
                        "update": plugin_info.get("update", "none")
                    })
        except Exception as e:
            logger.warning(f"Failed to get plugins for {project_name}: {e}")

        return {"plugins": plugins}

    except Exception as e:
        logger.error(f"Error getting plugins for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/plugins/{plugin_name}/update")
async def update_project_plugin(project_name: str, plugin_name: str):
    """Update a specific plugin."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Update the plugin
        cmd = ["ddev", "wp", "plugin", "update", plugin_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "wordpress_plugin_updated", {
                "plugin_name": plugin_name,
                "status": "updated",
                "message": f"Plugin {plugin_name} updated successfully"
            })
            return {"status": "success", "message": f"Plugin {plugin_name} updated successfully"}
        else:
            error_msg = f"Failed to update plugin {plugin_name}: {result.stderr}"
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "wordpress_plugin_updated", {
                "plugin_name": plugin_name,
                "status": "error",
                "message": error_msg
            })
            raise HTTPException(
                status_code=500,
                detail=error_msg,
                headers={"X-Error-Code": "PLUGIN_UPDATE_FAILED"}
            )

    except Exception as e:
        logger.error(f"Error updating plugin {plugin_name} for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/plugins/update-all")
async def update_all_plugins(project_name: str):
    """Update all plugins."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Update all plugins
        cmd = ["ddev", "wp", "plugin", "update", "--all"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "wordpress_plugins_updated", {
                "status": "updated",
                "message": "All plugins updated successfully"
            })
            return {"status": "success", "message": "All plugins updated successfully"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "wordpress_plugins_updated", {
                "status": "error",
                "message": f"Failed to update plugins: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to update plugins: {result.stderr}")

    except Exception as e:
        logger.error(f"Error updating all plugins for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}/themes")
async def get_project_themes(project_name: str):
    """Get themes for a project."""
    try:
        # Load real projects from LocalConfigManager
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Get theme list from WordPress
        themes = []
        try:
            cmd = ["ddev", "wp", "theme", "list", "--format=json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=project_dir)
            if result.returncode == 0:
                theme_data = json.loads(result.stdout)
                for theme_info in theme_data:
                    themes.append({
                        "name": theme_info.get("name", ""),
                        "status": theme_info.get("status", ""),
                        "version": theme_info.get("version", ""),
                        "update": theme_info.get("update", "none")
                    })
        except Exception as e:
            logger.warning(f"Failed to get themes for {project_name}: {e}")

        return {"themes": themes}

    except Exception as e:
        logger.error(f"Error getting themes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/themes/{theme_name}/update")
async def update_project_theme(project_name: str, theme_name: str):
    """Update a specific theme."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Update the theme
        cmd = ["ddev", "wp", "theme", "update", theme_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "wordpress_theme_updated", {
                "theme_name": theme_name,
                "status": "updated",
                "message": f"Theme {theme_name} updated successfully"
            })
            return {"status": "success", "message": f"Theme {theme_name} updated successfully"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "wordpress_theme_updated", {
                "theme_name": theme_name,
                "status": "error",
                "message": f"Failed to update theme {theme_name}: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to update theme: {result.stderr}")

    except Exception as e:
        logger.error(f"Error updating theme {theme_name} for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/themes/update-all")
async def update_all_themes(project_name: str):
    """Update all themes."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Update all themes
        cmd = ["ddev", "wp", "theme", "update", "--all"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "wordpress_themes_updated", {
                "status": "updated",
                "message": "All themes updated successfully"
            })
            return {"status": "success", "message": "All themes updated successfully"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "wordpress_themes_updated", {
                "status": "error",
                "message": f"Failed to update themes: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to update themes: {result.stderr}")

    except Exception as e:
        logger.error(f"Error updating all themes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/wordpress/core/update")
async def update_wordpress_core(project_name: str):
    """Update WordPress core."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Update WordPress core
        cmd = ["ddev", "wp", "core", "update"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)

        if result.returncode == 0:
            # Send WebSocket notification
            await notify_project_update(project_name, "wordpress_core_updated", {
                "status": "updated",
                "message": "WordPress core updated successfully"
            })
            return {"status": "success", "message": "WordPress core updated successfully"}
        else:
            # Send WebSocket notification for failure
            await notify_project_update(project_name, "wordpress_core_updated", {
                "status": "error",
                "message": f"Failed to update WordPress core: {result.stderr}"
            })
            raise HTTPException(status_code=500, detail=f"Failed to update WordPress core: {result.stderr}")

    except Exception as e:
        logger.error(f"Error updating WordPress core for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/backup")
async def create_project_backup(project_name: str, backup_options: Dict[str, Any] = None):
    """Create a backup for a project."""
    try:
        # Load real projects from LocalConfigManager
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Start backup process
        task_id = str(uuid.uuid4())
        backup_type = backup_options.get("type", "full") if backup_options else "full"

        dashboard_cache[task_id] = {
            "status": "running",
            "message": "Creating backup...",
            "started_at": datetime.now(),
            "project_name": project_name,
            "backup_type": backup_type
        }

        # Start background backup task
        asyncio.create_task(execute_backup_task(task_id, project_name, project_dir, backup_options))

        # Send WebSocket notification
        await notify_project_update(project_name, "backup_started", {
            "task_id": task_id,
            "backup_type": backup_type,
            "message": f"Backup process started ({backup_type})"
        })

        return {"status": "accepted", "task_id": task_id, "message": "Backup started"}

    except Exception as e:
        logger.error(f"Error starting backup for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/restore")
async def restore_project_backup(project_name: str, restore_options: Dict[str, Any]):
    """Restore a project from backup."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        # Validate restore options
        backup_path = restore_options.get("backup_path")
        if not backup_path:
            raise HTTPException(status_code=400, detail="backup_path is required")

        backup_dir = Path(backup_path)
        if not backup_dir.exists():
            raise HTTPException(status_code=404, detail="Backup not found")

        # Start restore process
        task_id = str(uuid.uuid4())
        restore_type = restore_options.get("type", "full")

        dashboard_cache[task_id] = {
            "status": "running",
            "message": "Starting restore process...",
            "started_at": datetime.now(),
            "project_name": project_name,
            "restore_type": restore_type,
            "backup_path": backup_path
        }

        # Start background restore task
        asyncio.create_task(execute_restore_task(task_id, project_name, project_dir, backup_dir, restore_options))

        # Send WebSocket notification
        await notify_project_update(project_name, "restore_started", {
            "task_id": task_id,
            "restore_type": restore_type,
            "backup_path": backup_path,
            "message": f"Restore process started ({restore_type})"
        })

        return {"task_id": task_id, "status": "started", "message": "Restore process started"}

    except Exception as e:
        logger.error(f"Error starting restore for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}/backups")
async def list_project_backups(project_name: str):
    """List available backups for a project."""
    try:
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = Path(project.directory)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        backup_dir = project_dir / "backups"
        if not backup_dir.exists():
            return {"backups": []}

        # List backup directories
        backups = []
        for backup_path in backup_dir.iterdir():
            if backup_path.is_dir():
                info_file = backup_path / "backup_info.json"
                if info_file.exists():
                    try:
                        with open(info_file, 'r') as f:
                            backup_info = json.load(f)
                        backups.append({
                            "path": str(backup_path),
                            "info": backup_info
                        })
                    except Exception as e:
                        logger.warning(f"Could not read backup info for {backup_path}: {e}")

        # Sort by timestamp (newest first)
        backups.sort(key=lambda x: x["info"]["timestamp"], reverse=True)

        return {"backups": backups}

    except Exception as e:
        logger.error(f"Error listing backups for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/bulk/backup")
async def bulk_create_backups(request: Dict[str, Any]):
    """Create backups for multiple projects."""
    try:
        project_names = request.get("projects", [])
        backup_options = request.get("backup_options", {})

        if not project_names:
            raise HTTPException(status_code=400, detail="No projects specified")

        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Validate projects
        valid_projects = []
        for project_name in project_names:
            project = next((p for p in projects if p.project_name == project_name), None)
            if project:
                valid_projects.append(project)

        if not valid_projects:
            raise HTTPException(status_code=404, detail="No valid projects found")

        # Start bulk backup process
        task_id = str(uuid.uuid4())
        dashboard_cache[task_id] = {
            "status": "running",
            "message": f"Starting bulk backup for {len(valid_projects)} projects...",
            "started_at": datetime.now(),
            "operation": "bulk_backup",
            "total_projects": len(valid_projects),
            "completed_projects": 0,
            "failed_projects": [],
            "results": {}
        }

        # Start background bulk backup task
        asyncio.create_task(execute_bulk_backup_task(task_id, valid_projects, backup_options))

        # Broadcast WebSocket notification
        await broadcast_dashboard_update("bulk_backup_started", {
            "task_id": task_id,
            "project_count": len(valid_projects),
            "message": f"Bulk backup started for {len(valid_projects)} projects"
        })

        return {"task_id": task_id, "status": "started", "message": "Bulk backup process started"}

    except Exception as e:
        logger.error(f"Error starting bulk backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/bulk/updates/plugins")
async def bulk_update_plugins(request: Dict[str, Any]):
    """Update plugins for multiple projects."""
    try:
        project_names = request.get("projects", [])
        plugin_names = request.get("plugins", [])  # Empty list means update all

        if not project_names:
            raise HTTPException(status_code=400, detail="No projects specified")

        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Validate projects
        valid_projects = []
        for project_name in project_names:
            project = next((p for p in projects if p.project_name == project_name), None)
            if project:
                valid_projects.append(project)

        if not valid_projects:
            raise HTTPException(status_code=404, detail="No valid projects found")

        # Start bulk plugin update process
        task_id = str(uuid.uuid4())
        dashboard_cache[task_id] = {
            "status": "running",
            "message": f"Starting bulk plugin update for {len(valid_projects)} projects...",
            "started_at": datetime.now(),
            "operation": "bulk_plugin_update",
            "total_projects": len(valid_projects),
            "completed_projects": 0,
            "failed_projects": [],
            "results": {},
            "plugin_names": plugin_names
        }

        # Start background bulk plugin update task
        asyncio.create_task(execute_bulk_plugin_update_task(task_id, valid_projects, plugin_names))

        # Broadcast WebSocket notification
        await broadcast_dashboard_update("bulk_plugin_update_started", {
            "task_id": task_id,
            "project_count": len(valid_projects),
            "plugin_count": len(plugin_names) if plugin_names else "all",
            "message": f"Bulk plugin update started for {len(valid_projects)} projects"
        })

        return {"task_id": task_id, "status": "started", "message": "Bulk plugin update process started"}

    except Exception as e:
        logger.error(f"Error starting bulk plugin update: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/bulk/ddev/start")
async def bulk_start_ddev(request: Dict[str, Any]):
    """Start DDEV for multiple projects."""
    try:
        project_names = request.get("projects", [])

        if not project_names:
            raise HTTPException(status_code=400, detail="No projects specified")

        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Validate projects
        valid_projects = []
        for project_name in project_names:
            project = next((p for p in projects if p.project_name == project_name), None)
            if project:
                valid_projects.append(project)

        if not valid_projects:
            raise HTTPException(status_code=404, detail="No valid projects found")

        # Start bulk DDEV start process
        task_id = str(uuid.uuid4())
        dashboard_cache[task_id] = {
            "status": "running",
            "message": f"Starting DDEV for {len(valid_projects)} projects...",
            "started_at": datetime.now(),
            "operation": "bulk_ddev_start",
            "total_projects": len(valid_projects),
            "completed_projects": 0,
            "failed_projects": [],
            "results": {}
        }

        # Start background bulk DDEV start task
        asyncio.create_task(execute_bulk_ddev_task(task_id, valid_projects, "start"))

        # Broadcast WebSocket notification
        await broadcast_dashboard_update("bulk_ddev_start_started", {
            "task_id": task_id,
            "project_count": len(valid_projects),
            "message": f"Bulk DDEV start started for {len(valid_projects)} projects"
        })

        return {"task_id": task_id, "status": "started", "message": "Bulk DDEV start process started"}

    except Exception as e:
        logger.error(f"Error starting bulk DDEV start: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/clients")
async def create_client(client_data: Dict[str, Any]):
    """Create a new client."""
    try:
        # Validate required fields
        required_fields = ["name", "email"]
        for field in required_fields:
            if field not in client_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        # Generate client ID
        client_id = str(uuid.uuid4())

        # Create client data structure
        client = {
            "id": client_id,
            "name": client_data["name"],
            "email": client_data["email"],
            "phone": client_data.get("phone", ""),
            "company": client_data.get("company", ""),
            "address": client_data.get("address", ""),
            "website": client_data.get("website", ""),
            "notes": client_data.get("notes", ""),
            "billing_info": {
                "rate": client_data.get("rate", 0),
                "billing_cycle": client_data.get("billing_cycle", "monthly"),
                "currency": client_data.get("currency", "USD"),
                "payment_method": client_data.get("payment_method", ""),
                "invoice_email": client_data.get("invoice_email", "")
            },
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "active": True
        }

        # Store client in cache (in production, use a proper database)
        clients_cache = dashboard_cache.get("clients", {})
        clients_cache[client_id] = client
        dashboard_cache["clients"] = clients_cache

        # Send WebSocket notification
        await broadcast_dashboard_update("client_created", {
            "client_id": client_id,
            "client": client,
            "message": f"Client {client['name']} created successfully"
        })

        return {"client": client}

    except Exception as e:
        logger.error(f"Error creating client: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_data: Dict[str, Any]):
    """Update an existing client."""
    try:
        clients_cache = dashboard_cache.get("clients", {})

        if client_id not in clients_cache:
            raise HTTPException(status_code=404, detail="Client not found")

        client = clients_cache[client_id]

        # Update client fields
        updateable_fields = ["name", "email", "phone", "company", "address", "website", "notes"]
        for field in updateable_fields:
            if field in client_data:
                client[field] = client_data[field]

        # Update billing info if provided
        if "billing_info" in client_data:
            client["billing_info"].update(client_data["billing_info"])

        client["updated_at"] = datetime.utcnow().isoformat()

        clients_cache[client_id] = client
        dashboard_cache["clients"] = clients_cache

        # Send WebSocket notification
        await broadcast_dashboard_update("client_updated", {
            "client_id": client_id,
            "client": client,
            "message": f"Client {client['name']} updated successfully"
        })

        return {"client": client}

    except Exception as e:
        logger.error(f"Error updating client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    """Delete a client."""
    try:
        clients_cache = dashboard_cache.get("clients", {})

        if client_id not in clients_cache:
            raise HTTPException(status_code=404, detail="Client not found")

        client_name = clients_cache[client_id]["name"]

        # Check if client has associated projects
        projects = LocalConfigManager().load_projects()
        client_projects = [p for p in projects if p.client_id == client_id]

        if client_projects:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete client. {len(client_projects)} project(s) are associated with this client."
            )

        # Remove client from cache
        del clients_cache[client_id]
        dashboard_cache["clients"] = clients_cache

        # Send WebSocket notification
        await broadcast_dashboard_update("client_deleted", {
            "client_id": client_id,
            "client_name": client_name,
            "message": f"Client {client_name} deleted successfully"
        })

        return {"message": "Client deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/assign-client")
async def assign_client_to_project(project_name: str, assignment_data: Dict[str, Any]):
    """Assign a client to a project."""
    try:
        client_id = assignment_data.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Client ID is required")

        # Get projects
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Check if client exists
        clients_cache = dashboard_cache.get("clients", {})
        if client_id not in clients_cache:
            raise HTTPException(status_code=404, detail="Client not found")

        # Update project with client assignment
        project.client_id = client_id
        local_config_manager.save_projects(projects)

        # Send WebSocket notification
        client_name = clients_cache[client_id]["name"]
        await notify_project_update(project_name, "client_assigned", {
            "client_id": client_id,
            "client_name": client_name,
            "message": f"Client {client_name} assigned to project"
        })

        return {"message": f"Client {client_name} assigned to project {project_name}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning client to project {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.delete("/projects/{project_name}/unassign-client")
async def unassign_client_from_project(project_name: str):
    """Remove client assignment from a project."""
    try:
        # Get projects
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Find the project
        project = None
        for p in projects:
            if p.project_name == project_name:
                project = p
                break

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        client_name = "Unknown"
        if project.client_id:
            clients_cache = dashboard_cache.get("clients", {})
            if project.client_id in clients_cache:
                client_name = clients_cache[project.client_id]["name"]

        # Remove client assignment
        project.client_id = None
        local_config_manager.save_projects(projects)

        # Send WebSocket notification
        await notify_project_update(project_name, "client_unassigned", {
            "message": f"Client {client_name} unassigned from project"
        })

        return {"message": f"Client unassigned from project {project_name}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unassigning client from project {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/clients")
async def get_all_clients():
    """Get all clients across projects."""
    try:
        # Get clients from cache
        clients_cache = dashboard_cache.get("clients", {})
        clients_list = []

        # Get projects to count associated projects
        projects = LocalConfigManager().load_projects()

        for client_id, client in clients_cache.items():
            # Count projects associated with this client
            client_projects = [p for p in projects if p.client_id == client_id]

            client_data = {
                "id": client_id,
                "name": client["name"],
                "email": client["email"],
                "phone": client.get("phone", ""),
                "company": client.get("company", ""),
                "website": client.get("website", ""),
                "billing_info": client.get("billing_info", {}),
                "projects": [{"project_name": p.project_name} for p in client_projects],
                "project_count": len(client_projects),
                "created_at": client["created_at"],
                "updated_at": client["updated_at"],
                "active": client.get("active", True),
                "notes": client.get("notes", "")
            }

            clients_list.append(client_data)

        # Sort by creation date (newest first)
        clients_list.sort(key=lambda x: x["created_at"], reverse=True)

        return {"clients": clients_list}

    except Exception as e:
        logger.error(f"Error getting clients: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Google Drive Integration endpoints
@dashboard_router.get("/google-drive/auth/status")
async def get_google_drive_auth_status():
    """Get Google Drive authentication status."""
    try:
        drive_service = get_google_drive_service()
        return {
            "authenticated": drive_service.is_authenticated(),
            "service_available": GOOGLE_DRIVE_AVAILABLE
        }
    except Exception as e:
        logger.error(f"Error checking Google Drive auth status: {e}")
        return {"authenticated": False, "service_available": False, "error": str(e)}

@dashboard_router.post("/google-drive/auth")
async def authenticate_google_drive():
    """Initiate Google Drive authentication."""
    try:
        drive_service = get_google_drive_service()
        if drive_service.is_authenticated():
            return {"status": "success", "message": "Already authenticated"}

        # For web flow, return the auth URL
        if not drive_service.credentials_path or not os.path.exists(drive_service.credentials_path):
            return {
                "status": "error",
                "message": "Google Drive credentials file not found",
                "instructions": "Please download credentials from Google Cloud Console and save as credentials.json"
            }

        # Start auth flow
        success = drive_service._authenticate()
        if success:
            return {"status": "success", "message": "Authentication successful"}
        else:
            return {"status": "error", "message": "Authentication failed"}

    except Exception as e:
        logger.error(f"Error authenticating Google Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/google-drive/folder")
async def create_drive_folder(folder_data: Dict[str, Any]):
    """Create a folder in Google Drive."""
    try:
        folder_name = folder_data.get("folder_name")
        parent_folder_id = folder_data.get("parent_folder_id")

        if not folder_name:
            raise HTTPException(status_code=400, detail="Folder name is required")

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        folder = drive_service.create_folder(folder_name, parent_folder_id)
        if folder:
            return {"status": "success", "folder": folder}
        else:
            raise HTTPException(status_code=500, detail="Failed to create folder")

    except Exception as e:
        logger.error(f"Error creating Google Drive folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/google-drive/folder/{folder_id}/files")
async def list_drive_files(folder_id: str = None, file_types: List[str] = None):
    """List files in a Google Drive folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        files = drive_service.list_files(folder_id, file_types)
        return {"files": files, "total": len(files)}

    except Exception as e:
        logger.error(f"Error listing Google Drive files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/google-drive/upload")
async def upload_to_drive(upload_data: Dict[str, Any]):
    """Upload a file to Google Drive."""
    try:
        file_path = upload_data.get("file_path")
        folder_id = upload_data.get("folder_id")

        if not file_path:
            raise HTTPException(status_code=400, detail="File path is required")

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        path = Path(file_path)
        result = drive_service.upload_file(path, folder_id)
        if result:
            return {"status": "success", "file": result}
        else:
            raise HTTPException(status_code=500, detail="Failed to upload file")

    except Exception as e:
        logger.error(f"Error uploading to Google Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/google-drive/download/{file_id}")
async def download_from_drive(file_id: str, download_data: Dict[str, Any]):
    """Download a file from Google Drive."""
    try:
        output_path = download_data.get("output_path")

        if not output_path:
            raise HTTPException(status_code=400, detail="Output path is required")

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        path = Path(output_path)
        success = drive_service.download_file(file_id, path)
        if success:
            return {"status": "success", "message": f"File downloaded to {output_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to download file")

    except Exception as e:
        logger.error(f"Error downloading from Google Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/google-drive/storage")
async def get_drive_storage_usage():
    """Get Google Drive storage usage information."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        usage = drive_service.get_storage_usage()
        return {"storage_usage": usage}

    except Exception as e:
        logger.error(f"Error getting Google Drive storage usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/google-drive/setup")
async def setup_project_google_drive(project_name: str, setup_data: Dict[str, Any]):
    """Set up Google Drive integration for a project."""
    try:
        project_info = get_mock_project_info(project_name)

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        # Create backup structure
        integration = drive_service.create_project_backup_structure(project_name)
        if integration:
            # Store integration
            drive_key = f"drive_integration_{project_name}"
            dashboard_cache[drive_key] = integration

            return {"status": "success", "integration": integration.to_dict()}
        else:
            raise HTTPException(status_code=500, detail="Failed to create backup structure")

    except Exception as e:
        logger.error(f"Error setting up Google Drive for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/google-drive/backup")
async def backup_project_to_drive(project_name: str, backup_options: Dict[str, Any] = None):
    """Backup project files to Google Drive."""
    try:
        project_info = get_mock_project_info(project_name)
        project_dir = Path(project_info["directory"])

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project directory not found")

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        # Get backup folder from integration
        drive_key = f"drive_integration_{project_name}"
        if drive_key not in dashboard_cache:
            raise HTTPException(status_code=400, detail="Google Drive integration not set up")

        integration = dashboard_cache[drive_key]
        backup_folder_id = integration.backup_folder_id

        # Start backup task
        task_id = str(uuid.uuid4())
        dashboard_cache[task_id] = {
            "status": "running",
            "message": "Uploading backup to Google Drive...",
            "started_at": datetime.now(),
            "project_name": project_name,
            "backup_type": "google_drive"
        }

        # Start background backup task
        asyncio.create_task(execute_drive_backup_task(task_id, project_name, project_dir, backup_folder_id, drive_service))

        return {"status": "accepted", "task_id": task_id, "message": "Google Drive backup started"}

    except Exception as e:
        logger.error(f"Error starting Google Drive backup for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/projects/{project_name}/google-drive/backups")
async def get_project_drive_backups(project_name: str, limit: int = 10):
    """Get backup history from Google Drive."""
    try:
        # Get backup folder from integration
        drive_key = f"drive_integration_{project_name}"
        if drive_key not in dashboard_cache:
            raise HTTPException(status_code=400, detail="Google Drive integration not set up")

        integration = dashboard_cache[drive_key]
        backup_folder_id = integration.backup_folder_id

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        backups = drive_service.get_backup_history(backup_folder_id, limit)
        return {"backups": backups, "total": len(backups)}

    except Exception as e:
        logger.error(f"Error getting Google Drive backups for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.post("/projects/{project_name}/google-drive/cleanup")
async def cleanup_drive_backups(project_name: str, cleanup_data: Dict[str, Any]):
    """Clean up old backups in Google Drive."""
    try:
        # Get backup folder from integration
        drive_key = f"drive_integration_{project_name}"
        if drive_key not in dashboard_cache:
            raise HTTPException(status_code=400, detail="Google Drive integration not set up")

        integration = dashboard_cache[drive_key]
        backup_folder_id = integration.backup_folder_id

        drive_service = get_google_drive_service()
        if not drive_service.is_authenticated():
            raise HTTPException(status_code=401, detail="Google Drive not authenticated")

        retention_days = cleanup_data.get("retention_days", 30)
        deleted_count = drive_service.cleanup_old_backups(backup_folder_id, retention_days)

        return {"status": "success", "deleted_count": deleted_count, "retention_days": retention_days}

    except Exception as e:
        logger.error(f"Error cleaning up Google Drive backups for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_router.get("/health")
async def dashboard_health():
    """Dashboard health check endpoint."""
    return {
        "status": "healthy",
        "service": "bedrock-forge-dashboard",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

def create_dashboard_project_from_existing(project_info, project_dir: Path) -> DashboardProject:
    """Create a DashboardProject from existing project information."""
    # Create environments
    environments = {}

    # Local environment (DDEV)
    local_env = Environment(
        type=EnvironmentType.LOCAL,
        url=project_info.wp_home,
        ddev_status="unknown",
        last_updated=datetime.now()
    )
    environments[EnvironmentType.LOCAL] = local_env

    # Try to get additional environment information from cache or config
    # This would be enhanced to detect staging/production URLs

    # Create dashboard project
    dashboard_project = DashboardProject(
        project_name=project_info.project_name,
        directory=str(project_dir),
        environments=environments,
        github=None,  # Will be loaded from cache/database
        google_drive=None,  # Will be loaded from cache/database
        server=None,  # Will be loaded from cache/database
        ssl_certificate=None,  # Will be loaded from cache/database
        client=None,  # Will be loaded from cache/database
    )

    # Load additional data from cache
    github_key = f"github_integration_{project_info.project_name}"
    if github_key in dashboard_cache:
        dashboard_project.github = dashboard_cache[github_key]

    drive_key = f"drive_integration_{project_info.project_name}"
    if drive_key in dashboard_cache:
        dashboard_project.google_drive = dashboard_cache[drive_key]

    client_key = f"client_info_{project_info.project_name}"
    if client_key in dashboard_cache:
        dashboard_project.client = dashboard_cache[client_key]

    # Get project status information
    try:
        # DDEV status
        ddev_cmd = f"cd {project_dir} && ddev status -j"
        result = subprocess.run(ddev_cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            ddev_data = json.loads(result.stdout)
            local_env.ddev_status = ddev_data.get("status", "unknown")

        # WordPress version
        wp_cmd = f"cd {project_dir} && ddev wp core version"
        result = subprocess.run(wp_cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            local_env.wordpress_version = result.stdout.strip()

        # Plugins (basic info)
        plugin_cmd = f"cd {project_dir} && ddev wp plugin list --format=json"
        result = subprocess.run(plugin_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            plugin_data = json.loads(result.stdout)
            for plugin_info in plugin_data:
                plugin = PluginInfo(
                    name=plugin_info.get("name", ""),
                    version=plugin_info.get("version", "1.0.0"),
                    status=plugin_info.get("status", "inactive")
                )
                dashboard_project.plugins.append(plugin)

        # Themes (basic info)
        theme_cmd = f"cd {project_dir} && ddev wp theme list --format=json"
        result = subprocess.run(theme_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            theme_data = json.loads(result.stdout)
            for theme_info in theme_data:
                theme = ThemeInfo(
                    name=theme_info.get("name", ""),
                    version=theme_info.get("version", "1.0.0"),
                    status=theme_info.get("status", "inactive")
                )
                dashboard_project.themes.append(theme)

    except Exception as e:
        logger.warning(f"Failed to get detailed project info for {project_info.project_name}: {e}")

    # Calculate health score (basic algorithm)
    health_score = 100.0

    if local_env.ddev_status != "running":
        health_score -= 20

    if not local_env.wordpress_version:
        health_score -= 10

    if not dashboard_project.plugins:
        health_score -= 5

    dashboard_project.health_score = max(0.0, health_score)

    return dashboard_project

async def execute_backup_task(task_id: str, project_name: str, project_dir: Path, backup_options: Dict[str, Any] = None):
    """Execute backup task in background."""
    try:
        dashboard_cache[task_id]["message"] = "Creating backup..."

        # Build backup command using DDEV and WordPress tools
        backup_type = backup_options.get("type", "full") if backup_options else "full"
        include_db = backup_options.get("database", True) if backup_options else True
        include_files = backup_options.get("files", True) if backup_options else True

        # Create backup directory with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = project_dir / "backups" / timestamp
        backup_dir.mkdir(parents=True, exist_ok=True)

        backup_commands = []

        # Database backup
        if include_db:
            dashboard_cache[task_id]["message"] = "Backing up database..."
            db_cmd = ["ddev", "wp", "db", "export", f"{backup_dir}/database.sql"]
            backup_commands.append(("database", db_cmd))

        # Files backup
        if include_files:
            dashboard_cache[task_id]["message"] = "Backing up files..."
            # Backup WordPress content (wp-content)
            wp_content_src = project_dir / "wp" / "content"
            wp_content_dst = backup_dir / "wp-content"
            if wp_content_src.exists():
                import shutil
                shutil.copytree(wp_content_src, wp_content_dst, dirs_exist_ok=True)

        # Execute database backup commands
        for backup_type_name, cmd in backup_commands:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)
            if result.returncode != 0:
                raise Exception(f"{backup_type_name} backup failed: {result.stderr}")

        # Create backup info file
        backup_info = {
            "timestamp": timestamp,
            "type": backup_type,
            "database": include_db,
            "files": include_files,
            "size": sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file())
        }

        with open(backup_dir / "backup_info.json", 'w') as f:
            json.dump(backup_info, f, indent=2)

        dashboard_cache[task_id].update({
            "status": "completed",
            "message": "Backup completed successfully",
            "completed_at": datetime.now(),
            "output": f"Backup created at {backup_dir}",
            "backup_size": backup_info["size"],
            "backup_path": str(backup_dir)
        })

        # Send WebSocket notification
        await notify_project_update(project_name, "backup_completed", {
            "task_id": task_id,
            "backup_type": backup_type,
            "backup_size": backup_info["size"],
            "backup_path": str(backup_dir),
            "message": "Backup completed successfully"
        })

    except subprocess.TimeoutExpired:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": "Backup timed out",
            "completed_at": datetime.now(),
            "error": "Backup timed out after 10 minutes"
        })

        # Send WebSocket notification for failure
        await notify_project_update(project_name, "backup_failed", {
            "task_id": task_id,
            "message": "Backup timed out"
        })

    except Exception as e:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Backup failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Backup task {task_id} failed: {e}")

        # Send WebSocket notification for failure
        await notify_project_update(project_name, "backup_failed", {
            "task_id": task_id,
            "message": f"Backup failed: {str(e)}"
        })

async def execute_restore_task(task_id: str, project_name: str, project_dir: Path, backup_dir: Path, restore_options: Dict[str, Any]):
    """Execute restore task in background."""
    try:
        dashboard_cache[task_id]["message"] = "Reading backup information..."

        # Read backup info
        info_file = backup_dir / "backup_info.json"
        if not info_file.exists():
            raise Exception("Backup info file not found")

        with open(info_file, 'r') as f:
            backup_info = json.load(f)

        restore_type = restore_options.get("type", "full")
        include_db = restore_options.get("database", True) and backup_info.get("database", True)
        include_files = restore_options.get("files", True) and backup_info.get("files", True)

        # Database restore
        if include_db:
            db_file = backup_dir / "database.sql"
            if db_file.exists():
                dashboard_cache[task_id]["message"] = "Restoring database..."
                cmd = ["ddev", "wp", "db", "import", str(db_file)]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)
                if result.returncode != 0:
                    raise Exception(f"Database restore failed: {result.stderr}")

        # Files restore
        if include_files:
            wp_content_src = backup_dir / "wp-content"
            wp_content_dst = project_dir / "wp" / "content"
            if wp_content_src.exists() and wp_content_dst.exists():
                dashboard_cache[task_id]["message"] = "Restoring files..."
                import shutil
                # Remove existing wp-content and copy from backup
                shutil.rmtree(wp_content_dst)
                shutil.copytree(wp_content_src, wp_content_dst)

        dashboard_cache[task_id].update({
            "status": "completed",
            "message": "Restore completed successfully",
            "completed_at": datetime.now(),
            "output": f"Project restored from backup {backup_dir}",
            "backup_info": backup_info
        })

        # Send WebSocket notification
        await notify_project_update(project_name, "restore_completed", {
            "task_id": task_id,
            "restore_type": restore_type,
            "backup_info": backup_info,
            "message": "Restore completed successfully"
        })

    except subprocess.TimeoutExpired:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": "Restore timed out",
            "completed_at": datetime.now(),
            "error": "Restore timed out after 10 minutes"
        })

        # Send WebSocket notification for failure
        await notify_project_update(project_name, "restore_failed", {
            "task_id": task_id,
            "message": "Restore timed out"
        })

    except Exception as e:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Restore failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Restore task {task_id} failed: {e}")

        # Send WebSocket notification for failure
        await notify_project_update(project_name, "restore_failed", {
            "task_id": task_id,
            "message": f"Restore failed: {str(e)}"
        })

async def execute_drive_backup_task(task_id: str, project_name: str, project_dir: Path, backup_folder_id: str, drive_service):
    """Execute Google Drive backup task in background."""
    try:
        dashboard_cache[task_id]["message"] = "Uploading files to Google Drive..."

        # Backup files to Google Drive
        uploaded_files = drive_service.backup_project_files(project_dir, backup_folder_id)

        if uploaded_files:
            # Calculate total size
            total_size = sum(f.get('size', 0) for f in uploaded_files)

            dashboard_cache[task_id].update({
                "status": "completed",
                "message": f"Successfully uploaded {len(uploaded_files)} files to Google Drive",
                "completed_at": datetime.now(),
                "files_uploaded": len(uploaded_files),
                "total_size": total_size,
                "backup_url": f"https://drive.google.com/drive/folders/{backup_folder_id}"
            })

            # Update project's last backup time
            drive_key = f"drive_integration_{project_name}"
            if drive_key in dashboard_cache:
                dashboard_cache[drive_key].last_backup = datetime.now()

        else:
            raise Exception("No files were uploaded to Google Drive")

    except Exception as e:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Google Drive backup failed: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })
        logger.error(f"Google Drive backup task {task_id} failed: {e}")

async def execute_background_command(task_id: str, command: str):
    """Execute a command in the background and update task status."""
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            dashboard_cache[task_id].update({
                "status": "completed",
                "message": "Command completed successfully",
                "completed_at": datetime.now(),
                "output": result.stdout
            })
        else:
            dashboard_cache[task_id].update({
                "status": "failed",
                "message": f"Command failed: {result.stderr}",
                "completed_at": datetime.now(),
                "error": result.stderr
            })
    except subprocess.TimeoutExpired:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": "Command timed out",
            "completed_at": datetime.now(),
            "error": "Command execution timed out after 300 seconds"
        })
    except Exception as e:
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Unexpected error: {str(e)}",
            "completed_at": datetime.now(),
            "error": str(e)
        })


# WebSocket Routes
@dashboard_router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "subscribe_project":
                project_name = message.get("project_name")
                if project_name:
                    manager.subscribe_to_project(client_id, project_name)
                    await manager.send_personal_message({
                        "type": "subscription_confirmed",
                        "project_name": project_name,
                        "status": "subscribed"
                    }, client_id)

            elif message.get("type") == "unsubscribe_project":
                project_name = message.get("project_name")
                if project_name:
                    manager.unsubscribe_from_project(client_id, project_name)
                    await manager.send_personal_message({
                        "type": "unsubscription_confirmed",
                        "project_name": project_name,
                        "status": "unsubscribed"
                    }, client_id)

            elif message.get("type") == "ping":
                await manager.send_personal_message({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat()
                }, client_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"WebSocket client {client_id} disconnected")


# Helper function to send project updates
async def notify_project_update(project_name: str, update_type: str, data: dict):
    """Send project update to all subscribed clients."""
    await manager.send_project_update(project_name, {
        "type": update_type,
        "data": data
    })


# Helper function to broadcast general updates
async def broadcast_dashboard_update(update_type: str, data: dict):
    """Broadcast dashboard update to all connected clients."""
    await manager.broadcast({
        "type": update_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    })

# Bulk operation execution functions
async def execute_bulk_backup_task(task_id: str, projects: List, backup_options: Dict[str, Any]):
    """Execute bulk backup task."""
    try:
        results = {}
        completed = 0
        failed = []

        for project in projects:
            try:
                dashboard_cache[task_id]["message"] = f"Backing up {project.project_name}..."

                # Create backup for this project
                backup_task_id = str(uuid.uuid4())
                project_dir = Path(project.directory)

                # Execute backup directly (reuse backup logic)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_dir = project_dir / "backups" / timestamp
                backup_dir.mkdir(parents=True, exist_ok=True)

                # Database backup
                include_db = backup_options.get("database", True)
                if include_db:
                    db_cmd = ["ddev", "wp", "db", "export", f"{backup_dir}/database.sql"]
                    result = subprocess.run(db_cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)
                    if result.returncode != 0:
                        raise Exception(f"Database backup failed: {result.stderr}")

                # Files backup
                include_files = backup_options.get("files", True)
                if include_files:
                    wp_content_src = project_dir / "wp" / "content"
                    wp_content_dst = backup_dir / "wp-content"
                    if wp_content_src.exists():
                        import shutil
                        shutil.copytree(wp_content_src, wp_content_dst, dirs_exist_ok=True)

                # Create backup info
                backup_info = {
                    "timestamp": timestamp,
                    "type": backup_options.get("type", "full"),
                    "database": include_db,
                    "files": include_files,
                    "size": sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file())
                }

                with open(backup_dir / "backup_info.json", 'w') as f:
                    json.dump(backup_info, f, indent=2)

                results[project.project_name] = {
                    "status": "success",
                    "backup_path": str(backup_dir),
                    "size": backup_info["size"]
                }
                completed += 1

                # Send project-specific update
                await notify_project_update(project.project_name, "backup_completed", {
                    "bulk_task_id": task_id,
                    "backup_path": str(backup_dir),
                    "message": f"Backup completed for {project.project_name}"
                })

            except Exception as e:
                logger.error(f"Backup failed for {project.project_name}: {e}")
                results[project.project_name] = {
                    "status": "failed",
                    "error": str(e)
                }
                failed.append(project.project_name)

                # Send project-specific failure update
                await notify_project_update(project.project_name, "backup_failed", {
                    "bulk_task_id": task_id,
                    "error": str(e),
                    "message": f"Backup failed for {project.project_name}"
                })

            # Update progress
            dashboard_cache[task_id]["completed_projects"] = completed
            dashboard_cache[task_id]["failed_projects"] = failed
            dashboard_cache[task_id]["results"] = results

        # Final update
        dashboard_cache[task_id].update({
            "status": "completed" if not failed else "partial_success",
            "message": f"Bulk backup completed: {completed} successful, {len(failed)} failed",
            "completed_at": datetime.now()
        })

        # Broadcast final update
        await broadcast_dashboard_update("bulk_backup_completed", {
            "task_id": task_id,
            "completed": completed,
            "failed": len(failed),
            "results": results,
            "message": f"Bulk backup completed: {completed} successful, {len(failed)} failed"
        })

    except Exception as e:
        logger.error(f"Bulk backup task {task_id} failed: {e}")
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Bulk backup failed: {str(e)}",
            "completed_at": datetime.now()
        })

async def execute_bulk_plugin_update_task(task_id: str, projects: List, plugin_names: List[str]):
    """Execute bulk plugin update task."""
    try:
        results = {}
        completed = 0
        failed = []

        for project in projects:
            try:
                dashboard_cache[task_id]["message"] = f"Updating plugins for {project.project_name}..."

                project_dir = Path(project.directory)

                # Update plugins
                if plugin_names:
                    # Update specific plugins
                    for plugin_name in plugin_names:
                        cmd = ["ddev", "wp", "plugin", "update", plugin_name]
                        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=project_dir)
                        if result.returncode != 0:
                            raise Exception(f"Plugin {plugin_name} update failed: {result.stderr}")
                else:
                    # Update all plugins
                    cmd = ["ddev", "wp", "plugin", "update", "--all"]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=project_dir)
                    if result.returncode != 0:
                        raise Exception(f"Plugin update failed: {result.stderr}")

                results[project.project_name] = {
                    "status": "success",
                    "updated_plugins": plugin_names if plugin_names else "all"
                }
                completed += 1

                # Send project-specific update
                await notify_project_update(project.project_name, "wordpress_plugins_updated", {
                    "bulk_task_id": task_id,
                    "updated_plugins": plugin_names if plugin_names else "all",
                    "message": f"Plugins updated for {project.project_name}"
                })

            except Exception as e:
                logger.error(f"Plugin update failed for {project.project_name}: {e}")
                results[project.project_name] = {
                    "status": "failed",
                    "error": str(e)
                }
                failed.append(project.project_name)

            # Update progress
            dashboard_cache[task_id]["completed_projects"] = completed
            dashboard_cache[task_id]["failed_projects"] = failed
            dashboard_cache[task_id]["results"] = results

        # Final update
        dashboard_cache[task_id].update({
            "status": "completed" if not failed else "partial_success",
            "message": f"Bulk plugin update completed: {completed} successful, {len(failed)} failed",
            "completed_at": datetime.now()
        })

        # Broadcast final update
        await broadcast_dashboard_update("bulk_plugin_update_completed", {
            "task_id": task_id,
            "completed": completed,
            "failed": len(failed),
            "results": results,
            "message": f"Bulk plugin update completed: {completed} successful, {len(failed)} failed"
        })

    except Exception as e:
        logger.error(f"Bulk plugin update task {task_id} failed: {e}")
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Bulk plugin update failed: {str(e)}",
            "completed_at": datetime.now()
        })

async def execute_bulk_ddev_task(task_id: str, projects: List, action: str):
    """Execute bulk DDEV operation task."""
    try:
        results = {}
        completed = 0
        failed = []

        for project in projects:
            try:
                dashboard_cache[task_id]["message"] = f"DDEV {action} for {project.project_name}..."

                project_dir = Path(project.directory)

                # Execute DDEV command
                cmd = ["ddev", action]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=project_dir)

                if result.returncode == 0:
                    status = "running" if action == "start" else "stopped"
                    results[project.project_name] = {
                        "status": "success",
                        "ddev_status": status
                    }
                    completed += 1

                    # Send project-specific update
                    await notify_project_update(project.project_name, "ddev_status_changed", {
                        "bulk_task_id": task_id,
                        "status": status,
                        "message": f"DDEV {action} completed for {project.project_name}"
                    })
                else:
                    raise Exception(f"DDEV {action} failed: {result.stderr}")

            except Exception as e:
                logger.error(f"DDEV {action} failed for {project.project_name}: {e}")
                results[project.project_name] = {
                    "status": "failed",
                    "error": str(e)
                }
                failed.append(project.project_name)

            # Update progress
            dashboard_cache[task_id]["completed_projects"] = completed
            dashboard_cache[task_id]["failed_projects"] = failed
            dashboard_cache[task_id]["results"] = results

        # Final update
        dashboard_cache[task_id].update({
            "status": "completed" if not failed else "partial_success",
            "message": f"Bulk DDEV {action} completed: {completed} successful, {len(failed)} failed",
            "completed_at": datetime.now()
        })

        # Broadcast final update
        await broadcast_dashboard_update(f"bulk_ddev_{action}_completed", {
            "task_id": task_id,
            "completed": completed,
            "failed": len(failed),
            "results": results,
            "message": f"Bulk DDEV {action} completed: {completed} successful, {len(failed)} failed"
        })

    except Exception as e:
        logger.error(f"Bulk DDEV {action} task {task_id} failed: {e}")
        dashboard_cache[task_id].update({
            "status": "failed",
            "message": f"Bulk DDEV {action} failed: {str(e)}",
            "completed_at": datetime.now()
        })