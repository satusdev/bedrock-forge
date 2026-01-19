"""
GitHub Integration API routes.

This module contains GitHub authentication and repository management endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, List, Annotated, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db, User, OAuthToken, OAuthProvider
from ....utils.logging import logger
from ...github_integration import get_github_service, GITHUB_AVAILABLE
from ...deps import get_current_active_user

router = APIRouter()


@router.get("/auth/status")
async def get_github_auth_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get GitHub authentication status."""
    try:
        if not GITHUB_AVAILABLE:
            return {"authenticated": False, "available": False, "message": "PyGithub library not installed"}
        
        # Check database for stored token
        result = await db.execute(
            select(OAuthToken).where(
                OAuthToken.user_id == current_user.id,
                OAuthToken.provider == OAuthProvider.GITHUB
            )
        )
        token = result.scalar_one_or_none()
        
        if token:
            # Try to use stored token
            github_service = get_github_service()
            if github_service.authenticate(token.access_token):
                return {
                    "authenticated": True,
                    "available": True,
                    "login": token.account_id,
                    "name": token.account_name,
                    "email": token.account_email
                }
        
        # Check if service has valid authentication
        github_service = get_github_service()
        return {
            "authenticated": github_service.is_authenticated() if github_service else False,
            "available": True
        }
    except Exception as e:
        logger.error(f"Error getting GitHub auth status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/url")
async def get_github_auth_url(
    redirect_uri: Optional[str] = Query(None, description="OAuth callback URL")
):
    """Get GitHub OAuth authorization URL."""
    try:
        if not GITHUB_AVAILABLE:
            raise HTTPException(status_code=400, detail="GitHub integration not available")
        
        github_service = get_github_service()
        auth_url = github_service.get_auth_url(redirect_uri=redirect_uri)
        
        return {"auth_url": auth_url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting GitHub auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth")
async def authenticate_github(
    auth_data: Dict[str, Any],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Authenticate with GitHub using access token (PAT) or OAuth code.
    
    For PAT: {"token": "ghp_xxxx"}
    For OAuth: {"code": "oauth_code", "state": "state_param"}
    """
    try:
        if not GITHUB_AVAILABLE:
            raise HTTPException(status_code=400, detail="GitHub integration not available")
        
        github_service = get_github_service()
        
        # Check if this is OAuth callback or PAT
        if auth_data.get("code"):
            # OAuth code flow
            code = auth_data.get("code")
            state = auth_data.get("state", "")
            
            result = github_service.complete_auth(code, state)
            
            if result.get('success'):
                # Delete existing token
                existing = await db.execute(
                    select(OAuthToken).where(
                        OAuthToken.user_id == current_user.id,
                        OAuthToken.provider == OAuthProvider.GITHUB
                    )
                )
                existing_token = existing.scalar_one_or_none()
                if existing_token:
                    await db.delete(existing_token)
                
                # Save to database
                oauth_token = OAuthToken(
                    user_id=current_user.id,
                    provider=OAuthProvider.GITHUB,
                    access_token=result['access_token'],
                    token_type=result.get('token_type', 'bearer'),
                    scope=result.get('scope'),
                    account_id=result.get('login'),
                    account_email=result.get('email'),
                    account_name=result.get('name'),
                )
                db.add(oauth_token)
                await db.flush()
                
                return {
                    "status": "success",
                    "message": "GitHub connected successfully",
                    "login": result.get('login'),
                    "name": result.get('name'),
                    "email": result.get('email')
                }
            else:
                raise HTTPException(status_code=401, detail="OAuth flow failed")
        
        elif auth_data.get("token"):
            # Personal Access Token flow
            token = auth_data.get("token")
            
            success = github_service.authenticate(token)
            
            if success:
                user_info = github_service.get_user_info()
                
                # Delete existing token
                existing = await db.execute(
                    select(OAuthToken).where(
                        OAuthToken.user_id == current_user.id,
                        OAuthToken.provider == OAuthProvider.GITHUB
                    )
                )
                existing_token = existing.scalar_one_or_none()
                if existing_token:
                    await db.delete(existing_token)
                
                # Save to database
                oauth_token = OAuthToken(
                    user_id=current_user.id,
                    provider=OAuthProvider.GITHUB,
                    access_token=token,
                    token_type='bearer',
                    account_id=user_info.get('login'),
                    account_email=user_info.get('email'),
                    account_name=user_info.get('name'),
                )
                db.add(oauth_token)
                await db.flush()
                
                return {
                    "status": "success",
                    "message": "GitHub authenticated successfully",
                    "login": user_info.get('login'),
                    "name": user_info.get('name')
                }
            else:
                raise HTTPException(status_code=401, detail="Authentication failed")
        else:
            raise HTTPException(status_code=400, detail="Token or code is required")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authenticating with GitHub: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/disconnect")
async def disconnect_github(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Disconnect GitHub integration."""
    try:
        result = await db.execute(
            select(OAuthToken).where(
                OAuthToken.user_id == current_user.id,
                OAuthToken.provider == OAuthProvider.GITHUB
            )
        )
        token = result.scalar_one_or_none()
        
        if token:
            await db.delete(token)
            await db.flush()
        
        return {"status": "success", "message": "GitHub disconnected"}
    except Exception as e:
        logger.error(f"Error disconnecting GitHub: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos/info")
async def get_github_repository_info(repo_url: str):
    """Get GitHub repository information."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        info = github_service.get_repository_info(repo_url)
        return info
    except Exception as e:
        logger.error(f"Error getting repository info for {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos/branches")
async def get_github_branches(repo_url: str):
    """Get GitHub repository branches."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        branches = github_service.get_branches(repo_url)
        return {"branches": branches}
    except Exception as e:
        logger.error(f"Error getting branches for {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos/commits")
async def get_github_commits(repo_url: str, branch: str = "main", limit: int = 10):
    """Get GitHub repository commits."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        commits = github_service.get_commits(repo_url, branch, limit)
        return {"commits": commits}
    except Exception as e:
        logger.error(f"Error getting commits for {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos/pull-requests")
async def get_github_pull_requests(repo_url: str, state: str = "open"):
    """Get GitHub repository pull requests."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        prs = github_service.get_pull_requests(repo_url, state)
        return {"pull_requests": prs}
    except Exception as e:
        logger.error(f"Error getting pull requests for {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repos/clone")
async def clone_github_repository(repo_url: str, clone_data: Dict[str, Any]):
    """Clone GitHub repository to local directory."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        target_dir = clone_data.get("target_directory")
        branch = clone_data.get("branch", "main")
        
        result = github_service.clone_repository(repo_url, target_dir, branch)
        return result
    except Exception as e:
        logger.error(f"Error cloning repository {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/pull")
async def pull_project_changes(project_name: str, pull_data: Dict[str, Any] = None):
    """Pull latest changes for a project repository."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        result = github_service.pull_changes(project_name)
        return result
    except Exception as e:
        logger.error(f"Error pulling changes for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/status")
async def get_project_git_status(project_name: str):
    """Get Git status for a project."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        status = github_service.get_status(project_name)
        return status
    except Exception as e:
        logger.error(f"Error getting git status for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhooks")
async def create_github_webhook(webhook_data: Dict[str, Any]):
    """Create a GitHub webhook."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        result = github_service.create_webhook(webhook_data)
        return result
    except Exception as e:
        logger.error(f"Error creating webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/webhooks")
async def get_github_webhooks(repo_url: str):
    """Get GitHub repository webhooks."""
    try:
        github_service = get_github_service()
        if not github_service:
            raise HTTPException(status_code=400, detail="GitHub not configured")
        
        webhooks = github_service.get_webhooks(repo_url)
        return {"webhooks": webhooks}
    except Exception as e:
        logger.error(f"Error getting webhooks for {repo_url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_name}/integration")
async def update_github_integration(project_name: str, github_data: Dict[str, Any]):
    """Update GitHub integration for a project."""
    try:
        # TODO: Implement with database
        return {
            "status": "success",
            "message": f"GitHub integration updated for {project_name}"
        }
    except Exception as e:
        logger.error(f"Error updating GitHub integration for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
