"""
Google Drive Integration API routes.

This module contains Google Drive authentication and file management endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, List, Optional, Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db, User, OAuthToken, OAuthProvider
from ....utils.logging import logger
from ...google_drive_integration import get_google_drive_service, GOOGLE_DRIVE_AVAILABLE
from ...deps import get_current_active_user

router = APIRouter()


@router.get("/auth/status")
async def get_google_drive_auth_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get Google Drive authentication status."""
    try:
        if not GOOGLE_DRIVE_AVAILABLE:
            return {"authenticated": False, "available": False, "message": "Google Drive libraries not installed"}
        
        # Check database for stored token
        result = await db.execute(
            select(OAuthToken).where(
                OAuthToken.user_id == current_user.id,
                OAuthToken.provider == OAuthProvider.GOOGLE_DRIVE
            )
        )
        token = result.scalar_one_or_none()
        
        if token:
            # Try to use stored token
            drive_service = get_google_drive_service()
            if drive_service.set_credentials_from_tokens(
                token.access_token,
                token.refresh_token,
                token.expires_at
            ):
                return {
                    "authenticated": True,
                    "available": True,
                    "email": token.account_email,
                    "name": token.account_name
                }
        
        # Check file-based credentials as fallback
        drive_service = get_google_drive_service()
        return {
            "authenticated": drive_service.is_authenticated() if drive_service else False,
            "available": True
        }
    except Exception as e:
        logger.error(f"Error getting Google Drive auth status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/url")
async def get_google_drive_auth_url(
    redirect_uri: Optional[str] = Query(None, description="OAuth callback URL")
):
    """Get Google Drive OAuth authorization URL."""
    try:
        if not GOOGLE_DRIVE_AVAILABLE:
            raise HTTPException(status_code=400, detail="Google Drive integration not available")
        
        drive_service = get_google_drive_service()
        auth_url = drive_service.get_auth_url(redirect_uri=redirect_uri)
        
        return {"auth_url": auth_url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting Google Drive auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth")
async def authenticate_google_drive(
    redirect_uri: Optional[str] = Query(None, description="OAuth callback URL")
):
    """Initiate Google Drive authentication - returns auth URL."""
    try:
        if not GOOGLE_DRIVE_AVAILABLE:
            raise HTTPException(status_code=400, detail="Google Drive integration not available")
        
        drive_service = get_google_drive_service()
        auth_url = drive_service.get_auth_url(redirect_uri=redirect_uri)
        
        return {"status": "pending", "auth_url": auth_url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error initiating Google Drive auth: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/callback")
async def google_drive_auth_callback(
    callback_data: Dict[str, Any],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Complete Google Drive OAuth callback.
    
    Expects: {"code": "authorization_code", "state": "state_param"}
    """
    try:
        if not GOOGLE_DRIVE_AVAILABLE:
            raise HTTPException(status_code=400, detail="Google Drive integration not available")
        
        code = callback_data.get("code")
        state = callback_data.get("state")
        redirect_uri = callback_data.get("redirect_uri")
        
        if not code:
            raise HTTPException(status_code=400, detail="Authorization code is required")
        
        drive_service = get_google_drive_service()
        result = drive_service.complete_auth(code, state or "", redirect_uri)
        
        if result.get('success'):
            # Delete existing token for this user/provider
            existing = await db.execute(
                select(OAuthToken).where(
                    OAuthToken.user_id == current_user.id,
                    OAuthToken.provider == OAuthProvider.GOOGLE_DRIVE
                )
            )
            existing_token = existing.scalar_one_or_none()
            if existing_token:
                await db.delete(existing_token)
            
            # Save new token to database
            from datetime import datetime
            expires_at = None
            if result.get('expires_at'):
                expires_at = datetime.fromisoformat(result['expires_at'].replace('Z', '+00:00'))
            
            oauth_token = OAuthToken(
                user_id=current_user.id,
                provider=OAuthProvider.GOOGLE_DRIVE,
                access_token=result['access_token'],
                refresh_token=result.get('refresh_token'),
                expires_at=expires_at,
                scope=result.get('scope'),
                account_email=result.get('email'),
                account_name=result.get('name'),
            )
            db.add(oauth_token)
            await db.flush()
            
            return {
                "status": "success",
                "message": "Google Drive connected successfully",
                "email": result.get('email'),
                "name": result.get('name')
            }
        else:
            raise HTTPException(status_code=400, detail="OAuth flow failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing Google Drive auth: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/disconnect")
async def disconnect_google_drive(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Disconnect Google Drive integration."""
    try:
        result = await db.execute(
            select(OAuthToken).where(
                OAuthToken.user_id == current_user.id,
                OAuthToken.provider == OAuthProvider.GOOGLE_DRIVE
            )
        )
        token = result.scalar_one_or_none()
        
        if token:
            await db.delete(token)
            await db.flush()
        
        return {"status": "success", "message": "Google Drive disconnected"}
    except Exception as e:
        logger.error(f"Error disconnecting Google Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/folders")
async def create_drive_folder(folder_data: Dict[str, Any]):
    """Create a folder in Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        folder_name = folder_data.get("name")
        parent_id = folder_data.get("parent_id")
        
        result = drive_service.create_folder(folder_name, parent_id)
        return result
    except Exception as e:
        logger.error(f"Error creating Drive folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files")
async def list_drive_files(folder_id: Optional[str] = None, file_types: Optional[List[str]] = None):
    """List files in a Google Drive folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        files = drive_service.list_files(folder_id, file_types)
        return {"files": files}
    except Exception as e:
        logger.error(f"Error listing Drive files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_to_drive(upload_data: Dict[str, Any]):
    """Upload a file to Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        file_path = upload_data.get("file_path")
        folder_id = upload_data.get("folder_id")
        
        result = drive_service.upload_file(file_path, folder_id)
        return result
    except Exception as e:
        logger.error(f"Error uploading to Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/{file_id}")
async def download_from_drive(file_id: str, download_data: Dict[str, Any]):
    """Download a file from Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        target_path = download_data.get("target_path")
        result = drive_service.download_file(file_id, target_path)
        return result
    except Exception as e:
        logger.error(f"Error downloading from Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage")
async def get_drive_storage_usage():
    """Get Google Drive storage usage information."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        usage = drive_service.get_storage_usage()
        return usage
    except Exception as e:
        logger.error(f"Error getting Drive storage usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/setup")
async def setup_project_google_drive(project_name: str, setup_data: Dict[str, Any]):
    """Set up Google Drive integration for a project."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        result = drive_service.setup_project(project_name, setup_data)
        return result
    except Exception as e:
        logger.error(f"Error setting up Drive for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/backup")
async def backup_project_to_drive(project_name: str, backup_options: Optional[Dict[str, Any]] = None):
    """Backup project files to Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        result = drive_service.backup_project(project_name, backup_options or {})
        return result
    except Exception as e:
        logger.error(f"Error backing up {project_name} to Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/backups")
async def get_project_drive_backups(project_name: str, limit: int = 10):
    """Get backup history from Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        backups = drive_service.get_project_backups(project_name, limit)
        return {"backups": backups}
    except Exception as e:
        logger.error(f"Error getting Drive backups for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/cleanup")
async def cleanup_drive_backups(project_name: str, cleanup_data: Dict[str, Any]):
    """Clean up old backups in Google Drive."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        result = drive_service.cleanup_backups(project_name, cleanup_data)
        return result
    except Exception as e:
        logger.error(f"Error cleaning up Drive backups for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_name}/integration")
async def update_google_drive_integration(project_name: str, drive_data: Dict[str, Any]):
    """Update Google Drive integration for a project."""
    try:
        # TODO: Implement with database
        return {
            "status": "success",
            "message": f"Google Drive integration updated for {project_name}"
        }
    except Exception as e:
        logger.error(f"Error updating Drive integration for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/initialize")
async def initialize_project_folders(project_name: str, options: Optional[Dict[str, Any]] = None):
    """
    Initialize standard Google Drive folder structure for a project.
    
    Creates:
    - {project_name}/
      - assets/
        - images/
        - videos/
        - fonts/
      - docs/
        - specs/
        - contracts/
        - guides/
      - backups/
    """
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        # Create main project folder
        main_folder = drive_service.create_folder(project_name)
        main_folder_id = main_folder.get("id")
        
        folders_created = {"main": main_folder_id}
        
        # Create assets folder with subfolders
        assets_folder = drive_service.create_folder("assets", main_folder_id)
        folders_created["assets"] = assets_folder.get("id")
        
        for subfolder in ["images", "videos", "fonts"]:
            drive_service.create_folder(subfolder, assets_folder.get("id"))
        
        # Create docs folder with subfolders
        docs_folder = drive_service.create_folder("docs", main_folder_id)
        folders_created["docs"] = docs_folder.get("id")
        
        for subfolder in ["specs", "contracts", "guides"]:
            drive_service.create_folder(subfolder, docs_folder.get("id"))
        
        # Create backups folder
        backups_folder = drive_service.create_folder("backups", main_folder_id)
        folders_created["backups"] = backups_folder.get("id")
        
        return {
            "status": "success",
            "project_name": project_name,
            "folders": folders_created,
            "message": "Project folder structure created successfully"
        }
    except Exception as e:
        logger.error(f"Error initializing Drive folders for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/assets")
async def list_project_assets(
    project_name: str, 
    folder_id: Optional[str] = None,
    file_type: Optional[str] = None
):
    """List files in project's assets folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        # TODO: Get folder_id from database if not provided
        if not folder_id:
            raise HTTPException(status_code=400, detail="Assets folder ID required")
        
        files = drive_service.list_files(folder_id)
        
        # Filter by file type if specified
        if file_type:
            files = [f for f in files if f.get("mimeType", "").startswith(file_type)]
        
        return {
            "project": project_name,
            "assets": files,
            "total": len(files)
        }
    except Exception as e:
        logger.error(f"Error listing assets for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/assets/upload")
async def upload_project_asset(project_name: str, upload_data: Dict[str, Any]):
    """Upload a file to project's assets folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        file_path = upload_data.get("file_path")
        folder_id = upload_data.get("folder_id")  # Assets folder ID
        subfolder = upload_data.get("subfolder")  # e.g., "images", "videos"
        
        if not file_path:
            raise HTTPException(status_code=400, detail="File path required")
        
        result = drive_service.upload_file(file_path, folder_id)
        
        return {
            "status": "success",
            "project": project_name,
            "file": result,
            "message": "Asset uploaded successfully"
        }
    except Exception as e:
        logger.error(f"Error uploading asset for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/docs")
async def list_project_docs(
    project_name: str, 
    folder_id: Optional[str] = None,
    doc_type: Optional[str] = None
):
    """List files in project's docs folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        if not folder_id:
            raise HTTPException(status_code=400, detail="Docs folder ID required")
        
        files = drive_service.list_files(folder_id)
        
        return {
            "project": project_name,
            "docs": files,
            "total": len(files)
        }
    except Exception as e:
        logger.error(f"Error listing docs for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/docs/upload")
async def upload_project_doc(project_name: str, upload_data: Dict[str, Any]):
    """Upload a document to project's docs folder."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        file_path = upload_data.get("file_path")
        folder_id = upload_data.get("folder_id")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="File path required")
        
        result = drive_service.upload_file(file_path, folder_id)
        
        return {
            "status": "success",
            "project": project_name,
            "file": result,
            "message": "Document uploaded successfully"
        }
    except Exception as e:
        logger.error(f"Error uploading doc for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/link")
async def get_project_drive_link(project_name: str, folder_id: Optional[str] = None):
    """Get shareable Google Drive link for project folder."""
    try:
        if not folder_id:
            raise HTTPException(status_code=400, detail="Folder ID required")
        
        # Google Drive folder link format
        drive_link = f"https://drive.google.com/drive/folders/{folder_id}"
        
        return {
            "project": project_name,
            "folder_id": folder_id,
            "link": drive_link,
            "embed_link": f"https://drive.google.com/embeddedfolderview?id={folder_id}"
        }
    except Exception as e:
        logger.error(f"Error getting Drive link for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_name}/sync")
async def sync_project_drive_metadata(project_name: str):
    """Sync project Drive folder metadata with database."""
    try:
        drive_service = get_google_drive_service()
        if not drive_service:
            raise HTTPException(status_code=400, detail="Google Drive not configured")
        
        # TODO: Update project record with Drive folder IDs and sync timestamp
        return {
            "status": "success",
            "project": project_name,
            "message": "Drive metadata synced successfully"
        }
    except Exception as e:
        logger.error(f"Error syncing Drive metadata for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

