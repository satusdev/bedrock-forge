"""
Local filesystem storage backend.

Stores backups on the local filesystem.
"""
import asyncio
import shutil
from pathlib import Path
from typing import Optional

from .base import BackupStorage, StorageConfig, StorageResult


class LocalStorage(BackupStorage):
    """
    Local filesystem storage backend.
    
    Stores backup files in a local directory structure.
    """
    
    def __init__(
        self,
        base_path: Optional[Path] = None,
        config: Optional[StorageConfig] = None,
    ):
        """
        Initialize local storage.
        
        Args:
            base_path: Base directory for backups
            config: Storage configuration
        """
        super().__init__(config)
        self.base_path = base_path or Path.home() / ".forge" / "backups"
    
    async def upload(
        self,
        local_path: Path,
        remote_path: str,
        metadata: Optional[dict] = None,
    ) -> StorageResult:
        """
        Copy file to local backup storage.
        
        For local storage, this copies the file to the backup directory.
        """
        try:
            dest_path = self.base_path / remote_path
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file (use thread pool for large files)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, shutil.copy2, str(local_path), str(dest_path)
            )
            
            size = dest_path.stat().st_size
            
            return StorageResult(
                success=True,
                path=str(dest_path),
                size_bytes=size,
                metadata=metadata,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=str(local_path),
                error=str(e),
            )
    
    async def download(
        self,
        remote_path: str,
        local_path: Path,
    ) -> StorageResult:
        """Download/copy file from local backup storage."""
        try:
            src_path = self.base_path / remote_path
            
            if not src_path.exists():
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"File not found: {src_path}",
                )
            
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, shutil.copy2, str(src_path), str(local_path)
            )
            
            return StorageResult(
                success=True,
                path=str(local_path),
                size_bytes=local_path.stat().st_size,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=remote_path,
                error=str(e),
            )
    
    async def delete(self, remote_path: str) -> StorageResult:
        """Delete file from local storage."""
        try:
            file_path = self.base_path / remote_path
            
            if file_path.exists():
                file_path.unlink()
            
            return StorageResult(
                success=True,
                path=remote_path,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=remote_path,
                error=str(e),
            )
    
    async def list_files(
        self,
        prefix: str = "",
        max_results: int = 100,
    ) -> list[str]:
        """List files in local backup storage."""
        try:
            search_path = self.base_path / prefix if prefix else self.base_path
            
            if not search_path.exists():
                return []
            
            files = []
            for path in search_path.rglob("*"):
                if path.is_file():
                    rel_path = path.relative_to(self.base_path)
                    files.append(str(rel_path))
                    if len(files) >= max_results:
                        break
            
            return sorted(files, reverse=True)  # Newest first by name
            
        except Exception:
            return []
    
    async def exists(self, remote_path: str) -> bool:
        """Check if file exists in local storage."""
        file_path = self.base_path / remote_path
        return file_path.exists()
    
    async def get_size(self, remote_path: str) -> int:
        """Get file size from local storage."""
        file_path = self.base_path / remote_path
        if file_path.exists():
            return file_path.stat().st_size
        return 0
    
    def get_absolute_path(self, remote_path: str) -> Path:
        """Get absolute path for a backup file."""
        return self.base_path / remote_path
