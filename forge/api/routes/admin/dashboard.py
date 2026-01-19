"""
Dashboard API routes.

This module contains dashboard statistics, configuration, health,
and debug endpoints.
"""
from fastapi import APIRouter, HTTPException
from pathlib import Path
from typing import Dict, Any, List

from ....utils.logging import logger
from ....utils.config_manager import ConfigManager
from ....utils.local_config import LocalConfigManager
from ...dashboard_config import (
    get_dashboard_config, update_dashboard_config, get_config_manager,
    DashboardConfig as DashboardConfigModel, UserPreferences
)
from ...schemas import (
    DashboardStats, ThemeUpdate, WidgetConfigUpdate,
    NotificationPreferencesUpdate, LayoutPreferences
)

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    """Get dashboard statistics."""
    try:
        # Get projects from config
        local_config_manager = LocalConfigManager()
        projects = local_config_manager.load_projects()

        # Calculate stats
        total_projects = len(projects)
        active_projects = 0
        healthy_sites = 0

        return DashboardStats(
            total_projects=total_projects,
            active_projects=active_projects,
            total_servers=0,
            healthy_sites=healthy_sites,
            recent_deployments=0,
            failed_backups=0
        )

    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", response_model=DashboardConfigModel)
async def get_dashboard_configuration():
    """Get dashboard configuration."""
    try:
        config = get_dashboard_config()
        return config
    except Exception as e:
        logger.error(f"Error getting dashboard configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
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


@router.put("/config/theme")
async def update_theme(theme_update: ThemeUpdate):
    """Update theme settings."""
    try:
        config_mgr = get_config_manager()
        config = config_mgr.get_config()

        config.theme = theme_update.theme
        if theme_update.primary_color:
            config.primary_color = theme_update.primary_color
        if theme_update.accent_color:
            config.accent_color = theme_update.accent_color

        success = config_mgr.update_config(config)
        if success:
            return {"status": "success", "message": "Theme updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update theme")

    except Exception as e:
        logger.error(f"Error updating theme: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/layout")
async def update_layout_preferences(layout_update: LayoutPreferences):
    """Update layout preferences."""
    try:
        config_mgr = get_config_manager()
        config = config_mgr.get_config()

        if layout_update.sidebar_collapsed is not None:
            config.sidebar_collapsed = layout_update.sidebar_collapsed
        if layout_update.show_advanced_options is not None:
            config.show_advanced_options = layout_update.show_advanced_options
        if layout_update.default_project_view:
            config.default_project_view = layout_update.default_project_view
        if layout_update.projects_per_page is not None:
            config.projects_per_page = layout_update.projects_per_page

        success = config_mgr.update_config(config)
        if success:
            return {"status": "success", "message": "Layout preferences updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update layout preferences")

    except Exception as e:
        logger.error(f"Error updating layout preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/notifications")
async def update_notification_preferences(notification_update: NotificationPreferencesUpdate):
    """Update notification preferences."""
    try:
        config_mgr = get_config_manager()
        config = config_mgr.get_config()

        config.notification_types.update(notification_update.notification_types)
        if notification_update.notifications_enabled is not None:
            config.notifications_enabled = notification_update.notifications_enabled

        success = config_mgr.update_config(config)
        if success:
            return {"status": "success", "message": "Notification preferences updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update notification preferences")

    except Exception as e:
        logger.error(f"Error updating notification preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/widgets/{widget_id}")
async def update_widget_configuration(widget_id: str, widget_update: WidgetConfigUpdate):
    """Update widget configuration."""
    try:
        config_mgr = get_config_manager()
        success = config_mgr.update_widget_config(widget_id, widget_update.config)

        if success:
            return {"status": "success", "message": f"Widget {widget_id} configuration updated"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update widget configuration")

    except Exception as e:
        logger.error(f"Error updating widget configuration for {widget_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/widgets/{widget_id}")
async def get_widget_configuration(widget_id: str):
    """Get widget configuration."""
    try:
        config_mgr = get_config_manager()
        widget_config = config_mgr.get_widget_config(widget_id)

        if widget_config is not None:
            return {"widget_id": widget_id, "config": widget_config}
        else:
            raise HTTPException(status_code=404, detail=f"Widget {widget_id} not found")

    except Exception as e:
        logger.error(f"Error getting widget configuration for {widget_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/reset")
async def reset_configuration_to_defaults():
    """Reset configuration to defaults."""
    try:
        config_mgr = get_config_manager()
        success = config_mgr.reset_to_defaults()

        if success:
            return {"status": "success", "message": "Configuration reset to defaults"}
        else:
            raise HTTPException(status_code=500, detail="Failed to reset configuration")

    except Exception as e:
        logger.error(f"Error resetting configuration to defaults: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/export")
async def export_configuration(export_path: str):
    """Export configuration to a file."""
    try:
        config_mgr = get_config_manager()
        path = Path(export_path)
        success = config_mgr.export_config(path)

        if success:
            return {"status": "success", "message": f"Configuration exported to {export_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to export configuration")

    except Exception as e:
        logger.error(f"Error exporting configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/import")
async def import_configuration(import_path: str):
    """Import configuration from a file."""
    try:
        config_mgr = get_config_manager()
        path = Path(import_path)
        success = config_mgr.import_config(path)

        if success:
            return {"status": "success", "message": f"Configuration imported from {import_path}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to import configuration")

    except Exception as e:
        logger.error(f"Error importing configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def dashboard_health():
    """Dashboard health check endpoint."""
    return {
        "status": "healthy",
        "service": "bedrock-forge-dashboard",
        "version": "1.0.0"
    }


@router.get("/test/simple")
async def test_simple():
    """Simple test endpoint."""
    return {"message": "Hello from dashboard API", "status": "working"}


@router.get("/debug/projects")
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
