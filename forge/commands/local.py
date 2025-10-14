import typer
import os
import json
import shutil
import time
from pathlib import Path
from typing import Optional, List

from dotenv import load_dotenv
from tqdm import tqdm
import gettext

# Local imports
from forge.utils.shell import run_shell
from forge.utils.config import load_config
from forge.utils.api import create_github_repo, validate_github_token
from forge.utils.errors import ForgeError
from forge.utils.logging import logger
from forge.utils.local_config import LocalConfigManager, GlobalProject
from forge.utils.project_helpers import ProjectSelector, DirectoryValidator
from forge.utils.security import CredentialManager, InputSanitizer, SecurityAuditor
from forge.utils.resilience import RetryManager, ErrorHandler, HealthChecker
from forge.models.project import Project, ProjectInfo
from forge.workflows.project_creation import ProjectCreationWorkflow
from forge.commands.sync import backup
from forge.constants import *

# Setup gettext (prep for i18n)
_ = gettext.gettext  # Wrap translatable strings with _()
# To fully enable: gettext.bindtextdomain('forge', 'locale'); gettext.textdomain('forge')

app = typer.Typer(name="local", help=_("Manage local projects with DDEV"))

# Initialize shared utilities
config_manager = LocalConfigManager()
project_selector = ProjectSelector(config_manager)
directory_validator = DirectoryValidator()
credential_manager = CredentialManager()
creation_workflow = ProjectCreationWorkflow()

def get_projects(verbose: bool = False) -> List[GlobalProject]:
    """Retrieve all projects from configuration."""
    projects = config_manager.load_projects()
    if verbose and projects:
        logger.info(_("Available projects:"))
        for i, project in enumerate(projects, 1):
            logger.info(_(f"{i}. {project.project_name} ({project.wp_home}, Directory: {project.directory})"))
    return projects

def get_base_dir() -> Path:
    config = load_config(None, "local")
    return Path(getattr(config, "base_dir", DEFAULT_BASE_DIR)).expanduser()

@app.command()
def create_project(
    project_name: Optional[str] = typer.Argument(None, help=_("Name of the project")),
    repo: bool = typer.Option(False, "--repo", help=_("Create GitHub repository")),
    github_org: str = typer.Option("", "--github-org", help=_("GitHub organization (optional)")),
    admin_user: Optional[str] = typer.Option(None, "--admin-user", help=_("WordPress admin username")),
    admin_email: Optional[str] = typer.Option(None, "--admin-email", help=_("WordPress admin email")),
    admin_password: Optional[str] = typer.Option(None, "--admin-password", help=_("WordPress admin password")),
    site_title: Optional[str] = typer.Option(None, "--site-title", help=_("WordPress site title (defaults to project name)")),
    db_name: Optional[str] = typer.Option(None, "--db-name", help=_("Database name (default: db for DDEV)")),
    db_user: Optional[str] = typer.Option(None, "--db-user", help=_("Database username (default: db for DDEV)")),
    db_password: Optional[str] = typer.Option(None, "--db-password", help=_("Database password (default: db for DDEV)")),
    db_host: Optional[str] = typer.Option(None, "--db-host", help=_("Database host (default: db for DDEV)")),
    plugin_preset: str = typer.Option(DEFAULT_PLUGIN_PRESET, "--plugin-preset", help=_("Plugin preset to install (blog, business, ecommerce, portfolio, minimal, performance)")),
    plugins: Optional[str] = typer.Option(None, "--plugins", help=_("Additional plugins to install (comma-separated)")),
    skip_plugins: bool = typer.Option(False, "--skip-plugins", help=_("Skip plugin installation")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Create a new Bedrock project with DDEV and set up WordPress."""
    try:
        creation_workflow.create_project(
            project_name=project_name,
            repo=repo,
            github_org=github_org,
            admin_user=admin_user,
            admin_email=admin_email,
            admin_password=admin_password,
            site_title=site_title,
            db_name=db_name,
            db_user=db_user,
            db_password=db_password,
            db_host=db_host,
            plugin_preset=plugin_preset,
            plugins=plugins,
            skip_plugins=skip_plugins,
            dry_run=dry_run,
            verbose=verbose
        )
    except Exception as e:
        raise ForgeError(f"Project creation failed: {e}")

@app.command()
def manage(
    project_name: Optional[str] = typer.Argument(None, help=_("Name of the project")),
    action: Optional[str] = typer.Argument(None, help=_("Action: start, stop, status")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage DDEV project (start, stop, status)."""
    directory_validator.check_requirements()

    # Get project selection
    selected_project_name = project_selector.select_project(project_name, verbose=verbose)

    # Get and validate action
    selected_action = project_selector.validate_action(action)

    # Load project
    try:
        project = Project.from_existing(selected_project_name, config_manager)
    except ForgeError as e:
        raise ForgeError(f"Failed to load project {selected_project_name}: {e}")

    # Create backup before stopping
    if selected_action == "stop" and not dry_run:
        backup(project_dir=project.directory, db=True, uploads=True, dry_run=dry_run)

    # Execute DDEV command
    command = f"cd {project.directory} && ddev {selected_action}"

    try:
        run_shell(command, dry_run)
        if verbose:
            logger.info(_(f"Executed: {command}"))
    except ForgeError as e:
        raise ForgeError(_(f"Failed to {selected_action} project {selected_project_name}: {e}"))

    if not dry_run:
        typer.secho(_(f"Project {selected_project_name} {selected_action} completed."), fg=typer.colors.GREEN)

@app.command()
def remove_project(
    project_name: Optional[str] = typer.Argument(None, help=_("Name of the project to remove")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Remove a local project and its DDEV configuration."""
    directory_validator.check_requirements()

    # Get project selection
    selected_project_name = project_selector.select_project(project_name, verbose=verbose)

    # Load project
    try:
        project = Project.from_existing(selected_project_name, config_manager)
    except ForgeError as e:
        raise ForgeError(f"Failed to load project {selected_project_name}: {e}")

    if not project.directory.exists():
        raise ForgeError(_(f"Project directory {project.directory} does not exist."))

    # Confirm removal
    if not dry_run and not typer.confirm(_(f"Are you sure you want to remove project {selected_project_name}? This will delete all files in {project.directory}")):
        logger.info("Project removal cancelled.")
        return

    # Execute removal commands
    commands = [
        f"cd {project.directory} && ddev delete -O",
        f"rm -rf {project.directory}"
    ]

    for cmd in tqdm(commands, desc=_("Removing project"), disable=not verbose):
        if dry_run:
            logger.info(_(f"Dry run: {cmd}"))
        else:
            try:
                run_shell(cmd, dry_run)
                if verbose:
                    logger.info(_(f"Executed: {cmd}"))
            except ForgeError as e:
                raise ForgeError(_(f"Failed to remove project {selected_project_name}: {e}"))

    if not dry_run:
        # Remove from configuration
        if project.remove_from_config():
            if verbose:
                logger.info(_(f"Removed {selected_project_name} from global configuration"))
        typer.secho(_(f"Project {selected_project_name} removed successfully."), fg=typer.colors.GREEN)

@app.command()
def open_vscode(
    project_name: Optional[str] = typer.Argument(None, help=_("Name of the project to open in VS Code")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Open a project in VS Code."""
    directory_validator.check_requirements()

    # Get project selection
    selected_project_name = project_selector.select_project(project_name, verbose=verbose)

    # Load project
    try:
        project = Project.from_existing(selected_project_name, config_manager)
    except ForgeError as e:
        raise ForgeError(f"Failed to load project {selected_project_name}: {e}")

    if not project.directory.exists():
        raise ForgeError(_(f"Project directory {project.directory} does not exist."))

    command = f"code {project.directory}"

    if dry_run:
        logger.info(_(f"Dry run: {command}"))
    else:
        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(_(f"Executed: {command}"))
            typer.secho(SUCCESS_VSCODE_OPENED.format(project_name=selected_project_name), fg=typer.colors.GREEN)
        except ForgeError as e:
            raise ForgeError(_(f"Failed to open project {selected_project_name} in VS Code: {e}"))

@app.command()
def discover(
    verbose: bool = typer.Option(False, "--verbose"),
    dry_run: bool = typer.Option(False, "--dry-run")
):
    """Scan base_dir for WordPress sites and prompt for import/migration."""
    base_dir = get_base_dir()
    found_sites = []

    for entry in tqdm(os.listdir(base_dir), desc=PROGRESS_DESC_SCANNING, disable=not verbose):
        entry_path = base_dir / entry
        if entry_path.is_dir():
            # Heuristic: look for wp-config.php or Bedrock structure
            if (entry_path / "wp-config.php").exists() or (entry_path / "web" / "wp-config.php").exists():
                found_sites.append(entry_path)

    if not found_sites:
        logger.warning(_("No WordPress sites found in {base_dir}").format(base_dir=base_dir))
        return

    logger.info(_("Found the following WordPress sites:"))
    for i, site in enumerate(found_sites, 1):
        typer.secho(_(f"{i}. {site}"), fg=typer.colors.BLUE)

    for site in found_sites:
        if typer.confirm(_(f"Import/migrate site at {site}?"), default=False):
            _import_existing_site(site, dry_run, verbose)

def _import_existing_site(site: Path, dry_run: bool, verbose: bool) -> None:
    """Import an existing WordPress site."""
    project_name = site.name
    project_dir = site

    # Backup site files and DB
    backup_dir = site.parent / f"{site.name}_backup"
    if not dry_run:
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        shutil.copytree(site, backup_dir)
        logger.info(_(f"Backed up {site} to {backup_dir}"))

    # Check if it's already a Bedrock project
    is_bedrock = (project_dir / "web" / "wp-config.php").exists()

    if not is_bedrock:
        # Convert to Bedrock structure
        logger.info(_(f"Converting {site} to Bedrock structure..."))
        if not dry_run:
            web_dir = project_dir / "web"
            web_dir.mkdir(exist_ok=True)
            content_dir = project_dir / "wp-content"
            if content_dir.exists():
                shutil.move(content_dir, web_dir / "app")
            # Move wp-config.php to web/
            wp_config = project_dir / "wp-config.php"
            if wp_config.exists():
                shutil.move(wp_config, web_dir / "wp-config.php")

    # DDEV config if not exists
    ddev_config = project_dir / ".ddev" / "config.yaml"
    if not ddev_config.exists():
        logger.info(_(f"Adding DDEV config to {site}..."))
        if not dry_run:
            run_shell(f"cd {project_dir} && ddev config --project-type=wordpress --docroot=web --project-name={project_name} --auto", dry_run)

    # If it's a Bedrock project, patch composer.json for monorepo-fetcher
    if is_bedrock or (project_dir / "composer.json").exists():
        logger.info(_(f"Patching composer.json for monorepo-fetcher..."))
        if not dry_run:
            _patch_composer_for_import(project_dir, dry_run, verbose)

    # Wait for essential files to be ready
    if not dry_run:
        _wait_for_import_files(project_dir, verbose)

    # Save imported site to configuration
    global_project = GlobalProject(
        project_name=project_name,
        directory=str(project_dir),
        wp_home=f"http://{project_name}.ddev.site",
        repo_url=None,
        created_date=time.strftime("%Y-%m-%d %H:%M:%S")
    )
    config_manager.add_project(global_project)
    logger.info(_(f"Imported site {project_name} and added to project list."))

def _patch_composer_for_import(project_dir: Path, dry_run: bool, verbose: bool) -> None:
    """Patch composer.json for imported projects."""
    composer_path = project_dir / "composer.json"
    if not composer_path.exists():
        return

    try:
        with open(composer_path, "r+") as f:
            data = json.load(f)
            repos = data.get("repositories", [])

            # Ensure wpackagist and monorepo-fetcher VCS repo are present only once
            if not any(r.get("url") == WPACKAGIST_URL for r in repos):
                repos.append({
                    "type": "composer",
                    "url": WPACKAGIST_URL,
                    "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
                })
            if not any(r.get("url") == MONOREPO_FETCHER_URL for r in repos):
                repos.append({
                    "type": "vcs",
                    "url": MONOREPO_FETCHER_URL
                })

            data["repositories"] = repos

            # Ensure require entry for monorepo-fetcher
            require = data.get("require", {})
            require["satusdev/monorepo-fetcher"] = MONOREPO_FETCHER_VERSION
            data["require"] = require

            f.seek(0)
            json.dump(data, f, indent=4)
            f.truncate()

        # Update dependencies
        run_shell(f"cd {project_dir} && ddev composer update satusdev/monorepo-fetcher --no-interaction", dry_run)

    except (json.JSONDecodeError, IOError, ForgeError) as e:
        logger.warning(_(f"Failed to update monorepo-fetcher: {e}"))

def _wait_for_import_files(project_dir: Path, verbose: bool) -> None:
    """Wait for essential files to be ready after import."""
    index_php_path = project_dir / "web" / "index.php"
    wp_config_path = project_dir / "web" / "wp-config.php"
    wait_time = 0

    while (
        not (index_php_path.exists() and os.access(index_php_path, os.R_OK))
        or not wp_config_path.exists()
    ) and wait_time < DDEV_INFO_WAIT_TIMEOUT:
        time.sleep(FILE_WAIT_INTERVAL)
        wait_time += 1

    if verbose:
        logger.info(_(f"Essential files ready after {wait_time} seconds"))

@app.command()
def list_projects(verbose: bool = typer.Option(False, "--verbose")):
    """List all managed projects."""
    projects = get_projects(verbose)
    if not projects:
        typer.secho(_("No projects found."), fg=typer.colors.YELLOW)
    else:
        typer.secho(_("Managed projects:"), fg=typer.colors.GREEN)
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project.project_name} ({project.wp_home}, Directory: {project.directory})"), fg=typer.colors.BLUE)

@app.command()
def switch_project(
    project_name: Optional[str] = typer.Argument(None, help=_("Project to switch to")),
    env: str = typer.Option("development", "--env", help=_("Environment: development or staging")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Switch active project and environment (updates env vars, DDEV context)."""
    projects = get_projects(verbose)
    if not projects:
        typer.secho(_("No projects found. Create or import a project first."), fg=typer.colors.YELLOW)
        return

    if not project_name:
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project.project_name} ({project.wp_home})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to switch to"), type=int)
        if selection < 1 or selection > len(projects):
            typer.secho(_("Invalid project selection"), fg=typer.colors.RED)
            return
        project_name = projects[selection - 1].project_name

    # Validate environment
    if env not in VALID_ENVIRONMENTS:
        raise ForgeError(_(f"Invalid environment: {env}. Choose from {VALID_ENVIRONMENTS}"))

    # Load project
    try:
        project = Project.from_existing(project_name, config_manager)
    except ForgeError as e:
        raise ForgeError(f"Failed to load project {project_name}: {e}")

    # Update environment variables (write .env.local)
    env_path = project.directory / ".env.local"
    env_content = f"{ENV_WP_ENV}={env}\n"

    if not dry_run:
        from forge.utils.security import SecureFileHandler
        SecureFileHandler.write_file_securely(env_path, env_content)

    typer.secho(SUCCESS_PROJECT_SWITCHED.format(project_name=project_name, env=env), fg=typer.colors.GREEN)
    typer.secho(_(f"Updated {env_path} with {ENV_WP_ENV}={env}"), fg=typer.colors.GREEN)

    # Optionally, run DDEV start for the selected project
    if typer.confirm(_(f"Start DDEV for {project_name}?"), default=True):
        run_shell(f"cd {project.directory} && ddev start", dry_run)
        typer.secho(_(f"DDEV started for {project_name}."), fg=typer.colors.GREEN)

@app.command()
def info(
    project_name: Optional[str] = typer.Argument(None, help=_("Name of the project to display info for")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Display detailed information for a project."""
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError(_("No projects found. Create a project first."))
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project.project_name} ({project.wp_home})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to view info"), type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(_("Invalid project selection"))
        project_name = projects[selection - 1].project_name

    try:
        project_info = config_manager.load_project_info(project_name)
    except ForgeError as e:
        raise ForgeError(f"Failed to load project info for {project_name}: {e}")

    typer.secho(_(f"Project Info for {project_name}:"), fg=typer.colors.GREEN)
    for key, value in project_info.to_dict().items():
        if key in ["ddev_docker_info", "wp_info"] and verbose:
            typer.secho(_(f"{key}:"), fg=typer.colors.BLUE)
            typer.secho(json.dumps(value, indent=2), fg=typer.colors.BLUE)
        else:
            typer.secho(_(f"{key}: {value}"), fg=typer.colors.BLUE)

if __name__ == "__main__":
    app()
