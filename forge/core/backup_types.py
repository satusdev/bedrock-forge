"""
Backup data types and configuration models.
Moved from services to core to avoid circular imports.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict

class BackupType(str, Enum):
    """Types of backup operations."""
    FULL = "full"          # Database + files
    DATABASE = "database"   # Database only
    FILES = "files"         # Files only
    INCREMENTAL = "incremental"  # Changed files only


class BackupStatus(str, Enum):
    """Status of a backup operation."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some parts succeeded


@dataclass
class BackupConfig:
    """
    Configuration for a backup operation.
    """
    backup_type: BackupType = BackupType.FULL
    include_database: bool = True
    include_files: bool = True
    include_uploads: bool = True
    exclude_patterns: List[str] = field(default_factory=lambda: [
        "*.log",
        "*.tmp",
        ".git",
        "node_modules",
        ".cache",
    ])
    compress: bool = True
    encryption_key: Optional[str] = None
    storage_backends: List[str] = field(default_factory=lambda: ["local"])
    storage_config: Dict = field(default_factory=dict)
    
    # Remote server configuration (scalar values, no ORM objects)
    is_remote: bool = False
    server_hostname: Optional[str] = None
    server_ssh_user: Optional[str] = None
    server_ssh_port: int = 22
    server_ssh_key_path: Optional[str] = None
    server_ssh_password: Optional[str] = None
    server_ssh_private_key: Optional[str] = None
    wp_path: Optional[str] = None
    project_name: str = "unknown-project"
    environment_type: str = "production"

@dataclass
class BackupResult:
    """Result of a backup operation."""
    success: bool
    backup_id: str
    status: BackupStatus
    backup_path: Optional[str] = None
    size_bytes: int = 0
    duration_seconds: float = 0.0
    database_backup: Optional[str] = None
    files_backup: Optional[str] = None
    storage_results: Dict = field(default_factory=dict)
    error: Optional[str] = None
    storage_file_id: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "backup_id": self.backup_id,
            "status": self.status.value,
            "backup_path": self.backup_path,
            "size_bytes": self.size_bytes,
            "storage_file_id": self.storage_file_id,
            "duration_seconds": self.duration_seconds,
            "storage_results": self.storage_results,
            "error": self.error,
        }
