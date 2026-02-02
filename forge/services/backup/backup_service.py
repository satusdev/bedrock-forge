"""
Backup service for creating and managing project backups.

Handles database and file backups with multi-storage support.
"""
import asyncio
import os
import shutil
import tarfile
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from forge.db.models.backup_schedule import BackupSchedule
from forge.utils.logging import logger
from forge.services.ssh_service import SSHKeyService

from forge.api.dashboard_config import get_dashboard_config
from forge.utils.ssh import SSHClient
from .storage import BackupStorage, LocalStorage, GoogleDriveStorage, S3Storage


# Map BackupStorageType enum values to storage backend keys
# This handles the mismatch between 'google_drive' enum value and 'gdrive' backend key
STORAGE_TYPE_TO_BACKEND = {
    "local": "local",
    "google_drive": "gdrive",
    "s3": "s3",
}


def normalize_storage_backend(storage_type) -> str:
    """
    Convert storage type (enum, string, or None) to normalized backend key.
    
    Handles:
    - BackupStorageType enum objects -> extracts .value
    - String values like 'google_drive' -> maps to 'gdrive'
    - None -> defaults to 'local'
    - Already normalized keys like 'gdrive' -> passes through
    """
    if storage_type is None:
        return "local"
    
    val = storage_type
    # Handle enum objects (have .value attribute)
    if hasattr(val, 'value'):
        val = val.value
        
    val = str(val)  # Force string conversion
    
    # Apply mapping (or return as-is if already a valid backend key)
    return STORAGE_TYPE_TO_BACKEND.get(val, val)


from forge.core.backup_types import BackupType, BackupStatus, BackupConfig, BackupResult


class BackupService:
    """
    Service for creating and managing backups.
    
    Supports multiple storage backends (local, Google Drive, S3)
    and various backup types (full, database, files).
    """
    
    def __init__(
        self,
        db: AsyncSession,
        local_backup_path: Optional[Path] = None,
        log_callback: Optional[callable] = None,
    ):
        """
        Initialize backup service.
        
        Args:
            db: Database session
            local_backup_path: Base path for local backups
            log_callback: Optional async callback for logging progress
        """
        self.db = db
        self.local_backup_path = local_backup_path or Path.home() / ".forge" / "backups"
        self._storage_backends: dict[str, BackupStorage] = {}
        self.log = log_callback
    
    def _get_storage(self, backend: str, config: Optional[dict] = None) -> BackupStorage:
        """Get or create storage backend instance."""
        # Normalize backend key to handle enum values (e.g., 'google_drive' -> 'gdrive')
        normalized_backend = STORAGE_TYPE_TO_BACKEND.get(backend, backend)
        
        if normalized_backend not in self._storage_backends:
            config = config or {}
            
            if normalized_backend == "local":
                self._storage_backends[normalized_backend] = LocalStorage(
                    base_path=self.local_backup_path,
                )
            elif normalized_backend == "gdrive":
                # Use global config as default
                global_config = get_dashboard_config()
                self._storage_backends[normalized_backend] = GoogleDriveStorage(
                    remote_name=config.get("gdrive_remote") or global_config.gdrive_rclone_remote or "gdrive",
                    base_folder=config.get("gdrive_folder") or global_config.gdrive_base_path or "forge-backups",
                )
            elif normalized_backend == "s3":
                self._storage_backends[normalized_backend] = S3Storage(
                    remote_name=config.get("s3_remote", "s3"),
                    bucket=config.get("s3_bucket", "temp-bucket"), # ensure bucket is not empty string by default if possible, or handle it
                    prefix=config.get("s3_prefix", "forge-backups"),
                )
            else:
                raise ValueError(f"Unknown storage backend: {backend}")
        
        return self._storage_backends[normalized_backend]
    
    async def create_backup(
        self,
        project_path: Path,
        schedule: Optional[BackupSchedule] = None,
        config: Optional[BackupConfig] = None,
        log_callback: Optional[callable] = None,
    ) -> BackupResult:
        """
        Create a backup of a WordPress project.
        Delegates to BackupOrchestrator.
        """
        # Lazy import to avoid circular dependency
        from .orchestrator import BackupOrchestrator
        
        config = config or BackupConfig()
        orchestrator = BackupOrchestrator(self.db, self)
        return await orchestrator.run(project_path, schedule, config, log_callback)

    async def _backup_database(
        self,
        project_path: Path,
        temp_dir: Path,
        backup_id: str,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """
        Backup WordPress database using wp-cli locally.
        """
        try:
            dump_file = temp_dir / f"{backup_id}_database.sql"
            
            # Use wp-cli to export database
            process = await asyncio.create_subprocess_exec(
                "wp", "db", "export", str(dump_file),
                "--path", str(project_path / "web" / "wp"),
                "--allow-root",
                cwd=str(project_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                # Try bedrock structure
                process = await asyncio.create_subprocess_exec(
                    "wp", "db", "export", str(dump_file),
                    "--path", str(project_path),
                    "--allow-root",
                    cwd=str(project_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()
            
            if process.returncode == 0 and dump_file.exists():
                return dump_file
            
            error_msg = stderr.decode().strip() if stderr else "Unknown error"
            raise Exception(f"Local WP-CLI DB export failed (code {process.returncode}): {error_msg}")
            
        except Exception as e:
            logger.error(f"Local database backup failed: {e}")
            raise e
            return None

    async def _backup_remote_database(
        self,
        env_link, # ProjectServer
        temp_dir: Path,
        backup_id: str,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """
        Backup remote WordPress database via SSH.
        Downloads the dump to temp_dir.
        """
        try:
            from forge.utils.ssh import SSHClient
            
            dump_filename = f"{backup_id}_database.sql"
            remote_dump_path = f"/tmp/{dump_filename}"
            local_dump_path = temp_dir / dump_filename
            
            # Resolve SSH credentials
            server = env_link.server
            host = server.hostname
            port = server.ssh_port
            user = env_link.ssh_user or server.ssh_user
            
            # Handle potentially encrypted fields (assuming TypeDecorator handles decryption on access)
            key_path = env_link.ssh_key_path if env_link.ssh_key_path else server.ssh_key_path
            password = server.ssh_password
            private_key = server.ssh_private_key

            # Fallback to System SSH Key if no credentials provided
            if not password and not key_path and not private_key:
                system_keys = await SSHKeyService.get_system_key(self.db)
                if system_keys and system_keys.get("private_key"):
                    private_key = system_keys["private_key"]
                    logger.info(f"Using system SSH key for backup of {host}")
            
            ssh = SSHClient(
                host=host, 
                user=user, 
                port=port,
                key_path=key_path,
                password=password,
                private_key=private_key
            )
            
            loop = asyncio.get_event_loop()
            
            # Define outside nested function for proper scoping
            local_gz_path = local_dump_path.with_suffix('.sql.gz')
            
            def perform_remote_backup():
                nonlocal local_gz_path
                with ssh:
                    # 1. Export DB on remote (compressed)
                    # Use gzip to compress stream directly if possible, or compress after. 
                    # wp db export supports - | gzip > file.sql.gz syntax
                    cmd = f"cd '{env_link.wp_path}' && wp db export - --allow-root | gzip > '{remote_dump_path}.gz'"
                    logger.info(f"Executing remote export: {cmd}")
                    result = ssh.run(cmd)
                    
                    if result.returncode != 0:
                        raise Exception(f"Remote WP-CLI failed: {result.stderr}")
                    
                    # 2. Download dump
                    remote_gz_path = f"{remote_dump_path}.gz"
                    
                    logger.info(f"Downloading dump: {remote_gz_path} -> {local_gz_path}")
                    ssh.download(remote_gz_path, str(local_gz_path))
                    
                    # 3. Cleanup remote
                    ssh.run(f"rm '{remote_gz_path}'")

            await loop.run_in_executor(None, perform_remote_backup)
            
            if local_gz_path.exists():
                return local_gz_path
                
            return None
            
        except Exception as e:
            logger.error(f"Remote DB backup failed: {e}")
            raise # Propagate to caller to get specific error message

    async def _backup_remote_database_scalar(
        self,
        config: BackupConfig,
        temp_dir: Path,
        backup_id: str,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """
        Backup remote WordPress database via SSH using scalar config values.
        Delegates to RemoteBackupRunner.
        """
        from .remote_runner import RemoteBackupRunner
        runner = RemoteBackupRunner(self.db)
        return await runner.backup_database(config, temp_dir, backup_id, log)

    async def _backup_files_remote_scalar(
        self,
        config: BackupConfig,
        temp_dir: Path,
        backup_id: str,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """Backup files from remote server via SSH using scalar config values."""
        from .remote_runner import RemoteBackupRunner
        runner = RemoteBackupRunner(self.db)
        return await runner.backup_files(config, temp_dir, backup_id, log)


    async def _backup_files(
        self,
        project_path: Path,
        temp_dir: Path,
        backup_id: str,
        config: BackupConfig,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """
        Backup WordPress files.
        
        Returns path to the files archive.
        """
        try:
            archive_path = temp_dir / f"{backup_id}_files.tar.gz"
            
            # Determine which directories to include
            dirs_to_backup = []
            
            # PREFERENCE: Check for 'web' directory at root (Bedrock/Standard parity with script)
            web_dir = project_path / "web"
            if web_dir.exists():
                if log: await log("Found 'web' directory, including entire web folder...")
                dirs_to_backup.append(web_dir)
            
            # Fallback to Bedrock structure detection if no 'web' logic above (though web covers it)
            elif (project_path / "app").exists():
                # Bedrock structure
                dirs_to_backup.append(project_path / "web" / "app" / "themes")
                dirs_to_backup.append(project_path / "web" / "app" / "plugins")
                dirs_to_backup.append(project_path / "web" / "app" / "mu-plugins")
                dirs_to_backup.append(project_path / "config")
                dirs_to_backup.append(project_path / ".env")
                
                # Bedrock structure checks
                uploads_path = project_path / "web" / "app" / "uploads"
                if config.include_uploads and uploads_path.exists():
                     dirs_to_backup.append(uploads_path)
            else:
                # Standard WordPress structure
                dirs_to_backup.append(project_path / "wp-content" / "themes")
                dirs_to_backup.append(project_path / "wp-content" / "plugins")
                
                uploads_path = project_path / "wp-content" / "uploads"
                if config.include_uploads and uploads_path.exists():
                    dirs_to_backup.append(uploads_path)
            
            # Filter to existing paths
            dirs_to_backup = [d for d in dirs_to_backup if d.exists()]
            
            if not dirs_to_backup:
                return None
            
            # Create archive
            loop = asyncio.get_event_loop()
            
            def create_tar():
                with tarfile.open(archive_path, "w:gz") as tar:
                    for path in dirs_to_backup:
                        if path.is_file():
                            arcname = path.name
                        else:
                            arcname = path.relative_to(project_path)
                        
                        # Filter function for exclusions
                        def exclude_filter(tarinfo):
                            name = tarinfo.name
                            for pattern in config.exclude_patterns:
                                if pattern.startswith("*"):
                                    if name.endswith(pattern[1:]):
                                        return None
                                elif pattern in name:
                                    return None
                            return tarinfo
                        
                        tar.add(
                            path,
                            arcname=str(arcname),
                            filter=exclude_filter,
                        )
            
            await loop.run_in_executor(None, create_tar)
            
            if archive_path.exists():
                return archive_path
            
            return None
            
        except Exception:
            return None
    
    async def _create_archive(
        self,
        temp_dir: Path,
        files: list[Path],
        backup_id: str,
    ) -> Path:
        """Combine multiple backup files into a single archive."""
        archive_path = temp_dir / f"{backup_id}.tar.gz"
        
        loop = asyncio.get_event_loop()
        
        def create_combined():
            with tarfile.open(archive_path, "w:gz") as tar:
                for file_path in files:
                    tar.add(file_path, arcname=file_path.name)
        
        await loop.run_in_executor(None, create_combined)
        return archive_path

    async def _backup_files_remote(
        self,
        env_link,
        temp_dir: Path,
        backup_id: str,
        config: BackupConfig,
        log: Optional[callable] = None,
    ) -> Optional[Path]:
        """Backup files from remote server via SSH."""
        try:
            server = env_link.server
            host = server.hostname
            port = server.ssh_port or 22
            user = env_link.ssh_user or server.ssh_user
            
            # Credentials
            key_path = env_link.ssh_key_path if env_link.ssh_key_path else server.ssh_key_path
            password = server.ssh_password
            private_key = server.ssh_private_key
            
            if not password and not key_path and not private_key:
                system_keys = await SSHKeyService.get_system_key(self.db)
                if system_keys and system_keys.get("private_key"):
                    private_key = system_keys["private_key"]

            ssh = SSHClient(
                host=host, user=user, port=port,
                key_path=key_path, password=password, private_key=private_key
            )
            
            local_archive_path = temp_dir / f"{backup_id}_files.tar.gz"
            remote_archive_path = f"/tmp/{backup_id}_files.tar.gz"
            
            loop = asyncio.get_event_loop()
            
            # Wrapper for sync SSH operations
            def perform_remote_file_backup():
                with ssh:
                    raw_wp_path = (env_link.wp_path or "").rstrip("/")
                    if "/web/web" in raw_wp_path:
                        raw_wp_path = raw_wp_path.replace("/web/web", "/web")
                    base_path = raw_wp_path
                    if raw_wp_path.endswith("/web/app"):
                        base_path = raw_wp_path[:-8]
                    elif "/web/app" in raw_wp_path:
                        base_path = raw_wp_path.split("/web/app")[0]
                    elif raw_wp_path.endswith("/web"):
                        base_path = raw_wp_path[:-4]

                    # Check for 'web' directory at root
                    check_web_cmd = f"test -d '{base_path}/web' && echo 'exists'"
                    web_exists_result = ssh.run(check_web_cmd)
                    has_web = "exists" in web_exists_result.stdout
                    
                    dirs = []
                    # Logic Parity: If 'web' exists, backup the whole thing
                    if has_web:
                         logger.info("Found remote 'web' directory, backing up entire folder...")
                         dirs.append("web")
                         # Include config/.env if outside web usually
                         dirs.append("config")
                         dirs.append(".env")
                    else:
                        # Fallback to Bedrock specific subfolders
                        # Bedrock: web/app/uploads, web/app/themes, web/app/plugins
                        dirs = [
                            "web/app/themes",
                            "web/app/plugins",
                            "web/app/mu-plugins",
                            "config",
                            ".env"
                        ]
                        if config.include_uploads:
                            dirs.append("web/app/uploads")

                    # Construct exclude args
                    excludes = ""
                    if config.exclude_patterns:
                        excludes = " ".join([f"--exclude='{p}'" for p in config.exclude_patterns])
                    
                    dirs_str = " ".join([f"'{d}'" for d in dirs])
                    
                    dirs_str = " ".join([f"'{d}'" for d in dirs])
                    
                    # -v for verbose to confirm files are processed
                    cmd = f"cd '{base_path}' && tar -czvf '{remote_archive_path}' {excludes} {dirs_str}"
                    logger.info(f"Executing remote file backup: {cmd}")
                    
                    result = ssh.run(cmd)
                    if result.returncode != 0:
                        # Fallback: maybe paths don't exist exactly? 
                        # Try broader backup? Or just log warn and try ignore-failed-read
                        logger.warning(f"Remote tar warning/error: {result.stderr}")
                        # If tar failed completely, file won't exist.
                    
                    ssh.download(remote_archive_path, str(local_archive_path))
                    ssh.run(f"rm '{remote_archive_path}'")
            
            if log: await log(f"Starting remote backup of {host}...")
            await loop.run_in_executor(None, perform_remote_file_backup)
            if log: await log("Remote files downloaded successfully.")
            
            if local_archive_path.exists():
                return local_archive_path
            return None

        except Exception as e:
            logger.error(f"Remote file backup failed: {e}")
            return None
    
    async def restore_backup(
        self,
        backup_path: str,
        project_path: Path,
        storage_backend: str = "local",
        storage_config: Optional[dict] = None,
    ) -> BackupResult:
        """
        Restore a backup to a project.
        
        Args:
            backup_path: Path/identifier of the backup
            project_path: Target project path
            storage_backend: Storage backend to download from
            storage_config: Storage configuration
            
        Returns:
            BackupResult with operation status
        """
        start_time = datetime.utcnow()
        backup_id = f"restore_{start_time.strftime('%Y%m%d_%H%M%S')}"
        
        temp_dir = Path(tempfile.mkdtemp(prefix="forge_restore_"))
        
        try:
            storage = self._get_storage(storage_backend, storage_config)
            
            # Download backup
            local_archive = temp_dir / "backup.tar.gz"
            download_result = await storage.download(backup_path, local_archive)
            
            if not download_result.success:
                return BackupResult(
                    success=False,
                    backup_id=backup_id,
                    status=BackupStatus.FAILED,
                    error=f"Download failed: {download_result.error}",
                )
            
            # Extract archive
            extract_dir = temp_dir / "extracted"
            extract_dir.mkdir()
            
            loop = asyncio.get_event_loop()
            
            def extract():
                with tarfile.open(local_archive, "r:gz") as tar:
                    tar.extractall(extract_dir)
            
            await loop.run_in_executor(None, extract)
            
            # Restore database if present
            for sql_file in extract_dir.glob("*_database.sql"):
                await self._restore_database(sql_file, project_path)
                break
            
            # Restore files if present
            for files_archive in extract_dir.glob("*_files.tar.gz"):
                await self._restore_files(files_archive, project_path)
                break
            
            return BackupResult(
                success=True,
                backup_id=backup_id,
                status=BackupStatus.COMPLETED,
                duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
            )
            
        except Exception as e:
            return BackupResult(
                success=False,
                backup_id=backup_id,
                status=BackupStatus.FAILED,
                error=str(e),
            )
            
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
    
    async def _restore_database(
        self,
        sql_file: Path,
        project_path: Path,
    ) -> bool:
        """Restore database from SQL dump."""
        try:
            process = await asyncio.create_subprocess_exec(
                "wp", "db", "import", str(sql_file),
                "--path", str(project_path),
                "--allow-root",
                cwd=str(project_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            return process.returncode == 0
        except Exception:
            return False
    
    async def _restore_files(
        self,
        archive: Path,
        project_path: Path,
    ) -> bool:
        """Restore files from archive."""
        try:
            loop = asyncio.get_event_loop()
            
            def extract():
                with tarfile.open(archive, "r:gz") as tar:
                    tar.extractall(project_path)
            
            await loop.run_in_executor(None, extract)
            return True
        except Exception:
            return False
    
    async def list_backups(
        self,
        schedule: Optional[BackupSchedule] = None,
        storage_backend: str = "local",
        storage_config: Optional[dict] = None,
        max_results: int = 50,
    ) -> list[dict]:
        """
        List available backups.
        
        Args:
            schedule: Filter by schedule
            storage_backend: Storage backend to query
            storage_config: Storage configuration
            max_results: Maximum results to return
            
        Returns:
            List of backup metadata dicts
        """
        try:
            storage = self._get_storage(storage_backend, storage_config)
            
            # Determine prefix
            if schedule:
                prefix = f"schedules/{schedule.id}"
            else:
                prefix = ""
            
            # This returns list[dict] for GDrive but might return list[str] for others if they are not updated
            files = await storage.list_files(prefix=prefix, max_results=max_results)
            
            backups = []
            for file_item in files:
                # Handle both legacy string path and new dict metadata
                if isinstance(file_item, str):
                    path = file_item
                    size = await storage.get_size(path)
                    mod_time = None
                    file_id = None
                else:
                    path = file_item.get("path")
                    size = file_item.get("size")
                    mod_time = file_item.get("mod_time")
                    file_id = file_item.get("id")
                
                # Construct web link for GDrive if ID is available
                # Note: This is a view link, depends on permissions
                web_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing" if file_id and storage_backend == "gdrive" else None
                
                backups.append({
                    "path": path,
                    "size_bytes": size,
                    "storage": storage_backend,
                    "mod_time": mod_time,
                    "id": file_id,
                    "link": web_link,
                })
            
            return backups
            
        except Exception:
            return []
    
    async def delete_backup(
        self,
        backup_path: str,
        storage_backend: str = "local",
        storage_config: Optional[dict] = None,
    ) -> bool:
        """Delete a backup from storage."""
        try:
            storage = self._get_storage(storage_backend, storage_config)
            result = await storage.delete(backup_path)
            return result.success
        except Exception:
            return False

    async def download_backup_stream(
        self,
        backup_path: str,
        storage_backend: str = "local",
        storage_config: Optional[dict] = None,
    ):
        """
        Get a download stream for a backup file.
        
        Returns:
            Generator yielding chunks of the file
        """
        try:
            storage = self._get_storage(storage_backend, storage_config)
            
            # Create a temporary file to download to, then stream it
            # Direct streaming from rclone stdout is complex with async
            # For now, download to temp then stream
            
            temp_dir = Path(tempfile.mkdtemp(prefix="forge_download_"))
            local_path = temp_dir / "download.tmp"
            
            download_result = await storage.download(backup_path, local_path)
            
            if not download_result.success:
                raise Exception(f"Failed to download backup: {download_result.error}")
            
            # Stream the file and delete temp dir when done
            # Note: This relies on the caller to handle the stream and we might need 
            # a better way to cleanup. FastApi BackgroundTasks can handle cleanup.
            
            # Better approach for large files: Direct stream from rclone cat?
            # But Storage API is designed around file ops.
            # Let's stick to download-then-stream for reliability for now.
            
            return local_path, temp_dir
            
        except Exception as e:
            raise e

    async def _process_uploads(
        self,
        backup_files: list[Path],
        config: BackupConfig,
        schedule: Optional[BackupSchedule],
        start_time: datetime,
        project_path: Path,
        log: callable,
    ) -> BackupResult:
        """
        Internal helper to handle archiving and uploading.
        Used by BackupOrchestrator.
        """
        result = BackupResult(
            success=False,
            backup_id="", # Placeholder
            status=BackupStatus.IN_PROGRESS,
            storage_results={}
        )
        
        # Determine files to upload
        files_to_upload = []
        is_split_mode = "gdrive" in config.storage_backends and len(backup_files) > 1
        
        if is_split_mode:
            files_to_upload = backup_files
            result.backup_path = "split_upload" 
            result.size_bytes = sum(f.stat().st_size for f in backup_files)
        else:
            if (config.compress or len(backup_files) > 1) and backup_files:
                await log("Creating combined backup archive...")
                archive_path = await self._create_archive(
                    backup_files[0].parent, backup_files, f"backup_{start_time.strftime('%Y%m%d_%H%M%S')}"
                )
            elif backup_files:
                archive_path = backup_files[0]
            else:
                 # Should not happen if caller checked
                 return result
            
            result.backup_path = str(archive_path)
            result.size_bytes = archive_path.stat().st_size
            files_to_upload = [archive_path]
        
        # Upload
        storage_config = config.storage_config if config.storage_config else (schedule.storage_config if schedule else {})
        
        for backend in config.storage_backends:
            try:
                await log(f"Preparing storage backend: {backend}")
                storage = self._get_storage(backend, storage_config)
                
                # Determine remote base path/folder
                project_name = config.project_name
                env_name = config.environment_type
                
                if backend == "gdrive":
                    timestamp_folder = start_time.strftime("%Y-%m-%d_%H-%M")
                    # Check if environment-specific folder ID is used (heuristic: long, no slashes)
                    gdrive_folder = storage_config.get("gdrive_folder")
                    if gdrive_folder and len(gdrive_folder) > 20 and "/" not in gdrive_folder:
                             # This IS the root folder for this backup context (e.g. project/env folder)
                             # So we only append the timestamp folder
                             remote_base = timestamp_folder
                    else:
                             # Default: build directory structure
                             remote_base = f"{project_name}/{env_name}/{timestamp_folder}"
                elif backend == "s3":
                     timestamp_folder = start_time.strftime("%Y-%m-%d_%H-%M")
                     remote_base = f"{project_name}/{env_name}/{timestamp_folder}"
                elif schedule:
                    remote_base = f"schedules/{schedule.id}/{start_time.strftime('%Y%m%d_%H%M%S')}"
                else:
                    remote_base = f"{project_name}/{env_name}/manual_{start_time.strftime('%Y%m%d_%H%M%S')}"
                
                backend_success = True
                backend_paths = []
                storage_file_id = None
                
                for local_file in files_to_upload:
                     file_name = local_file.name
                     remote_path = f"{remote_base}/{file_name}"
                     
                     await log(f"Uploading {file_name} to {backend}...")
                     
                     upload_result = await storage.upload(
                        local_path=local_file,
                        remote_path=remote_path,
                        metadata={
                            "project": str(project_path),
                            "schedule_id": str(schedule.id) if schedule else None,
                            "backup_type": config.backup_type.value if hasattr(config.backup_type, 'value') else str(config.backup_type),
                            "created_at": start_time.isoformat(),
                            "environment": config.environment_type
                        },
                     )
                     
                     if upload_result.success:
                         backend_paths.append(upload_result.path)
                     else:
                         backend_success = False
                         result.storage_results[backend] = {
                            "success": False,
                            "error": upload_result.error
                         }
                         break
                
                if backend_success:
                    # GDrive Folder ID refinement
                    if backend == "gdrive":
                        try:
                             folder_id = await storage.get_folder_id(remote_base)
                             if folder_id:
                                storage_file_id = folder_id
                        except Exception:
                            pass
                    
                    if storage_file_id:
                        result.storage_file_id = storage_file_id

                    result.storage_results[backend] = {
                        "success": True,
                        "path": remote_base if backend == "gdrive" else (
                            backend_paths[0] if len(backend_paths) == 1 else remote_base
                        ),
                        "size": result.size_bytes,
                        "files": backend_paths,
                        "storage_file_id": storage_file_id,
                    }
                    await log(f"Upload to {backend} completed.")
                
            except Exception as e:
                result.storage_results[backend] = {
                    "success": False,
                    "error": str(e),
                }
        
        return result
