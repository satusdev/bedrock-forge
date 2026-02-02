"""
ProjectServer Pydantic schemas.
"""
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field

from ...db.models.project_server import ServerEnvironment


class ProjectServerBase(BaseModel):
    """Base project-server link fields."""
    server_id: int
    environment: ServerEnvironment = ServerEnvironment.staging
    wp_path: str = Field(min_length=1, max_length=500)
    wp_url: str = Field(min_length=1, max_length=500)
    notes: str | None = None
    is_primary: bool = True
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    gdrive_backups_folder_id: str | None = None
    database_name: str | None = None
    database_user: str | None = None
    database_password: str | None = None


class ProjectServerCreate(ProjectServerBase):
    """Schema for linking a server to a project."""
    gdrive_backups_folder_id: str | None = None
    pass


class ProjectServerUpdate(BaseModel):
    """Schema for updating a project-server link."""
    environment: ServerEnvironment | None = None
    wp_path: str | None = None
    wp_url: str | None = None
    notes: str | None = None
    is_primary: bool | None = None
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    gdrive_backups_folder_id: str | None = None
    database_name: str | None = None
    database_user: str | None = None
    database_password: str | None = None


class ProjectServerRead(ProjectServerBase):
    """Response schema for project-server link."""
    id: int
    project_id: int
    server_name: str | None = None  # Populated from relationship
    gdrive_backups_folder_id: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectServerWithCredentials(ProjectServerRead):
    """Project-server with associated credentials count."""
    credentials_count: int = 0


class SyncOptions(BaseModel):
    """Options for syncing between environments."""
    sync_database: bool = True
    sync_uploads: bool = True
    sync_plugins: bool = False
    sync_themes: bool = False
    dry_run: bool = False
    exclude_paths: List[str] = Field(default_factory=list)


class SyncResult(BaseModel):
    """Result of a sync operation."""
    success: bool
    message: str
    files_synced: int = 0
    database_synced: bool = False
    errors: List[str] = Field(default_factory=list)
