"""
GitHub Integration Service for Bedrock Forge Dashboard.

This module provides comprehensive GitHub API integration for repository management,
deployment workflows, and collaboration features.
"""

import os
import json
import subprocess
import secrets
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

try:
    from github import Github, GithubException, Repository
    from git import Repo, GitCommandError
    GITHUB_AVAILABLE = True
except ImportError:
    GITHUB_AVAILABLE = False

from ..utils.logging import logger
from ..models.dashboard_project import GitHubIntegration


class GitHubService:
    """GitHub integration service."""
    
    # OAuth configuration
    GITHUB_OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
    GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
    GITHUB_API_USER_URL = "https://api.github.com/user"
    
    # OAuth state storage
    _oauth_states: Dict[str, Any] = {}

    def __init__(self, access_token: Optional[str] = None):
        """
        Initialize GitHub service.

        Args:
            access_token: GitHub personal access token
        """
        self.access_token = access_token or os.getenv("GITHUB_ACCESS_TOKEN")
        self.client = None
        self._user_info = None

        if GITHUB_AVAILABLE and self.access_token:
            try:
                self.client = Github(self.access_token)
                # Test authentication
                self.client.get_user().login
                logger.info("GitHub API authenticated successfully")
            except Exception as e:
                logger.error(f"Failed to authenticate with GitHub: {e}")
                self.client = None
        else:
            if not GITHUB_AVAILABLE:
                logger.warning("PyGithub library not available. Install with: pip install PyGithub")
            if not self.access_token:
                logger.warning("GitHub access token not provided")

    def authenticate(self, access_token: str) -> bool:
        """
        Authenticate or re-authenticate with a new access token.
        
        Args:
            access_token: GitHub personal access token or OAuth token
            
        Returns:
            True if authentication successful
        """
        if not GITHUB_AVAILABLE:
            logger.error("PyGithub library not available")
            return False
            
        try:
            self.access_token = access_token
            self.client = Github(access_token)
            # Test authentication by getting user
            user = self.client.get_user()
            self._user_info = {
                'login': user.login,
                'name': user.name,
                'email': user.email,
                'avatar_url': user.avatar_url
            }
            logger.info(f"GitHub API authenticated successfully as {user.login}")
            return True
        except Exception as e:
            logger.error(f"Failed to authenticate with GitHub: {e}")
            self.client = None
            self._user_info = None
            return False
    
    def get_auth_url(self, redirect_uri: Optional[str] = None, state: Optional[str] = None) -> str:
        """
        Generate GitHub OAuth authorization URL.
        
        Args:
            redirect_uri: OAuth callback URL
            state: Optional CSRF state parameter
            
        Returns:
            Authorization URL to redirect user to
        """
        client_id = os.getenv("GITHUB_CLIENT_ID")
        if not client_id:
            raise ValueError("GITHUB_CLIENT_ID environment variable not set")
        
        redirect_uri = redirect_uri or os.getenv(
            "GITHUB_OAUTH_REDIRECT_URI",
            "http://localhost:3000/settings"
        )
        
        # Generate state if not provided
        state = state or secrets.token_urlsafe(32)
        
        # Store state for verification
        GitHubService._oauth_states[state] = {
            'redirect_uri': redirect_uri,
            'created_at': datetime.utcnow()
        }
        
        params = {
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'scope': 'repo read:user user:email',
            'state': state,
        }
        
        auth_url = f"{self.GITHUB_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"
        logger.info(f"Generated GitHub OAuth URL with state: {state}")
        return auth_url
    
    def complete_auth(self, code: str, state: str) -> Dict[str, Any]:
        """
        Complete OAuth flow by exchanging code for access token.
        
        Args:
            code: Authorization code from GitHub callback
            state: State parameter from callback
            
        Returns:
            Dict with access token and user info
        """
        import requests
        
        client_id = os.getenv("GITHUB_CLIENT_ID")
        client_secret = os.getenv("GITHUB_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            raise ValueError("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set")
        
        # Verify state
        state_data = GitHubService._oauth_states.get(state)
        if state_data:
            del GitHubService._oauth_states[state]
        
        # Exchange code for token
        response = requests.post(
            self.GITHUB_OAUTH_TOKEN_URL,
            data={
                'client_id': client_id,
                'client_secret': client_secret,
                'code': code,
            },
            headers={'Accept': 'application/json'}
        )
        
        if response.status_code != 200:
            raise ValueError(f"GitHub token exchange failed: {response.text}")
        
        token_data = response.json()
        
        if 'error' in token_data:
            raise ValueError(f"GitHub OAuth error: {token_data.get('error_description', token_data['error'])}")
        
        access_token = token_data.get('access_token')
        
        # Authenticate with new token
        self.authenticate(access_token)
        
        return {
            'success': True,
            'access_token': access_token,
            'token_type': token_data.get('token_type', 'bearer'),
            'scope': token_data.get('scope'),
            'login': self._user_info.get('login') if self._user_info else None,
            'name': self._user_info.get('name') if self._user_info else None,
            'email': self._user_info.get('email') if self._user_info else None,
            'avatar_url': self._user_info.get('avatar_url') if self._user_info else None,
        }
    
    def get_user_info(self) -> Dict[str, Any]:
        """Get authenticated user's info."""
        if self._user_info:
            return self._user_info
        
        if not self.client:
            return {}
        
        try:
            user = self.client.get_user()
            self._user_info = {
                'login': user.login,
                'name': user.name,
                'email': user.email,
                'avatar_url': user.avatar_url
            }
            return self._user_info
        except Exception as e:
            logger.error(f"Failed to get GitHub user info: {e}")
            return {}
    
    def pull_changes(self, project_name: str, project_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Pull latest changes for a project.
        
        Args:
            project_name: Name of the project
            project_dir: Optional explicit path to project directory
            
        Returns:
            Result dict with status and message
        """
        # Resolve project directory
        if not project_dir:
            # Try common locations
            base_dirs = [
                Path(os.getenv('FORGE_BASE_DIR', '/home/nadbad/Work/Wordpress')),
                Path.home() / 'Work' / 'Wordpress',
                Path('/var/www'),
            ]
            
            for base in base_dirs:
                potential_path = base / project_name
                if potential_path.exists() and (potential_path / '.git').exists():
                    project_dir = potential_path
                    break
        
        if not project_dir or not project_dir.exists():
            return {
                'status': 'error',
                'message': f'Project directory not found for {project_name}'
            }
        
        success = self.pull_repository(project_dir)
        
        if success:
            return {
                'status': 'success',
                'message': f'Successfully pulled changes for {project_name}',
                'directory': str(project_dir)
            }
        else:
            return {
                'status': 'error',
                'message': f'Failed to pull changes for {project_name}'
            }
    
    def get_status(self, project_name: str, project_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Get git status for a project.
        
        Args:
            project_name: Name of the project
            project_dir: Optional explicit path to project directory
            
        Returns:
            Status dict with git information
        """
        # Resolve project directory
        if not project_dir:
            base_dirs = [
                Path(os.getenv('FORGE_BASE_DIR', '/home/nadbad/Work/Wordpress')),
                Path.home() / 'Work' / 'Wordpress',
                Path('/var/www'),
            ]
            
            for base in base_dirs:
                potential_path = base / project_name
                if potential_path.exists() and (potential_path / '.git').exists():
                    project_dir = potential_path
                    break
        
        if not project_dir or not project_dir.exists():
            return {
                'status': 'not_found',
                'message': f'Project directory not found for {project_name}'
            }
        
        return self.get_repository_status(project_dir)

    def is_authenticated(self) -> bool:
        """Check if GitHub API is authenticated."""
        return self.client is not None

    def get_repository(self, repo_url: str) -> Optional['Repository.Repository']:
        """
        Get GitHub repository from URL.

        Args:
            repo_url: GitHub repository URL

        Returns:
            Repository object or None if not found
        """
        if not self.is_authenticated():
            return None

        try:
            # Extract owner/repo from URL
            if "github.com/" in repo_url:
                parts = repo_url.strip("/").split("/")
                if len(parts) >= 2:
                    owner, repo = parts[-2], parts[-1]
                    # Remove .git if present
                    repo = repo.replace(".git", "")
                    return self.client.get_repo(f"{owner}/{repo}")
        except Exception as e:
            logger.error(f"Failed to get repository {repo_url}: {e}")

        return None

    def get_repository_info(self, repo_url: str) -> Dict[str, Any]:
        """
        Get comprehensive repository information.

        Args:
            repo_url: GitHub repository URL

        Returns:
            Repository information dictionary
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return {}

        try:
            return {
                "name": repo.name,
                "full_name": repo.full_name,
                "description": repo.description,
                "url": repo.html_url,
                "clone_url": repo.clone_url,
                "ssh_url": repo.ssh_url,
                "default_branch": repo.default_branch,
                "language": repo.language,
                "stars": repo.stargazers_count,
                "forks": repo.forks_count,
                "open_issues": repo.open_issues_count,
                "created_at": repo.created_at.isoformat() if repo.created_at else None,
                "updated_at": repo.updated_at.isoformat() if repo.updated_at else None,
                "pushed_at": repo.pushed_at.isoformat() if repo.pushed_at else None,
                "size": repo.size,
                "is_private": repo.private,
                "owner": {
                    "login": repo.owner.login,
                    "name": repo.owner.name,
                    "avatar_url": repo.owner.avatar_url
                }
            }
        except Exception as e:
            logger.error(f"Failed to get repository info: {e}")
            return {}

    def get_branches(self, repo_url: str) -> List[Dict[str, Any]]:
        """
        Get all branches for a repository.

        Args:
            repo_url: GitHub repository URL

        Returns:
            List of branch information
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return []

        branches = []
        try:
            for branch in repo.get_branches():
                branches.append({
                    "name": branch.name,
                    "commit": {
                        "sha": branch.commit.sha,
                        "message": branch.commit.commit.message,
                        "author": branch.commit.commit.author.name,
                        "date": branch.commit.commit.author.date.isoformat() if branch.commit.commit.author.date else None
                    },
                    "protected": branch.protected
                })
        except Exception as e:
            logger.error(f"Failed to get branches: {e}")

        return branches

    def get_commits(self, repo_url: str, branch: str = "main", limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent commits for a repository branch.

        Args:
            repo_url: GitHub repository URL
            branch: Branch name
            limit: Maximum number of commits to return

        Returns:
            List of commit information
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return []

        commits = []
        try:
            for commit in repo.get_commits(sha=branch)[:limit]:
                commits.append({
                    "sha": commit.sha,
                    "message": commit.commit.message,
                    "author": {
                        "name": commit.commit.author.name,
                        "email": commit.commit.author.email,
                        "date": commit.commit.author.date.isoformat() if commit.commit.author.date else None
                    },
                    "committer": {
                        "name": commit.commit.committer.name,
                        "email": commit.commit.committer.email,
                        "date": commit.commit.committer.date.isoformat() if commit.commit.committer.date else None
                    },
                    "url": commit.html_url,
                    "additions": commit.stats.additions if commit.stats else 0,
                    "deletions": commit.stats.deletions if commit.stats else 0,
                    "total": commit.stats.total if commit.stats else 0
                })
        except Exception as e:
            logger.error(f"Failed to get commits: {e}")

        return commits

    def get_pull_requests(self, repo_url: str, state: str = "open") -> List[Dict[str, Any]]:
        """
        Get pull requests for a repository.

        Args:
            repo_url: GitHub repository URL
            state: Pull request state (open, closed, all)

        Returns:
            List of pull request information
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return []

        prs = []
        try:
            for pr in repo.get_pulls(state=state):
                prs.append({
                    "number": pr.number,
                    "title": pr.title,
                    "body": pr.body,
                    "state": pr.state,
                    "user": {
                        "login": pr.user.login,
                        "name": pr.user.name,
                        "avatar_url": pr.user.avatar_url
                    },
                    "head": {
                        "ref": pr.head.ref,
                        "sha": pr.head.sha
                    },
                    "base": {
                        "ref": pr.base.ref,
                        "sha": pr.base.sha
                    },
                    "created_at": pr.created_at.isoformat() if pr.created_at else None,
                    "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
                    "url": pr.html_url,
                    "mergeable": pr.mergeable,
                    "merged": pr.merged,
                    "merge_commit_sha": pr.merge_commit_sha
                })
        except Exception as e:
            logger.error(f"Failed to get pull requests: {e}")

        return prs

    def create_webhook(self, repo_url: str, webhook_url: str, events: List[str] = None) -> Optional[Dict[str, Any]]:
        """
        Create a webhook for a repository.

        Args:
            repo_url: GitHub repository URL
            webhook_url: URL to receive webhook events
            events: List of events to subscribe to

        Returns:
            Webhook information or None if failed
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return None

        if events is None:
            events = ["push", "pull_request", "release"]

        try:
            webhook = repo.create_hook(
                "web",
                {
                    "url": webhook_url,
                    "content_type": "json"
                },
                events=events,
                active=True
            )

            return {
                "id": webhook.id,
                "url": webhook.url,
                "events": webhook.events,
                "active": webhook.active,
                "created_at": webhook.created_at.isoformat() if webhook.created_at else None
            }
        except Exception as e:
            logger.error(f"Failed to create webhook: {e}")
            return None

    def get_webhooks(self, repo_url: str) -> List[Dict[str, Any]]:
        """
        Get all webhooks for a repository.

        Args:
            repo_url: GitHub repository URL

        Returns:
            List of webhook information
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return []

        webhooks = []
        try:
            for webhook in repo.get_hooks():
                webhooks.append({
                    "id": webhook.id,
                    "url": webhook.url,
                    "events": webhook.events,
                    "active": webhook.active,
                    "created_at": webhook.created_at.isoformat() if webhook.created_at else None,
                    "updated_at": webhook.updated_at.isoformat() if webhook.updated_at else None
                })
        except Exception as e:
            logger.error(f"Failed to get webhooks: {e}")

        return webhooks

    def clone_repository(self, repo_url: str, target_dir: Path, branch: str = "main") -> bool:
        """
        Clone a repository to a local directory.

        Args:
            repo_url: GitHub repository URL
            target_dir: Target directory for cloning
            branch: Branch to clone

        Returns:
            True if successful, False otherwise
        """
        try:
            if target_dir.exists():
                logger.warning(f"Target directory {target_dir} already exists")
                return False

            # Use SSH if available, otherwise HTTPS
            if self.access_token and "github.com" in repo_url:
                # Convert HTTPS to authenticated URL
                if repo_url.startswith("https://"):
                    repo_url = repo_url.replace("https://", f"https://{self.access_token}@")

            repo = Repo.clone_from(repo_url, target_dir, branch=branch)
            logger.info(f"Successfully cloned {repo_url} to {target_dir}")
            return True

        except GitCommandError as e:
            logger.error(f"Failed to clone repository: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error cloning repository: {e}")
            return False

    def pull_repository(self, repo_dir: Path, branch: str = "main") -> bool:
        """
        Pull latest changes for a repository.

        Args:
            repo_dir: Local repository directory
            branch: Branch to pull

        Returns:
            True if successful, False otherwise
        """
        try:
            if not repo_dir.exists():
                logger.error(f"Repository directory {repo_dir} does not exist")
                return False

            repo = Repo(repo_dir)

            # Check if we're on the correct branch
            if repo.active_branch.name != branch:
                repo.git.checkout(branch)

            # Pull changes
            origin = repo.remotes.origin
            origin.pull()

            logger.info(f"Successfully pulled changes for {repo_dir}")
            return True

        except GitCommandError as e:
            logger.error(f"Failed to pull repository: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error pulling repository: {e}")
            return False

    def get_repository_status(self, repo_dir: Path) -> Dict[str, Any]:
        """
        Get status of a local repository.

        Args:
            repo_dir: Local repository directory

        Returns:
            Repository status information
        """
        try:
            if not repo_dir.exists():
                return {"status": "not_found"}

            repo = Repo(repo_dir)

            # Get current branch
            current_branch = repo.active_branch.name

            # Check if there are uncommitted changes
            is_dirty = repo.is_dirty()
            has_untracked_files = len(repo.untracked_files) > 0

            # Get ahead/behind information
            try:
                ahead_behind = repo.git.rev_list('--count', '--left-right', f'origin/{current_branch}...HEAD')
                behind, ahead = map(int, ahead_behind.split('\t'))
            except:
                ahead = behind = 0

            # Get last commit info
            last_commit = repo.head.commit
            last_commit_info = {
                "sha": last_commit.hexsha,
                "message": last_commit.message,
                "author": str(last_commit.author),
                "date": last_commit.committed_datetime.isoformat()
            }

            return {
                "status": "ok",
                "branch": current_branch,
                "is_dirty": is_dirty,
                "has_untracked_files": has_untracked_files,
                "ahead": ahead,
                "behind": behind,
                "last_commit": last_commit_info,
                "untracked_files": repo.untracked_files if has_untracked_files else []
            }

        except Exception as e:
            logger.error(f"Failed to get repository status: {e}")
            return {"status": "error", "error": str(e)}

    def create_deployment(self, repo_url: str, ref: str, environment: str, description: str = "") -> Optional[Dict[str, Any]]:
        """
        Create a deployment on GitHub.

        Args:
            repo_url: GitHub repository URL
            ref: Git ref (branch, tag, or SHA)
            environment: Environment name
            description: Deployment description

        Returns:
            Deployment information or None if failed
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return None

        try:
            deployment = repo.create_deployment(
                ref=ref,
                environment=environment,
                description=description
            )

            return {
                "id": deployment.id,
                "sha": deployment.sha,
                "ref": deployment.ref,
                "environment": deployment.environment,
                "description": deployment.description,
                "created_at": deployment.created_at.isoformat() if deployment.created_at else None,
                "url": deployment.url
            }
        except Exception as e:
            logger.error(f"Failed to create deployment: {e}")
            return None

    def get_deployments(self, repo_url: str, environment: str = None) -> List[Dict[str, Any]]:
        """
        Get deployments for a repository.

        Args:
            repo_url: GitHub repository URL
            environment: Filter by environment (optional)

        Returns:
            List of deployment information
        """
        repo = self.get_repository(repo_url)
        if not repo:
            return []

        deployments = []
        try:
            for deployment in repo.get_deployments():
                if environment and deployment.environment != environment:
                    continue

                deployments.append({
                    "id": deployment.id,
                    "sha": deployment.sha,
                    "ref": deployment.ref,
                    "environment": deployment.environment,
                    "description": deployment.description,
                    "created_at": deployment.created_at.isoformat() if deployment.created_at else None,
                    "updated_at": deployment.updated_at.isoformat() if deployment.updated_at else None,
                    "url": deployment.url
                })
        except Exception as e:
            logger.error(f"Failed to get deployments: {e}")

        # Sort by creation date (newest first)
        deployments.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return deployments


# Global GitHub service instance
_github_service = None

def get_github_service(access_token: str = None) -> GitHubService:
    """Get or create GitHub service instance."""
    global _github_service
    if _github_service is None or access_token:
        _github_service = GitHubService(access_token)
    return _github_service