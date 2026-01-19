"""
Google Drive storage backend using rclone.

Stores backups in Google Drive via rclone remote.
"""
import asyncio
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import BackupStorage, StorageConfig, StorageResult


class GoogleDriveStorage(BackupStorage):
    """
    Google Drive storage backend using rclone.
    
    Requires rclone to be installed and configured with a Google Drive remote.
    """
    
    def __init__(
        self,
        remote_name: str = "gdrive",
        base_folder: str = "forge-backups",
        config: Optional[StorageConfig] = None,
    ):
        """
        Initialize Google Drive storage.
        
        Args:
            remote_name: Name of the rclone remote (must be configured)
            base_folder: Base folder in Google Drive
            config: Storage configuration
        """
        super().__init__(config)
        self.remote_name = remote_name
        self.base_folder = base_folder
        self._rclone_path: Optional[str] = None
    
    @property
    def rclone_path(self) -> str:
        """Get path to rclone binary."""
        if self._rclone_path is None:
            self._rclone_path = shutil.which("rclone") or "rclone"
        return self._rclone_path
    
    def _get_remote_path(self, path: str) -> str:
        """Build full rclone remote path."""
        return f"{self.remote_name}:{self.base_folder}/{path}"
    
    async def _run_rclone(
        self,
        *args: str,
        check: bool = True,
    ) -> tuple[bool, str, str]:
        """
        Run rclone command asynchronously.
        
        Returns:
            Tuple of (success, stdout, stderr)
        """
        cmd = [self.rclone_path, *args]
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            
            success = process.returncode == 0
            if check and not success:
                return False, stdout.decode(), stderr.decode()
            
            return True, stdout.decode(), stderr.decode()
            
        except Exception as e:
            return False, "", str(e)
    
    async def upload(
        self,
        local_path: Path,
        remote_path: str,
        metadata: Optional[dict] = None,
    ) -> StorageResult:
        """Upload file to Google Drive using rclone."""
        try:
            full_remote = self._get_remote_path(remote_path)
            
            # Use rclone copyto for direct file copy
            success, stdout, stderr = await self._run_rclone(
                "copyto",
                str(local_path),
                full_remote,
                "--progress",
            )
            
            if not success:
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"rclone upload failed: {stderr}",
                )
            
            # Get file size
            size = local_path.stat().st_size
            
            return StorageResult(
                success=True,
                path=remote_path,
                size_bytes=size,
                metadata={
                    **(metadata or {}),
                    "gdrive_remote": self.remote_name,
                    "gdrive_path": full_remote,
                    "uploaded_at": datetime.utcnow().isoformat(),
                },
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
        """Download file from Google Drive using rclone."""
        try:
            full_remote = self._get_remote_path(remote_path)
            
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            success, stdout, stderr = await self._run_rclone(
                "copyto",
                full_remote,
                str(local_path),
                "--progress",
            )
            
            if not success:
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"rclone download failed: {stderr}",
                )
            
            return StorageResult(
                success=True,
                path=str(local_path),
                size_bytes=local_path.stat().st_size if local_path.exists() else 0,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=remote_path,
                error=str(e),
            )
    
    async def delete(self, remote_path: str) -> StorageResult:
        """Delete file from Google Drive using rclone."""
        try:
            full_remote = self._get_remote_path(remote_path)
            
            success, stdout, stderr = await self._run_rclone(
                "deletefile",
                full_remote,
            )
            
            if not success:
                # Check if file didn't exist (not an error)
                if "not found" in stderr.lower() or "no matches found" in stderr.lower():
                    return StorageResult(
                        success=True,
                        path=remote_path,
                    )
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"rclone delete failed: {stderr}",
                )
            
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
        """List files in Google Drive folder using rclone."""
        try:
            search_path = f"{prefix}" if prefix else ""
            full_remote = self._get_remote_path(search_path)
            
            success, stdout, stderr = await self._run_rclone(
                "lsf",
                full_remote,
                "--recursive",
                "--files-only",
                f"--max-count={max_results}",
            )
            
            if not success:
                return []
            
            files = [
                f"{prefix}/{f}".strip("/") if prefix else f.strip()
                for f in stdout.strip().split("\n")
                if f.strip()
            ]
            
            return sorted(files, reverse=True)[:max_results]
            
        except Exception:
            return []
    
    async def exists(self, remote_path: str) -> bool:
        """Check if file exists in Google Drive using rclone."""
        try:
            full_remote = self._get_remote_path(remote_path)
            
            success, stdout, stderr = await self._run_rclone(
                "lsf",
                full_remote,
                check=False,
            )
            
            return success and bool(stdout.strip())
            
        except Exception:
            return False
    
    async def get_size(self, remote_path: str) -> int:
        """Get file size from Google Drive using rclone."""
        try:
            full_remote = self._get_remote_path(remote_path)
            
            success, stdout, stderr = await self._run_rclone(
                "size",
                full_remote,
                "--json",
            )
            
            if not success:
                return 0
            
            data = json.loads(stdout)
            return data.get("bytes", 0)
            
        except Exception:
            return 0
    
    async def check_configured(self) -> tuple[bool, str]:
        """
        Check if rclone remote is configured.
        
        Returns:
            Tuple of (is_configured, message)
        """
        try:
            # Check if rclone is installed
            if not shutil.which("rclone"):
                return False, "rclone is not installed"
            
            # Check if remote is configured
            success, stdout, stderr = await self._run_rclone(
                "listremotes",
            )
            
            if not success:
                return False, f"Failed to list remotes: {stderr}"
            
            remotes = stdout.strip().split("\n")
            expected_remote = f"{self.remote_name}:"
            
            if expected_remote not in remotes:
                return False, f"Remote '{self.remote_name}' not configured. Run: rclone config"
            
            return True, f"Remote '{self.remote_name}' is configured"
            
        except Exception as e:
            return False, str(e)
    
    async def get_quota(self) -> Optional[dict]:
        """
        Get Google Drive quota information.
        
        Returns:
            Dict with quota info or None if unavailable
        """
        try:
            success, stdout, stderr = await self._run_rclone(
                "about",
                f"{self.remote_name}:",
                "--json",
            )
            
            if not success:
                return None
            
            return json.loads(stdout)
            
        except Exception:
            return None
