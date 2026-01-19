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

from .storage import BackupStorage, LocalStorage, GoogleDriveStorage, S3Storage


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
    
    Attributes:
        backup_type: Type of backup to create
        include_database: Whether to backup database
        include_files: Whether to backup files
        include_uploads: Whether to include wp-content/uploads
        exclude_patterns: Glob patterns to exclude
        compress: Whether to compress the backup
        encryption_key: Optional encryption key
        storage_backends: Storage backends to upload to
    """
    backup_type: BackupType = BackupType.FULL
    include_database: bool = True
    include_files: bool = True
    include_uploads: bool = True
    exclude_patterns: list[str] = field(default_factory=lambda: [
        "*.log",
        "*.tmp",
        ".git",
        "node_modules",
        ".cache",
    ])
    compress: bool = True
    encryption_key: Optional[str] = None
    storage_backends: list[str] = field(default_factory=lambda: ["local"])


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
    storage_results: dict = field(default_factory=dict)
    error: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "backup_id": self.backup_id,
            "status": self.status.value,
            "backup_path": self.backup_path,
            "size_bytes": self.size_bytes,
            "duration_seconds": self.duration_seconds,
            "storage_results": self.storage_results,
            "error": self.error,
        }


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
    ):
        """
        Initialize backup service.
        
        Args:
            db: Database session
            local_backup_path: Base path for local backups
        """
        self.db = db
        self.local_backup_path = local_backup_path or Path.home() / ".forge" / "backups"
        self._storage_backends: dict[str, BackupStorage] = {}
    
    def _get_storage(self, backend: str, config: Optional[dict] = None) -> BackupStorage:
        """Get or create storage backend instance."""
        if backend not in self._storage_backends:
            config = config or {}
            
            if backend == "local":
                self._storage_backends[backend] = LocalStorage(
                    base_path=self.local_backup_path,
                )
            elif backend == "gdrive":
                self._storage_backends[backend] = GoogleDriveStorage(
                    remote_name=config.get("gdrive_remote", "gdrive"),
                    base_folder=config.get("gdrive_folder", "forge-backups"),
                )
            elif backend == "s3":
                self._storage_backends[backend] = S3Storage(
                    bucket=config.get("s3_bucket", ""),
                    prefix=config.get("s3_prefix", "forge-backups"),
                    region=config.get("s3_region", "us-east-1"),
                    endpoint_url=config.get("s3_endpoint"),
                )
            else:
                raise ValueError(f"Unknown storage backend: {backend}")
        
        return self._storage_backends[backend]
    
    async def create_backup(
        self,
        project_path: Path,
        schedule: Optional[BackupSchedule] = None,
        config: Optional[BackupConfig] = None,
    ) -> BackupResult:
        """
        Create a backup of a WordPress project.
        
        Args:
            project_path: Path to the WordPress project
            schedule: Optional backup schedule (for metadata)
            config: Backup configuration
            
        Returns:
            BackupResult with operation status
        """
        start_time = datetime.utcnow()
        config = config or BackupConfig()
        
        # Generate backup ID
        timestamp = start_time.strftime("%Y%m%d_%H%M%S")
        backup_id = f"backup_{timestamp}"
        
        # Create temp directory for backup files
        temp_dir = Path(tempfile.mkdtemp(prefix="forge_backup_"))
        
        try:
            result = BackupResult(
                success=False,
                backup_id=backup_id,
                status=BackupStatus.IN_PROGRESS,
            )
            
            backup_files = []
            
            # Backup database
            if config.include_database and config.backup_type in [
                BackupType.FULL, BackupType.DATABASE
            ]:
                db_result = await self._backup_database(
                    project_path, temp_dir, backup_id
                )
                if db_result:
                    backup_files.append(db_result)
                    result.database_backup = str(db_result)
            
            # Backup files
            if config.include_files and config.backup_type in [
                BackupType.FULL, BackupType.FILES
            ]:
                files_result = await self._backup_files(
                    project_path, temp_dir, backup_id, config
                )
                if files_result:
                    backup_files.append(files_result)
                    result.files_backup = str(files_result)
            
            if not backup_files:
                result.error = "No backup files were created"
                result.status = BackupStatus.FAILED
                return result
            
            # Create combined archive if multiple files
            if len(backup_files) > 1 and config.compress:
                archive_path = await self._create_archive(
                    temp_dir, backup_files, backup_id
                )
            else:
                archive_path = backup_files[0]
            
            result.backup_path = str(archive_path)
            result.size_bytes = archive_path.stat().st_size
            
            # Upload to storage backends
            storage_config = schedule.storage_config if schedule else {}
            
            for backend in config.storage_backends:
                try:
                    storage = self._get_storage(backend, storage_config)
                    
                    # Determine remote path
                    if schedule:
                        remote_path = f"schedules/{schedule.id}/{backup_id}.tar.gz"
                    else:
                        remote_path = f"manual/{backup_id}.tar.gz"
                    
                    upload_result = await storage.upload(
                        local_path=archive_path,
                        remote_path=remote_path,
                        metadata={
                            "project": str(project_path),
                            "schedule_id": str(schedule.id) if schedule else None,
                            "backup_type": config.backup_type.value,
                            "created_at": start_time.isoformat(),
                        },
                    )
                    
                    result.storage_results[backend] = {
                        "success": upload_result.success,
                        "path": upload_result.path,
                        "size": upload_result.size_bytes,
                        "error": upload_result.error,
                    }
                    
                except Exception as e:
                    result.storage_results[backend] = {
                        "success": False,
                        "error": str(e),
                    }
            
            # Determine final status
            successful_uploads = sum(
                1 for r in result.storage_results.values() if r.get("success")
            )
            
            if successful_uploads == len(config.storage_backends):
                result.success = True
                result.status = BackupStatus.COMPLETED
            elif successful_uploads > 0:
                result.success = True
                result.status = BackupStatus.PARTIAL
            else:
                result.status = BackupStatus.FAILED
                result.error = "All storage uploads failed"
            
            # Calculate duration
            end_time = datetime.utcnow()
            result.duration_seconds = (end_time - start_time).total_seconds()
            
            return result
            
        except Exception as e:
            return BackupResult(
                success=False,
                backup_id=backup_id,
                status=BackupStatus.FAILED,
                error=str(e),
                duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
            )
            
        finally:
            # Cleanup temp directory
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
    
    async def _backup_database(
        self,
        project_path: Path,
        temp_dir: Path,
        backup_id: str,
    ) -> Optional[Path]:
        """
        Backup WordPress database using wp-cli.
        
        Returns path to the database dump file.
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
            
            return None
            
        except Exception:
            return None
    
    async def _backup_files(
        self,
        project_path: Path,
        temp_dir: Path,
        backup_id: str,
        config: BackupConfig,
    ) -> Optional[Path]:
        """
        Backup WordPress files.
        
        Returns path to the files archive.
        """
        try:
            archive_path = temp_dir / f"{backup_id}_files.tar.gz"
            
            # Determine which directories to include
            dirs_to_backup = []
            
            # Check for Bedrock structure
            if (project_path / "web" / "app").exists():
                # Bedrock structure
                dirs_to_backup.append(project_path / "web" / "app" / "themes")
                dirs_to_backup.append(project_path / "web" / "app" / "plugins")
                dirs_to_backup.append(project_path / "web" / "app" / "mu-plugins")
                dirs_to_backup.append(project_path / "config")
                dirs_to_backup.append(project_path / ".env")
                
                if config.include_uploads:
                    dirs_to_backup.append(project_path / "web" / "app" / "uploads")
            else:
                # Standard WordPress structure
                dirs_to_backup.append(project_path / "wp-content" / "themes")
                dirs_to_backup.append(project_path / "wp-content" / "plugins")
                
                if config.include_uploads:
                    dirs_to_backup.append(project_path / "wp-content" / "uploads")
            
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
            
            files = await storage.list_files(prefix=prefix, max_results=max_results)
            
            backups = []
            for file_path in files:
                size = await storage.get_size(file_path)
                backups.append({
                    "path": file_path,
                    "size_bytes": size,
                    "storage": storage_backend,
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
