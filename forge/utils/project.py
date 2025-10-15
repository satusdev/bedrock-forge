"""
Project utilities for getting project configuration.
"""

from typing import Optional, Dict, Any
from pathlib import Path

from .local_config import LocalConfigManager


def get_project_config(project_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Get project configuration by name.

    Args:
        project_name: Name of the project. If None, returns None.

    Returns:
        Dictionary with project configuration or None if not found.
    """
    if not project_name:
        return None

    try:
        config_manager = LocalConfigManager()
        project = config_manager.get_project(project_name)

        if not project:
            return None

        return {
            'name': project.project_name,
            'path': project.directory,
            'wp_home': project.wp_home,
            'repo_url': project.repo_url,
            'created_date': project.created_date
        }
    except Exception:
        return None