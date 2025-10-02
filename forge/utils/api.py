import requests
import typer
from forge.utils.errors import ForgeError

def validate_github_token(github_token: str, verbose: bool) -> bool:
    """Validate GitHub token by checking user endpoint."""
    if not github_token:
        return False
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    try:
        response = requests.get("https://api.github.com/user", headers=headers)
        response.raise_for_status()
        if verbose:
            typer.secho(f"GitHub token validated successfully for user: {response.json().get('login')}", fg=typer.colors.GREEN)
        return True
    except requests.RequestException as e:
        typer.secho(f"Invalid GitHub token: {e}", fg=typer.colors.RED)
        return False

def check_repo_exists(project_name: str, owner: str, github_token: str, verbose: bool) -> bool:
    """Check if a repository already exists."""
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    url = f"https://api.github.com/repos/{owner}/{project_name}"
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            typer.secho(f"Repository {owner}/{project_name} already exists.", fg=typer.colors.YELLOW)
            return True
        return False
    except requests.RequestException as e:
        typer.secho(f"Error checking repository existence: {e}", fg=typer.colors.YELLOW)
        return False

def create_github_repo(project_name: str, owner: str, github_token: str, dry_run: bool, verbose: bool) -> str:
    """Create a GitHub repository and return its URL."""
    if dry_run:
        typer.secho(f"Dry run: Would create GitHub repo {project_name} for {owner}", fg=typer.colors.BLUE)
        return f"https://github.com/{owner}/{project_name}.git"
    
    if not validate_github_token(github_token, verbose):
        raise ForgeError("Invalid GitHub token provided. Ensure it has 'repo' scope.")

    if check_repo_exists(project_name, owner, github_token, verbose):
        return f"https://github.com/{owner}/{project_name}.git"

    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {
        "name": project_name,
        "private": True,
        "auto_init": True
    }
    
    url = f"https://api.github.com/orgs/{owner}/repos"
    try:
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 404:  # Not an organization
            url = "https://api.github.com/user/repos"
            response = requests.post(url, json=data, headers=headers)
        if response.status_code == 422:
            error_message = response.json().get("message", "Unknown error")
            raise ForgeError(f"Failed to create GitHub repo: 422 Client Error: {error_message}")
        response.raise_for_status()
        repo_url = response.json().get("clone_url")
        if verbose:
            typer.secho(f"Created GitHub repo: {repo_url}", fg=typer.colors.GREEN)
        return repo_url
    except requests.RequestException as e:
        raise ForgeError(f"Failed to create GitHub repo: {e}")