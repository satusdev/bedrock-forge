"""
Amazon S3 storage backend using rclone.

Stores backups in S3-compatible object storage via rclone remote.
"""
import asyncio
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import BackupStorage, StorageConfig, StorageResult


class S3Storage(BackupStorage):
    """
    S3 storage backend using rclone.
    
    Requires rclone to be installed and configured with an S3 remote.
    """
    
    def __init__(
        self,
        remote_name: str = "s3",
        bucket: str = "",
        prefix: str = "forge-backups",
        config: Optional[StorageConfig] = None,
        rclone_config_path: Optional[str] = None,
    ):
        """
        Initialize S3 storage.
        
        Args:
            remote_name: Name of the rclone remote (must be configured)
            bucket: S3 bucket name
            prefix: Prefix (folder) within the bucket
            config: Storage configuration
        """
        super().__init__(config)
        self.remote_name = remote_name
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self._rclone_path: Optional[str] = None
        self.rclone_config_path = rclone_config_path or os.getenv("RCLONE_CONFIG")
    
    @property
    def rclone_path(self) -> str:
        """Get path to rclone binary."""
        if self._rclone_path is None:
            self._rclone_path = shutil.which("rclone") or "rclone"
        return self._rclone_path
    
    def _build_remote_path(self, path: str = "") -> str:
        """Build full rclone remote path."""
        # Format: remote:bucket/prefix/path
        base_path = f"{self.bucket}/{self.prefix}".strip("/")
        suffix = (path or "").strip("/")
        
        if base_path and suffix:
            combined = f"{base_path}/{suffix}"
        elif base_path:
            combined = base_path
        else:
            combined = suffix

        return f"{self.remote_name}:{combined}"

    def get_remote_path(self, path: str = "") -> str:
        """Public helper to build remote path."""
        return self._build_remote_path(path)
    
    async def _run_rclone(
        self,
        *args: str,
        check: bool = True,
    ) -> tuple[bool, str, str]:
        """
        Run rclone command asynchronously.
        """
        cmd = [self.rclone_path]
        if self.rclone_config_path:
            cmd.extend(["--config", self.rclone_config_path])
        cmd.extend(args)
        
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
        """Upload file to S3 using rclone."""
        try:
            full_remote = self._build_remote_path(remote_path)
            
            # Use rclone copyto
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
                    error=f"rclone S3 upload failed: {stderr}",
                )
            
            size = local_path.stat().st_size
            
            return StorageResult(
                success=True,
                path=remote_path,
                size_bytes=size,
                metadata={
                    **(metadata or {}),
                    "s3_remote": self.remote_name,
                    "s3_bucket": self.bucket,
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
        """Download file from S3 using rclone."""
        try:
            full_remote = self._build_remote_path(remote_path)
            
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
                    error=f"rclone S3 download failed: {stderr}",
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
        """Delete file from S3 using rclone."""
        try:
            full_remote = self._build_remote_path(remote_path)
            
            success, stdout, stderr = await self._run_rclone(
                "deletefile",
                full_remote,
            )
            
            if not success:
                if "not found" in stderr.lower():
                    return StorageResult(
                        success=True,
                        path=remote_path,
                    )
                return StorageResult(
                    success=False,
                    path=remote_path,
                    error=f"rclone S3 delete failed: {stderr}",
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
    ) -> list[dict]:
        """
        List files in S3 bucket using rclone.
        """
        try:
            # listjson on bucket/prefix
            search_path = f"{prefix}" if prefix else ""
            full_remote = self._build_remote_path(search_path)
            
            success, stdout, stderr = await self._run_rclone(
                "lsjson",
                full_remote,
                "--recursive",
                "--files-only",
                "--no-mimetype",
            )
            
            if not success:
                return []
            
            entries = json.loads(stdout)
            
            files = []
            for entry in entries:
                if entry.get("IsDir"):
                    continue
                    
                rel_path = entry.get("Path", "")
                if prefix:
                    rel_path = f"{prefix}/{rel_path}"
                
                files.append({
                    "path": rel_path,
                    "name": entry.get("Name", ""),
                    "size": entry.get("Size", 0),
                    "mod_time": entry.get("ModTime", ""),
                })
            
            files.sort(key=lambda x: x.get("mod_time") or "", reverse=True)
            
            return files[:max_results]
            
        except Exception:
            return []
    
    async def exists(self, remote_path: str) -> bool:
        """Check if file exists."""
        try:
            full_remote = self._build_remote_path(remote_path)
            success, stdout, stderr = await self._run_rclone(
                "lsf",
                full_remote,
                check=False,
            )
            return success and bool(stdout.strip())
        except Exception:
            return False
    
    async def get_size(self, remote_path: str) -> int:
        """Get file size."""
        try:
            full_remote = self._build_remote_path(remote_path)
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
        """Check if rclone remote is configured."""
        try:
            if not shutil.which("rclone"):
                return False, "rclone is not installed"
            
            success, stdout, stderr = await self._run_rclone("listremotes")
            if not success:
                return False, f"Failed to list remotes: {stderr}"
            
            remotes = stdout.strip().split("\n")
            expected_remote = f"{self.remote_name}:"
            
            if expected_remote not in remotes:
                return False, f"Remote '{self.remote_name}' not configured"
            
            return True, f"Remote '{self.remote_name}' is configured"
        except Exception as e:
            return False, str(e)
