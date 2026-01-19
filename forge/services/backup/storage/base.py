"""
Abstract base class for backup storage backends.

Defines the interface that all storage implementations must follow.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, BinaryIO


@dataclass
class StorageResult:
    """Result of a storage operation."""
    success: bool
    path: str
    size_bytes: int = 0
    error: Optional[str] = None
    metadata: Optional[dict] = None


@dataclass
class StorageConfig:
    """Configuration for storage backends."""
    # Common settings
    backup_dir: str = ".forge/backups"
    
    # Google Drive settings
    gdrive_remote: str = "gdrive"
    gdrive_folder: Optional[str] = None
    
    # S3 settings
    s3_bucket: Optional[str] = None
    s3_prefix: str = ""
    s3_region: str = "us-east-1"
    
    # Cleanup settings
    remove_local_after_upload: bool = True


class BackupStorage(ABC):
    """
    Abstract base class for backup storage backends.
    
    All storage implementations (local, Google Drive, S3) must
    implement these methods.
    """
    
    def __init__(self, config: Optional[StorageConfig] = None):
        """
        Initialize storage backend.
        
        Args:
            config: Storage configuration options
        """
        self.config = config or StorageConfig()
    
    @abstractmethod
    async def upload(
        self,
        local_path: Path,
        remote_path: str,
        metadata: Optional[dict] = None,
    ) -> StorageResult:
        """
        Upload a file to storage.
        
        Args:
            local_path: Path to local file
            remote_path: Destination path in storage
            metadata: Optional metadata to attach
            
        Returns:
            StorageResult with upload details
        """
        pass
    
    @abstractmethod
    async def download(
        self,
        remote_path: str,
        local_path: Path,
    ) -> StorageResult:
        """
        Download a file from storage.
        
        Args:
            remote_path: Path in storage
            local_path: Local destination path
            
        Returns:
            StorageResult with download details
        """
        pass
    
    @abstractmethod
    async def delete(self, remote_path: str) -> StorageResult:
        """
        Delete a file from storage.
        
        Args:
            remote_path: Path to file in storage
            
        Returns:
            StorageResult indicating success/failure
        """
        pass
    
    @abstractmethod
    async def list_files(
        self,
        prefix: str = "",
        max_results: int = 100,
    ) -> list[str]:
        """
        List files in storage.
        
        Args:
            prefix: Filter files by prefix/folder
            max_results: Maximum number of results
            
        Returns:
            List of file paths
        """
        pass
    
    @abstractmethod
    async def exists(self, remote_path: str) -> bool:
        """
        Check if a file exists in storage.
        
        Args:
            remote_path: Path to check
            
        Returns:
            True if file exists
        """
        pass
    
    @abstractmethod
    async def get_size(self, remote_path: str) -> int:
        """
        Get the size of a file in storage.
        
        Args:
            remote_path: Path to file
            
        Returns:
            File size in bytes
        """
        pass
    
    def get_storage_path(self, project_slug: str, filename: str) -> str:
        """
        Generate a storage path for a backup file.
        
        Args:
            project_slug: Project identifier
            filename: Backup filename
            
        Returns:
            Full storage path
        """
        return f"{project_slug}/{filename}"
