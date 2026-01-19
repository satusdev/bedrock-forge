"""
Server Pydantic schemas.
"""
import json
from datetime import datetime
from typing import List, Any
from pydantic import BaseModel, Field, validator

from ...db.models.server import ServerProvider, ServerStatus, PanelType


class ServerBase(BaseModel):
    """Base server fields."""
    name: str = Field(min_length=1, max_length=255)
    hostname: str = Field(min_length=1, max_length=255)
    provider: ServerProvider = ServerProvider.CUSTOM
    ssh_user: str = "root"
    ssh_port: int = Field(default=22, ge=1, le=65535)
    ssh_key_path: str | None = None
    panel_type: PanelType = PanelType.NONE
    panel_url: str | None = None
    panel_username: str | None = None  # For auto-login
    panel_password: str | None = None  # For auto-login (encrypted in DB)
    tags: List[str] | None = None  # JSON-serializable list

    @validator('hostname')
    def hostname_format(cls, v):
        if ' ' in v:
            raise ValueError('Hostname cannot contain spaces')
        return v.lower()

    @validator('panel_url')
    def validate_panel_url(cls, v):
        if v and not v.startswith(('http://', 'https://')):
            raise ValueError('Panel URL must start with http:// or https://')
        return v


class ServerCreate(ServerBase):
    """Server creation schema."""
    ssh_password: str | None = None
    ssh_private_key: str | None = None


class ServerUpdate(BaseModel):
    """Server update schema (all optional)."""
    name: str | None = None
    hostname: str | None = None
    provider: ServerProvider | None = None
    ssh_user: str | None = None
    ssh_port: int | None = None
    ssh_key_path: str | None = None
    ssh_password: str | None = None
    ssh_private_key: str | None = None
    panel_type: PanelType | None = None
    panel_url: str | None = None
    panel_username: str | None = None
    panel_password: str | None = None
    tags: List[str] | None = None
    uploads_path: str | None = None


class ServerRead(ServerBase):
    """Server response schema."""
    id: int
    status: ServerStatus
    last_health_check: datetime | None
    owner_id: int
    wp_root_paths: List[str] | None = None  # Parsed from JSON
    uploads_path: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    
    @validator('wp_root_paths', pre=True, always=True)
    def parse_wp_root_paths(cls, v: Any) -> List[str] | None:
        """Parse JSON string to list if needed."""
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else None
            except (json.JSONDecodeError, TypeError):
                return None
        return None
    
    @validator('tags', pre=True, always=True)
    def parse_tags(cls, v: Any) -> List[str] | None:
        """Parse JSON string to list if needed."""
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else None
            except (json.JSONDecodeError, TypeError):
                return None
        return None


class ServerTestResult(BaseModel):
    """SSH connection test result."""
    success: bool
    message: str
    response_time_ms: int | None = None


class DirectoryScanResult(BaseModel):
    """Result of scanning a server for WordPress installations."""
    success: bool
    message: str
    directories: List[str] = Field(default_factory=list)
    scan_path: str | None = None


class ServerDirectory(BaseModel):
    """WordPress directory on a server."""
    path: str
    wp_version: str | None = None
    site_url: str | None = None
    is_bedrock: bool = False
