"""
Client Portal Authentication API routes.

Separate auth system for client users (not admin Users).
"""
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request, Header
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt

from ....db import get_db
from ....db.models.client_user import ClientUser
from ....db.models.client import Client
from ....core.config import settings
from ....utils.logging import logger
from ...rate_limit import limiter

router = APIRouter()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


# ============================================================================
# Schemas
# ============================================================================

class ClientToken(BaseModel):
    """Token response for client auth."""
    access_token: str
    token_type: str = "bearer"
    client_id: int
    client_name: str
    role: str


class ClientUserProfile(BaseModel):
    """Current client user profile."""
    id: int
    email: str
    full_name: str | None
    client_id: int
    client_name: str
    company: str | None
    role: str


class ClientLoginRequest(BaseModel):
    """Login request body."""
    email: EmailStr
    password: str


# ============================================================================
# Helper Functions
# ============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_client_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Create JWT token for client user."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "type": "client"  # Mark as client token
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_client_user(
    token: str,
    db: AsyncSession
) -> ClientUser:
    """Get current client user from token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Verify this is a client token
        if payload.get("type") != "client":
            raise credentials_exception
        
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(
        select(ClientUser).where(ClientUser.email == email)
    )
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        raise credentials_exception
    
    return user


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/login", response_model=ClientToken)
@limiter.limit("5/minute")
async def client_login(
    request: Request,
    login_request: ClientLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Client portal login.
    
    Returns JWT token for authenticated client user.
    """
    # Find user
    result = await db.execute(
        select(ClientUser)
        .where(ClientUser.email == login_request.email)
        .where(ClientUser.is_active == True)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(login_request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Get client info
    result = await db.execute(
        select(Client).where(Client.id == user.client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client account not found"
        )
    
    # Update last login
    user.last_login_at = datetime.utcnow()
    await db.commit()
    
    # Create token
    access_token = create_client_access_token(
        data={
            "sub": user.email,
            "client_id": client.id,
            "role": user.role.value,
        }
    )
    
    logger.info(f"Client user logged in: {user.email}")
    
    return ClientToken(
        access_token=access_token,
        client_id=client.id,
        client_name=client.name,
        role=user.role.value,
    )


@router.get("/me", response_model=ClientUserProfile)
async def get_client_me(
    token: str | None = None,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db)
):
    """Get current client user profile."""
    resolved_token = token
    if not resolved_token and authorization and authorization.startswith("Bearer "):
        resolved_token = authorization.replace("Bearer ", "")
    if not resolved_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing credentials",
        )

    user = await get_current_client_user(resolved_token, db)
    
    result = await db.execute(
        select(Client).where(Client.id == user.client_id)
    )
    client = result.scalar_one_or_none()
    
    return ClientUserProfile(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        client_id=user.client_id,
        client_name=client.name if client else "Unknown",
        company=client.company if client else None,
        role=user.role.value,
    )


@router.post("/refresh", response_model=ClientToken)
async def refresh_client_token(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db)
):
    """Refresh client JWT using existing token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing credentials",
        )
    token = authorization.replace("Bearer ", "")
    user = await get_current_client_user(token, db)

    result = await db.execute(
        select(Client).where(Client.id == user.client_id)
    )
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client account not found"
        )

    access_token = create_client_access_token(
        data={
            "sub": user.email,
            "client_id": client.id,
            "role": user.role.value,
        }
    )

    return ClientToken(
        access_token=access_token,
        client_id=client.id,
        client_name=client.name,
        role=user.role.value,
    )


@router.post("/logout")
async def client_logout():
    """
    Client logout.
    
    Note: With JWT, logout is handled client-side by discarding the token.
    This endpoint exists for API completeness.
    """
    return {"message": "Logged out successfully"}
