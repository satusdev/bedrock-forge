"""
Settings API routes.

Provides endpoints for managing system-wide settings, including SSH identity.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....services.ssh_service import SSHKeyService
from ....utils.logging import logger

router = APIRouter()

class SSHKeyUpdateRequest(BaseModel):
    private_key: str

class SSHKeyResponse(BaseModel):
    configured: bool
    public_key: Optional[str] = None
    key_type: Optional[str] = None

@router.get("/ssh-key", response_model=SSHKeyResponse)
async def get_system_ssh_key(db: AsyncSession = Depends(get_db)):
    """Get the current system SSH public key."""
    try:
        keys = await SSHKeyService.get_system_key(db)
        if keys:
            return SSHKeyResponse(
                configured=True,
                public_key=keys.get("public_key"),
                key_type="Configured" # We could store/parse type better if needed
            )
        return SSHKeyResponse(configured=False)
    except Exception as e:
        logger.error(f"Error fetching system SSH key: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/ssh-key", response_model=SSHKeyResponse)
async def update_system_ssh_key(
    request: SSHKeyUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update the system SSH private key.
    Validates the key and derives the public key.
    """
    try:
        result = await SSHKeyService.set_system_key(db, request.private_key)
        
        return SSHKeyResponse(
            configured=True,
            public_key=result.get("public_key"),
            key_type=result.get("type")
        )
    except Exception as e:
        logger.error(f"Error updating system SSH key: {e}")
        raise HTTPException(status_code=400, detail=str(e))
