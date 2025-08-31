import requests
from .config import load_config
from .errors import ForgeError
import typer

def create_github_repo(project_name: str, owner: str, dry_run: bool = False, verbose: bool = False) -> str | None:
    """Create a GitHub repository and return its SSH URL."""
    config = load_config()
    github_token = config.github_token or os.getenv("GITHUB_TOKEN")
    
    if not github_token:
        raise ForgeError("GITHUB_TOKEN not found in config or environment")
    
    url = "https://api.github.com/user/repos" if not owner else f"https://api.github.com/orgs/{owner}/repos"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {
        "name": project_name,
        "private": True,
        "auto_init": True
    }
    
    if dry_run:
        typer.echo(f"Dry run: Would create GitHub repo {owner}/{project_name}")
        return None
    
    try:
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        repo_url = response.json().get("ssh_url")
        if verbose:
            typer.echo(f"Created GitHub repo: {repo_url}")
        return repo_url
    except requests.RequestException as e:
        raise ForgeError(f"Failed to create GitHub repo: {e}")
