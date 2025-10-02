import typer
import os
import secrets
import string
import json
from pathlib import Path
from getpass import getpass
from forge.utils.shell import run_shell
from forge.utils.config import load_config
from forge.utils.api import create_github_repo, validate_github_token
from forge.utils.errors import ForgeError
from forge.utils.logging import logger
import shutil
import time
import glob
from tqdm import tqdm  # For progress in long ops
import gettext  # For i18n prep

# Setup gettext (prep for i18n)
_ = gettext.gettext  # Wrap translatable strings with _()
# To fully enable: gettext.bindtextdomain('forge', 'locale'); gettext.textdomain('forge')

app = typer.Typer(name="local", help=_("Manage local projects with DDEV"))

def generate_salt(length: int = 64) -> str:
    """Generate a secure random salt for WordPress, avoiding problematic characters."""
    chars = string.ascii_letters + string.digits + "!#$%&()*+,-./:;<=>?@[]^_{}|~"
    return ''.join(secrets.choice(chars) for _ in range(length))

def check_requirements() -> None:
    """Check if required tools (DDEV, Docker, Git, code) are installed."""
    for cmd in ["ddev", "docker", "git"]:
        if not shutil.which(cmd):
            raise ForgeError(_(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV."))
    if not shutil.which("code"):
        logger.warning(_("Warning: VS Code ('code' command) not found. Install it for open-vscode command: https://code.visualstudio.com/"))

def check_ddev_config(project_dir: Path, project_name: str, dry_run: bool) -> None:
    """Verify DDEV configuration exists in project directory."""
    if dry_run:
        return
    config_path = project_dir / ".ddev" / "config.yaml"
    if not config_path.exists():
        raise ForgeError(_(f"DDEV configuration not found in {project_dir}. Ensure 'ddev config' runs successfully."))

def check_clean_directory(project_dir: Path, dry_run: bool) -> None:
    """Ensure project directory is empty or contains only allowed files for Composer."""
    allowed_paths = {"web", "web/.gitignore", "web/wp-config-ddev.php", "web/wp-config.php", ".ddev", ".ddev/config.yaml", ".forge", ".forge/project.json"}
    if dry_run or not project_dir.exists():
        return
    # If directory is not empty, remove it entirely to avoid Composer errors
    if any(project_dir.iterdir()):
        shutil.rmtree(project_dir)
        logger.warning(_(f"Removed non-empty project directory: {project_dir}"))
        return
    existing_paths = set()
    for root, dirs, files in os.walk(project_dir):
        rel_root = os.path.relpath(root, project_dir)
        for name in files + dirs:
            existing_paths.add(os.path.join(rel_root, name) if rel_root != '.' else name)
    invalid_paths = existing_paths - allowed_paths
    if invalid_paths:
        for path in tqdm(invalid_paths, desc=_("Cleaning invalid paths"), disable=not os.getenv("VERBOSE")):
            fpath = project_dir / path
            if fpath.is_dir():
                shutil.rmtree(fpath)
            else:
                try:
                    fpath.unlink()
                except FileNotFoundError:
                    pass
        logger.warning(_(f"Cleaned invalid paths from {project_dir}: {', '.join(invalid_paths)}"))

def update_default_json(github_user: str, config_path: str = "forge/config/default.json") -> None:
    """Update github_user in default.json."""
    try:
        config_dir = Path(config_path).parent
        config_dir.mkdir(exist_ok=True)
        config_data = {}
        if Path(config_path).exists():
            with open(config_path, "r") as f:
                config_data = json.load(f)
        config_data["github_user"] = github_user
        with open(config_path, "w") as f:
            json.dump(config_data, f, indent=4)
        logger.info(_(f"Updated github_user to {github_user} in {config_path}"))
    except Exception as e:
        raise ForgeError(_(f"Failed to update {config_path}: {e}"))

def update_env_local(github_token: str, env_path: str = "forge/config/.env.local") -> None:
    """Update GITHUB_TOKEN in .env.local."""
    try:
        config_dir = Path(env_path).parent
        config_dir.mkdir(exist_ok=True)
        with open(env_path, "w") as f:  # Overwrite to avoid duplicates
            f.write(f"GITHUB_TOKEN={github_token}\n")
        logger.info(_(f"Updated GITHUB_TOKEN in {env_path}"))
    except Exception as e:
        raise ForgeError(_(f"Failed to update {env_path}: {e}"))

def save_project_info(project_dir: Path, project_name: str, admin_user: str, admin_email: str, admin_password: str, site_title: str, db_name: str, db_user: str, db_password: str, db_host: str, repo_url: str = None, dry_run: bool = False, verbose: bool = False) -> None:
    """Save project information in ~/.forge/projects.json and project_dir/.forge/project.json."""
    if dry_run:
        logger.info(_(f"Dry run: Would save project info for {project_name}"))
        return
    
    # Project-specific config
    project_config_path = project_dir / ".forge" / "project.json"
    project_config_path.parent.mkdir(exist_ok=True)
    project_info = {
        "project_name": project_name,
        "directory": str(project_dir),
        "wp_admin_user": admin_user,
        "wp_admin_email": admin_email,
        "wp_admin_password": admin_password,
        "site_title": site_title,
        "db_name": db_name,
        "db_user": db_user,
        "db_password": db_password,
        "db_host": db_host,
        "wp_home": f"http://{project_name}.ddev.site",
        "wp_siteurl": f"http://{project_name}.ddev.site/wp",
        "repo_url": repo_url,
        "ddev_docker_info": {},
        "wp_info": {},
        "created_date": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # Fetch DDEV info with progress if verbose
    try:
        if verbose:
            with tqdm(total=1, desc=_("Fetching DDEV info")) as pbar:
                project_info["ddev_docker_info"] = json.loads(run_shell(f"cd {project_dir} && ddev describe -j", dry_run=False))
                pbar.update(1)
        else:
            project_info["ddev_docker_info"] = json.loads(run_shell(f"cd {project_dir} && ddev describe -j", dry_run=False))
    except ForgeError as e:
        logger.warning(_(f"Failed to fetch DDEV info: {e}"))
    
    # Fetch WP info
    try:
        wp_commands = [
            ("version", "ddev wp core version"),
            ("siteurl", "ddev wp option get siteurl"),
            ("home", "ddev wp option get home"),
            ("blogname", "ddev wp option get blogname")
        ]
        wp_info = {}
        for key, cmd in tqdm(wp_commands, desc=_("Fetching WP info"), disable=not verbose):
            full_cmd = f"cd {project_dir} && {cmd}"
            wp_info[key] = run_shell(full_cmd, dry_run=False).strip()
        project_info["wp_info"] = wp_info
    except ForgeError as e:
        logger.warning(_(f"Failed to fetch WP info: {e}"))
    
    # Save to project-specific file
    with open(project_config_path, "w") as f:
        json.dump(project_info, f, indent=4)
    if verbose:
        logger.info(_(f"Saved project info to {project_config_path}"))
    
    # Update global projects list
    global_config_path = Path.home() / ".forge" / "projects.json"
    global_config_path.parent.mkdir(exist_ok=True)
    projects = []
    if global_config_path.exists():
        with open(global_config_path, "r") as f:
            projects = json.load(f)
    
    # Update or add project
    projects = [p for p in projects if p["project_name"] != project_name]
    projects.append({
        "project_name": project_name,
        "directory": str(project_dir),
        "wp_home": f"http://{project_name}.ddev.site",
        "repo_url": repo_url,
        "created_date": project_info["created_date"]
    })
    
    with open(global_config_path, "w") as f:
        json.dump(projects, f, indent=4)
    if verbose:
        logger.info(_(f"Updated global project list in {global_config_path}"))

def load_project_info(project_name: str, verbose: bool = False) -> dict:
    """Load project information from ~/.forge/projects.json and project_dir/.forge/project.json."""
    global_config_path = Path.home() / ".forge" / "projects.json"
    project_info = {}
    
    # Load from global projects list
    if global_config_path.exists():
        with open(global_config_path, "r") as f:
            projects = json.load(f)
        for project in projects:
            if project["project_name"] == project_name:
                project_info = project
                break
    
    # Load from project-specific file
    base_dir = get_base_dir()
    project_dir = base_dir / project_name
    project_config_path = project_dir / ".forge" / "project.json"
    if project_config_path.exists():
        with open(project_config_path, "r") as f:
            project_specific_info = json.load(f)
            project_info.update(project_specific_info)
    
    if not project_info:
        raise ForgeError(_(f"No project info found for {project_name}"))
    
    if verbose:
        logger.info(_(f"Loaded project info for {project_name}"))
    return project_info

def get_projects(verbose: bool = False) -> list:
    """Retrieve all projects from ~/.forge/projects.json."""
    global_config_path = Path.home() / ".forge" / "projects.json"
    projects = []
    if global_config_path.exists():
        with open(global_config_path, "r") as f:
            projects = json.load(f)
    if verbose and projects:
        logger.info(_("Available projects:"))
        for i, project in enumerate(projects, 1):
            logger.info(_(f"{i}. {project['project_name']} ({project['wp_home']}, Directory: {project['directory']})"))
    return projects

def get_base_dir() -> Path:
    config = load_config(None, "local")
    return Path(getattr(config, "base_dir", "~/Work/Wordpress/")).expanduser()

@app.command()
def create_project(
    project_name: str = typer.Argument(None, help=_("Name of the project")),
    repo: bool = typer.Option(False, "--repo", help=_("Create GitHub repository")),
    github_org: str = typer.Option("", "--github-org", help=_("GitHub organization (optional)")),
    admin_user: str = typer.Option(None, "--admin-user", help=_("WordPress admin username")),
    admin_email: str = typer.Option(None, "--admin-email", help=_("WordPress admin email")),
    admin_password: str = typer.Option(None, "--admin-password", help=_("WordPress admin password")),
    site_title: str = typer.Option(None, "--site-title", help=_("WordPress site title (defaults to project name)")),
    db_name: str = typer.Option(None, "--db-name", help=_("Database name (default: db for DDEV)")),
    db_user: str = typer.Option(None, "--db-user", help=_("Database username (default: db for DDEV)")),
    db_password: str = typer.Option(None, "--db-password", help=_("Database password (default: db for DDEV)")),
    db_host: str = typer.Option(None, "--db-host", help=_("Database host (default: db for DDEV)")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Create a new Bedrock project with DDEV and set up WordPress."""
    check_requirements()
    
    # Load configuration
    config = load_config(None, "local")
    config_path = "forge/config/default.json"
    env_path = "forge/config/.env.local"

    # Interactive prompts for missing arguments
    project_name = project_name or typer.prompt(_("Project name"), default="myproject")
    admin_user = admin_user or config.admin_user or typer.prompt(_("WordPress admin username"), default="admin")
    admin_email = admin_email or config.admin_email or typer.prompt(_("WordPress admin email"), default="admin@example.com")
    admin_password = admin_password or getpass(_("WordPress admin password: "))
    site_title = site_title or typer.prompt(_("WordPress site title"), default=project_name)
    db_name = db_name or typer.prompt(_("Database name"), default="db")
    db_user = db_user or typer.prompt(_("Database username"), default="db")
    db_password = db_password or getpass(_("Database password: "))
    db_host = db_host or typer.prompt(_("Database host"), default="db")
    
    github_token = None
    github_user = None
    repo_url = None
    if repo or typer.confirm(_("Create GitHub repository?"), default=False):
        repo = True
        github_org = github_org or typer.prompt(_("GitHub organization (leave empty for personal account)"), default="")
        github_user = github_org if github_org else (config.github_user or typer.prompt(_("GitHub username"), default="nadbad"))
        
        # Load existing token and validate
        load_dotenv(env_path)
        github_token = os.getenv("GITHUB_TOKEN") or ""
        max_attempts = 3
        for attempt in range(max_attempts):
            if validate_github_token(github_token, verbose):
                break
            logger.error(_(f"Invalid GitHub token (attempt {attempt + 1}/{max_attempts})."))
            github_token = getpass(_("GitHub Personal Access Token (with repo scope): "))
            if not github_token and attempt < max_attempts - 1:
                logger.warning(_("No token provided. Retrying..."))
            elif not github_token:
                logger.warning(_("Skipping GitHub repository creation due to missing token."))
                repo = False
                break
        if github_token and repo and typer.confirm(_(f"Save GITHUB_TOKEN to {env_path}?")):
            update_env_local(github_token, env_path)
        if github_user != config.github_user and typer.confirm(_(f"Update github_user to {github_user} in {config_path}?")):
            update_default_json(github_user, config_path)

    base_dir = get_base_dir()
    project_dir = base_dir / project_name
    
    # Generate secure salts
    salts = {key: generate_salt() for key in [
        "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
        "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"
    ]}
    
    # Create .env file content for Bedrock
    env_content = f"""DB_NAME={db_name}
DB_USER={db_user}
DB_PASSWORD={db_password}
DB_HOST={db_host}
WP_ENV=development
WP_HOME=http://{project_name}.ddev.site
WP_SITEURL=${{WP_HOME}}/wp
AUTH_KEY={salts["AUTH_KEY"]}
SECURE_AUTH_KEY={salts["SECURE_AUTH_KEY"]}
LOGGED_IN_KEY={salts["LOGGED_IN_KEY"]}
NONCE_KEY={salts["NONCE_KEY"]}
AUTH_SALT={salts["AUTH_SALT"]}
SECURE_AUTH_SALT={salts["SECURE_AUTH_SALT"]}
LOGGED_IN_SALT={salts["LOGGED_IN_SALT"]}
NONCE_SALT={salts["NONCE_SALT"]}
"""
    
    # Ensure project_dir exists and is clean
    check_clean_directory(project_dir, dry_run)
    if not dry_run:
        project_dir.mkdir(exist_ok=True)
    
    commands = [
        f"cd {project_dir} && ddev config --project-type=wordpress --docroot=web --project-name={project_name} --auto",
        f"cd {project_dir} && ddev composer create-project roots/bedrock .",
        "WAIT_FOR_COMPOSER_JSON_AND_WP_CORE_PLACEHOLDER",
    ]

    # Patch composer.json with repositories before requiring monorepo-fetcher
    def patch_composer():
        composer_path = project_dir / "composer.json"
        with open(composer_path, "r+") as f:
            data = json.load(f)
            repos = data.get("repositories", [])
            # Ensure wpackagist and monorepo-fetcher VCS repo are present only once
            if not any(r.get("url") == "https://wpackagist.org" for r in repos):
                repos.append({
                    "type": "composer",
                    "url": "https://wpackagist.org",
                    "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
                })
            if not any(r.get("url") == "https://github.com/satusdev/monorepo-fetcher" for r in repos):
                repos.append({
                    "type": "vcs",
                    "url": "https://github.com/satusdev/monorepo-fetcher"
                })
            data["repositories"] = repos
            # Ensure require entry for monorepo-fetcher:dev-main
            require = data.get("require", {})
            require["satusdev/monorepo-fetcher"] = "dev-main"
            data["require"] = require
            f.seek(0)
            json.dump(data, f, indent=4)
            f.truncate()
    
    commands.append("PATCH_COMPOSER_PLACEHOLDER")
    commands.append(f"cd {project_dir} && ddev composer clear-cache")
    commands.append(f"cd {project_dir} && ddev composer update satusdev/monorepo-fetcher --no-interaction")
    commands.append("CHECK_WP_CORE_FILES_PLACEHOLDER")
    commands.append(f"cd {project_dir} && ddev wp core install --url=http://{project_name}.ddev.site --title='{site_title}' --admin_user={admin_user} --admin_password={admin_password} --admin_email={admin_email} --skip-email")
    commands.append(f"cd {project_dir} && ddev start")

    if repo and github_token:
        github_owner = github_org if github_org else github_user
        try:
            repo_url = create_github_repo(project_name, github_owner, github_token, dry_run, verbose)
            if repo_url and not dry_run:
                commands.extend([
                    f"cd {project_dir} && git init",
                    f"cd {project_dir} && git add .",
                    f"cd {project_dir} && git commit -m 'Initial Bedrock project setup'",
                    f"cd {project_dir} && git remote add origin {repo_url}",
                    f"cd {project_dir} && git push -u origin main",
                ])
        except ForgeError as e:
            logger.warning(_(f"Warning: {e}. Skipping GitHub repo creation."))

    # Execute commands with progress
    for i, cmd in enumerate(tqdm(commands, desc=_("Executing setup commands"), disable=not verbose)):
        if i == 2 and not dry_run:  # After composer, before wp core install
            env_path_file = project_dir / ".env"
            with open(env_path_file, "w") as f:
                f.write(env_content)
            if verbose:
                logger.info(_(f"Wrote .env to {env_path_file}"))
            save_project_info(project_dir, project_name, admin_user, admin_email, admin_password, site_title, db_name, db_user, db_password, db_host, repo_url, dry_run, verbose)
        # Retry composer commands up to 3 times
        if cmd == "WAIT_FOR_COMPOSER_JSON_AND_WP_CORE_PLACEHOLDER" and not dry_run:
            composer_json_path = project_dir / "composer.json"
            wp_core_path = project_dir / "web" / "wp" / "wp-includes"
            wait_time = 0
            while (not composer_json_path.exists() or not (wp_core_path.exists() and any(wp_core_path.iterdir()))) and wait_time < 60:
                time.sleep(1)
                wait_time += 1
            if not composer_json_path.exists():
                raise ForgeError(_(f"composer.json did not appear after create-project. Aborting."))
            if not (wp_core_path.exists() and any(wp_core_path.iterdir())):
                raise ForgeError(_(f"web/wp/wp-includes did not appear after create-project. Aborting."))
            if verbose:
                logger.info(_(f"composer.json and web/wp/wp-includes found after {wait_time} seconds"))
            continue
        if cmd == "PATCH_COMPOSER_PLACEHOLDER" and not dry_run:
            patch_composer()
            if verbose:
                logger.info(_(f"Patched composer.json with repositories"))
            continue
        if cmd == "CHECK_WP_CORE_FILES_PLACEHOLDER" and not dry_run:
            wp_core_path = project_dir / "web" / "wp" / "wp-includes"
            if not wp_core_path.exists() or not any(wp_core_path.iterdir()):
                raise ForgeError(_(f"Composer install did not complete successfully. Missing {wp_core_path}. Please check composer output and try again."))
            if verbose:
                logger.info(_(f"Verified WordPress core files exist at {wp_core_path}"))
            continue
        if "ddev composer" in cmd:
            for attempt in range(3):
                try:
                    run_shell(cmd, dry_run)
                    if verbose:
                        logger.info(_(f"Executed: {cmd}"))
                    break
                except ForgeError as e:
                    if attempt < 2:
                        logger.warning(_(f"Composer attempt {attempt + 1} failed: {e}. Retrying in 5 seconds..."))
                        time.sleep(5)
                    else:
                        raise ForgeError(_(f"Failed to run composer command for {project_name}: {e}"))
        else:
            try:
                run_shell(cmd, dry_run)
                if verbose:
                    logger.info(_(f"Executed: {cmd}"))
            except ForgeError as e:
                raise ForgeError(_(f"Failed to create project {project_name}: {e}"))

    # After core install, install plugins with progress
    if not dry_run:
        try:
            managewp_cmd = f"cd {project_dir} && ddev wp plugin install manage-wp --activate"
            run_shell(managewp_cmd, dry_run)
            if verbose:
                logger.info(_("Installed and activated plugin: manage-wp"))
        except Exception as e:
            logger.error(_(f"Failed to install manage-wp plugin: {e}"))
        try:
            with open("forge/config/default.json", "r") as config_file:
                config_data = json.load(config_file)
            default_plugins = config_data.get("default_plugins", [])
            for plugin in tqdm(default_plugins, desc=_("Installing default plugins"), disable=not verbose):
                plugin_cmd = f"cd {project_dir} && ddev wp plugin install {plugin} --activate"
                run_shell(plugin_cmd, dry_run)
                if verbose:
                    logger.info(_(f"Installed and activated plugin: {plugin}"))
        except Exception as e:
            logger.error(_(f"Failed to install default plugins: {e}"))
        check_ddev_config(project_dir, project_name, dry_run)
        typer.secho(_(f"Project {project_name} created at {project_dir}. Access at: http://{project_name}.ddev.site"), fg=typer.colors.GREEN)
        typer.secho(_(f"WordPress admin: http://{project_name}.ddev.site/wp/wp-admin (user: {admin_user}, password: {admin_password})"), fg=typer.colors.GREEN)
        typer.secho(_(f"DDEV commands: cd {project_dir} && ddev ssh, ddev stop, ddev status"), fg=typer.colors.GREEN)
        if repo and github_token and repo_url:
            typer.secho(_(f"GitHub repository: {repo_url}"), fg=typer.colors.GREEN)

@app.command()
def manage(
    project_name: str = typer.Argument(None, help=_("Name of the project")),
    action: str = typer.Argument(None, help=_("Action: start, stop, status")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage DDEV project (start, stop, status)."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError(_("No projects found. Create a project first."))
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number"), type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(_("Invalid project selection"))
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = Path(project_info["directory"])
    action = action or typer.prompt(_("Action (start/stop/status)"), default="status")
    
    valid_actions = ["start", "stop", "status"]
    if action not in valid_actions:
        raise ForgeError(_(f"Invalid action: {action}. Choose from {valid_actions}"))
    
    if action == "stop":
        from forge.commands.sync import backup
        backup(project_dir=project_dir, db=True, uploads=True, dry_run=dry_run)
    
    command = f"cd {project_dir} && ddev {action}"
    
    try:
        run_shell(command, dry_run)
        if verbose:
            logger.info(_(f"Executed: {command}"))
    except ForgeError as e:
        raise ForgeError(_(f"Failed to {action} project {project_name}: {e}"))
    
    if not dry_run:
        typer.secho(_(f"Project {project_name} {action} completed."), fg=typer.colors.GREEN)

@app.command()
def remove_project(
    project_name: str = typer.Argument(None, help=_("Name of the project to remove")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Remove a local project and its DDEV configuration."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError(_("No projects found. Create a project first."))
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to remove"), type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(_("Invalid project selection"))
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = Path(project_info["directory"])
    
    if not project_dir.exists():
        raise ForgeError(_(f"Project directory {project_dir} does not exist."))
    
    commands = [
        f"cd {project_dir} && ddev delete -O",
        f"rm -rf {project_dir}"
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
                raise ForgeError(_(f"Failed to remove project {project_name}: {e}"))
    
    if not dry_run:
        # Update global projects list
        global_config_path = Path.home() / ".forge" / "projects.json"
        projects = get_projects(verbose)
        projects = [p for p in projects if p["project_name"] != project_name]
        with open(global_config_path, "w") as f:
            json.dump(projects, f, indent=4)
        if verbose:
            logger.info(_(f"Removed {project_name} from {global_config_path}"))
        typer.secho(_(f"Project {project_name} removed successfully."), fg=typer.colors.GREEN)

@app.command()
def open_vscode(
    project_name: str = typer.Argument(None, help=_("Name of the project to open in VS Code")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Open a project in VS Code."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError(_("No projects found. Create a project first."))
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to open in VS Code"), type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(_("Invalid project selection"))
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = Path(project_info["directory"])
    
    if not project_dir.exists():
        raise ForgeError(_(f"Project directory {project_dir} does not exist."))
    
    command = f"code {project_dir}"
    
    if dry_run:
        logger.info(_(f"Dry run: {command}"))
    else:
        try:
            run_shell(command, dry_run)
            if verbose:
                logger.info(_(f"Executed: {command}"))
            typer.secho(_(f"Opened project {project_name} in VS Code."), fg=typer.colors.GREEN)
        except ForgeError as e:
            raise ForgeError(_(f"Failed to open project {project_name} in VS Code: {e}"))

@app.command()
def discover(
    verbose: bool = typer.Option(False, "--verbose"),
    dry_run: bool = typer.Option(False, "--dry-run")
):
    """Scan base_dir for WordPress sites and prompt for import/migration."""
    base_dir = get_base_dir()
    found_sites = []
    for entry in tqdm(os.listdir(base_dir), desc=_("Scanning for sites"), disable=not verbose):
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
            # Backup site files and DB
            backup_dir = site.parent / f"{site.name}_backup"
            if not dry_run:
                if backup_dir.exists():
                    shutil.rmtree(backup_dir)
                shutil.copytree(site, backup_dir)
                logger.info(_(f"Backed up {site} to {backup_dir}"))
            # Composer init
            logger.info(_(f"Initializing composer in {site}..."))
            composer_json = site / "composer.json"
            if not dry_run and not composer_json.exists():
                run_shell(f"cd {site} && composer init --no-interaction", dry_run)
            # Bedrock migration
            logger.info(_(f"Migrating {site} to Bedrock structure..."))
            if not dry_run:
                web_dir = site / "web"
                web_dir.mkdir(exist_ok=True)
                content_dir = site / "wp-content"
                if content_dir.exists():
                    shutil.move(content_dir, web_dir / "app")
                # Assume templates dir
                template_dir = Path("forge/templates")
                if template_dir.exists():
                    for file in template_dir.glob("*.php"):
                        shutil.copy(file, web_dir)
                # Update wp-config.php
                config_path = web_dir / "wp-config.php"
                if config_path.exists():
                    with open(config_path, "r+") as f:
                        content = f.read().replace("WP_CONTENT_DIR", str(web_dir / "app"))
                        f.seek(0)
                        f.write(content)
                        f.truncate()
            # DDEV config
            logger.info(_(f"Adding DDEV config to {site}..."))
            if not dry_run:
                run_shell(f"cd {site} && ddev config --project-type=wordpress --docroot=web --project-name={site.name} --auto", dry_run)
            # Content migration (uploads, DB)
            logger.info(_(f"Migrating uploads and DB for {site}..."))
            if not dry_run:
                # Export DB from old (assume wp-cli)
                db_backup = backup_dir / "db.sql"
                run_shell(f"wp db export {db_backup}", cwd=backup_dir)
                run_shell(f"ddev import-db --file {db_backup}", cwd=site)
                # Move uploads if needed
                uploads_backup = backup_dir / "wp-content" / "uploads"
                if uploads_backup.exists():
                    shutil.move(uploads_backup, web_dir / "app" / "uploads")
            logger.info(_(f"Imported and migrated {site}."))
            # Save imported site to global JSON
            global_config_path = Path.home() / ".forge" / "projects.json"
            global_config_path.parent.mkdir(exist_ok=True)
            projects = []
            if global_config_path.exists():
                with open(global_config_path, "r") as f:
                    projects = json.load(f)
            project_name = site.name
            projects = [p for p in projects if p["project_name"] != project_name]
            projects.append({
                "project_name": project_name,
                "directory": str(site),
                "wp_home": f"http://{project_name}.ddev.site",
                "repo_url": None,
                "created_date": time.strftime("%Y-%m-%d %H:%M:%S")
            })
            with open(global_config_path, "w") as f:
                json.dump(projects, f, indent=4)
            logger.info(_(f"Saved imported site {project_name} to global project list."))

@app.command()
def list_projects(verbose: bool = typer.Option(False, "--verbose")):
    """List all managed projects."""
    projects = get_projects(verbose)
    if not projects:
        typer.secho(_("No projects found."), fg=typer.colors.YELLOW)
    else:
        typer.secho(_("Managed projects:"), fg=typer.colors.GREEN)
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']}, Directory: {project['directory']})"), fg=typer.colors.BLUE)

@app.command()
def switch_project(
    project_name: str = typer.Argument(None, help=_("Project to switch to")),
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
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to switch to"), type=int)
        if selection < 1 or selection > len(projects):
            typer.secho(_("Invalid project selection"), fg=typer.colors.RED)
            return
        project_name = projects[selection - 1]["project_name"]
    project_info = load_project_info(project_name, verbose)
    project_dir = Path(project_info["directory"])
    # Update environment variables (write .env.local)
    env_path = project_dir / ".env.local"
    env_content = f"WP_ENV={env}\n"
    if not dry_run:
        with open(env_path, "w") as f:
            f.write(env_content)
    typer.secho(_(f"Switched to project {project_name} with environment {env}."), fg=typer.colors.GREEN)
    typer.secho(_(f"Updated {env_path} with WP_ENV={env}"), fg=typer.colors.GREEN)
    # Optionally, run DDEV start for the selected project
    if typer.confirm(_(f"Start DDEV for {project_name}?"), default=True):
        run_shell(f"cd {project_dir} && ddev start", dry_run)
        typer.secho(_(f"DDEV started for {project_name}."), fg=typer.colors.GREEN)

@app.command()
def info(
    project_name: str = typer.Argument(None, help=_("Name of the project to display info for")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Display detailed information for a project."""
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError(_("No projects found. Create a project first."))
        for i, project in enumerate(projects, 1):
            typer.secho(_(f"{i}. {project['project_name']} ({project['wp_home']})"), fg=typer.colors.BLUE)
        selection = typer.prompt(_("Select a project number to view info"), type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError(_("Invalid project selection"))
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    typer.secho(_(f"Project Info for {project_name}:"), fg=typer.colors.GREEN)
    for key, value in project_info.items():
        if key in ["ddev_docker_info", "wp_info"] and verbose:
            typer.secho(_(f"{key}:"), fg=typer.colors.BLUE)
            typer.secho(json.dumps(value, indent=2), fg=typer.colors.BLUE)
        else:
            typer.secho(_(f"{key}: {value}"), fg=typer.colors.BLUE)

if __name__ == "__main__":
    app()
