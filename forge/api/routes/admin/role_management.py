"""
Role management API routes.

Provides CRUD for roles, permissions, and user role assignments.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated, List
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ....db import get_db
from ....db.models import User
from ....db.models.role import Role, Permission, DEFAULT_PERMISSIONS, DEFAULT_ROLES
from ...deps import get_current_active_user
from ....utils.logging import logger

router = APIRouter()


# Schemas
class PermissionRead(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
    category: str

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str
    display_name: str
    description: str | None = None
    color: str = "#6366f1"
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    color: str | None = None
    permission_ids: List[int] | None = None


class RoleRead(BaseModel):
    id: int
    name: str
    display_name: str
    description: str | None
    color: str
    is_system: bool
    permissions: List[PermissionRead] = []

    class Config:
        from_attributes = True


# Permission endpoints
@router.get("/permissions", response_model=List[PermissionRead])
async def list_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List all available permissions."""
    result = await db.execute(select(Permission).order_by(Permission.category, Permission.code))
    return result.scalars().all()


@router.post("/permissions/seed")
async def seed_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Seed default permissions (admin only)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    created = 0
    for perm_data in DEFAULT_PERMISSIONS:
        existing = await db.execute(select(Permission).where(Permission.code == perm_data["code"]))
        if not existing.scalar_one_or_none():
            perm = Permission(**perm_data)
            db.add(perm)
            created += 1
    
    await db.commit()
    return {"created": created}


# Role endpoints
@router.get("/roles", response_model=List[RoleRead])
async def list_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """List all roles with their permissions."""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
    )
    return result.scalars().all()


@router.get("/roles/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get a single role with permissions."""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/roles", response_model=RoleRead)
async def create_role(
    data: RoleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new role."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check for existing
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role name already exists")
    
    role = Role(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        color=data.color,
    )
    
    # Add permissions
    if data.permission_ids:
        perms_result = await db.execute(
            select(Permission).where(Permission.id.in_(data.permission_ids))
        )
        role.permissions = list(perms_result.scalars().all())
    
    db.add(role)
    await db.commit()
    await db.refresh(role)
    
    # Reload with permissions
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role.id)
    )
    return result.scalar_one()


@router.patch("/roles/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update a role."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if data.display_name is not None:
        role.display_name = data.display_name
    if data.description is not None:
        role.description = data.description
    if data.color is not None:
        role.color = data.color
    if data.permission_ids is not None:
        perms_result = await db.execute(
            select(Permission).where(Permission.id.in_(data.permission_ids))
        )
        role.permissions = list(perms_result.scalars().all())
    
    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete a role (non-system only)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    
    await db.delete(role)
    await db.commit()
    return {"success": True}


@router.post("/roles/seed")
async def seed_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Seed default roles (admin only)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    # First, get all permissions
    perms_result = await db.execute(select(Permission))
    all_perms = {p.code: p for p in perms_result.scalars().all()}
    
    created = 0
    for role_data in DEFAULT_ROLES:
        existing = await db.execute(select(Role).where(Role.name == role_data["name"]))
        if not existing.scalar_one_or_none():
            role = Role(
                name=role_data["name"],
                display_name=role_data["display_name"],
                description=role_data["description"],
                color=role_data["color"],
                is_system=role_data["is_system"],
            )
            
            # Assign permissions
            perm_patterns = role_data.get("permissions", [])
            for pattern in perm_patterns:
                if pattern == "*":
                    role.permissions = list(all_perms.values())
                    break
                elif pattern.endswith(".*"):
                    prefix = pattern[:-2]
                    for code, perm in all_perms.items():
                        if code.startswith(prefix + "."):
                            role.permissions.append(perm)
                elif pattern in all_perms:
                    role.permissions.append(all_perms[pattern])
            
            db.add(role)
            created += 1
    
    await db.commit()
    return {"created": created}
