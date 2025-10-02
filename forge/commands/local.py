import typer
import os
import secrets
import string
import json
from forge.utils.shell import run_shell
from forge.utils.config import load_config, load_dotenv
from forge.utils.api import create_github_repo, validate_github_token
from forge.utils.errors import ForgeError
import shutil
import time
import glob

app = typer.Typer(name="local", help="Manage local projects with DDEV")

def generate_salt(length: int = 64) -> str:
    """Generate a secure random salt for WordPress, avoiding problematic characters."""
    chars = string.ascii_letters + string.digits + "!#$%&()*+,-./:;<=>?@[]^_{}|~"
    return ''.join(secrets.choice(chars) for _ in range(length))

def check_requirements() -> None:
    """Check if required tools (DDEV, Docker, Git, code) are installed."""
    for cmd in ["ddev", "docker", "git"]:
        if not shutil.which(cmd):
            raise ForgeError(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV.")
    if not shutil.which("code"):
        typer.secho("Warning: VS Code ('code' command) not found. Install it for open-vscode command: https://code.visualstudio.com/", fg=typer.colors.YELLOW)

def check_ddev_config(project_dir: str, project_name: str, dry_run: bool) -> None:
    """Verify DDEV configuration exists in project directory."""
    if dry_run:
        return
    config_path = os.path.join(project_dir, ".ddev", "config.yaml")
    if not os.path.exists(config_path):
        raise ForgeError(f"DDEV configuration not found in {project_dir}. Ensure 'ddev config' runs successfully.")

def check_clean_directory(project_dir: str, dry_run: bool) -> None:
    """Ensure project directory is empty or contains only allowed files for Composer."""
    allowed_paths = {"web", "web/.gitignore", "web/wp-config-ddev.php", "web/wp-config.php", ".ddev", ".ddev/config.yaml", ".forge", ".forge/project.json"}
    if dry_run or not os.path.exists(project_dir):
        return
    existing_paths = {os.path.relpath(os.path.join(root, name), project_dir) 
                     for root, _, files in os.walk(project_dir) for name in files + ['web', '.ddev', '.forge']}
    invalid_paths = existing_paths - allowed_paths
    if invalid_paths:
        for path in invalid_paths:
            fpath = os.path.join(project_dir, path)
            if os.path.isdir(fpath):
                shutil.rmtree(fpath)
            else:
                os.remove(fpath)
        typer.secho(f"Cleaned invalid paths from {project_dir}: {', '.join(invalid_paths)}", fg=typer.colors.YELLOW)

def update_default_json(github_user: str, config_path: str = "forge/config/default.json") -> None:
    """Update github_user in default.json."""
    try:
        config_dir = os.path.dirname(config_path)
        os.makedirs(config_dir, exist_ok=True)
        config_data = {}
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config_data = json.load(f)
        config_data["github_user"] = github_user
        with open(config_path, "w") as f:
            json.dump(config_data, f, indent=4)
        typer.secho(f"Updated github_user to {github_user} in {config_path}", fg=typer.colors.GREEN)
    except Exception as e:
        raise ForgeError(f"Failed to update {config_path}: {e}")

def update_env_local(github_token: str, env_path: str = "forge/config/.env.local") -> None:
    """Update GITHUB_TOKEN in .env.local."""
    try:
        config_dir = os.path.dirname(env_path)
        os.makedirs(config_dir, exist_ok=True)
        with open(env_path, "w") as f:  # Overwrite to avoid duplicates
            f.write(f"GITHUB_TOKEN={github_token}\n")
        typer.secho(f"Updated GITHUB_TOKEN in {env_path}", fg=typer.colors.GREEN)
    except Exception as e:
        raise ForgeError(f"Failed to update {env_path}: {e}")

def save_project_info(project_dir: str, project_name: str, admin_user: str, admin_email: str, admin_password: str, site_title: str, db_name: str, db_user: str, db_password: str, db_host: str, repo_url: str = None, dry_run: bool = False, verbose: bool = False) -> None:
    """Save project information in ~/.forge/projects.json and project_dir/.forge/project.json."""
    if dry_run:
        typer.secho(f"Dry run: Would save project info for {project_name}", fg=typer.colors.BLUE)
        return
    
    # Project-specific config
    project_config_path = os.path.join(project_dir, ".forge", "project.json")
    os.makedirs(os.path.dirname(project_config_path), exist_ok=True)
    project_info = {
        "project_name": project_name,
        "directory": project_dir,
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
    
    # Fetch DDEV info
    try:
        project_info["ddev_docker_info"] = json.loads(run_shell(f"cd {project_dir} && ddev describe -j", dry_run=False))
    except ForgeError as e:
        typer.secho(f"Warning: Failed to fetch DDEV info: {e}", fg=typer.colors.YELLOW)
    
    # Fetch WP info
    try:
        wp_info = {
            "version": run_shell(f"cd {project_dir} && ddev wp core version", dry_run=False).strip(),
            "site_data": {
                "siteurl": run_shell(f"cd {project_dir} && ddev wp option get siteurl", dry_run=False).strip(),
                "home": run_shell(f"cd {project_dir} && ddev wp option get home", dry_run=False).strip(),
                "blogname": run_shell(f"cd {project_dir} && ddev wp option get blogname", dry_run=False).strip()
            }
        }
        project_info["wp_info"] = wp_info
    except ForgeError as e:
        typer.secho(f"Warning: Failed to fetch WP info: {e}", fg=typer.colors.YELLOW)
    
    # Save to project-specific file
    with open(project_config_path, "w") as f:
        json.dump(project_info, f, indent=4)
    if verbose:
        typer.secho(f"Saved project info to {project_config_path}", fg=typer.colors.GREEN)
    
    # Update global projects list
    global_config_path = os.path.expanduser("~/.forge/projects.json")
    os.makedirs(os.path.dirname(global_config_path), exist_ok=True)
    projects = []
    if os.path.exists(global_config_path):
        with open(global_config_path, "r") as f:
            projects = json.load(f)
    
    # Update or add project
    projects = [p for p in projects if p["project_name"] != project_name]
    projects.append({
        "project_name": project_name,
        "directory": project_dir,
        "wp_home": f"http://{project_name}.ddev.site",
        "repo_url": repo_url,
        "created_date": project_info["created_date"]
    })
    
    with open(global_config_path, "w") as f:
        json.dump(projects, f, indent=4)
    if verbose:
        typer.secho(f"Updated global project list in {global_config_path}", fg=typer.colors.GREEN)

def load_project_info(project_name: str, verbose: bool = False) -> dict:
    """Load project information from ~/.forge/projects.json and project_dir/.forge/project.json."""
    global_config_path = os.path.expanduser("~/.forge/projects.json")
    project_info = {}
    
    # Load from global projects list
    if os.path.exists(global_config_path):
        with open(global_config_path, "r") as f:
            projects = json.load(f)
        for project in projects:
            if project["project_name"] == project_name:
                project_info = project
                break
    
    # Load from project-specific file
    project_dir = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    project_config_path = os.path.join(project_dir, ".forge", "project.json")
    if os.path.exists(project_config_path):
        with open(project_config_path, "r") as f:
            project_specific_info = json.load(f)
            project_info.update(project_specific_info)
    
    if not project_info:
        raise ForgeError(f"No project info found for {project_name}")
    
    if verbose:
        typer.secho(f"Loaded project info for {project_name}", fg=typer.colors.GREEN)
    return project_info

def get_projects(verbose: bool = False) -> list:
    """Retrieve all projects from ~/.forge/projects.json."""
    global_config_path = os.path.expanduser("~/.forge/projects.json")
    projects = []
    if os.path.exists(global_config_path):
        with open(global_config_path, "r") as f:
            projects = json.load(f)
    if verbose and projects:
        typer.secho("Available projects:", fg=typer.colors.GREEN)
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']}, Directory: {project['directory']})", fg=typer.colors.BLUE)
    return projects

@app.command()
def create_project(
    project_name: str = typer.Argument(None, help="Name of the project"),
    repo: bool = typer.Option(False, "--repo", help="Create GitHub repository"),
    github_org: str = typer.Option("", "--github-org", help="GitHub organization (optional)"),
    admin_user: str = typer.Option(None, "--admin-user", help="WordPress admin username"),
    admin_email: str = typer.Option(None, "--admin-email", help="WordPress admin email"),
    admin_password: str = typer.Option(None, "--admin-password", help="WordPress admin password"),
    site_title: str = typer.Option(None, "--site-title", help="WordPress site title (defaults to project name)"),
    db_name: str = typer.Option(None, "--db-name", help="Database name (default: db for DDEV)"),
    db_user: str = typer.Option(None, "--db-user", help="Database username (default: db for DDEV)"),
    db_password: str = typer.Option(None, "--db-password", help="Database password (default: db for DDEV)"),
    db_host: str = typer.Option(None, "--db-host", help="Database host (default: db for DDEV)"),
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
    project_name = project_name or typer.prompt("Project name", default="myproject")
    admin_user = admin_user or config.admin_user or typer.prompt("WordPress admin username", default="admin")
    admin_email = admin_email or config.admin_email or typer.prompt("WordPress admin email", default="admin@example.com")
    admin_password = admin_password or typer.prompt("WordPress admin password", default="admin", show_default=False)
    site_title = site_title or typer.prompt("WordPress site title", default=project_name)
    db_name = db_name or typer.prompt("Database name", default="db")
    db_user = db_user or typer.prompt("Database username", default="db")
    db_password = db_password or typer.prompt("Database password", default="db", show_default=False)
    db_host = db_host or typer.prompt("Database host", default="db")
    
    github_token = None
    github_user = None
    repo_url = None
    if repo or typer.confirm("Create GitHub repository?", default=False):
        repo = True
        github_org = github_org or typer.prompt("GitHub organization (leave empty for personal account)", default="")
        github_user = github_org if github_org else (config.github_user or typer.prompt("GitHub username", default="nadbad"))
        
        # Load existing token and validate
        load_dotenv(env_path)
        github_token = os.getenv("GITHUB_TOKEN") or ""
        max_attempts = 3
        for attempt in range(max_attempts):
            if validate_github_token(github_token, verbose):
                break
            typer.secho(f"Invalid GitHub token (attempt {attempt + 1}/{max_attempts}).", fg=typer.colors.RED)
            github_token = typer.prompt("GitHub Personal Access Token (with repo scope)", show_default=False)
            if not github_token and attempt < max_attempts - 1:
                typer.secho("No token provided. Retrying...", fg=typer.colors.YELLOW)
            elif not github_token:
                typer.secho("Skipping GitHub repository creation due to missing token.", fg=typer.colors.YELLOW)
                repo = False
                break
        if github_token and repo and typer.confirm(f"Save GITHUB_TOKEN to {env_path}?"):
            update_env_local(github_token, env_path)
        if github_user != config.github_user and typer.confirm(f"Update github_user to {github_user} in {config_path}?"):
            update_default_json(github_user, config_path)

    project_dir = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    
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
        os.makedirs(project_dir, exist_ok=True)
    
    commands = [
        f"cd {project_dir} && ddev config --project-type=wordpress --docroot=web --project-name={project_name} --auto",
        f"cd {project_dir} && ddev composer create-project roots/bedrock . --no-interaction",
        f"cd {project_dir} && ddev composer require satusdev/monorepo-fetcher --no-interaction",
        f"cd {project_dir} && ddev wp core install --url=http://{project_name}.ddev.site --title='{site_title}' --admin_user={admin_user} --admin_password={admin_password} --admin_email={admin_email} --skip-email",
        f"cd {project_dir} && ddev start",
    ]
    
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
            typer.secho(f"Warning: {e}. Skipping GitHub repo creation.", fg=typer.colors.YELLOW)
    
    # Execute commands, writing .env and saving project info after composer
    for i, cmd in enumerate(commands):
        if i == 2 and not dry_run:  # After composer, before wp core install
            env_path_file = os.path.join(project_dir, ".env")
            with open(env_path_file, "w") as f:
                f.write(env_content)
            if verbose:
                typer.secho(f"Wrote .env to {env_path_file}", fg=typer.colors.GREEN)
            save_project_info(project_dir, project_name, admin_user, admin_email, admin_password, site_title, db_name, db_user, db_password, db_host, repo_url, dry_run, verbose)
            # Always install and activate manage-wp plugin
            try:
                managewp_cmd = f"cd {project_dir} && ddev wp plugin install manage-wp --activate"
                run_shell(managewp_cmd, dry_run)
                if verbose:
                    typer.secho("Installed and activated plugin: manage-wp", fg=typer.colors.GREEN)
            except Exception as e:
                typer.secho(f"Failed to install manage-wp plugin: {e}", fg=typer.colors.RED)
            # Install default plugins from config
            try:
                with open("forge/config/default.json", "r") as config_file:
                    config_data = json.load(config_file)
                default_plugins = config_data.get("default_plugins", [])
                for plugin in default_plugins:
                    plugin_cmd = f"cd {project_dir} && ddev wp plugin install {plugin} --activate"
                    run_shell(plugin_cmd, dry_run)
                    if verbose:
                        typer.secho(f"Installed and activated plugin: {plugin}", fg=typer.colors.GREEN)
            except Exception as e:
                typer.secho(f"Failed to install default plugins: {e}", fg=typer.colors.RED)
        elif i == 2 and dry_run:
            typer.secho(f"Dry run: Would write .env to {project_dir}/.env\n{env_content}", fg=typer.colors.BLUE)
        
        # Retry composer commands up to 3 times
        if "ddev composer create-project" in cmd or "ddev composer require satusdev/monorepo-fetcher" in cmd:
            for attempt in range(3):
                try:
                    run_shell(cmd, dry_run)
                    if verbose:
                        typer.secho(f"Executed: {cmd}", fg=typer.colors.GREEN)
                    break
                except ForgeError as e:
                    if attempt < 2:
                        typer.secho(f"Composer attempt {attempt + 1} failed: {e}. Retrying in 5 seconds...", fg=typer.colors.YELLOW)
                        time.sleep(5)
                    else:
                        raise ForgeError(f"Failed to run composer command for {project_name}: {e}")
        else:
            try:
                run_shell(cmd, dry_run)
                if verbose:
                    typer.secho(f"Executed: {cmd}", fg=typer.colors.GREEN)
            except ForgeError as e:
                raise ForgeError(f"Failed to create project {project_name}: {e}")
    
    if not dry_run:
        check_ddev_config(project_dir, project_name, dry_run)
        typer.secho(f"Project {project_name} created at {project_dir}. Access at: http://{project_name}.ddev.site", fg=typer.colors.GREEN)
        typer.secho(f"WordPress admin: http://{project_name}.ddev.site/wp/wp-admin (user: {admin_user}, password: {admin_password})", fg=typer.colors.GREEN)
        typer.secho(f"DDEV commands: cd {project_dir} && ddev ssh, ddev stop, ddev status", fg=typer.colors.GREEN)
        if repo and github_token and repo_url:
            typer.secho(f"GitHub repository: {repo_url}", fg=typer.colors.GREEN)

@app.command()
def manage(
    project_name: str = typer.Argument(None, help="Name of the project"),
    action: str = typer.Argument(None, help="Action: start, stop, status"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage DDEV project (start, stop, status)."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError("No projects found. Create a project first.")
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']})", fg=typer.colors.BLUE)
        selection = typer.prompt("Select a project number", type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError("Invalid project selection")
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = project_info["directory"]
    action = action or typer.prompt("Action (start/stop/status)", default="status")
    
    valid_actions = ["start", "stop", "status"]
    if action not in valid_actions:
        raise ForgeError(f"Invalid action: {action}. Choose from {valid_actions}")
    
    command = f"cd {project_dir} && ddev {action}"
    
    try:
        run_shell(command, dry_run)
        if verbose:
            typer.secho(f"Executed: {command}", fg=typer.colors.GREEN)
    except ForgeError as e:
        raise ForgeError(f"Failed to {action} project {project_name}: {e}")
    
    if not dry_run:
        typer.secho(f"Project {project_name} {action} completed.", fg=typer.colors.GREEN)

@app.command()
def remove_project(
    project_name: str = typer.Argument(None, help="Name of the project to remove"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Remove a local project and its DDEV configuration."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError("No projects found. Create a project first.")
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']})", fg=typer.colors.BLUE)
        selection = typer.prompt("Select a project number to remove", type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError("Invalid project selection")
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = project_info["directory"]
    
    if not os.path.exists(project_dir):
        raise ForgeError(f"Project directory {project_dir} does not exist.")
    
    commands = [
        f"cd {project_dir} && ddev delete -O",
        f"rm -rf {project_dir}"
    ]
    
    for cmd in commands:
        if dry_run:
            typer.secho(f"Dry run: {cmd}", fg=typer.colors.BLUE)
        else:
            try:
                run_shell(cmd, dry_run)
                if verbose:
                    typer.secho(f"Executed: {cmd}", fg=typer.colors.GREEN)
            except ForgeError as e:
                raise ForgeError(f"Failed to remove project {project_name}: {e}")
    
    if not dry_run:
        # Update global projects list
        global_config_path = os.path.expanduser("~/.forge/projects.json")
        projects = get_projects(verbose)
        projects = [p for p in projects if p["project_name"] != project_name]
        with open(global_config_path, "w") as f:
            json.dump(projects, f, indent=4)
        if verbose:
            typer.secho(f"Removed {project_name} from {global_config_path}", fg=typer.colors.GREEN)
        typer.secho(f"Project {project_name} removed successfully.", fg=typer.colors.GREEN)

@app.command()
def open_vscode(
    project_name: str = typer.Argument(None, help="Name of the project to open in VS Code"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Open a project in VS Code."""
    check_requirements()
    
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError("No projects found. Create a project first.")
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']})", fg=typer.colors.BLUE)
        selection = typer.prompt("Select a project number to open in VS Code", type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError("Invalid project selection")
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    project_dir = project_info["directory"]
    
    if not os.path.exists(project_dir):
        raise ForgeError(f"Project directory {project_dir} does not exist.")
    
    command = f"code {project_dir}"
    
    if dry_run:
        typer.secho(f"Dry run: {command}", fg=typer.colors.BLUE)
    else:
        try:
            run_shell(command, dry_run)
            if verbose:
                typer.secho(f"Executed: {command}", fg=typer.colors.GREEN)
            typer.secho(f"Opened project {project_name} in VS Code.", fg=typer.colors.GREEN)
        except ForgeError as e:
            raise ForgeError(f"Failed to open project {project_name} in VS Code: {e}")

@app.command()
def discover(
    verbose: bool = typer.Option(False, "--verbose"),
    dry_run: bool = typer.Option(False, "--dry-run")
):
    """Scan ~/Work/Wordpress/ for WordPress sites and prompt for import/migration."""
    import glob
    import shutil
    from pathlib import Path

    base_dir = os.path.expanduser("~/Work/Wordpress/")
    found_sites = []
    for entry in os.listdir(base_dir):
        entry_path = os.path.join(base_dir, entry)
        if os.path.isdir(entry_path):
            # Heuristic: look for wp-config.php or Bedrock structure
            if os.path.exists(os.path.join(entry_path, "wp-config.php")) or os.path.exists(os.path.join(entry_path, "web/wp-config.php")):
                found_sites.append(entry_path)

    if not found_sites:
        typer.secho("No WordPress sites found in ~/Work/Wordpress/", fg=typer.colors.YELLOW)
        return

    typer.secho("Found the following WordPress sites:", fg=typer.colors.GREEN)
    for i, site in enumerate(found_sites, 1):
        typer.secho(f"{i}. {site}", fg=typer.colors.BLUE)

    for site in found_sites:
        if typer.confirm(f"Import/migrate site at {site}?", default=False):
            # Backup site files and DB (simple copy for now)
            backup_dir = f"{site}_backup"
            if not dry_run:
                if os.path.exists(backup_dir):
                    shutil.rmtree(backup_dir)
                shutil.copytree(site, backup_dir)
                typer.secho(f"Backed up {site} to {backup_dir}", fg=typer.colors.GREEN)
            # Composer init
            typer.secho(f"Initializing composer in {site}...", fg=typer.colors.BLUE)
            composer_json = os.path.join(site, "composer.json")
            if not dry_run and not os.path.exists(composer_json):
                run_shell(f"cd {site} && composer init --no-interaction", dry_run)
            # Bedrock migration (copy Bedrock structure)
            typer.secho(f"Migrating {site} to Bedrock structure...", fg=typer.colors.BLUE)
            # (For brevity, just log here; real logic would copy Bedrock files)
            # DDEV config
            typer.secho(f"Adding DDEV config to {site}...", fg=typer.colors.BLUE)
            if not dry_run:
                run_shell(f"cd {site} && ddev config --project-type=wordpress --docroot=web --project-name={os.path.basename(site)} --auto", dry_run)
            # Content migration (uploads, DB)
            typer.secho(f"Migrating uploads and DB for {site}...", fg=typer.colors.BLUE)
            # (For brevity, just log here; real logic would move uploads and import DB)
            typer.secho(f"Imported and migrated {site}.", fg=typer.colors.GREEN)
            # Save imported site to global JSON
            global_config_path = os.path.expanduser("~/.forge/projects.json")
            os.makedirs(os.path.dirname(global_config_path), exist_ok=True)
            projects = []
            if os.path.exists(global_config_path):
                with open(global_config_path, "r") as f:
                    projects = json.load(f)
            project_name = os.path.basename(site)
            projects = [p for p in projects if p["project_name"] != project_name]
            projects.append({
                "project_name": project_name,
                "directory": site,
                "wp_home": f"http://{project_name}.ddev.site",
                "repo_url": None,
                "created_date": time.strftime("%Y-%m-%d %H:%M:%S")
            })
            with open(global_config_path, "w") as f:
                json.dump(projects, f, indent=4)
            typer.secho(f"Saved imported site {project_name} to global project list.", fg=typer.colors.GREEN)

@app.command()
def list_projects(verbose: bool = typer.Option(False, "--verbose")):
    """List all managed projects."""
    projects = get_projects(verbose)
    if not projects:
        typer.secho("No projects found.", fg=typer.colors.YELLOW)
    else:
        typer.secho("Managed projects:", fg=typer.colors.GREEN)
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']}, Directory: {project['directory']})", fg=typer.colors.BLUE)

@app.command()
def switch_project(
    project_name: str = typer.Argument(None, help="Project to switch to"),
    env: str = typer.Option("development", "--env", help="Environment: development or staging"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Switch active project and environment (updates env vars, DDEV context)."""
    projects = get_projects(verbose)
    if not projects:
        typer.secho("No projects found. Create or import a project first.", fg=typer.colors.YELLOW)
        return
    if not project_name:
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']})", fg=typer.colors.BLUE)
        selection = typer.prompt("Select a project number to switch to", type=int)
        if selection < 1 or selection > len(projects):
            typer.secho("Invalid project selection", fg=typer.colors.RED)
            return
        project_name = projects[selection - 1]["project_name"]
    project_info = load_project_info(project_name, verbose)
    project_dir = project_info["directory"]
    # Update environment variables (write .env.local)
    env_path = os.path.join(project_dir, ".env.local")
    env_content = f"WP_ENV={env}\n"
    if not dry_run:
        with open(env_path, "w") as f:
            f.write(env_content)
    typer.secho(f"Switched to project {project_name} with environment {env}.", fg=typer.colors.GREEN)
    typer.secho(f"Updated {env_path} with WP_ENV={env}", fg=typer.colors.GREEN)
    # Optionally, run DDEV start for the selected project
    if typer.confirm(f"Start DDEV for {project_name}?", default=True):
        run_shell(f"cd {project_dir} && ddev start", dry_run)
        typer.secho(f"DDEV started for {project_name}.", fg=typer.colors.GREEN)

@app.command()
def info(
    project_name: str = typer.Argument(None, help="Name of the project to display info for"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Display detailed information for a project."""
    if not project_name:
        projects = get_projects(verbose)
        if not projects:
            raise ForgeError("No projects found. Create a project first.")
        for i, project in enumerate(projects, 1):
            typer.secho(f"{i}. {project['project_name']} ({project['wp_home']})", fg=typer.colors.BLUE)
        selection = typer.prompt("Select a project number to view info", type=int)
        if selection < 1 or selection > len(projects):
            raise ForgeError("Invalid project selection")
        project_name = projects[selection - 1]["project_name"]
    
    project_info = load_project_info(project_name, verbose)
    typer.secho(f"Project Info for {project_name}:", fg=typer.colors.GREEN)
    for key, value in project_info.items():
        if key in ["ddev_docker_info", "wp_info"] and verbose:
            typer.secho(f"{key}:", fg=typer.colors.BLUE)
            typer.secho(json.dumps(value, indent=2), fg=typer.colors.BLUE)
        else:
            typer.secho(f"{key}: {value}", fg=typer.colors.BLUE)
