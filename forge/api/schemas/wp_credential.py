"""
WPCredential Pydantic schemas.
"""
from datetime import datetime
from pydantic import BaseModel, Field


class WPCredentialBase(BaseModel):
    """Base WP credential fields."""
    label: str = Field(default="Admin", min_length=1, max_length=100)
    is_primary: bool = False
    notes: str | None = None


class WPCredentialCreate(WPCredentialBase):
    """Schema for creating WP credentials (unencrypted input)."""
    project_server_id: int
    wp_username: str = Field(min_length=1, max_length=100)
    wp_password: str = Field(min_length=1)


class WPCredentialUpdate(BaseModel):
    """Schema for updating WP credentials."""
    label: str | None = None
    wp_username: str | None = None
    wp_password: str | None = None
    is_primary: bool | None = None
    is_active: bool | None = None
    notes: str | None = None


class WPCredentialRead(WPCredentialBase):
    """Response schema for WP credentials (no password exposed)."""
    id: int
    project_server_id: int
    user_id: int
    wp_username: str  # Decrypted username shown
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WPCredentialWithContext(WPCredentialRead):
    """Credential with project/server context."""
    project_name: str | None = None
    server_name: str | None = None
    environment: str | None = None
    wp_url: str | None = None


class QuickLoginRequest(BaseModel):
    """Request for generating a quick login."""
    credential_id: int
    timeout_minutes: int = Field(default=5, ge=1, le=60)


class QuickLoginResponse(BaseModel):
    """Response with quick login details."""
    login_url: str | None = None
    method: str  # "auto_login" | "form_redirect" | "manual"
    wp_url: str
    username: str
    # Password only included for "manual" method
    password: str | None = None
    expires_at: datetime | None = None
