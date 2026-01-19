"""
User management API routes.

Provides CRUD for users and role assignment.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated, List, Optional
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from ....db import get_db
from ....db.models.user import User
from ....db.models.role import Role
from ...deps import get_current_active_user
from ....utils.logging import logger
from ....core.security import get_password_hash

router = APIRouter()


# Schemas
class UserRoleRead(BaseModel):
    id: int
    name: str
    display_name: str
    color: str

    class Config:
        from_attributes = True


class UserRead(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    is_active: bool
    is_superuser: bool
    avatar_url: str | None
    roles: List[UserRoleRead] = []

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    role_ids: List[int] = []


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    full_name: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None
    avatar_url: str | None = None
    role_ids: List[int] | None = None


class PasswordChange(BaseModel):
    new_password: str


# User endpoints
@router.get("", response_model=List[UserRead])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    role_id: Optional[int] = None,
):
    """List all users with optional filters."""
    if not current_user.is_superuser and not current_user.has_permission("users.view"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = select(User).options(selectinload(User.roles))
    
    if search:
        query = query.where(
            or_(
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%")
            )
        )
    
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    
    # Role filter would need a subquery join
    
    result = await db.execute(query.order_by(User.username))
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get a single user."""
    if not current_user.is_superuser and not current_user.has_permission("users.view"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("", response_model=UserRead)
async def create_user(
    data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new user."""
    if not current_user.is_superuser and not current_user.has_permission("users.manage"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for existing email/username
    existing = await db.execute(
        select(User).where(
            or_(User.email == data.email, User.username == data.username)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    user = User(
        email=data.email,
        username=data.username,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        is_active=data.is_active,
        is_superuser=data.is_superuser if current_user.is_superuser else False,
    )
    
    # Assign roles
    if data.role_ids:
        roles_result = await db.execute(
            select(Role).where(Role.id.in_(data.role_ids))
        )
        user.roles = list(roles_result.scalars().all())
    
    db.add(user)
    await db.commit()
    
    # Reload with roles
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user.id)
    )
    return result.scalar_one()


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update a user."""
    if not current_user.is_superuser and not current_user.has_permission("users.manage"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if data.email is not None:
        user.email = data.email
    if data.username is not None:
        user.username = data.username
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_superuser is not None and current_user.is_superuser:
        user.is_superuser = data.is_superuser
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url
    if data.role_ids is not None:
        roles_result = await db.execute(
            select(Role).where(Role.id.in_(data.role_ids))
        )
        user.roles = list(roles_result.scalars().all())
    
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    data: PasswordChange,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Reset a user's password (admin only)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    
    return {"success": True}


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete a user."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()
    
    return {"success": True}


@router.get("/me", response_model=UserRead)
async def get_current_user_info(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get current user info with roles."""
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.get("/me/permissions")
async def get_current_user_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get current user's permissions."""
    result = await db.execute(
        select(User).options(
            selectinload(User.roles).selectinload(Role.permissions)
        ).where(User.id == current_user.id)
    )
    user = result.scalar_one()
    
    return {
        "is_superuser": user.is_superuser,
        "permissions": list(user.get_all_permissions())
    }
