"""
CyberPanel API routes.

Provides REST API endpoints for CyberPanel server management including:
- Website management
- Database management  
- User management with local credential caching
- Package and ACL management
"""
import secrets
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, EmailStr, Field

from ....utils.logging import logger
from ....utils.crypto import encrypt_credential, decrypt_credential
from ....db.session import get_db
from ....db.models.server import Server
from ....db.models.cyberpanel_user import CyberPanelUser, CyberPanelUserStatus, CyberPanelUserType
from ....services.cyberpanel_service import CyberPanelService
from ...deps import get_current_user
from ....db.models.user import User
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

router = APIRouter()


# ===== Request/Response Models =====

class CreateWebsiteRequest(BaseModel):
    domain: str
    email: str
    php_version: str = "8.1"
    package: str = "Default"
    ssl: bool = True


class CreateDatabaseRequest(BaseModel):
    domain: str
    db_name: str
    db_user: str
    db_password: str


class PHPVersionRequest(BaseModel):
    php_version: str


class CreateCyberPanelUserRequest(BaseModel):
    """Request to create a new CyberPanel user."""
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    email: EmailStr
    password: Optional[str] = Field(None, min_length=8, description="If not provided, a secure password will be generated")
    first_name: str = ""
    last_name: str = ""
    user_type: str = Field("user", pattern=r'^(admin|reseller|user)$')
    websites_limit: int = Field(0, ge=0, description="0 = unlimited")
    disk_limit: int = Field(0, ge=0, description="Disk limit in MB, 0 = unlimited")
    bandwidth_limit: int = Field(0, ge=0, description="Bandwidth limit in MB, 0 = unlimited")
    package_name: str = "Default"
    notes: Optional[str] = None


class UpdateCyberPanelUserRequest(BaseModel):
    """Request to update a CyberPanel user."""
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    websites_limit: Optional[int] = Field(None, ge=0)
    disk_limit: Optional[int] = Field(None, ge=0)
    bandwidth_limit: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    """Request to change a user's password."""
    new_password: Optional[str] = Field(None, min_length=8, description="If not provided, a secure password will be generated")


class CyberPanelUserResponse(BaseModel):
    """Response model for CyberPanel user."""
    id: int
    server_id: int
    username: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    full_name: str
    user_type: str
    acl_name: Optional[str]
    status: str
    has_password: bool
    password_set_at: Optional[str]
    password_out_of_sync: bool
    synced_from_panel: bool
    last_synced_at: Optional[str]
    package_name: Optional[str]
    limits: Dict[str, Any]
    is_over_quota: bool
    notes: Optional[str]
    created_at: Optional[str]
    
    class Config:
        from_attributes = True


async def get_cyberpanel_service(server_id: int, db: AsyncSession) -> CyberPanelService:
    """Get CyberPanel service for a server."""
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if not server.panel_type or server.panel_type.value != "cyberpanel":
        raise HTTPException(status_code=400, detail="Server is not configured as CyberPanel")
    
    
    return await CyberPanelService.from_server(server, db)


@router.get("/servers/{server_id}/verify")
async def verify_cyberpanel_connection(server_id: int, db: AsyncSession = Depends(get_db)):
    """Verify CyberPanel API connection for a server."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        verified = await service.verify_connection()
        
        # Update verification status in database
        result = await db.execute(select(Server).where(Server.id == server_id))
        server = result.scalar_one_or_none()
        
        if server:
            server.panel_verified = verified
            await db.commit()
        
        await service.close()
        
        return {
            "verified": verified,
            "server_id": server_id,
            "message": "Connection verified" if verified else "Connection failed"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying CyberPanel connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/websites")
async def list_websites(server_id: int, db: AsyncSession = Depends(get_db)):
    """List all websites on the CyberPanel server."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        websites = await service.list_websites()
        await service.close()
        
        return {
            "websites": websites,
            "total": len(websites)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing websites: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/websites")
async def create_website(
    server_id: int, 
    request: CreateWebsiteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new website on the CyberPanel server."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.create_website(
            domain=request.domain,
            email=request.email,
            php_version=request.php_version,
            package=request.package,
            ssl=request.ssl
        )
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "domain": request.domain,
                "message": f"Website {request.domain} created successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating website: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/servers/{server_id}/websites/{domain}")
async def delete_website(
    server_id: int, 
    domain: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a website from the CyberPanel server."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.delete_website(domain)
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "message": f"Website {domain} deleted successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting website: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/websites/{domain}/ssl")
async def issue_ssl_certificate(
    server_id: int, 
    domain: str,
    db: AsyncSession = Depends(get_db)
):
    """Issue SSL certificate for a website."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.issue_ssl(domain)
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "domain": domain,
                "message": "SSL certificate issued successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error issuing SSL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/websites/{domain}/stats")
async def get_website_stats(
    server_id: int, 
    domain: str,
    db: AsyncSession = Depends(get_db)
):
    """Get website statistics (bandwidth, disk usage)."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.get_website_stats(domain)
        await service.close()
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting website stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/servers/{server_id}/websites/{domain}/php")
async def change_php_version(
    server_id: int, 
    domain: str,
    request: PHPVersionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Change PHP version for a website."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.change_php_version(domain, request.php_version)
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "domain": domain,
                "php_version": request.php_version
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing PHP version: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/databases")
async def list_databases(server_id: int, db: AsyncSession = Depends(get_db)):
    """List all databases on the CyberPanel server."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        databases = await service.list_databases_detailed()
        await service.close()
        
        return {
            "databases": databases,
            "total": len(databases)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing databases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/databases")
async def create_database(
    server_id: int, 
    request: CreateDatabaseRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new MySQL database."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.create_database(
            domain=request.domain,
            db_name=request.db_name,
            db_user=request.db_user,
            db_password=request.db_password
        )
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "database": request.db_name,
                "user": request.db_user,
                "message": "Database created successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/servers/{server_id}/databases/{db_name}")
async def delete_database(
    server_id: int,
    db_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a MySQL database."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.delete_database(db_name)
        await service.close()
        
        if result.get("success"):
            return {
                "status": "success",
                "database": db_name,
                "message": "Database deleted successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/wordpress")
async def scan_wordpress_sites(server_id: int, db: AsyncSession = Depends(get_db)):
    """Scan server for WordPress installations."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        wp_sites = await service.scan_wordpress_sites()
        await service.close()
        
        return {
            "wordpress_sites": wp_sites,
            "total": len(wp_sites)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning WordPress sites: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/info")
async def get_server_info(server_id: int, db: AsyncSession = Depends(get_db)):
    """Get CyberPanel server system information."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        info = await service.get_server_info()
        await service.close()
        
        if info.get("success"):
            return info
        else:
            raise HTTPException(status_code=400, detail=info.get("error"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting server info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== USER MANAGEMENT ROUTES =====

def generate_secure_password(length: int = 16) -> str:
    """Generate a secure random password."""
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.get("/servers/{server_id}/users")
async def list_cyberpanel_users(
    server_id: int,
    sync: bool = Query(False, description="Sync users from CyberPanel before returning"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all CyberPanel users for a server.
    
    If sync=True, fetches fresh data from CyberPanel and updates local cache.
    Otherwise returns cached data from database.
    """
    try:
        # Get server
        result = await db.execute(select(Server).where(Server.id == server_id))
        server = result.scalar_one_or_none()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        if sync:
            # Sync from CyberPanel
            service = await get_cyberpanel_service(server_id, db)
            panel_users = await service.list_users()
            await service.close()
            
            # Update local cache
            now = datetime.utcnow()
            panel_usernames = set()
            
            for pu in panel_users:
                panel_usernames.add(pu['userName'])
                
                # Check if user exists locally
                result = await db.execute(
                    select(CyberPanelUser).where(
                        CyberPanelUser.server_id == server_id,
                        CyberPanelUser.username == pu['userName']
                    )
                )
                local_user = result.scalar_one_or_none()
                
                # Map user type
                user_type = CyberPanelUserType.USER
                if pu.get('type') == 'admin':
                    user_type = CyberPanelUserType.ADMIN
                elif pu.get('type') == 'reseller':
                    user_type = CyberPanelUserType.RESELLER
                
                if local_user:
                    # Update existing
                    local_user.email = pu.get('email', local_user.email)
                    local_user.first_name = pu.get('firstName', '')
                    local_user.last_name = pu.get('lastName', '')
                    local_user.user_type = user_type
                    local_user.acl_name = pu.get('acl')
                    local_user.websites_limit = pu.get('websitesLimit', 0)
                    local_user.websites_count = pu.get('websitesCount', 0)
                    local_user.disk_limit = pu.get('diskLimit', 0)
                    local_user.bandwidth_limit = pu.get('bandwidthLimit', 0)
                    local_user.last_synced_at = now
                    if local_user.status == CyberPanelUserStatus.DELETED:
                        local_user.status = CyberPanelUserStatus.ACTIVE
                else:
                    # Create new (discovered from panel)
                    new_user = CyberPanelUser(
                        server_id=server_id,
                        username=pu['userName'],
                        email=pu.get('email', ''),
                        first_name=pu.get('firstName', ''),
                        last_name=pu.get('lastName', ''),
                        user_type=user_type,
                        acl_name=pu.get('acl'),
                        websites_limit=pu.get('websitesLimit', 0),
                        websites_count=pu.get('websitesCount', 0),
                        disk_limit=pu.get('diskLimit', 0),
                        bandwidth_limit=pu.get('bandwidthLimit', 0),
                        synced_from_panel=True,
                        last_synced_at=now,
                        status=CyberPanelUserStatus.ACTIVE
                    )
                    db.add(new_user)
            
            # Mark users not in panel as deleted
            result = await db.execute(
                select(CyberPanelUser).where(
                    CyberPanelUser.server_id == server_id,
                    CyberPanelUser.status != CyberPanelUserStatus.DELETED
                )
            )
            local_users = result.scalars().all()
            for lu in local_users:
                if lu.username not in panel_usernames:
                    lu.status = CyberPanelUserStatus.DELETED
                    lu.last_synced_at = now
            
            await db.commit()
        
        # Return users from database
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.status != CyberPanelUserStatus.DELETED
            ).order_by(CyberPanelUser.username)
        )
        users = result.scalars().all()
        
        return {
            "users": [u.to_dict() for u in users],
            "total": len(users),
            "synced": sync
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing CyberPanel users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/users")
async def create_cyberpanel_user(
    server_id: int,
    request: CreateCyberPanelUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new CyberPanel user.
    
    Creates user in CyberPanel and stores encrypted password locally.
    Returns the password once - must be saved immediately.
    """
    try:
        # Generate password if not provided
        password = request.password or generate_secure_password()
        
        # Create in CyberPanel
        service = await get_cyberpanel_service(server_id, db)
        result = await service.create_user(
            username=request.username,
            email=request.email,
            password=password,
            first_name=request.first_name,
            last_name=request.last_name,
            user_type=request.user_type,
            websites_limit=request.websites_limit,
            disk_limit=request.disk_limit,
            bandwidth_limit=request.bandwidth_limit,
            package_name=request.package_name
        )
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to create user"))
        
        # Get server for encryption key
        server_result = await db.execute(select(Server).where(Server.id == server_id))
        server = server_result.scalar_one_or_none()
        
        # Map user type
        user_type = CyberPanelUserType.USER
        if request.user_type == 'admin':
            user_type = CyberPanelUserType.ADMIN
        elif request.user_type == 'reseller':
            user_type = CyberPanelUserType.RESELLER
        
        # Create local record with encrypted password
        now = datetime.utcnow()
        encrypted_password = encrypt_credential(password, str(server.owner_id))
        
        new_user = CyberPanelUser(
            server_id=server_id,
            created_by_id=current_user.id,
            username=request.username,
            email=request.email,
            first_name=request.first_name,
            last_name=request.last_name,
            user_type=user_type,
            password_encrypted=encrypted_password,
            password_set_at=now,
            password_last_changed_at=now,
            websites_limit=request.websites_limit,
            disk_limit=request.disk_limit,
            bandwidth_limit=request.bandwidth_limit,
            package_name=request.package_name,
            synced_from_panel=False,
            last_synced_at=now,
            status=CyberPanelUserStatus.ACTIVE,
            notes=request.notes
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Return with password (only time it's shown)
        response = new_user.to_dict()
        response["password"] = password
        response["password_notice"] = "Save this password now! It will not be shown again unless you reveal it."
        
        return {
            "status": "success",
            "message": f"User {request.username} created successfully",
            "user": response
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating CyberPanel user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/users/{username}")
async def get_cyberpanel_user(
    server_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific CyberPanel user."""
    try:
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return user.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting CyberPanel user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/servers/{server_id}/users/{username}")
async def update_cyberpanel_user(
    server_id: int,
    username: str,
    request: UpdateCyberPanelUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a CyberPanel user's details."""
    try:
        # Get local user
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        
        if not local_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update in CyberPanel
        service = await get_cyberpanel_service(server_id, db)
        result = await service.update_user(
            username=username,
            email=request.email,
            first_name=request.first_name,
            last_name=request.last_name,
            websites_limit=request.websites_limit,
            disk_limit=request.disk_limit,
            bandwidth_limit=request.bandwidth_limit
        )
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to update user"))
        
        # Update local record
        if request.email is not None:
            local_user.email = request.email
        if request.first_name is not None:
            local_user.first_name = request.first_name
        if request.last_name is not None:
            local_user.last_name = request.last_name
        if request.websites_limit is not None:
            local_user.websites_limit = request.websites_limit
        if request.disk_limit is not None:
            local_user.disk_limit = request.disk_limit
        if request.bandwidth_limit is not None:
            local_user.bandwidth_limit = request.bandwidth_limit
        if request.notes is not None:
            local_user.notes = request.notes
        
        local_user.last_synced_at = datetime.utcnow()
        await db.commit()
        await db.refresh(local_user)
        
        return {
            "status": "success",
            "message": f"User {username} updated successfully",
            "user": local_user.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating CyberPanel user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/servers/{server_id}/users/{username}")
async def delete_cyberpanel_user(
    server_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a CyberPanel user."""
    try:
        # Get local user
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        
        # Delete from CyberPanel
        service = await get_cyberpanel_service(server_id, db)
        result = await service.delete_user(username)
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to delete user"))
        
        # Mark local user as deleted (keep for audit)
        if local_user:
            local_user.status = CyberPanelUserStatus.DELETED
            local_user.last_synced_at = datetime.utcnow()
            await db.commit()
        
        return {
            "status": "success",
            "message": f"User {username} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting CyberPanel user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/users/{username}/password")
async def change_cyberpanel_user_password(
    server_id: int,
    username: str,
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Change a CyberPanel user's password.
    
    Returns the new password once - must be saved immediately.
    """
    try:
        # Generate password if not provided
        new_password = request.new_password or generate_secure_password()
        
        # Change in CyberPanel
        service = await get_cyberpanel_service(server_id, db)
        result = await service.change_user_password(username, new_password)
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to change password"))
        
        # Update local record
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        
        if local_user:
            # Get server for encryption key
            server_result = await db.execute(select(Server).where(Server.id == server_id))
            server = server_result.scalar_one_or_none()
            
            now = datetime.utcnow()
            local_user.password_encrypted = encrypt_credential(new_password, str(server.owner_id))
            local_user.password_last_changed_at = now
            local_user.password_out_of_sync = False
            await db.commit()
        
        return {
            "status": "success",
            "message": f"Password changed for {username}",
            "password": new_password,
            "password_notice": "Save this password now! It will not be shown again unless you reveal it."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/users/{username}/reveal-password")
async def reveal_cyberpanel_user_password(
    server_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reveal the stored password for a CyberPanel user.
    
    Only works for users created via Forge (password stored locally).
    Requires explicit action for security.
    """
    try:
        # Get local user
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        
        if not local_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not local_user.has_password:
            raise HTTPException(
                status_code=400, 
                detail="No password stored for this user. User was discovered from CyberPanel, not created via Forge."
            )
        
        # Get server for decryption key
        server_result = await db.execute(select(Server).where(Server.id == server_id))
        server = server_result.scalar_one_or_none()
        
        # Decrypt password
        try:
            password = decrypt_credential(local_user.password_encrypted, str(server.owner_id))
        except Exception as e:
            logger.error(f"Failed to decrypt password: {e}")
            raise HTTPException(status_code=500, detail="Failed to decrypt password")
        
        return {
            "username": username,
            "password": password,
            "password_set_at": local_user.password_set_at.isoformat() if local_user.password_set_at else None,
            "password_last_changed_at": local_user.password_last_changed_at.isoformat() if local_user.password_last_changed_at else None,
            "warning": "Handle this password securely. Consider changing it if you suspect it has been compromised."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revealing password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/users/{username}/suspend")
async def suspend_cyberpanel_user(
    server_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Suspend a CyberPanel user (disable login)."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.suspend_user(username)
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to suspend user"))
        
        # Update local status
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        if local_user:
            local_user.status = CyberPanelUserStatus.SUSPENDED
            await db.commit()
        
        return {
            "status": "success",
            "message": f"User {username} suspended"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error suspending user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/servers/{server_id}/users/{username}/unsuspend")
async def unsuspend_cyberpanel_user(
    server_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Unsuspend a CyberPanel user (enable login)."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        result = await service.unsuspend_user(username)
        await service.close()
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to unsuspend user"))
        
        # Update local status
        result = await db.execute(
            select(CyberPanelUser).where(
                CyberPanelUser.server_id == server_id,
                CyberPanelUser.username == username
            )
        )
        local_user = result.scalar_one_or_none()
        if local_user:
            local_user.status = CyberPanelUserStatus.ACTIVE
            await db.commit()
        
        return {
            "status": "success",
            "message": f"User {username} unsuspended"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsuspending user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/packages")
async def list_cyberpanel_packages(
    server_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List available CyberPanel packages."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        packages = await service.list_packages()
        await service.close()
        
        return {
            "packages": packages,
            "total": len(packages)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/servers/{server_id}/acls")
async def list_cyberpanel_acls(
    server_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List available CyberPanel ACLs (Access Control Lists)."""
    try:
        service = await get_cyberpanel_service(server_id, db)
        acls = await service.list_acls()
        await service.close()
        
        return {
            "acls": acls,
            "total": len(acls)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing ACLs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
