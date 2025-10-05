"""
Project model for managing WordPress projects.
"""
import json
import os
import secrets
import string
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field

from forge.utils.shell import run_shell
from forge.utils.local_config import LocalConfigManager, ProjectInfo, GlobalProject
from forge.utils.errors import ForgeError
from forge.utils.logging import logger


@dataclass
class WPConfig:
    """WordPress configuration data."""
    db_name: str
    db_user: str
    db_password: str
    db_host: str
    wp_env: str = "development"
    wp_home: str = ""
    wp_siteurl: str = ""
    salts: Dict[str, str] = field(default_factory=dict)

    def to_env_content(self) -> str:
        """Generate .env file content."""
        content = f"""DB_NAME={self.db_name}
DB_USER={self.db_user}
DB_PASSWORD={self.db_password}
DB_HOST={self.db_host}
WP_ENV={self.wp_env}
WP_HOME={self.wp_home}
WP_SITEURL=${{WP_HOME}}/wp
"""
        for salt_key, salt_value in self.salts.items():
            content += f"{salt_key}={salt_value}\n"
        return content

    @classmethod
    def create_salts(cls) -> Dict[str, str]:
        """Generate secure WordPress salts."""
        chars = string.ascii_letters + string.digits + "!#$%&()*+,-./:;<=>?@[]^_{}|~"
        salt_keys = [
            "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
            "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"
        ]
        return {key: ''.join(secrets.choice(chars) for _ in range(64)) for key in salt_keys}


class Project:
    """
    Encapsulates a WordPress project with DDEV and Bedrock.
    """

    def __init__(self, name: str, base_dir: Optional[Path] = None, config_manager: Optional[LocalConfigManager] = None):
        """
        Initialize project.

        Args:
            name: Project name.
            base_dir: Base directory for projects.
            config_manager: Configuration manager instance.
        """
        self.name = name
        self.base_dir = base_dir or Path.home() / "Work" / "Wordpress"
        self.directory = self.base_dir / name
        self.config_manager = config_manager or LocalConfigManager(self.base_dir)
        self.wp_home = f"http://{name}.ddev.site"
        self.wp_siteurl = f"http://{name}.ddev.site/wp"

    @classmethod
    def from_existing(cls, name: str, config_manager: Optional[LocalConfigManager] = None) -> 'Project':
        """
        Load existing project from configuration.

        Args:
            name: Project name.
            config_manager: Configuration manager instance.

        Returns:
            Project instance loaded with existing data.

        Raises:
            ForgeError: If project is not found.
        """
        project = cls(name, config_manager=config_manager)
        project_info = project.config_manager.load_project_info(name)
        project.directory = Path(project_info.directory)
        project.wp_home = project_info.wp_home
        project.wp_siteurl = project_info.wp_siteurl
        return project

    def create_wp_config(self, db_name: str, db_user: str, db_password: str, db_host: str) -> WPConfig:
        """
        Create WordPress configuration.

        Args:
            db_name: Database name.
            db_user: Database username.
            db_password: Database password.
            db_host: Database host.

        Returns:
            WPConfig object.
        """
        salts = WPConfig.create_salts()
        return WPConfig(
            db_name=db_name,
            db_user=db_user,
            db_password=db_password,
            db_host=db_host,
            wp_home=self.wp_home,
            wp_siteurl=self.wp_siteurl,
            salts=salts
        )

    def setup_ddev_config(self, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Configure DDEV for the project.

        Args:
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would configure DDEV for {self.name}")
            return

        command = f"cd {self.directory} && ddev config --project-type=wordpress --docroot=web --project-name={self.name} --auto"
        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(f"Configured DDEV for {self.name}")
        except ForgeError as e:
            raise ForgeError(f"Failed to configure DDEV for {self.name}: {e}")

    def setup_bedrock(self, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Install Bedrock using Composer.

        Args:
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would install Bedrock for {self.name}")
            return

        command = f"cd {self.directory} && ddev composer create-project roots/bedrock ."
        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(f"Installed Bedrock for {self.name}")
        except ForgeError as e:
            raise ForgeError(f"Failed to install Bedrock for {self.name}: {e}")

    def patch_composer_json(self, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Patch composer.json to add repositories for monorepo-fetcher.

        Args:
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        composer_path = self.directory / "composer.json"

        if dry_run:
            logger.info(f"Dry run: Would patch {composer_path}")
            return

        if not composer_path.exists():
            raise ForgeError(f"composer.json not found at {composer_path}")

        try:
            with open(composer_path, "r+") as f:
                data = json.load(f)
                repos = data.get("repositories", [])

                # Add wpackagist if not present
                if not any(r.get("url") == "https://wpackagist.org" for r in repos):
                    repos.append({
                        "type": "composer",
                        "url": "https://wpackagist.org",
                        "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
                    })

                # Add monorepo-fetcher VCS repo if not present
                if not any(r.get("url") == "https://github.com/satusdev/monorepo-fetcher" for r in repos):
                    repos.append({
                        "type": "vcs",
                        "url": "https://github.com/satusdev/monorepo-fetcher"
                    })

                data["repositories"] = repos

                # Ensure require entry for monorepo-fetcher
                require = data.get("require", {})
                require["satusdev/monorepo-fetcher"] = "dev-main"
                data["require"] = require

                f.seek(0)
                json.dump(data, f, indent=4)
                f.truncate()

            if verbose:
                logger.info(f"Patched composer.json for {self.name}")
        except (json.JSONDecodeError, IOError) as e:
            raise ForgeError(f"Failed to patch composer.json: {e}")

    def write_env_file(self, wp_config: WPConfig, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Write .env file for WordPress configuration.

        Args:
            wp_config: WordPress configuration.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        env_path = self.directory / ".env"

        if dry_run:
            logger.info(f"Dry run: Would write {env_path}")
            return

        try:
            with open(env_path, "w") as f:
                f.write(wp_config.to_env_content())
            if verbose:
                logger.info(f"Wrote .env file for {self.name}")
        except IOError as e:
            raise ForgeError(f"Failed to write .env file: {e}")

    def install_wordpress(self, site_title: str, admin_user: str, admin_password: str, admin_email: str, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Install WordPress core.

        Args:
            site_title: Site title.
            admin_user: WordPress admin username.
            admin_password: WordPress admin password.
            admin_email: WordPress admin email.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would install WordPress for {self.name}")
            return

        command = (f"cd {self.directory} && ddev wp core install "
                  f"--url={self.wp_home} --title='{site_title}' "
                  f"--admin_user={admin_user} --admin_password={admin_password} "
                  f"--admin_email={admin_email} --skip-email")

        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(f"Installed WordPress for {self.name}")
        except ForgeError as e:
            raise ForgeError(f"Failed to install WordPress for {self.name}: {e}")

    def start_ddev(self, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Start DDEV for the project.

        Args:
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would start DDEV for {self.name}")
            return

        command = f"cd {self.directory} && ddev start"

        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(f"Started DDEV for {self.name}")
        except ForgeError as e:
            raise ForgeError(f"Failed to start DDEV for {self.name}: {e}")

    def install_plugins(self, plugins: List[str], dry_run: bool = False, verbose: bool = False) -> None:
        """
        Install and activate WordPress plugins.

        Args:
            plugins: List of plugin slugs to install.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would install plugins for {self.name}: {plugins}")
            return

        for plugin in plugins:
            command = f"cd {self.directory} && ddev wp plugin install {plugin} --activate"
            try:
                run_shell(command, dry_run)
                if verbose:
                    logger.info(f"Installed and activated plugin: {plugin}")
            except ForgeError as e:
                logger.error(f"Failed to install plugin {plugin}: {e}")

    def setup_git_repo(self, repo_url: str, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Initialize git repository and push to remote.

        Args:
            repo_url: GitHub repository URL.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would set up git repository for {self.name}")
            return

        commands = [
            f"cd {self.directory} && git init",
            f"cd {self.directory} && git add .",
            f"cd {self.directory} && git commit -m 'Initial Bedrock project setup'",
            f"cd {self.directory} && git remote add origin {repo_url}",
            f"cd {self.directory} && git push -u origin main",
        ]

        for command in commands:
            try:
                run_shell(command, dry_run)
                if verbose:
                    logger.info(f"Executed: {command}")
            except ForgeError as e:
                raise ForgeError(f"Failed to set up git repository: {e}")

    def wait_for_files(self, timeout: int = 60, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Wait for essential files to appear after composer installation.

        Args:
            timeout: Maximum time to wait in seconds.
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would wait for files for {self.name}")
            return

        composer_json_path = self.directory / "composer.json"
        wp_core_path = self.directory / "web" / "wp" / "wp-includes"
        index_php_path = self.directory / "web" / "index.php"

        wait_time = 0
        while (
            not composer_json_path.exists()
            or not (wp_core_path.exists() and any(wp_core_path.iterdir()))
            or not (index_php_path.exists() and os.access(index_php_path, os.R_OK))
        ) and wait_time < timeout:
            time.sleep(1)
            wait_time += 1

        if not composer_json_path.exists():
            raise ForgeError(f"composer.json did not appear after create-project. Aborting.")
        if not (wp_core_path.exists() and any(wp_core_path.iterdir())):
            raise ForgeError(f"web/wp/wp-includes did not appear after create-project. Aborting.")
        if not (index_php_path.exists() and os.access(index_php_path, os.R_OK)):
            raise ForgeError(f"web/index.php did not appear or is not readable after create-project. Aborting.")

        # Fix permissions if needed
        try:
            run_shell(f"cd {self.directory} && ddev exec chmod -R 755 web", dry_run)
        except Exception:
            pass

        if verbose:
            logger.info(f"Essential files ready after {wait_time} seconds")

    def save_to_config(self, project_info: ProjectInfo, verbose: bool = False) -> None:
        """
        Save project information to configuration files.

        Args:
            project_info: Complete project information.
            verbose: Enable verbose logging.
        """
        # Save project-specific info
        self.config_manager.save_project_info(self.directory, project_info, verbose)

        # Save to global projects list
        global_project = GlobalProject(
            project_name=project_info.project_name,
            directory=str(self.directory),
            wp_home=project_info.wp_home,
            repo_url=project_info.repo_url,
            created_date=project_info.created_date
        )
        self.config_manager.add_project(global_project)

    def delete_ddev(self, dry_run: bool = False, verbose: bool = False) -> None:
        """
        Delete DDEV configuration for the project.

        Args:
            dry_run: If True, only show what would be done.
            verbose: Enable verbose logging.
        """
        if dry_run:
            logger.info(f"Dry run: Would delete DDEV configuration for {self.name}")
            return

        command = f"cd {self.directory} && ddev delete -O"
        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(f"Deleted DDEV configuration for {self.name}")
        except ForgeError as e:
            raise ForgeError(f"Failed to delete DDEV configuration for {self.name}: {e}")

    def remove_from_config(self) -> bool:
        """
        Remove project from global configuration.

        Returns:
            True if project was removed, False if not found.
        """
        return self.config_manager.remove_project(self.name)

    def get_ddev_info(self, dry_run: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get DDEV information for the project.

        Args:
            dry_run: If True, return None.

        Returns:
            DDEV information dictionary or None.
        """
        if dry_run:
            return None

        try:
            command = f"cd {self.directory} && ddev describe -j"
            result = run_shell(command, dry_run)
            return json.loads(result)
        except (ForgeError, json.JSONDecodeError) as e:
            logger.warning(f"Failed to get DDEV info: {e}")
            return None

    def get_wp_info(self, dry_run: bool = False) -> Optional[Dict[str, str]]:
        """
        Get WordPress information for the project.

        Args:
            dry_run: If True, return None.

        Returns:
            WordPress information dictionary or None.
        """
        if dry_run:
            return None

        wp_commands = [
            ("version", "ddev wp core version"),
            ("siteurl", "ddev wp option get siteurl"),
            ("home", "ddev wp option get home"),
            ("blogname", "ddev wp option get blogname")
        ]

        wp_info = {}
        for key, cmd in wp_commands:
            try:
                full_cmd = f"cd {self.directory} && {cmd}"
                result = run_shell(full_cmd, dry_run)
                wp_info[key] = result.strip()
            except ForgeError as e:
                logger.warning(f"Failed to get WP {key}: {e}")
                return None

        return wp_info