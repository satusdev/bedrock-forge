"""
Tag management API routes.

Provides CRUD for project tags with relationship management.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated, List, Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from slugify import slugify

from ....db import get_db
from ....db.models.user import User
from ....db.models.tag import Tag, DEFAULT_TAGS
from ....db.models.project import Project
from ....db.models.server import Server
from ....db.models.project_tag import project_tags, server_tags
from ...deps import get_current_active_user
from ....utils.logging import logger

router = APIRouter()


# Schemas
class TagCreate(BaseModel):
    name: str
    slug: str | None = None
    color: str = "#6366f1"
    icon: str | None = None
    description: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    color: str | None = None
    icon: str | None = None
    description: str | None = None


class TagRead(BaseModel):
    id: int
    name: str
    slug: str
    color: str
    icon: str | None
    description: str | None
    usage_count: int

    class Config:
        from_attributes = True


class TagAssignment(BaseModel):
    tag_ids: List[int]


# Tag endpoints
@router.get("", response_model=List[TagRead])
async def list_tags(
    db: Annotated[AsyncSession, Depends(get_db)],
    search: Optional[str] = None,
):
    """List all tags."""
    query = select(Tag)
    
    if search:
        query = query.where(Tag.name.ilike(f"%{search}%"))
    
    result = await db.execute(query.order_by(Tag.name))
    return result.scalars().all()


@router.get("/{tag_id}", response_model=TagRead)
async def get_tag(
    tag_id: int,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get a single tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.post("", response_model=TagRead)
async def create_tag(
    data: TagCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Create a new tag."""
    # Generate slug from provided or name
    slug = data.slug if data.slug else slugify(data.name)
    
    # Check for existing
    existing = await db.execute(
        select(Tag).where((Tag.name == data.name) | (Tag.slug == slug))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag already exists")
    
    tag = Tag(
        name=data.name,
        slug=slug,
        color=data.color,
        icon=data.icon,
        description=data.description,
    )
    
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    
    return tag


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Update a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if data.name is not None:
        tag.name = data.name
        # Only regenerate slug if no explicit slug provided
        if data.slug is None:
            tag.slug = slugify(data.name)
    if data.slug is not None:
        tag.slug = data.slug
    if data.color is not None:
        tag.color = data.color
    if data.icon is not None:
        tag.icon = data.icon
    if data.description is not None:
        tag.description = data.description
    
    await db.commit()
    await db.refresh(tag)
    
    return tag


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Delete a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    await db.delete(tag)
    await db.commit()
    
    return {"success": True}


@router.post("/seed")
async def seed_tags(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Seed default tags."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    
    created = 0
    for tag_data in DEFAULT_TAGS:
        existing = await db.execute(select(Tag).where(Tag.slug == tag_data["slug"]))
        if not existing.scalar_one_or_none():
            tag = Tag(**tag_data)
            db.add(tag)
            created += 1
    
    await db.commit()
    return {"created": created}


# Project-Tag management endpoints
@router.get("/project/{project_id}", response_model=List[TagRead])
async def get_project_tags(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get all tags for a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.tag_objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project.tag_objects


@router.put("/project/{project_id}")
async def set_project_tags(
    project_id: int,
    data: TagAssignment,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Set tags for a project (replaces existing tags)."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.tag_objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Fetch requested tags
    tags_result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids)))
    tags = tags_result.scalars().all()
    
    # Update project tags
    project.tag_objects = list(tags)
    
    await db.commit()
    
    # Update usage counts
    await _update_tag_usage_counts(db)
    
    return {"success": True, "tags": [t.id for t in tags]}


@router.post("/project/{project_id}/add/{tag_id}")
async def add_project_tag(
    project_id: int,
    tag_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Add a tag to a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.tag_objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = tag_result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if tag not in project.tag_objects:
        project.tag_objects.append(tag)
        await db.commit()
        await _update_tag_usage_counts(db)
    
    return {"success": True}


@router.delete("/project/{project_id}/remove/{tag_id}")
async def remove_project_tag(
    project_id: int,
    tag_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Remove a tag from a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.tag_objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = tag_result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if tag in project.tag_objects:
        project.tag_objects.remove(tag)
        await db.commit()
        await _update_tag_usage_counts(db)
    
    return {"success": True}


# Server-Tag management endpoints
@router.get("/server/{server_id}", response_model=List[TagRead])
async def get_server_tags(
    server_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Get all tags for a server."""
    result = await db.execute(
        select(Server).where(Server.id == server_id).options(selectinload(Server.tag_objects))
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    return server.tag_objects


@router.put("/server/{server_id}")
async def set_server_tags(
    server_id: int,
    data: TagAssignment,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)]
):
    """Set tags for a server (replaces existing tags)."""
    result = await db.execute(
        select(Server).where(Server.id == server_id).options(selectinload(Server.tag_objects))
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Fetch requested tags
    tags_result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids)))
    tags = tags_result.scalars().all()
    
    # Update server tags
    server.tag_objects = list(tags)
    
    await db.commit()
    
    # Update usage counts
    await _update_tag_usage_counts(db)
    
    return {"success": True, "tags": [t.id for t in tags]}


async def _update_tag_usage_counts(db: AsyncSession):
    """Update usage count for all tags."""
    # Get all tags
    result = await db.execute(select(Tag))
    tags = result.scalars().all()
    
    for tag in tags:
        # Count projects using this tag
        project_count_result = await db.execute(
            select(func.count()).select_from(project_tags).where(project_tags.c.tag_id == tag.id)
        )
        project_count = project_count_result.scalar() or 0
        
        # Count servers using this tag
        server_count_result = await db.execute(
            select(func.count()).select_from(server_tags).where(server_tags.c.tag_id == tag.id)
        )
        server_count = server_count_result.scalar() or 0
        
        tag.usage_count = project_count + server_count
    
    await db.commit()
