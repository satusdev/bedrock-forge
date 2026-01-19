"""
Credentials API routes.

CRUD operations for WordPress credentials with encrypted storage
and quick login functionality.
"""
from datetime import datetime, timedelta
from typing import Annotated, List, Optional
import uuid
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from ....db import get_db, User, Project
from ....db.models.project_server import ProjectServer
from ....db.models.wp_credential import WPCredential, CredentialStatus
from ....utils.logging import logger
from ....utils.crypto import encrypt_credential, decrypt_credential, generate_nonce
from ...deps import get_current_active_user

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================

class WPCredentialCreate(BaseModel):
    """Schema for creating a WordPress credential."""
    project_server_id: int
    label: str = "Admin"
    username: str
    password: str
    notes: Optional[str] = None


class WPCredentialUpdate(BaseModel):
    """Schema for updating a WordPress credential."""
    label: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    notes: Optional[str] = None


class WPCredentialRead(BaseModel):
    """Schema for reading a WordPress credential (no sensitive data)."""
    id: int
    project_server_id: int
    label: str
    username: str  # Username is shown, password is not
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class QuickLoginRequest(BaseModel):
    """Request for generating a quick login URL."""
    method: str = Field(
        default="auto",
        description="Login method: 'auto' (MU-plugin), 'redirect' (form), 'manual' (credentials)"
    )
    duration_minutes: int = Field(
        default=5,
        ge=1,
        le=60,
        description="Token validity duration in minutes"
    )


class QuickLoginResponse(BaseModel):
    """Response with quick login information."""
    method: str
    login_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    expires_at: Optional[datetime] = None
    instructions: str


# Store quick login tokens (in-memory for now, use Redis in production)
_quick_login_tokens: dict = {}


# ============================================================================
# Helper Functions
# ============================================================================

async def _get_credential_or_404(
    credential_id: int,
    db: AsyncSession,
    current_user: User
) -> WPCredential:
    """Get credential by ID with ownership verification."""
    result = await db.execute(
        select(WPCredential)
        .join(ProjectServer)
        .join(Project)
        .where(
            WPCredential.id == credential_id,
            Project.owner_id == current_user.id
        )
        .options(selectinload(WPCredential.project_server))
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credential not found"
        )
    return credential


async def _get_project_server_or_404(
    project_server_id: int,
    db: AsyncSession,
    current_user: User
) -> ProjectServer:
    """Get project-server link with ownership verification."""
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(
            ProjectServer.id == project_server_id,
            Project.owner_id == current_user.id
        )
        .options(selectinload(ProjectServer.server))
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project-server link not found"
        )
    return ps


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.get("/{project_server_id}/credentials", response_model=List[WPCredentialRead])
async def list_credentials(
    project_server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List all credentials for a project-server link."""
    # Verify ownership
    await _get_project_server_or_404(project_server_id, db, current_user)
    
    result = await db.execute(
        select(WPCredential)
        .where(WPCredential.project_server_id == project_server_id)
        .order_by(WPCredential.label)
    )
    credentials = result.scalars().all()
    
    return [
        WPCredentialRead(
            id=c.id,
            project_server_id=c.project_server_id,
            label=c.label,
            username=c.username_encrypted,  # We'll decrypt in a moment
            status=c.status.value,
            notes=c.notes,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in credentials
    ]


@router.post("/{project_server_id}/credentials", response_model=WPCredentialRead, status_code=status.HTTP_201_CREATED)
async def create_credential(
    project_server_id: int,
    credential_data: WPCredentialCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new WordPress credential."""
    # Verify ownership
    ps = await _get_project_server_or_404(project_server_id, db, current_user)
    
    # Encrypt username and password
    username_encrypted, username_salt = encrypt_credential(
        credential_data.username, current_user.id
    )
    password_encrypted, password_salt = encrypt_credential(
        credential_data.password, current_user.id
    )
    
    credential = WPCredential(
        project_server_id=project_server_id,
        user_id=current_user.id,
        label=credential_data.label,
        username_encrypted=username_encrypted,
        username_salt=username_salt,
        password_encrypted=password_encrypted,
        password_salt=password_salt,
        notes=credential_data.notes,
        status=CredentialStatus.ACTIVE
    )
    
    db.add(credential)
    await db.flush()
    await db.refresh(credential)
    
    logger.info(f"Credential '{credential_data.label}' created for project-server {project_server_id}")
    
    return WPCredentialRead(
        id=credential.id,
        project_server_id=credential.project_server_id,
        label=credential.label,
        username=credential_data.username,  # Return unencrypted username
        status=credential.status.value,
        notes=credential.notes,
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


@router.get("/{project_server_id}/credentials/{credential_id}", response_model=WPCredentialRead)
async def get_credential(
    project_server_id: int,
    credential_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get a specific credential."""
    credential = await _get_credential_or_404(credential_id, db, current_user)
    
    # Decrypt username
    username = decrypt_credential(
        credential.username_encrypted,
        credential.username_salt,
        current_user.id
    )
    
    return WPCredentialRead(
        id=credential.id,
        project_server_id=credential.project_server_id,
        label=credential.label,
        username=username,
        status=credential.status.value,
        notes=credential.notes,
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


@router.put("/{project_server_id}/credentials/{credential_id}", response_model=WPCredentialRead)
async def update_credential(
    project_server_id: int,
    credential_id: int,
    update_data: WPCredentialUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update a credential."""
    credential = await _get_credential_or_404(credential_id, db, current_user)
    
    if update_data.label is not None:
        credential.label = update_data.label
    
    if update_data.username is not None:
        username_encrypted, username_salt = encrypt_credential(
            update_data.username, current_user.id
        )
        credential.username_encrypted = username_encrypted
        credential.username_salt = username_salt
    
    if update_data.password is not None:
        password_encrypted, password_salt = encrypt_credential(
            update_data.password, current_user.id
        )
        credential.password_encrypted = password_encrypted
        credential.password_salt = password_salt
    
    if update_data.notes is not None:
        credential.notes = update_data.notes
    
    await db.flush()
    await db.refresh(credential)
    
    # Decrypt username for response
    username = decrypt_credential(
        credential.username_encrypted,
        credential.username_salt,
        current_user.id
    )
    
    logger.info(f"Credential {credential_id} updated")
    
    return WPCredentialRead(
        id=credential.id,
        project_server_id=credential.project_server_id,
        label=credential.label,
        username=username,
        status=credential.status.value,
        notes=credential.notes,
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


@router.delete("/{project_server_id}/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    project_server_id: int,
    credential_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete a credential."""
    credential = await _get_credential_or_404(credential_id, db, current_user)
    await db.delete(credential)
    logger.info(f"Credential {credential_id} deleted")


# ============================================================================
# Quick Login Endpoints
# ============================================================================

@router.post("/{project_server_id}/credentials/{credential_id}/quick-login")
async def generate_quick_login(
    project_server_id: int,
    credential_id: int,
    request: QuickLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """
    Generate a quick login URL for the specified credential.
    
    Methods:
    - 'auto': Install temporary MU-plugin for auto-login (most secure)
    - 'redirect': Generate prefilled login form redirect (medium security)
    - 'manual': Return decrypted credentials to copy-paste (least secure)
    """
    credential = await _get_credential_or_404(credential_id, db, current_user)
    ps = credential.project_server
    
    # Decrypt credentials
    username = decrypt_credential(
        credential.username_encrypted,
        credential.username_salt,
        current_user.id
    )
    password = decrypt_credential(
        credential.password_encrypted,
        credential.password_salt,
        current_user.id
    )
    
    # Base WordPress URL
    wp_url = ps.wp_url.rstrip('/')
    wp_login_url = f"{wp_url}/wp-login.php"
    
    expires_at = datetime.utcnow() + timedelta(minutes=request.duration_minutes)
    
    if request.method == "manual":
        # Just return the credentials
        return QuickLoginResponse(
            method="manual",
            login_url=wp_login_url,
            username=username,
            password=password,
            expires_at=None,  # No expiry for manual
            instructions=f"Go to {wp_login_url} and enter the credentials above."
        )
    
    elif request.method == "redirect":
        # Generate a form redirect URL (uses browser form POST)
        # This exposes password in URL parameters temporarily
        token = generate_nonce(32)
        _quick_login_tokens[token] = {
            "username": username,
            "password": password,
            "wp_url": wp_url,
            "expires_at": expires_at
        }
        
        # Generate a redirect URL through our API
        redirect_url = f"/api/v1/credentials/quick-login/{token}"
        
        return QuickLoginResponse(
            method="redirect",
            login_url=redirect_url,
            token=token,
            expires_at=expires_at,
            instructions="Click the login URL to be automatically redirected to WordPress login."
        )
    
    else:  # auto method - MU-plugin
        # Generate a one-time token
        token = generate_nonce(64)
        
        # Store token for validation
        _quick_login_tokens[token] = {
            "username": username,
            "credential_id": credential_id,
            "expires_at": expires_at,
            "used": False
        }
        
        # The MU-plugin needs to be installed on the target site
        # It will validate the token against our API
        auto_login_url = f"{wp_url}/?forge_autologin={token}"
        
        return QuickLoginResponse(
            method="auto",
            login_url=auto_login_url,
            token=token,
            expires_at=expires_at,
            instructions=(
                "This requires the Forge Auto-Login MU-plugin installed on the target site. "
                "Click the URL to be automatically logged in."
            )
        )


@router.get("/quick-login/{token}")
async def validate_quick_login(token: str):
    """
    Validate a quick login token and return an HTML form for auto-submit.
    
    This is used for the 'redirect' method - returns an HTML page that
    auto-submits the login form.
    """
    token_data = _quick_login_tokens.get(token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired token"
        )
    
    if datetime.utcnow() > token_data["expires_at"]:
        del _quick_login_tokens[token]
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Token has expired"
        )
    
    # Delete token after use (one-time use)
    del _quick_login_tokens[token]
    
    wp_url = token_data["wp_url"]
    username = token_data["username"]
    password = token_data["password"]
    
    # Return auto-submitting HTML form
    from fastapi.responses import HTMLResponse
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Logging in...</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }}
            .loader {{
                text-align: center;
            }}
            .spinner {{
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: white;
                animation: spin 1s ease-in-out infinite;
                margin: 0 auto 20px;
            }}
            @keyframes spin {{
                to {{ transform: rotate(360deg); }}
            }}
        </style>
    </head>
    <body>
        <div class="loader">
            <div class="spinner"></div>
            <p>Logging you in...</p>
        </div>
        <form id="loginForm" method="POST" action="{wp_url}/wp-login.php" style="display:none;">
            <input type="hidden" name="log" value="{username}" />
            <input type="hidden" name="pwd" value="{password}" />
            <input type="hidden" name="rememberme" value="forever" />
            <input type="hidden" name="redirect_to" value="{wp_url}/wp-admin/" />
        </form>
        <script>
            document.getElementById('loginForm').submit();
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html)


@router.post("/quick-login/{token}/validate")
async def validate_autologin_token(token: str):
    """
    API endpoint for MU-plugin to validate an auto-login token.
    
    The MU-plugin calls this to verify the token is valid and get
    the username to log in.
    """
    token_data = _quick_login_tokens.get(token)
    
    if not token_data:
        return {"valid": False, "error": "Invalid token"}
    
    if datetime.utcnow() > token_data["expires_at"]:
        del _quick_login_tokens[token]
        return {"valid": False, "error": "Token expired"}
    
    if token_data.get("used"):
        return {"valid": False, "error": "Token already used"}
    
    # Mark as used
    _quick_login_tokens[token]["used"] = True
    
    return {
        "valid": True,
        "username": token_data["username"]
    }
