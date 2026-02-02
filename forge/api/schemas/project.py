"""
Project Pydantic schemas for API operations.
"""
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator

from ...db.models.project import ProjectStatus
from ...db.models.project_server import ServerEnvironment


class ProjectCreate(BaseModel):
    """Schema for creating a new project (simplified - no server required)."""
    name: str = Field(min_length=1, max_length=255, description="Project name")
    domain: str = Field(min_length=1, max_length=500, description="Primary domain")
    site_title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    
    # GitHub integration (optional)
    github_repo_url: Optional[str] = Field(None, max_length=500)
    github_branch: str = Field("main", max_length=100)
    
    # Organization
    tags: List[str] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    domain: Optional[str] = Field(None, min_length=1, max_length=500)
    site_title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    github_repo_url: Optional[str] = None
    github_branch: Optional[str] = None
    tags: Optional[List[str]] = None


class ProjectRead(BaseModel):
    """Response schema for a project."""
    id: int
    name: str
    slug: str
    domain: str
    site_title: Optional[str] = None
    description: Optional[str] = None
    status: ProjectStatus
    
    # GitHub
    github_repo_url: Optional[str] = None
    github_branch: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    
    # Environments count
    environments_count: int = 0
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProjectSummary(BaseModel):
    """Lightweight project summary for lists."""
    id: int
    name: str
    slug: str
    domain: str
    status: ProjectStatus
    tags: List[str] = Field(default_factory=list)
    environments_count: int = 0
    has_staging: bool = False
    has_production: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Environment Link Schemas (ProjectServer)
# ============================================================================

class EnvironmentCreate(BaseModel):
    """Schema for linking an environment to a server."""
    environment: ServerEnvironment = Field(description="staging or production")

    @field_validator("environment", mode="before")
    @classmethod
    def case_insensitive_environment(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.lower()
        return v
    server_id: int = Field(description="Server to deploy on")
    
    # WordPress location
    wp_url: str = Field(min_length=1, max_length=500, description="Site URL")
    wp_path: str = Field(min_length=1, max_length=500, description="WordPress root path on server")
    
    # SSH credentials
    ssh_user: Optional[str] = Field(None, max_length=100)
    ssh_key_path: Optional[str] = Field(None, max_length=500)
    
    # Database credentials
    database_name: str = Field(min_length=1, max_length=64)
    database_user: str = Field(min_length=1, max_length=64)
    database_password: str = Field(min_length=1, max_length=255)
    
    # Optional
    backup_path: Optional[str] = Field(None, max_length=500)
    gdrive_backups_folder_id: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=1000)


class EnvironmentUpdate(BaseModel):
    """Schema for updating an environment link."""
    wp_url: Optional[str] = None
    wp_path: Optional[str] = None
    ssh_user: Optional[str] = None
    ssh_key_path: Optional[str] = None
    database_name: Optional[str] = None
    database_user: Optional[str] = None
    database_password: Optional[str] = None
    backup_path: Optional[str] = None
    gdrive_backups_folder_id: Optional[str] = None
    notes: Optional[str] = None


class EnvironmentRead(BaseModel):
    """Response schema for a project environment."""
    id: int
    environment: ServerEnvironment
    server_id: int
    server_name: str
    server_hostname: str
    
    wp_url: str
    wp_path: str
    ssh_user: Optional[str] = None
    ssh_key_path: Optional[str] = None
    
    # Database
    database_name: Optional[str] = None
    database_user: Optional[str] = None
    database_password: Optional[str] = None
    backup_path: Optional[str] = None
    gdrive_backups_folder_id: Optional[str] = None
    notes: Optional[str] = None
    
    is_primary: bool = True
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Local Projects (DDEV)
# ============================================================================

class LocalProject(BaseModel):
    """Schema for local (DDEV) projects from ~/.forge."""
    project_name: str
    directory: str
    wp_home: str
    repo_url: Optional[str] = None
    created_date: Optional[str] = None
    ddev_status: str = "unknown"


class TagsResponse(BaseModel):
    """Response for available tags."""
    tags: List[str]
