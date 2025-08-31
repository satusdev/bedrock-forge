import typer
import os
import secrets
import string
from ..utils.shell import run_shell
from ..utils.config import load_config
from ..utils.api import create_github_repo
from ..utils.errors import ForgeError
import shutil
import subprocess

app = typer.Typer(name="local", help="Manage local projects with DDEV")

def generate_salt(length: int = 64) -> str:
    """Generate a secure random salt for WordPress, avoiding problematic characters."""
    # Use alphanumeric and safe punctuation, excluding single/double quotes and whitespace
    chars = string.ascii_letters + string.digits + "!#$%&()*+,-./:;<=>?@[]^_{}|~"
    return ''.join(secrets.choice(chars) for _ in range(length))

def check_requirements() -> None:
    """Check if required tools (DDEV, Docker, Git) are installed."""
    for cmd in ["ddev", "docker", "git"]:
        if not shutil.which(cmd):
            raise ForgeError(f"{cmd} is not installed. Please install it: https://ddev.readthedocs.io/en/stable/users/install/ for DDEV.")

def check_ddev_config(project_dir: str, project_name: str) -> None:
    """Verify DDEV configuration exists in project directory."""
    config_path = os.path.join(project_dir, ".ddev", "config.yaml")
    if not os.path.exists(config_path):
        raise ForgeError(f"DDEV configuration not found in {project_dir}. Ensure 'ddev config' runs successfully.")

def check_clean_directory(project_dir: str) -> None:
    """Ensure project directory is empty or contains only allowed files for Composer."""
    allowed_paths = {"web", "web/.gitignore", "web/wp-config-ddev.php", "web/wp-config.php"}
    if os.path.exists(project_dir):
        existing_paths = {os.path.relpath(os.path.join(root, name), project_dir) 
                         for root, _, files in os.walk(project_dir) for name in files + ['web']}
        invalid_paths = existing_paths - allowed_paths
        if invalid_paths:
            for path in invalid_paths:
                fpath = os.path.join(project_dir, path)
                if os.path.isdir(fpath):
                    shutil.rmtree(fpath)
                else:
                    os.remove(fpath)
            if invalid_paths:
                typer.echo(f"Cleaned invalid paths from {project_dir}: {', '.join(invalid_paths)}")

@app.command()
def create_project(
    project_name: str = typer.Argument(..., help="Name of the project"),
    repo: bool = typer.Option(False, "--repo", help="Create GitHub repository"),
    github_org: str = typer.Option("", "--github-org", help="GitHub organization (optional)"),
    admin_user: str = typer.Option("admin", "--admin-user", help="WordPress admin username"),
    admin_email: str = typer.Option("admin@example.com", "--admin-email", help="WordPress admin email"),
    admin_password: str = typer.Option("admin", "--admin-password", help="WordPress admin password"),
    site_title: str = typer.Option(None, "--site-title", help="WordPress site title (defaults to project name)"),
    db_name: str = typer.Option("db", "--db-name", help="Database name (default: db for DDEV)"),
    db_user: str = typer.Option("db", "--db-user", help="Database username (default: db for DDEV)"),
    db_password: str = typer.Option("db", "--db-password", help="Database password (default: db for DDEV)"),
    db_host: str = typer.Option("db", "--db-host", help="Database host (default: db for DDEV)"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Create a new Bedrock project with DDEV and set up WordPress."""
    check_requirements()
    
    config = load_config(project_name, "local")
    project_dir = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    site_title = site_title or project_name
    
    # Override defaults from config if available
    admin_user = getattr(config, "admin_user", admin_user)
    admin_email = getattr(config, "admin_email", admin_email)
    
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
    check_clean_directory(project_dir)
    os.makedirs(project_dir, exist_ok=True)
    
    commands = [
        f"cd {project_dir} && ddev config --project-type=wordpress --docroot=web --project-name={project_name} --auto",
        f"cd {project_dir} && ddev composer create-project roots/bedrock --no-interaction",
        f"cd {project_dir} && ddev wp core install --url=http://{project_name}.ddev.site --title='{site_title}' --admin_user={admin_user} --admin_password={admin_password} --admin_email={admin_email} --skip-email",
        f"cd {project_dir} && ddev start",
    ]
    
    if repo:
        github_owner = github_org if github_org else os.getenv("GITHUB_USER", getattr(config, "github_user", "your-username"))
        repo_url = create_github_repo(project_name, github_owner, dry_run, verbose)
        if repo_url and not dry_run:
            commands.extend([
                f"cd {project_dir} && git init",
                f"cd {project_dir} && git add .",
                f"cd {project_dir} && git commit -m 'Initial Bedrock project setup'",
                f"cd {project_dir} && git remote add origin {repo_url}",
                f"cd {project_dir} && git push -u origin main",
            ])
    
    # Execute commands, writing .env after composer
    for i, cmd in enumerate(commands):
        if i == 2 and not dry_run:  # After composer, before wp core install
            env_path = os.path.join(project_dir, ".env")
            with open(env_path, "w") as f:
                f.write(env_content)
            if verbose:
                typer.echo(f"Wrote .env to {env_path}")
        elif i == 2 and dry_run:
            typer.echo(f"Dry run: Would write .env to {project_dir}/.env\n{env_content}")
        
        # Retry composer command up to 3 times
        if "ddev composer create-project" in cmd:
            for attempt in range(3):
                try:
                    run_shell(cmd, dry_run)
                    if verbose:
                        typer.echo(f"Executed: {cmd}")
                    break
                except ForgeError as e:
                    if attempt < 2:
                        typer.echo(f"Composer attempt {attempt + 1} failed, retrying in 5 seconds...")
                        time.sleep(5)
                    else:
                        raise ForgeError(f"Failed to create project {project_name}: {e}")
        else:
            try:
                run_shell(cmd, dry_run)
                if verbose:
                    typer.echo(f"Executed: {cmd}")
            except ForgeError as e:
                raise ForgeError(f"Failed to create project {project_name}: {e}")
    
    if not dry_run:
        check_ddev_config(project_dir, project_name)
        typer.echo(f"Project {project_name} created at {project_dir}. Access at: http://{project_name}.ddev.site")
        typer.echo(f"WordPress admin: http://{project_name}.ddev.site/wp/wp-admin (user: {admin_user}, password: {admin_password})")
        typer.echo(f"DDEV commands: cd {project_dir} && ddev ssh, ddev stop, ddev status")
        if repo and repo_url:
            typer.echo(f"GitHub repository: {repo_url}")

@app.command()
def manage(
    project_name: str = typer.Argument(..., help="Name of the project"),
    action: str = typer.Argument(..., help="Action: start, stop, status"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Manage DDEV project (start, stop, status)."""
    check_requirements()
    
    valid_actions = ["start", "stop", "status"]
    if action not in valid_actions:
        raise ForgeError(f"Invalid action: {action}. Choose from {valid_actions}")
    
    config = load_config(project_name, "local")
    project_dir = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    command = f"cd {project_dir} && ddev {action}"
    
    try:
        run_shell(command, dry_run)
        if verbose:
            typer.echo(f"Executed: {command}")
    except ForgeError as e:
        raise ForgeError(f"Failed to {action} project {project_name}: {e}")
    
    if not dry_run:
        typer.echo(f"Project {project_name} {action} completed.")