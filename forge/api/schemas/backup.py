"""
Backup and Backup Schedule Pydantic schemas for API operations.
"""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field

from ...db.models.backup import BackupType, BackupStorageType, BackupStatus
from ...db.models.backup_schedule import ScheduleFrequency, ScheduleStatus


# ============================================================================
# Backup Schemas
# ============================================================================

class BackupCreate(BaseModel):
    """Schema for creating a new backup."""
    project_id: int = Field(..., description="Project to backup")
    backup_type: BackupType = Field(BackupType.FULL, description="Type of backup")
    storage_type: BackupStorageType = Field(
        BackupStorageType.LOCAL, description="Where to store the backup"
    )
    name: Optional[str] = Field(None, max_length=255, description="Backup name")
    config: Optional[dict[str, Any]] = Field(None, description="Additional config")


class BackupRead(BaseModel):
    """Response schema for a backup."""
    id: int
    name: str
    project_id: int
    project_name: Optional[str] = None
    
    backup_type: BackupType
    storage_type: BackupStorageType
    storage_path: str
    size_bytes: Optional[int] = None
    
    status: BackupStatus
    error_message: Optional[str] = None
    storage_file_id: Optional[str] = None
    gdrive_link: Optional[str] = None
    logs: Optional[str] = None
    
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class BackupListResponse(BaseModel):
    """Response for listing backups."""
    items: list[BackupRead]
    total: int
    page: int
    page_size: int


# ============================================================================
# Backup Schedule Schemas
# ============================================================================

class ScheduleCreate(BaseModel):
    """Schema for creating a new backup schedule."""
    name: str = Field(..., min_length=1, max_length=255, description="Schedule name")
    project_id: int = Field(..., description="Project to backup")
    environment_id: Optional[int] = Field(None, description="Environment to backup")

    
    # Schedule timing
    frequency: ScheduleFrequency = Field(
        ScheduleFrequency.DAILY, description="How often to run"
    )
    hour: int = Field(2, ge=0, le=23, description="Hour to run (0-23)")
    minute: int = Field(0, ge=0, le=59, description="Minute to run (0-59)")
    day_of_week: Optional[int] = Field(
        None, ge=0, le=6, description="Day of week for weekly (0=Monday)"
    )
    day_of_month: Optional[int] = Field(
        None, ge=1, le=31, description="Day of month for monthly"
    )
    timezone: str = Field("UTC", max_length=50, description="Schedule timezone")
    cron_expression: Optional[str] = Field(
        None, max_length=100, description="Custom cron expression"
    )
    
    # Backup settings
    backup_type: BackupType = Field(BackupType.FULL, description="Type of backup")
    storage_type: BackupStorageType = Field(
        BackupStorageType.GOOGLE_DRIVE, description="Where to store backups"
    )
    
    # Retention
    retention_count: int = Field(
        7, ge=1, le=365, description="Number of backups to keep"
    )
    retention_days: Optional[int] = Field(
        None, ge=1, le=365, description="Delete backups older than X days"
    )
    
    description: Optional[str] = Field(None, description="Schedule description")
    config: Optional[dict[str, Any]] = Field(None, description="Additional config")


class ScheduleUpdate(BaseModel):
    """Schema for updating a backup schedule."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    environment_id: Optional[int] = None

    
    # Schedule timing
    frequency: Optional[ScheduleFrequency] = None
    hour: Optional[int] = Field(None, ge=0, le=23)
    minute: Optional[int] = Field(None, ge=0, le=59)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    timezone: Optional[str] = Field(None, max_length=50)
    cron_expression: Optional[str] = Field(None, max_length=100)
    
    # Backup settings
    backup_type: Optional[BackupType] = None
    storage_type: Optional[BackupStorageType] = None
    
    # Retention
    retention_count: Optional[int] = Field(None, ge=1, le=365)
    retention_days: Optional[int] = Field(None, ge=1, le=365)
    
    # Status
    status: Optional[ScheduleStatus] = None
    
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class ScheduleRead(BaseModel):
    """Response schema for a backup schedule."""
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    project_name: Optional[str] = None
    environment_id: Optional[int] = None
    environment_name: Optional[str] = None
    
    # Schedule timing

    frequency: ScheduleFrequency
    hour: int
    minute: int
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    timezone: str
    cron_expression: Optional[str] = None
    cron_display: Optional[str] = None  # Human-readable cron
    
    # Backup settings
    backup_type: BackupType
    storage_type: BackupStorageType
    
    # Retention
    retention_count: int
    retention_days: Optional[int] = None
    
    # Status & tracking
    status: ScheduleStatus
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    last_run_success: Optional[bool] = None
    last_run_error: Optional[str] = None
    run_count: int = 0
    failure_count: int = 0
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ScheduleListResponse(BaseModel):
    """Response for listing schedules."""
    items: list[ScheduleRead]
    total: int
    page: int
    page_size: int


class ScheduleRunResponse(BaseModel):
    """Response when manually triggering a schedule."""
    success: bool
    message: str
    schedule_id: int
    backup_id: Optional[int] = None
