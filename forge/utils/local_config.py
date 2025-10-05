"""
Local project configuration management utilities.
"""
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

from .logging import logger
from .errors import ForgeError


@dataclass
class ProjectInfo:
    """Data class for project information."""
    project_name: str
    directory: str
    wp_admin_user: str
    wp_admin_email: str
    wp_admin_password: str
    site_title: str
    db_name: str
    db_user: str
    db_password: str
    db_host: str
    wp_home: str
    wp_siteurl: str
    repo_url: Optional[str] = None
    ddev_docker_info: Optional[Dict[str, Any]] = None
    wp_info: Optional[Dict[str, Any]] = None
    created_date: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ProjectInfo':
        """Create ProjectInfo from dictionary."""
        return cls(**data)

    def to_dict(self) -> Dict[str, Any]:
        """Convert ProjectInfo to dictionary."""
        return asdict(self)


@dataclass
class GlobalProject:
    """Data class for global project list entry."""
    project_name: str
    directory: str
    wp_home: str
    repo_url: Optional[str] = None
    created_date: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'GlobalProject':
        """Create GlobalProject from dictionary."""
        return cls(**data)

    def to_dict(self) -> Dict[str, Any]:
        """Convert GlobalProject to dictionary."""
        return asdict(self)


class LocalConfigManager:
    """Manages local project configuration and JSON files."""

    def __init__(self, base_dir: Optional[Path] = None):
        """
        Initialize configuration manager.

        Args:
            base_dir: Base directory for projects. Defaults to ~/Work/Wordpress/
        """
        self.base_dir = base_dir or Path.home() / "Work" / "Wordpress"
        self.global_config_path = Path.home() / ".forge" / "projects.json"
        self.default_config_path = Path("forge/config/default.json")
        self.env_local_path = Path("forge/config/.env.local")

    def ensure_global_config_dir(self) -> None:
        """Ensure the global configuration directory exists."""
        self.global_config_path.parent.mkdir(exist_ok=True)

    def load_projects(self) -> List[GlobalProject]:
        """
        Load all projects from the global configuration file.

        Returns:
            List of GlobalProject objects.
        """
        if not self.global_config_path.exists():
            return []

        try:
            with open(self.global_config_path, "r") as f:
                projects_data = json.load(f)
            return [GlobalProject.from_dict(p) for p in projects_data]
        except (json.JSONDecodeError, IOError) as e:
            raise ForgeError(f"Failed to load projects from {self.global_config_path}: {e}")

    def save_projects(self, projects: List[GlobalProject]) -> None:
        """
        Save projects to the global configuration file.

        Args:
            projects: List of GlobalProject objects to save.
        """
        self.ensure_global_config_dir()
        try:
            projects_data = [p.to_dict() for p in projects]
            with open(self.global_config_path, "w") as f:
                json.dump(projects_data, f, indent=4)
            logger.info(f"Saved {len(projects)} projects to {self.global_config_path}")
        except IOError as e:
            raise ForgeError(f"Failed to save projects to {self.global_config_path}: {e}")

    def add_project(self, project: GlobalProject) -> None:
        """
        Add or update a project in the global configuration.

        Args:
            project: GlobalProject to add or update.
        """
        projects = self.load_projects()
        # Remove existing project with same name
        projects = [p for p in projects if p.project_name != project.project_name]
        projects.append(project)
        self.save_projects(projects)

    def remove_project(self, project_name: str) -> bool:
        """
        Remove a project from the global configuration.

        Args:
            project_name: Name of the project to remove.

        Returns:
            True if project was removed, False if not found.
        """
        projects = self.load_projects()
        original_count = len(projects)
        projects = [p for p in projects if p.project_name != project_name]

        if len(projects) < original_count:
            self.save_projects(projects)
            return True
        return False

    def get_project(self, project_name: str) -> Optional[GlobalProject]:
        """
        Get a project from the global configuration.

        Args:
            project_name: Name of the project to retrieve.

        Returns:
            GlobalProject if found, None otherwise.
        """
        projects = self.load_projects()
        for project in projects:
            if project.project_name == project_name:
                return project
        return None

    def save_project_info(self, project_dir: Path, project_info: ProjectInfo, verbose: bool = False) -> None:
        """
        Save detailed project information to the project-specific configuration file.

        Args:
            project_dir: Directory where the project is located.
            project_info: ProjectInfo object to save.
            verbose: Enable verbose logging.
        """
        project_config_path = project_dir / ".forge" / "project.json"
        project_config_path.parent.mkdir(exist_ok=True)

        try:
            with open(project_config_path, "w") as f:
                json.dump(project_info.to_dict(), f, indent=4)
            if verbose:
                logger.info(f"Saved project info to {project_config_path}")
        except IOError as e:
            raise ForgeError(f"Failed to save project info to {project_config_path}: {e}")

    def load_project_info(self, project_name: str) -> ProjectInfo:
        """
        Load project information combining global and project-specific data.

        Args:
            project_name: Name of the project to load.

        Returns:
            Complete ProjectInfo object.

        Raises:
            ForgeError: If project information is not found.
        """
        # Load from global projects list first
        global_project = self.get_project(project_name)
        if not global_project:
            raise ForgeError(f"No project info found for {project_name}")

        # Try to load detailed info from project-specific file
        project_dir = Path(global_project.directory)
        project_config_path = project_dir / ".forge" / "project.json"

        if project_config_path.exists():
            try:
                with open(project_config_path, "r") as f:
                    project_data = json.load(f)
                return ProjectInfo.from_dict(project_data)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load project-specific config for {project_name}: {e}")

        # Fallback: create basic ProjectInfo from global data
        return ProjectInfo(
            project_name=global_project.project_name,
            directory=global_project.directory,
            wp_admin_user="",
            wp_admin_email="",
            wp_admin_password="",
            site_title=global_project.project_name,
            db_name="db",
            db_user="db",
            db_password="db",
            db_host="db",
            wp_home=global_project.wp_home,
            wp_siteurl=f"{global_project.wp_home}/wp",
            repo_url=global_project.repo_url,
            created_date=global_project.created_date
        )

    def update_default_json(self, key: str, value: Any) -> None:
        """
        Update a value in the default.json configuration file.

        Args:
            key: Configuration key to update.
            value: Value to set.
        """
        try:
            config_dir = self.default_config_path.parent
            config_dir.mkdir(exist_ok=True)

            config_data = {}
            if self.default_config_path.exists():
                with open(self.default_config_path, "r") as f:
                    config_data = json.load(f)

            config_data[key] = value

            with open(self.default_config_path, "w") as f:
                json.dump(config_data, f, indent=4)
            logger.info(f"Updated {key} to {value} in {self.default_config_path}")
        except IOError as e:
            raise ForgeError(f"Failed to update {self.default_config_path}: {e}")

    def update_env_local(self, key: str, value: str) -> None:
        """
        Update a value in the .env.local file.

        Args:
            key: Environment variable key.
            value: Environment variable value.
        """
        try:
            config_dir = self.env_local_path.parent
            config_dir.mkdir(exist_ok=True)

            with open(self.env_local_path, "w") as f:  # Overwrite to avoid duplicates
                f.write(f"{key}={value}\n")
            logger.info(f"Updated {key} in {self.env_local_path}")
        except IOError as e:
            raise ForgeError(f"Failed to update {self.env_local_path}: {e}")