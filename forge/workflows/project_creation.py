"""
Project creation workflow with split, focused functions.
"""
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional
from tqdm import tqdm

from forge.models.project import Project, ProjectInfo
from forge.utils.local_config import LocalConfigManager
from forge.utils.project_helpers import (
    ProjectSelector,
    DirectoryValidator,
    InputValidator,
    SecurityHelper
)
from forge.utils.config import load_config
from forge.utils.api import create_github_repo, validate_github_token
from forge.utils.shell import run_shell
from forge.utils.errors import ForgeError
from forge.utils.logging import logger
from forge.constants import (
    DEFAULT_PROJECT_NAME,
    DEFAULT_ADMIN_USER,
    DEFAULT_ADMIN_EMAIL,
    DEFAULT_DB_NAME,
    DEFAULT_DB_USER,
    DEFAULT_DB_HOST,
    DEFAULT_GITHUB_USER,
    GITHUB_TOKEN_MAX_ATTEMPTS,
    DEFAULT_CONFIG_PATH,
    DEFAULT_ENV_LOCAL_PATH,
    DEFAULT_PLUGIN_MANAGE_WP,
    DEFAULT_PLUGIN_PRESET,
    SUCCESS_PROJECT_CREATED,
    SUCCESS_WP_ADMIN_INFO,
    SUCCESS_DDEV_COMMANDS,
    SUCCESS_GITHUB_REPO
)


class ProjectCreationWorkflow:
    """Orchestrates the project creation process with focused functions."""

    def __init__(self):
        """Initialize the workflow with required dependencies."""
        self.config_manager = LocalConfigManager()
        self.project_selector = ProjectSelector(self.config_manager)
        self.directory_validator = DirectoryValidator()

    def create_project(
        self,
        project_name: Optional[str] = None,
        repo: bool = False,
        github_org: str = "",
        admin_user: Optional[str] = None,
        admin_email: Optional[str] = None,
        admin_password: Optional[str] = None,
        site_title: Optional[str] = None,
        db_name: Optional[str] = None,
        db_user: Optional[str] = None,
        db_password: Optional[str] = None,
        db_host: Optional[str] = None,
        plugin_preset: str = DEFAULT_PLUGIN_PRESET,
        plugins: Optional[str] = None,
        skip_plugins: bool = False,
        dry_run: bool = False,
        verbose: bool = False
    ) -> None:
        """
        Main entry point for project creation.

        Args:
            project_name: Name of the project.
            repo: Whether to create GitHub repository.
            github_org: GitHub organization name.
            admin_user: WordPress admin username.
            admin_email: WordPress admin email.
            admin_password: WordPress admin password.
            site_title: WordPress site title.
            db_name: Database name.
            db_user: Database username.
            db_password: Database password.
            db_host: Database host.
            plugin_preset: Plugin preset to install.
            plugins: Additional plugins to install (comma-separated).
            skip_plugins: Skip plugin installation.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        # Check requirements
        self.directory_validator.check_requirements()

        # Load configuration
        config = load_config(None, "local")

        # Collect user input
        project_params = self._collect_project_input(
            project_name, admin_user, admin_email, admin_password,
            site_title, db_name, db_user, db_password, db_host, config
        )

        # Handle GitHub setup if requested
        github_info = self._setup_github_repo(repo, github_org, config, dry_run, verbose)

        # Create project instance
        project = Project(project_params["project_name"], self.config_manager.base_dir, self.config_manager)

        # Prepare project directory
        self._prepare_project_directory(project, dry_run, verbose)

        # Execute setup workflow
        self._execute_project_setup(project, project_params, github_info, dry_run, verbose)

        # Install plugins
        self._install_plugins(project, plugin_preset, plugins, skip_plugins, dry_run, verbose)

        # Final verification and success message
        self._finalize_project(project, project_params, github_info, dry_run)

    def _collect_project_input(
        self,
        project_name: Optional[str],
        admin_user: Optional[str],
        admin_email: Optional[str],
        admin_password: Optional[str],
        site_title: Optional[str],
        db_name: Optional[str],
        db_user: Optional[str],
        db_password: Optional[str],
        db_host: Optional[str],
        config
    ) -> Dict[str, str]:
        """Collect and validate all user input for project creation."""
        import typer
        from gettext import gettext as _

        # Interactive prompts for missing arguments with validation
        if not project_name:
            project_name = InputValidator.prompt_for_valid_input(
                _("Project name"),
                InputValidator.validate_project_name,
                _("Project name must be alphanumeric, hyphens, underscores only, max 63 chars"),
                DEFAULT_PROJECT_NAME
            )
        else:
            # Validate provided project name
            if not InputValidator.validate_project_name(project_name):
                raise ForgeError(_("Invalid project name: {project_name}. Must be alphanumeric, hyphens, underscores only, max 63 chars").format(project_name=project_name))

        admin_user = admin_user or config.admin_user or typer.prompt(_("WordPress admin username"), default=DEFAULT_ADMIN_USER)

        if not admin_email:
            admin_email = config.admin_email or typer.prompt(_("WordPress admin email"), default=DEFAULT_ADMIN_EMAIL)
            admin_email = InputValidator.prompt_for_valid_input(
                _("WordPress admin email"),
                InputValidator.validate_email,
                _("Please enter a valid email address"),
                admin_email
            )
        else:
            # Validate provided admin email
            if not InputValidator.validate_email(admin_email):
                raise ForgeError(_("Invalid admin email: {admin_email}").format(admin_email=admin_email))

        admin_password = admin_password or SecurityHelper.secure_prompt_for_password(_("WordPress admin password: "))

        site_title = site_title or typer.prompt(_("WordPress site title"), default=project_name)

        db_name = db_name or typer.prompt(_("Database name"), default=DEFAULT_DB_NAME)
        db_user = db_user or typer.prompt(_("Database username"), default=DEFAULT_DB_USER)
        db_password = db_password or SecurityHelper.secure_prompt_for_password(_("Database password: "))
        db_host = db_host or typer.prompt(_("Database host"), default=DEFAULT_DB_HOST)

        return {
            "project_name": project_name,
            "admin_user": admin_user,
            "admin_email": admin_email,
            "admin_password": admin_password,
            "site_title": site_title,
            "db_name": db_name,
            "db_user": db_user,
            "db_password": db_password,
            "db_host": db_host
        }

    def _setup_github_repo(
        self,
        repo: bool,
        github_org: str,
        config,
        dry_run: bool,
        verbose: bool
    ) -> Optional[Dict[str, str]]:
        """Handle GitHub repository setup if requested."""
        import typer
        from gettext import gettext as _

        if not repo and not typer.confirm(_("Create GitHub repository?"), default=False):
            return None

        repo = True
        github_org = github_org or typer.prompt(_("GitHub organization (leave empty for personal account)"), default="")
        github_user = github_org if github_org else (config.github_user or typer.prompt(_("GitHub username"), default=DEFAULT_GITHUB_USER))

        # Load existing token and validate
        from dotenv import load_dotenv
        load_dotenv(DEFAULT_ENV_LOCAL_PATH)
        github_token = os.getenv("GITHUB_TOKEN") or ""

        for attempt in range(GITHUB_TOKEN_MAX_ATTEMPTS):
            if validate_github_token(github_token, verbose):
                break

            logger.error(f"Invalid GitHub token (attempt {attempt + 1}/{GITHUB_TOKEN_MAX_ATTEMPTS}).")
            github_token = SecurityHelper.secure_prompt_for_password(_("GitHub Personal Access Token (with repo scope): "))

            if not github_token and attempt < GITHUB_TOKEN_MAX_ATTEMPTS - 1:
                logger.warning("No token provided. Retrying...")
            elif not github_token:
                logger.warning("Skipping GitHub repository creation due to missing token.")
                return None

        # Save credentials if user confirms
        if github_token and typer.confirm(f"Save GITHUB_TOKEN to {DEFAULT_ENV_LOCAL_PATH}?"):
            self.config_manager.update_env_local("GITHUB_TOKEN", github_token)

        if github_user != getattr(config, 'github_user', None) and typer.confirm(f"Update github_user to {github_user} in {DEFAULT_CONFIG_PATH}?"):
            self.config_manager.update_default_json("github_user", github_user)

        return {
            "github_token": github_token,
            "github_user": github_user,
            "github_org": github_org,
            "create_repo": True
        }

    def _prepare_project_directory(self, project: Project, dry_run: bool, verbose: bool) -> None:
        """Prepare and clean the project directory."""
        # Ensure project_dir exists and is clean
        self.directory_validator.check_clean_directory(project.directory, dry_run)
        if not dry_run:
            project.directory.mkdir(exist_ok=True)
            if verbose:
                logger.info(f"Created project directory: {project.directory}")

    def _execute_project_setup(
        self,
        project: Project,
        project_params: Dict[str, str],
        github_info: Optional[Dict[str, str]],
        dry_run: bool,
        verbose: bool
    ) -> None:
        """Execute the main project setup workflow."""
        # Create WordPress configuration
        project.create_wp_config(
            project_params["db_name"],
            project_params["db_user"],
            project_params["db_password"],
            project_params["db_host"]
        )

        # Setup commands with progress tracking
        commands = self._build_setup_commands(project, project_params, verbose)

        # Execute setup commands with progress
        for i, cmd in enumerate(tqdm(commands, desc="Executing setup commands", disable=not verbose)):
            self._execute_setup_command(project, cmd, i, project_params, github_info, dry_run, verbose)

    def _build_setup_commands(
        self,
        project: Project,
        project_params: Dict[str, str],
        verbose: bool
    ) -> List[str]:
        """Build the list of setup commands to execute."""
        return [
            f"cd {project.directory} && ddev config --project-type=wordpress --docroot=web --project-name={project.name} --auto",
            f"cd {project.directory} && ddev composer create-project roots/bedrock .",
            "WAIT_FOR_COMPOSER_JSON_WP_CORE_AND_INDEX_PLACEHOLDER",
            "CHECK_WP_CORE_FILES_PLACEHOLDER",
            f"cd {project.directory} && ddev wp core install --url={project.wp_home} --title='{project_params['site_title']}' --admin_user={project_params['admin_user']} --admin_password={project_params['admin_password']} --admin_email={project_params['admin_email']} --skip-email",
            f"cd {project.directory} && ddev start"
        ]

    def _execute_setup_command(
        self,
        project: Project,
        command: str,
        index: int,
        project_params: Dict[str, str],
        github_info: Optional[Dict[str, str]],
        dry_run: bool,
        verbose: bool
    ) -> None:
        """Execute a single setup command with appropriate handling."""

        # Handle special placeholder commands
        if command == "WAIT_FOR_COMPOSER_JSON_WP_CORE_AND_INDEX_PLACEHOLDER":
            if not dry_run:
                project.wait_for_files(verbose=verbose)
            return

        if command == "CHECK_WP_CORE_FILES_PLACEHOLDER":
            if not dry_run:
                self._verify_wordpress_core(project)
            return

        # Handle .env file writing after composer setup
        if index == 2 and not dry_run:
            wp_config = project.create_wp_config(
                project_params["db_name"],
                project_params["db_user"],
                project_params["db_password"],
                project_params["db_host"]
            )
            project.write_env_file(wp_config, dry_run, verbose)
            self._save_project_info(project, project_params, github_info, dry_run, verbose)

        # Execute command with retry for composer commands
        if "ddev composer" in command:
            self._execute_with_retry(
                lambda: run_shell(command, dry_run),
                f"Failed to run composer command for {project.name}",
                verbose
            )
        else:
            try:
                run_shell(command, dry_run)
                if verbose:
                    logger.info(f"Executed: {command}")
            except ForgeError as e:
                raise ForgeError(f"Failed to create project {project.name}: {e}")

    def _execute_with_retry(
        self,
        func,
        error_message: str,
        verbose: bool
    ) -> None:
        """Execute a function with retry logic using COMPOSER_RETRY_CONFIG."""
        from forge.utils.resilience import COMPOSER_RETRY_CONFIG, RetryManager

        retry_decorator = RetryManager.retry_with_config(COMPOSER_RETRY_CONFIG)
        retry_func = retry_decorator(func)

        try:
            retry_func()
            if verbose:
                logger.info("Command succeeded with retry logic")
        except ForgeError as e:
            raise ForgeError(f"{error_message}: {e}")

    def _verify_wordpress_core(self, project: Project) -> None:
        """Verify that WordPress core files are properly installed."""
        wp_core_path = project.directory / "web" / "wp" / "wp-includes"
        if not wp_core_path.exists() or not any(wp_core_path.iterdir()):
            raise ForgeError(f"Composer install did not complete successfully. Missing {wp_core_path}. Please check composer output and try again.")

    def _save_project_info(
        self,
        project: Project,
        project_params: Dict[str, str],
        github_info: Optional[Dict[str, str]],
        dry_run: bool,
        verbose: bool
    ) -> None:
        """Save project information to configuration files."""
        repo_url = None
        if github_info and github_info.get("create_repo"):
            repo_url = self._create_github_repository(project, github_info, dry_run, verbose)

        # Create project info object
        project_info = ProjectInfo(
            project_name=project_params["project_name"],
            directory=str(project.directory),
            wp_admin_user=project_params["admin_user"],
            wp_admin_email=project_params["admin_email"],
            wp_admin_password=project_params["admin_password"],
            site_title=project_params["site_title"],
            db_name=project_params["db_name"],
            db_user=project_params["db_user"],
            db_password=project_params["db_password"],
            db_host=project_params["db_host"],
            wp_home=project.wp_home,
            wp_siteurl=project.wp_siteurl,
            repo_url=repo_url,
            ddev_docker_info=project.get_ddev_info(dry_run),
            wp_info=project.get_wp_info(dry_run),
            created_date=time.strftime("%Y-%m-%d %H:%M:%S")
        )

        project.save_to_config(project_info, verbose)

        # Setup git repository if repo was created
        if repo_url and not dry_run:
            project.setup_git_repo(repo_url, dry_run, verbose)

    def _create_github_repository(
        self,
        project: Project,
        github_info: Dict[str, str],
        dry_run: bool,
        verbose: bool
    ) -> Optional[str]:
        """Create GitHub repository for the project."""
        if not github_info.get("github_token"):
            return None

        github_owner = github_info.get("github_org") or github_info.get("github_user")
        try:
            repo_url = create_github_repo(
                project.name,
                github_owner,
                github_info["github_token"],
                dry_run,
                verbose
            )
            return repo_url
        except ForgeError as e:
            logger.warning(f"Warning: {e}. Skipping GitHub repo creation.")
            return None

    def _install_plugins(self, project: Project, plugin_preset: str = DEFAULT_PLUGIN_PRESET,
                         additional_plugins: Optional[str] = None, skip_plugins: bool = False,
                         dry_run: bool = False, verbose: bool = False) -> None:
        """Install plugins for the project using the enhanced plugin manager."""
        if skip_plugins or dry_run:
            if not skip_plugins and verbose:
                logger.info("Skipping plugin installation in dry-run mode")
            return

        try:
            from ..utils.plugin_manager import PluginManager
            plugin_manager = PluginManager()

            # Get plugins from preset
            preset = plugin_manager.get_preset(plugin_preset)
            if not preset:
                logger.warning(f"Plugin preset '{plugin_preset}' not found, using default plugins")
                # Fallback to basic plugins
                plugins_to_install = [DEFAULT_PLUGIN_MANAGE_WP, "wordpress-seo", "wordfence", "contact-form-7"]
            else:
                plugins_to_install = preset.plugins.copy()
                logger.info(f"Installing plugin preset '{preset.name}' with {len(plugins_to_install)} plugins")

            # Add additional plugins if specified
            if additional_plugins:
                extra_plugins = [p.strip() for p in additional_plugins.split(",")]
                plugins_to_install.extend(extra_plugins)
                logger.info(f"Adding {len(extra_plugins)} additional plugins")

            # Always include manage-wp plugin
            if DEFAULT_PLUGIN_MANAGE_WP not in plugins_to_install:
                plugins_to_install.append(DEFAULT_PLUGIN_MANAGE_WP)

            # Install plugins using the enhanced plugin manager
            results = plugin_manager.install_plugins(
                project_path=project.directory,
                plugins=plugins_to_install,
                dry_run=dry_run,
                verbose=verbose
            )

            # Show results
            successful = sum(1 for success in results.values() if success)
            total = len(results)

            logger.info(f"Plugin installation complete: {successful}/{total} plugins installed successfully")

            if verbose:
                for plugin, success in results.items():
                    status = "✅" if success else "❌"
                    logger.info(f"  {status} {plugin}")

        except Exception as e:
            logger.error(f"Failed to install plugins: {e}")
            # Fallback to basic installation
            if verbose:
                logger.info("Falling back to basic plugin installation")
            try:
                basic_plugins = [DEFAULT_PLUGIN_MANAGE_WP, "wordpress-seo", "wordfence"]
                project.install_plugins(basic_plugins, dry_run, verbose)
            except Exception as fallback_error:
                logger.error(f"Failed to install basic plugins: {fallback_error}")

    def _finalize_project(
        self,
        project: Project,
        project_params: Dict[str, str],
        github_info: Optional[Dict[str, str]],
        dry_run: bool
    ) -> None:
        """Finalize project setup and display success message."""
        if dry_run:
            return

        # Verify DDEV configuration
        directory_validator.check_ddev_config(project.directory, project.name, dry_run)

        # Display success messages
        import typer
        from gettext import gettext as _

        typer.secho(
            SUCCESS_PROJECT_CREATED.format(
                project_name=project.name,
                project_dir=project.directory,
                url=project.wp_home
            ),
            fg=typer.colors.GREEN
        )
        typer.secho(
            SUCCESS_WP_ADMIN_INFO.format(
                admin_url=f"{project.wp_home}/wp/wp-admin",
                admin_user=project_params["admin_user"],
                admin_password=project_params["admin_password"]
            ),
            fg=typer.colors.GREEN
        )
        typer.secho(
            SUCCESS_DDEV_COMMANDS.format(project_dir=project.directory),
            fg=typer.colors.GREEN
        )

        if github_info and github_info.get("create_repo"):
            # Get repo URL from saved project info
            project_info = self.config_manager.load_project_info(project.name)
            if project_info.repo_url:
                typer.secho(
                    SUCCESS_GITHUB_REPO.format(repo_url=project_info.repo_url),
                    fg=typer.colors.GREEN
                )