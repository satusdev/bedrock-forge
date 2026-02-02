"""
Google Drive storage backend using rclone.

Stores backups in Google Drive via rclone remote.
"""
import asyncio
import os
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import BackupStorage, StorageConfig, StorageResult
from ....utils.logging import logger


class GoogleDriveStorage(BackupStorage):
    """
    Google Drive storage backend using rclone.
    
    Requires rclone to be installed and configured with a Google Drive remote.
    """
    
    def __init__(
        self,
        remote_name: str = "gdrive",
        base_folder: Optional[str] = None,
        config: Optional[StorageConfig] = None,
        rclone_config_path: Optional[str] = None,
    ):
        """
        Initialize Google Drive storage.
        
        Args:
            remote_name: Name of the rclone remote (must be configured)
            base_folder: Base folder in Google Drive (defaults to env FORGE_BACKUPS_DIR or 'forge-backups')
            config: Storage configuration
        """
        super().__init__(config)
        self.remote_name = remote_name
        # Use env var as fallback default if base_folder is None or empty
        self.base_folder = base_folder or os.getenv("FORGE_BACKUPS_DIR", "forge-backups")
        self._rclone_path: Optional[str] = None
        self.rclone_config_path = rclone_config_path or os.getenv("RCLONE_CONFIG")

    async def get_file_id(self, remote_path: str) -> Optional[str]:
        """Get file or folder ID from Google Drive path."""
        try:
            full_remote = self._get_remote_path(remote_path)
            # Use lsjson with --stat to get info about the path itself
            success, stdout, stderr = await self._run_rclone(
                "lsjson",
                full_remote,
                "--stat", 
            )
            
            if success:
                try:
                    data = json.loads(stdout)
                    return data.get("ID")
                except:
                    pass
            return None
        except Exception:
            return None

    async def get_folder_id(self, remote_path: str) -> Optional[str]:
        """Get folder ID from a Google Drive folder path."""
        folder_id = await self.get_file_id(remote_path)
        if folder_id:
            return folder_id

        # Fallback: list parent directory and match folder name
        try:
            parent, _, folder_name = (remote_path or "").rstrip("/").rpartition("/")
            if not folder_name:
                return None
            parent_remote = self._get_remote_path(parent)
            success, stdout, _ = await self._run_rclone(
                "lsjson",
                parent_remote,
                "--dirs-only",
                "--max-depth",
                "1",
            )
            if not success:
                return None
            entries = json.loads(stdout) if stdout else []
            for entry in entries:
                if entry.get("Name") == folder_name and entry.get("IsDir"):
                    return entry.get("ID")
        except Exception:
            return None

        return None

    
    @property
    def rclone_path(self) -> str:
        """Get path to rclone binary."""
        if self._rclone_path is None:
            self._rclone_path = shutil.which("rclone") or "rclone"
        return self._rclone_path
    
    def _build_remote_path(self, path: str = "", use_base_path: bool = True) -> str:
        """Build full rclone remote path."""
        base = (self.base_folder or "").strip("/")
        suffix = (path or "").strip("/")
        
        remote = self.remote_name
        # If base looks like a GDrive ID (long alphanumeric, no slashes)
        # We can use it as a root_folder_id overlay
        if use_base_path and base and len(base) > 20 and "/" not in base:
            remote = f"{self.remote_name},root_folder_id={base}"
            combined = suffix
        elif use_base_path and base:
            combined = f"{base}/{suffix}" if suffix else base
        else:
            combined = suffix

        if combined:
            return f"{remote}:{combined}"
        return f"{remote}:"

    def _get_remote_path(self, path: str) -> str:
        """Build full rclone remote path."""
        return self._build_remote_path(path, use_base_path=True)

    def get_remote_path(self, path: str = "", use_base_path: bool = True) -> str:
        """Public helper to build remote path."""
        return self._build_remote_path(path, use_base_path=use_base_path)
    
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
            
            # Check if rclone upload failed
            if not success:
                return StorageResult(
                    success=False,
                    path=str(local_path),
                    error=f"rclone upload failed: {stderr}",
                )
            
            # Get file IDs and other info using lsjson
            success_ls, stdout_ls, stderr_ls = await self._run_rclone(
                "lsjson",
                full_remote,
            )
            
            file_id = None
            if success_ls:
                try:
                    entries = json.loads(stdout_ls)
                    if entries:
                        file_id = entries[0].get("ID")
                except:
                    pass

            # Get file size
            size = local_path.stat().st_size
            
            return StorageResult(
                success=True,
                path=remote_path,
                size_bytes=size,
                storage_file_id=file_id,
                metadata={
                    **(metadata or {}),
                    "gdrive_remote": self.remote_name,
                    "gdrive_path": full_remote,
                    "gdrive_file_id": file_id,
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

    async def delete_folder(self, folder_id: str) -> StorageResult:
        """Delete folder by ID using rclone purge.
        
        Args:
            folder_id: Google Drive folder ID to delete
            
        Returns:
            StorageResult with success/failure
        """
        try:
            # Use root_folder_id to target the specific folder
            remote_spec = f"{self.remote_name},root_folder_id={folder_id}:"
            
            success, stdout, stderr = await self._run_rclone(
                "purge",
                remote_spec,
            )
            
            if not success:
                # Check if folder didn't exist (not an error)
                if "not found" in stderr.lower() or "directory not found" in stderr.lower():
                    return StorageResult(
                        success=True,
                        path=folder_id,
                    )
                logger.error(
                    f"rclone purge failed for folder_id={folder_id} remote_spec={remote_spec}: {stderr}"
                )
                return StorageResult(
                    success=False,
                    path=folder_id,
                    error=f"rclone purge failed: {stderr}",
                )
            
            return StorageResult(
                success=True,
                path=folder_id,
            )
            
        except Exception as e:
            return StorageResult(
                success=False,
                path=folder_id,
                error=str(e),
            )
    
    async def list_files(
        self,
        prefix: str = "",
        max_results: int = 100,
    ) -> list[dict]:
        """
        List files in Google Drive folder using rclone with metadata.
        
        Returns:
            List of dicts with keys: path, name, size, mod_time, id, mime_type
        """
        try:
            search_path = f"{prefix}" if prefix else ""
            full_remote = self._get_remote_path(search_path)
            
            # Use lsjson to get metadata including ID
            success, stdout, stderr = await self._run_rclone(
                "lsjson",
                full_remote,
                "--recursive",
                "--files-only",
                "--no-mimetype",
                "--no-modtime", 
            )
            
            # Note: We can add --hash to get MD5 if needed, but it's slower
            # Re-run with full metadata if cheap enough, but lsjson default is good
            
            if not success:
                return []
            
            entries = json.loads(stdout)
            
            files = []
            for entry in entries:
                if entry.get("IsDir"):
                    continue
                    
                # Relative path from the search prefix
                rel_path = entry.get("Path", "")
                if prefix:
                    rel_path = f"{prefix}/{rel_path}"
                
                files.append({
                    "path": rel_path,
                    "name": entry.get("Name", ""),
                    "size": entry.get("Size", 0),
                    "mod_time": entry.get("ModTime", ""),
                    "id": entry.get("ID", ""),
                    "mime_type": entry.get("MimeType", ""),
                })
            
            # Sort by ModTime desc (if available) or Name
            # rclone lsjson returns ModTime in ISO format
            files.sort(key=lambda x: x.get("mod_time") or "", reverse=True)
            
            return files[:max_results]
            
        except Exception:
            return []

    async def list_directories(
        self,
        prefix: str = "",
        max_results: int = 200,
        shared_with_me: bool = False,
        recursive: bool = False,
        use_base_path: bool = True,
    ) -> list[str]:
        """List directories in Google Drive using rclone."""
        try:
            search_path = f"{prefix}" if prefix else ""
            full_remote = self._build_remote_path(search_path, use_base_path=use_base_path)

            args = ["lsf", full_remote, "--dirs-only"]
            if recursive:
                args.append("--recursive")
            # Note: --max-count doesn't exist in rclone v1.72.1, limiting is done in Python
            if shared_with_me:
                args.append("--drive-shared-with-me")

            success, stdout, stderr = await self._run_rclone(*args)
            if not success:
                return []

            entries = []
            for line in stdout.strip().split("\n"):
                entry = line.strip().rstrip("/")
                if not entry:
                    continue
                entries.append(entry)

            results = [
                f"{prefix}/{entry}".strip("/") if prefix else entry
                for entry in entries
            ]

            return results[:max_results]
        except Exception:
            return []

    async def search_directories(
        self,
        query: str,
        prefix: str = "",
        max_results: int = 200,
        shared_with_me: bool = False,
        use_base_path: bool = True,
    ) -> list[str]:
        """Search directories by name in Google Drive using rclone."""
        try:
            if not query:
                return []

            candidates = await self.list_directories(
                prefix=prefix,
                max_results=max_results,
                shared_with_me=shared_with_me,
                recursive=True,
                use_base_path=use_base_path,
            )

            lowered = query.lower()
            matches = [
                entry for entry in candidates
                if entry.lower().find(lowered) != -1
            ]

            return matches[:max_results]
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
    
    async def find_by_id(self, file_id: str) -> Optional[dict]:
        """
        Find a file or folder by ID within the base folder.
        
        Returns:
            Dict with 'path', 'name', 'is_dir', 'id' or None
        """
        try:
            # Use lsjson on the base folder
            # We can't easily query by ID with rclone without mounting or iterating
            # But we can list the current directory
            full_remote = self._get_remote_path("")
            
            success, stdout, stderr = await self._run_rclone(
                "lsjson",
                full_remote,
                "--no-mimetype",
                "--no-modtime"
            )
            
            if not success:
                return None
            
            entries = json.loads(stdout)
            for entry in entries:
                if entry.get("ID") == file_id:
                    return {
                        "path": entry.get("Path"),
                        "name": entry.get("Name"),
                        "is_dir": entry.get("IsDir", False),
                        "id": entry.get("ID")
                    }
                    
            return None
            
        except Exception:
            return None

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

    async def get_link(self, remote_path: str) -> Optional[str]:
        """Get public/shareable link for a file."""
        try:
            full_remote = self._get_remote_path(remote_path)
            success, stdout, stderr = await self._run_rclone(
                "link",
                full_remote,
            )
            
            if success and stdout.strip():
                return stdout.strip()
            
            # Fallback to direct ID link if we can get the ID
            file_id = None
            success_ls, stdout_ls, stderr_ls = await self._run_rclone(
                "lsjson",
                full_remote,
            )
            if success_ls:
                entries = json.loads(stdout_ls)
                if entries:
                    file_id = entries[0].get("ID")
            
            if file_id:
                return f"https://drive.google.com/open?id={file_id}"
                
            return None
        except Exception:
            return None
