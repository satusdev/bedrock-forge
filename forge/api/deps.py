"""
Shared FastAPI dependencies for the Forge API.

This module contains shared state, utilities, and dependency injection
functions used across multiple route modules.
"""
from typing import Dict, Any, Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db import get_db, User
from ..core.config import settings
from .security import verify_token


import json
from ..utils.redis_client import get_redis_client

# Global in-memory storage for dashboard state
# In production, this will be replaced with database sessions
dashboard_cache: Dict[str, Any] = {}

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_PREFIX}/auth/login",
    auto_error=False  # Allow unauthenticated access to some endpoints
)


def get_task_status(task_id: str) -> Dict[str, Any]:
    """Get the status of a background task from Redis."""
    try:
        redis = get_redis_client()
        data = redis.get(f"task:{task_id}")
        if data:
            return json.loads(data)
    except Exception as e:
        # Fallback or log error
        print(f"Error getting task status from Redis: {e}")
        
    return {
        "status": "unknown",
        "message": "Task not found"
    }


def update_task_status(task_id: str, status: str, message: str = "", 
                       progress: int = 0, result: Any = None) -> None:
    """Update the status of a background task in Redis."""
    try:
        redis = get_redis_client()
        data = {
            "status": status,
            "message": message,
            "progress": progress,
            "result": result
        }
        # Store with 24h expiry
        redis.setex(f"task:{task_id}", 86400, json.dumps(data))
    except Exception as e:
        print(f"Error updating task status in Redis: {e}")


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    """
    Get the current authenticated user from JWT token.
    
    Raises:
        HTTPException: If token is missing, invalid, or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if token is None:
        raise credentials_exception
    
    payload = verify_token(token, "access")
    if payload is None:
        raise credentials_exception
    
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    # Get user from database
    result = await db.execute(
        select(User).where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """
    Get current user and verify they are active.
    
    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


async def require_superuser(
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> User:
    """
    Require the current user to be a superuser.
    
    Raises:
        HTTPException: If user is not a superuser
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser required"
        )
    return current_user


async def get_optional_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> User | None:
    """
    Get the current user if authenticated, None otherwise.
    Useful for endpoints that work differently for authenticated users.
    """
    if token is None:
        return None
    
    payload = verify_token(token, "access")
    if payload is None:
        return None
    
    user_id = payload.get("sub")
    if user_id is None:
        return None
    
    result = await db.execute(
        select(User).where(User.id == int(user_id))
    )
    return result.scalar_one_or_none()
