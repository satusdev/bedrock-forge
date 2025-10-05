"""
Helper utilities for project selection and validation.
"""
import typer
from typing import List, Optional, Tuple
from pathlib import Path

from forge.utils.local_config import LocalConfigManager, GlobalProject
from forge.utils.errors import ForgeError
from forge.constants import (
    ERROR_NO_PROJECTS_FOUND,
    ERROR_INVALID_PROJECT_SELECTION,
    ERROR_INVALID_ACTION,
    VALID_DDEV_ACTIONS
)


class ProjectSelector:
    """Helper class for project selection and validation."""

    def __init__(self, config_manager: Optional[LocalConfigManager] = None):
        """
        Initialize project selector.

        Args:
            config_manager: Configuration manager instance.
        """
        self.config_manager = config_manager or LocalConfigManager()

    def select_project(
        self,
        project_name: Optional[str] = None,
        allow_empty: bool = False,
        verbose: bool = False
    ) -> str:
        """
        Select a project name either from parameter or interactive selection.

        Args:
            project_name: Pre-selected project name.
            allow_empty: Whether to allow empty project list.
            verbose: Enable verbose logging.

        Returns:
            Selected project name.

        Raises:
            ForgeError: If no projects found or selection is invalid.
        """
        if project_name:
            return project_name

        projects = self.config_manager.load_projects()
        if not projects:
            if allow_empty:
                return ""
            raise ForgeError(ERROR_NO_PROJECTS_FOUND)

        return self._interactive_project_selection(projects)

    def _interactive_project_selection(self, projects: List[GlobalProject]) -> str:
        """
        Handle interactive project selection.

        Args:
            projects: List of available projects.

        Returns:
            Selected project name.

        Raises:
            ForgeError: If selection is invalid.
        """
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project.project_name} ({project.wp_home})", fg=typer.colors.BLUE)

        selection = typer.prompt("Select a project number", type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(ERROR_INVALID_PROJECT_SELECTION)

        return projects[selection - 1].project_name

    def validate_action(self, action: Optional[str], valid_actions: Optional[List[str]] = None) -> str:
        """
        Validate and prompt for action if needed.

        Args:
            action: Pre-selected action.
            valid_actions: List of valid actions.

        Returns:
            Validated action name.

        Raises:
            ForgeError: If action is invalid.
        """
        if not valid_actions:
            valid_actions = VALID_DDEV_ACTIONS

        if action:
            if action not in valid_actions:
                raise ForgeError(ERROR_INVALID_ACTION.format(action=action, valid_actions=valid_actions))
            return action

        action = typer.prompt(f"Action ({'/'.join(valid_actions)})", default="status")
        if action not in valid_actions:
            raise ForgeError(ERROR_INVALID_ACTION.format(action=action, valid_actions=valid_actions))

        return action


class DirectoryValidator:
    """Helper class for directory validation operations."""

    @staticmethod
    def check_requirements() -> None:
        """
        Check if required tools (DDEV, Docker, Git, code) are installed.

        Raises:
            ForgeError: If required tools are missing.
        """
        import shutil
        from forge.utils.logging import logger
        from forge.constants import WARNING_VS_CODE_NOT_FOUND

        required_commands = ["ddev", "docker", "git"]
        for cmd in required_commands:
            if not shutil.which(cmd):
                raise ForgeError(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV.")

        if not shutil.which("code"):
            logger.warning(WARNING_VS_CODE_NOT_FOUND)

    @staticmethod
    def check_clean_directory(project_dir: Path, dry_run: bool) -> None:
        """
        Ensure project directory is empty or contains only allowed files for Composer.

        Args:
            project_dir: Project directory to check.
            dry_run: If True, skip actual directory operations.
        """
        from forge.constants import ALLOWED_PROJECT_PATHS
        from forge.utils.logging import logger
        import os
        import shutil
        from tqdm import tqdm

        if dry_run or not project_dir.exists():
            return

        # If directory is not empty, remove it entirely to avoid Composer errors
        if any(project_dir.iterdir()):
            shutil.rmtree(project_dir)
            logger.warning(f"Removed non-empty project directory: {project_dir}")
            return

        existing_paths = set()
        for root, dirs, files in os.walk(project_dir):
            rel_root = os.path.relpath(root, project_dir)
            for name in files + dirs:
                existing_paths.add(os.path.join(rel_root, name) if rel_root != '.' else name)

        invalid_paths = existing_paths - ALLOWED_PROJECT_PATHS
        if invalid_paths:
            for path in tqdm(invalid_paths, desc="Cleaning invalid paths", disable=not os.getenv("VERBOSE")):
                fpath = project_dir / path
                if fpath.is_dir():
                    shutil.rmtree(fpath)
                else:
                    try:
                        fpath.unlink()
                    except FileNotFoundError:
                        pass
            logger.warning(f"Cleaned invalid paths from {project_dir}: {', '.join(invalid_paths)}")

    @staticmethod
    def check_ddev_config(project_dir: Path, project_name: str, dry_run: bool) -> None:
        """
        Verify DDEV configuration exists in project directory.

        Args:
            project_dir: Project directory to check.
            project_name: Name of the project.
            dry_run: If True, skip actual checks.

        Raises:
            ForgeError: If DDEV configuration is not found.
        """
        from forge.constants import ERROR_DDEV_CONFIG_NOT_FOUND

        if dry_run:
            return

        config_path = project_dir / ".ddev" / "config.yaml"
        if not config_path.exists():
            raise ForgeError(ERROR_DDEV_CONFIG_NOT_FOUND.format(project_dir=project_dir))

    @staticmethod
    def ensure_directory_exists(directory: Path, dry_run: bool = False) -> None:
        """
        Ensure a directory exists, creating it if necessary.

        Args:
            directory: Directory to ensure exists.
            dry_run: If True, only show what would be done.
        """
        if dry_run:
            return

        directory.mkdir(parents=True, exist_ok=True)


class RetryHelper:
    """Helper class for retry operations with exponential backoff."""

    @staticmethod
    def retry_with_backoff(
        func,
        max_attempts: int = 3,
        base_delay: int = 1,
        max_delay: int = 60,
        backoff_factor: float = 2.0,
        exceptions: Tuple = (Exception,)
    ):
        """
        Retry a function with exponential backoff.

        Args:
            func: Function to retry.
            max_attempts: Maximum number of retry attempts.
            base_delay: Initial delay between retries in seconds.
            max_delay: Maximum delay between retries in seconds.
            backoff_factor: Multiplier for exponential backoff.
            exceptions: Tuple of exceptions to catch and retry on.

        Returns:
            Result of the function call.

        Raises:
            The last exception if all attempts fail.
        """
        import time
        from forge.utils.logging import logger

        last_exception = None
        delay = base_delay

        for attempt in range(max_attempts):
            try:
                return func()
            except exceptions as e:
                last_exception = e
                if attempt == max_attempts - 1:
                    break

                logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay} seconds...")
                time.sleep(delay)
                delay = min(delay * backoff_factor, max_delay)

        raise last_exception


class InputValidator:
    """Helper class for user input validation."""

    @staticmethod
    def validate_email(email: str) -> bool:
        """
        Validate email format.

        Args:
            email: Email address to validate.

        Returns:
            True if email is valid, False otherwise.
        """
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None

    @staticmethod
    def validate_project_name(project_name: str) -> bool:
        """
        Validate project name format.

        Args:
            project_name: Project name to validate.

        Returns:
            True if project name is valid, False otherwise.
        """
        import re
        # Allow alphanumeric characters, hyphens, and underscores
        # Must start and end with alphanumeric character
        pattern = r'^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$'
        return re.match(pattern, project_name) is not None and len(project_name) <= 63

    @staticmethod
    def validate_github_token(token: str) -> bool:
        """
        Basic validation for GitHub token format.

        Args:
            token: GitHub token to validate.

        Returns:
            True if token appears to be valid format, False otherwise.
        """
        # GitHub personal access tokens are typically 40 characters long
        # and contain alphanumeric characters
        return len(token) >= 20 and token.replace('_', '').replace('-', '').isalnum()

    @staticmethod
    def prompt_for_valid_input(
        prompt_message: str,
        validation_func,
        error_message: str,
        default_value: Optional[str] = None,
        password: bool = False
    ) -> str:
        """
        Prompt user for input with validation.

        Args:
            prompt_message: Message to display to user.
            validation_func: Function to validate input.
            error_message: Error message to display on validation failure.
            default_value: Default value if user enters nothing.
            password: Whether to hide input (for passwords).

        Returns:
            Validated user input.
        """
        from getpass import getpass

        while True:
            if password:
                user_input = getpass(prompt_message) or default_value or ""
            else:
                user_input = typer.prompt(prompt_message, default=default_value or "") if default_value else typer.prompt(prompt_message)

            if validation_func(user_input):
                return user_input

            typer.secho(error_message, fg=typer.colors.RED)


class SecurityHelper:
    """Helper class for security-related operations."""

    @staticmethod
    def secure_prompt_for_password(prompt_message: str) -> str:
        """
        Securely prompt for password with validation.

        Args:
            prompt_message: Message to display to user.

        Returns:
            Password entered by user.
        """
        from getpass import getpass

        while True:
            password = getpass(prompt_message)
            if len(password) >= 8:
                return password
            typer.secho("Password must be at least 8 characters long.", fg=typer.colors.RED)

    @staticmethod
    def generate_secure_string(length: int, chars: str) -> str:
        """
        Generate a cryptographically secure random string.

        Args:
            length: Length of the string to generate.
            chars: Characters to choose from.

        Returns:
            Secure random string.
        """
        import secrets
        return ''.join(secrets.choice(chars) for _ in range(length))

    @staticmethod
    def sanitize_shell_argument(arg: str) -> str:
        """
        Sanitize argument for safe shell command execution.

        Args:
            arg: Argument to sanitize.

        Returns:
            Sanitized argument safe for shell usage.
        """
        import shlex
        return shlex.quote(arg)