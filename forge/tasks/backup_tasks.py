"""
Backup tasks for Celery.

Database-integrated backup tasks that work with the new models.
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio

from ..db import AsyncSessionLocal, Backup, Project
from ..db.models.backup import BackupType, BackupStatus
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


async def _create_backup_record(
    project_id: int,
    backup_type: BackupType,
    file_path: str,
    size_bytes: int
) -> int:
    """Create a backup record in the database."""
    async with AsyncSessionLocal() as db:
        backup = Backup(
            project_id=project_id,
            backup_type=backup_type,
            status=BackupStatus.COMPLETED,
            file_path=file_path,
            size_bytes=size_bytes,
            completed_at=datetime.utcnow()
        )
        db.add(backup)
        await db.commit()
        await db.refresh(backup)
        return backup.id


@shared_task(name="forge.tasks.backup_tasks.create_project_backup")
def create_project_backup(
    project_id: int,
    backup_db: bool = True,
    backup_uploads: bool = True,
    sync_gdrive: bool = False
) -> dict:
    """Create a backup for a project."""
    return run_async(_create_project_backup(
        project_id, backup_db, backup_uploads, sync_gdrive
    ))


async def _create_project_backup(
    project_id: int,
    backup_db: bool,
    backup_uploads: bool,
    sync_gdrive: bool
) -> dict:
    """Create project backup with database tracking."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return {"error": "Project not found"}
        
        project_path = Path(project.path)
        backup_dir = project_path / ".ddev" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_files = []
        total_size = 0
        
        try:
            # Database backup
            if backup_db:
                db_file = backup_dir / f"db_{timestamp}.sql"
                # Use DDEV to export database
                proc = await asyncio.create_subprocess_exec(
                    "ddev", "export-db", "-f", str(db_file),
                    cwd=str(project_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await proc.wait()
                
                if db_file.exists():
                    size = db_file.stat().st_size
                    total_size += size
                    backup_files.append(str(db_file))
                    
                    await _create_backup_record(
                        project_id, BackupType.DATABASE,
                        str(db_file), size
                    )
            
            # Uploads backup
            if backup_uploads:
                uploads_path = project_path / "web" / "app" / "uploads"
                if uploads_path.exists():
                    archive_file = backup_dir / f"uploads_{timestamp}.tar.gz"
                    proc = await asyncio.create_subprocess_exec(
                        "tar", "-czf", str(archive_file), "-C", 
                        str(uploads_path.parent), uploads_path.name,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    await proc.wait()
                    
                    if archive_file.exists():
                        size = archive_file.stat().st_size
                        total_size += size
                        backup_files.append(str(archive_file))
                        
                        await _create_backup_record(
                            project_id, BackupType.FILES,
                            str(archive_file), size
                        )
            
            logger.info(f"Backup completed for {project.project_name}")
            
            return {
                "success": True,
                "project": project.project_name,
                "files": backup_files,
                "total_size": total_size
            }
            
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            return {"success": False, "error": str(e)}


async def _run_scheduled_backups() -> dict:
    """Run backups for all projects with auto_backup enabled."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project).where(Project.auto_backup_enabled == True)
        )
        projects = result.scalars().all()
        
        results = []
        for project in projects:
            backup_result = await _create_project_backup(
                project.id, True, True, False
            )
            results.append(backup_result)
        
        success_count = sum(1 for r in results if r.get("success"))
        
        return {
            "total": len(results),
            "success": success_count,
            "results": results
        }


@shared_task(name="forge.tasks.backup_tasks.run_scheduled_backups")
def run_scheduled_backups() -> dict:
    """Run scheduled backups for all enabled projects."""
    logger.info("Starting scheduled backup cycle")
    return run_async(_run_scheduled_backups())


@shared_task(name="forge.tasks.backup_tasks.cleanup_old_backups")
def cleanup_old_backups(retention_days: int = 7) -> dict:
    """Cleanup old backup files."""
    return run_async(_cleanup_old_backups(retention_days))


async def _cleanup_old_backups(retention_days: int) -> dict:
    """Delete backups older than retention period."""
    async with AsyncSessionLocal() as db:
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        
        result = await db.execute(
            select(Backup).where(Backup.created_at < cutoff)
        )
        old_backups = result.scalars().all()
        
        deleted = 0
        for backup in old_backups:
            if backup.file_path:
                path = Path(backup.file_path)
                if path.exists():
                    path.unlink()
                    deleted += 1
            await db.delete(backup)
        
        await db.commit()
        
        logger.info(f"Cleanup: deleted {deleted} old backups")
        return {"deleted": deleted}


from datetime import timedelta


# ============================================================================
# New Database-Integrated Tasks
# ============================================================================

from ..db.models.backup import BackupStorageType
from ..db.models.project_server import ProjectServer
from ..db.models.server import Server
import os
from ..api.deps import update_task_status


@shared_task(name="forge.tasks.backup_tasks.create_project_backup_task")
def create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str = "full",
    task_id: Optional[str] = None
) -> dict:
    """Create a backup with database tracking."""
    return run_async(_create_project_backup_task(project_id, backup_id, backup_type, task_id))


async def _create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str,
    task_id: Optional[str] = None
) -> dict:
    """Create backup and update database record."""
    async with AsyncSessionLocal() as db:
        # Get backup record
        result = await db.execute(
            select(Backup).where(Backup.id == backup_id)
        )
        backup = result.scalar_one_or_none()
        if not backup:
            if task_id:
                update_task_status(task_id, "failed", "Backup record not found")
            return {"error": "Backup record not found"}
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            backup.status = BackupStatus.FAILED
            await db.commit()
            if task_id:
                update_task_status(task_id, "failed", "Project not found")
            return {"error": "Project not found"}
        
        # Update status to in progress
        backup.status = BackupStatus.IN_PROGRESS
        await db.commit()
        
        project_path = Path(project.path)
        backup_dir = project_path / ".ddev" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        

        try:
            # Helper: Log Progress
            async def log_progress(msg: str):
                logger.info(f"[Backup {backup_id}] {msg}")
                # Update Redis task status
                if task_id:
                    update_task_status(task_id, "running", msg)
                    
                # Re-fetch to ensure we have fresh data/session state
                # Note: For high frequency, you might want to optimize this,
                # but for backups (slow ops), individual updates are fine.
                async with AsyncSessionLocal() as log_db:
                    b_record = await log_db.get(Backup, backup_id)
                    if b_record:
                        timestamp_str = datetime.now().strftime("[%H:%M:%S]")
                        new_line = f"{timestamp_str} {msg}\n"
                        b_record.logs = (b_record.logs or "") + new_line
                        await log_db.commit()

            await log_progress(f"Starting backup task for project {project.name}...")

            if backup_type in ("full", "database"):
                # Database backup
                await log_progress("Exporting database via DDEV...")
                db_file = backup_dir / f"db_{backup.id}_{timestamp}.sql"
                
                proc = await asyncio.create_subprocess_exec(
                    "ddev", "export-db", "-f", str(db_file),
                    cwd=str(project_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
                
                if db_file.exists():
                     size_mb = db_file.stat().st_size / (1024*1024)
                     await log_progress(f"Database exported successfully ({size_mb:.2f} MB)")
                else:
                     await log_progress("Warning: Database export file not created")
            
            if backup_type in ("full", "files"):
                # Files backup
                await log_progress("Compressing uploads folder...")
                uploads_path = project_path / "web" / "app" / "uploads"
                if uploads_path.exists():
                    archive_file = backup_dir / f"backup_{backup.id}_{timestamp}.tar.gz"
                    proc = await asyncio.create_subprocess_exec(
                        "tar", "-czf", str(archive_file), "-C",
                        str(project_path), "web/app/uploads",
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=600)
                    
                    if archive_file.exists():
                        size_mb = archive_file.stat().st_size / (1024*1024)
                        await log_progress(f"Files compressed successfully ({size_mb:.2f} MB)")
                else:
                    await log_progress("Uploads directory not found, skipping files")
            
            # Calculate final backup path and size
            if backup_type == "database":
                final_path = str(db_file)
            else:
                final_path = str(archive_file) if archive_file.exists() else str(db_file)
            
            file_size = Path(final_path).stat().st_size if Path(final_path).exists() else 0
            
            # Update backup record
            backup.status = BackupStatus.COMPLETED
            backup.file_path = final_path
            backup.size_bytes = file_size
            backup.completed_at = datetime.utcnow()
            await db.commit()
            
            await log_progress(f"Backup completed successfully! Total size: {file_size/(1024*1024):.2f} MB")
            
            logger.info(f"Backup {backup_id} completed: {final_path}")
            
            if task_id:
                update_task_status(task_id, "completed", "Backup completed successfully")

            return {
                "success": True,
                "backup_id": backup_id,
                "file_path": final_path,
                "size_bytes": file_size
            }
            
        except Exception as e:
            # Try to log failure
            try:
                async with AsyncSessionLocal() as log_db:
                    b_record = await log_db.get(Backup, backup_id)
                    if b_record:
                        b_record.logs = (b_record.logs or "") + f"[ERROR] {str(e)}\n"
                        await log_db.commit()
            except:
                pass
                
            backup.status = BackupStatus.FAILED
            await db.commit()
            logger.error(f"Backup {backup_id} failed: {e}")
            if task_id:
                update_task_status(task_id, "failed", f"Backup failed: {str(e)}")
            return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.pull_remote_backup_task")
def pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool = True,
    include_uploads: bool = True,
    include_plugins: bool = False,
    include_themes: bool = False,
    task_id: Optional[str] = None
) -> dict:
    """Pull backup from remote server."""
    return run_async(_pull_remote_backup_task(
        project_server_id, backup_id,
        include_database, include_uploads,
        include_plugins, include_themes,
        task_id
    ))


async def _pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool,
    include_uploads: bool,
    include_plugins: bool,
    include_themes: bool,
    task_id: Optional[str] = None
) -> dict:
    """Pull backup from remote server with database tracking."""
    async with AsyncSessionLocal() as db:
        # Get backup record
        result = await db.execute(
            select(Backup).where(Backup.id == backup_id)
        )
        backup = result.scalar_one_or_none()
        if not backup:
            if task_id:
                update_task_status(task_id, "failed", "Backup record not found")
            return {"error": "Backup record not found"}
        
        # Get project-server link
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            backup.status = BackupStatus.FAILED
            await db.commit()
            if task_id:
                update_task_status(task_id, "failed", "Project-server not found")
            return {"error": "Project-server not found"}
        
        # Get server
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            backup.status = BackupStatus.FAILED
            await db.commit()
            if task_id:
                update_task_status(task_id, "failed", "Server not found")
            return {"error": "Server not found"}
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == ps.project_id)
        )
        project = result.scalar_one_or_none()
        
        # Update status
        backup.status = BackupStatus.IN_PROGRESS
        await db.commit()
        
        project_path = Path(project.path) if project else Path("/tmp")
        backup_dir = project_path / ".ddev" / "backups" / "remote"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        

        try:
            # Helper: Log Progress
            async def log_progress(msg: str):
                logger.info(f"[Backup {backup_id}] {msg}")
                if task_id:
                    update_task_status(task_id, "running", msg)

                async with AsyncSessionLocal() as log_db:
                    b_record = await log_db.get(Backup, backup_id)
                    if b_record:
                        timestamp_str = datetime.now().strftime("[%H:%M:%S]")
                        new_line = f"{timestamp_str} {msg}\n"
                        b_record.logs = (b_record.logs or "") + new_line
                        await log_db.commit()

            await log_progress(f"Starting remote backup task from {server.name}...")
            
            backup_files = []
            total_size = 0
            
            # Build SSH command base
            ssh_base = [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-p", str(server.ssh_port),
            ]
            if server.ssh_key_path:
                ssh_base.extend(["-i", server.ssh_key_path])
            
            remote_host = f"{server.ssh_user}@{server.hostname}"
            
            # Pull database
            if include_database:
                await log_progress(f"Pulling database from {server.name}...")
                remote_sql = f"/tmp/remote_db_{timestamp}.sql"
                local_sql = backup_dir / f"db_{backup.id}_{timestamp}.sql"

                raw_wp_path = (ps.wp_path or "").rstrip("/")
                if "/web/web" in raw_wp_path:
                    raw_wp_path = raw_wp_path.replace("/web/web", "/web")
                cli_path = raw_wp_path
                if raw_wp_path.endswith("/web/app"):
                    cli_path = raw_wp_path[:-8]
                elif "/web/app" in raw_wp_path:
                    cli_path = raw_wp_path.split("/web/app")[0]
                elif raw_wp_path.endswith("/web"):
                    cli_path = raw_wp_path[:-4]
                
                # Export on remote
                await log_progress(f"Running WP-CLI export on remote server...")
                export_cmd = f"cd {cli_path} && wp db export {remote_sql} --allow-root"
                ssh_cmd = ssh_base + [remote_host, export_cmd]
                
                proc = await asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
                
                # Download
                await log_progress(f"Downloading database dump...")
                scp_cmd = [
                    "scp", "-o", "StrictHostKeyChecking=no",
                    "-o", "BatchMode=yes", "-P", str(server.ssh_port)
                ]
                if server.ssh_key_path:
                    scp_cmd.extend(["-i", server.ssh_key_path])
                scp_cmd.extend([f"{remote_host}:{remote_sql}", str(local_sql)])
                
                proc = await asyncio.create_subprocess_exec(
                    *scp_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
                
                if local_sql.exists():
                    size = local_sql.stat().st_size
                    backup_files.append(str(local_sql))
                    total_size += size
                    await log_progress(f"Database downloaded successfully ({size/(1024*1024):.2f} MB)")
                
                # Cleanup remote
                cleanup_cmd = ssh_base + [remote_host, f"rm -f {remote_sql}"]
                await asyncio.create_subprocess_exec(*cleanup_cmd)
            
            # Pull files (uploads, plugins, themes)
            paths_to_pull = []
            if include_uploads:
                paths_to_pull.append("web/app/uploads")
            if include_plugins:
                paths_to_pull.append("web/app/plugins")
            if include_themes:
                paths_to_pull.append("web/app/themes")
            
            for path in paths_to_pull:
                await log_progress(f"Pulling {path} from {server.name}...")
                raw_wp_path = (ps.wp_path or "").rstrip("/")
                if "/web/web" in raw_wp_path:
                    raw_wp_path = raw_wp_path.replace("/web/web", "/web")
                base_path = raw_wp_path
                if raw_wp_path.endswith("/web/app"):
                    base_path = raw_wp_path[:-8]
                elif "/web/app" in raw_wp_path:
                    base_path = raw_wp_path.split("/web/app")[0]
                elif raw_wp_path.endswith("/web"):
                    base_path = raw_wp_path[:-4]

                remote_path = f"{base_path}/{path}"
                local_archive = backup_dir / f"{path.replace('/', '_')}_{backup.id}_{timestamp}.tar.gz"
                
                # Create archive on remote
                archive_name = f"/tmp/{path.replace('/', '_')}_{timestamp}.tar.gz"
                await log_progress(f"Creating archive on remote server for {path}...")
                tar_cmd = f"tar -czf {archive_name} -C {base_path} {path}"
                ssh_cmd = ssh_base + [remote_host, tar_cmd]
                
                proc = await asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=600)
                
                # Download archive
                await log_progress(f"Downloading archive...")
                scp_cmd = [
                    "scp", "-o", "StrictHostKeyChecking=no",
                    "-o", "BatchMode=yes", "-P", str(server.ssh_port)
                ]
                if server.ssh_key_path:
                    scp_cmd.extend(["-i", server.ssh_key_path])
                scp_cmd.extend([f"{remote_host}:{archive_name}", str(local_archive)])
                
                proc = await asyncio.create_subprocess_exec(
                    *scp_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=600)
                
                if local_archive.exists():
                    size = local_archive.stat().st_size
                    backup_files.append(str(local_archive))
                    total_size += size
                    await log_progress(f"Archive downloaded ({size/(1024*1024):.2f} MB)")
                
                # Cleanup remote
                cleanup_cmd = ssh_base + [remote_host, f"rm -f {archive_name}"]
                await asyncio.create_subprocess_exec(*cleanup_cmd)
            
            # Update backup record
            backup.status = BackupStatus.COMPLETED
            backup.file_path = backup_files[0] if backup_files else None
            backup.size_bytes = total_size
            backup.completed_at = datetime.utcnow()
            await db.commit()
            
            await log_progress(f"Remote Backup completed successfully! Total size: {total_size/(1024*1024):.2f} MB")
            logger.info(f"Remote backup {backup_id} completed from {server.name}")
            
            if task_id:
                update_task_status(task_id, "completed", "Remote backup completed successfully")

            return {
                "success": True,
                "backup_id": backup_id,
                "files": backup_files,
                "total_size": total_size
            }
            
        except Exception as e:
            try:
                async with AsyncSessionLocal() as log_db:
                    b_record = await log_db.get(Backup, backup_id)
                    if b_record:
                        b_record.logs = (b_record.logs or "") + f"[ERROR] {str(e)}\n"
                        await log_db.commit()
            except:
                pass
                
            backup.status = BackupStatus.FAILED
            await db.commit()
            logger.error(f"Remote backup {backup_id} failed: {e}")
            if task_id:
                update_task_status(task_id, "failed", f"Remote backup failed: {str(e)}")
            return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.restore_backup_task")
def restore_backup_task(
    backup_id: int,
    target: str = "local"
) -> dict:
    """Restore from a backup."""
    return run_async(_restore_backup_task(backup_id, target))


async def _restore_backup_task(
    backup_id: int,
    target: str
) -> dict:
    """Restore from backup with database tracking. Supports local and Google Drive backups."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Backup).where(Backup.id == backup_id)
        )
        backup = result.scalar_one_or_none()
        if not backup:
            return {"error": "Backup not found"}
        
        result = await db.execute(
            select(Project).where(Project.id == backup.project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return {"error": "Project not found"}
        
        project_path = Path(project.path)
        
        # Determine backup file path (local vs Google Drive)
        local_backup_path = None
        
        # Check storage_path first (newer model), then file_path (legacy compatibility)
        storage_path = getattr(backup, 'storage_path', None) or getattr(backup, 'file_path', None)
        storage_type = getattr(backup, 'storage_type', None)
        
        if not storage_path:
            return {"error": "Backup storage path not found"}
        
        # Handle Google Drive backups - download first
        if storage_type == BackupStorageType.GOOGLE_DRIVE:
            try:
                from ..api.google_drive_integration import GoogleDriveService
                
                gdrive = GoogleDriveService()
                if not gdrive.is_authenticated():
                    return {"error": "Google Drive not authenticated. Please set up Google Drive integration."}
                
                # Create temp directory for download
                temp_backup_dir = project_path / ".ddev" / "backups" / "restored"
                temp_backup_dir.mkdir(parents=True, exist_ok=True)
                
                # Extract file ID from storage_path (could be full path or just ID)
                gdrive_file_id = storage_path
                if '/' in storage_path:
                    gdrive_file_id = storage_path.split('/')[-1]
                
                # Determine filename from backup record
                backup_name = getattr(backup, 'name', None) or f"backup_{backup_id}"
                # Guess extension based on backup type
                if backup.backup_type == BackupType.DATABASE:
                    ext = ".sql"
                else:
                    ext = ".tar.gz"
                
                local_backup_path = temp_backup_dir / f"{backup_name}{ext}"
                
                logger.info(f"Downloading backup from Google Drive: {gdrive_file_id}")
                
                success = gdrive.download_file(gdrive_file_id, local_backup_path)
                if not success or not local_backup_path.exists():
                    return {"error": "Failed to download backup from Google Drive"}
                
                logger.info(f"Downloaded Google Drive backup to {local_backup_path}")
                
            except ImportError:
                return {"error": "Google Drive integration not available. Install required packages."}
            except Exception as e:
                logger.error(f"Failed to download from Google Drive: {e}")
                return {"error": f"Google Drive download failed: {str(e)}"}
        else:
            # Local backup
            local_backup_path = Path(storage_path)
            if not local_backup_path.exists():
                return {"error": f"Backup file not found: {storage_path}"}
        
        try:
            if target == "local":
                # Restore to local DDEV environment
                if backup.backup_type == BackupType.DATABASE or local_backup_path.suffix == ".sql":
                    # Database restore
                    logger.info(f"Restoring database from {local_backup_path}")
                    proc = await asyncio.create_subprocess_exec(
                        "ddev", "import-db", "-f", str(local_backup_path),
                        cwd=str(project_path),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                    
                    if proc.returncode != 0:
                        return {"success": False, "error": f"Database restore failed: {stderr.decode()[:200]}"}
                
                elif local_backup_path.suffix in (".gz", ".tar"):
                    # Files restore
                    logger.info(f"Restoring files from {local_backup_path}")
                    proc = await asyncio.create_subprocess_exec(
                        "tar", "-xzf", str(local_backup_path), "-C", str(project_path),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                    
                    if proc.returncode != 0:
                        return {"success": False, "error": f"Files restore failed: {stderr.decode()[:200]}"}
                
                else:
                    return {"error": f"Unknown backup format: {local_backup_path.suffix}"}
                
                logger.info(f"Restore completed from backup {backup_id} to local")
                
                # Clean up downloaded Google Drive file if needed
                if storage_type == BackupStorageType.GOOGLE_DRIVE and local_backup_path.exists():
                    # Optionally delete the temp file
                    # local_backup_path.unlink()
                    pass
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "target": "local",
                    "source_type": storage_type.value if storage_type else "local",
                    "message": "Restore completed successfully"
                }
            else:
                # Restore to remote server
                # Parse target as project_server_id
                try:
                    project_server_id = int(target)
                except ValueError:
                    return {"error": f"Invalid target: {target}. Expected 'local' or a project_server_id"}
                
                # Get project-server link
                ps_result = await db.execute(
                    select(ProjectServer).where(ProjectServer.id == project_server_id)
                )
                ps = ps_result.scalar_one_or_none()
                if not ps:
                    return {"error": f"Project server {project_server_id} not found"}
                
                # Get server details
                srv_result = await db.execute(
                    select(Server).where(Server.id == ps.server_id)
                )
                server = srv_result.scalar_one_or_none()
                if not server:
                    return {"error": "Server not found"}
                
                # Build SSH connection
                ssh_base = [
                    "ssh",
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "BatchMode=yes",
                    "-p", str(server.ssh_port),
                ]
                if server.ssh_key_path:
                    ssh_base.extend(["-i", server.ssh_key_path])
                
                remote_host = f"{server.ssh_user}@{server.hostname}"
                
                if backup.backup_type == BackupType.DATABASE or local_backup_path.suffix == ".sql":
                    # Upload SQL file to remote
                    remote_sql = f"/tmp/restore_{backup_id}.sql"
                    
                    scp_cmd = [
                        "scp", "-o", "StrictHostKeyChecking=no",
                        "-o", "BatchMode=yes", "-P", str(server.ssh_port)
                    ]
                    if server.ssh_key_path:
                        scp_cmd.extend(["-i", server.ssh_key_path])
                    scp_cmd.extend([str(local_backup_path), f"{remote_host}:{remote_sql}"])
                    
                    proc = await asyncio.create_subprocess_exec(
                        *scp_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=300)
                    
                    # Import using wp-cli on remote
                    import_cmd = f"cd {ps.wp_path} && wp db import {remote_sql} --allow-root && rm -f {remote_sql}"
                    ssh_cmd = ssh_base + [remote_host, import_cmd]
                    
                    proc = await asyncio.create_subprocess_exec(
                        *ssh_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                    
                    if proc.returncode != 0:
                        return {"success": False, "error": f"Remote database restore failed: {stderr.decode()[:200]}"}
                    
                elif local_backup_path.suffix in (".gz", ".tar"):
                    # Upload and extract archive on remote
                    remote_archive = f"/tmp/restore_{backup_id}.tar.gz"
                    
                    scp_cmd = [
                        "scp", "-o", "StrictHostKeyChecking=no",
                        "-o", "BatchMode=yes", "-P", str(server.ssh_port)
                    ]
                    if server.ssh_key_path:
                        scp_cmd.extend(["-i", server.ssh_key_path])
                    scp_cmd.extend([str(local_backup_path), f"{remote_host}:{remote_archive}"])
                    
                    proc = await asyncio.create_subprocess_exec(
                        *scp_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=600)
                    
                    # Extract on remote
                    extract_cmd = f"tar -xzf {remote_archive} -C {ps.wp_path} && rm -f {remote_archive}"
                    ssh_cmd = ssh_base + [remote_host, extract_cmd]
                    
                    proc = await asyncio.create_subprocess_exec(
                        *ssh_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                    
                    if proc.returncode != 0:
                        return {"success": False, "error": f"Remote files restore failed: {stderr.decode()[:200]}"}
                
                logger.info(f"Remote restore completed from backup {backup_id} to server {server.name}")
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "target": f"server:{server.name}",
                    "source_type": storage_type.value if storage_type else "local",
                    "message": f"Restore completed to {server.name}"
                }
            
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return {"success": False, "error": str(e)}

@shared_task(name="forge.tasks.backup_tasks.create_environment_backup_task")
def create_environment_backup_task(
    project_id: int,
    env_id: int,
    backup_id: int,
    backup_type: str = "database",
    storage_backends: list = None,
    override_gdrive_folder_id: str = None,
    task_id: Optional[str] = None
) -> dict:
    """Create a backup for a specific environment."""
    return run_async(_create_environment_backup_task(
        project_id, env_id, backup_id, backup_type, storage_backends, override_gdrive_folder_id, task_id
    ))


async def _create_environment_backup_task(
    project_id: int,
    env_id: int,
    backup_id: int,
    backup_type: str,
    storage_backends: list,
    override_gdrive_folder_id: str = None,
    task_id: Optional[str] = None
) -> dict:
    """Async implementation of environment backup creation."""
    from ..db.session import create_engine
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    
    backup = None
    
    try:
        # Use main session for the task logic
        async with AsyncSessionLocal() as db:
            try:
                # Get backup record
                result = await db.execute(select(Backup).where(Backup.id == backup_id))
                backup = result.scalar_one_or_none()
                if not backup:
                    if task_id:
                        update_task_status(task_id, "failed", "Backup record not found")
                    return {"error": "Backup record not found"}

                # Get environment
                from sqlalchemy.orm import joinedload
                env_result = await db.execute(
                    select(ProjectServer).where(
                        ProjectServer.id == env_id,
                        ProjectServer.project_id == project_id
                    ).options(
                        joinedload(ProjectServer.server),
                        joinedload(ProjectServer.project)
                    )
                )
                env_link = env_result.scalar_one_or_none()
                if not env_link:
                    backup.status = BackupStatus.FAILED
                    backup.error_message = "Environment not found"
                    await db.commit()
                    if task_id:
                        update_task_status(task_id, "failed", "Environment not found")
                    return {"error": "Environment not found"}

                # Define atomic logging helper using raw SQL for PostgreSQL compatibility
                async def log(msg: str):
                    logger.info(f"[Backup {backup_id}] {msg}")
                    if task_id:
                        update_task_status(task_id, "running", msg)
                    try:
                        timestamp = datetime.now().strftime("[%H:%M:%S]")
                        new_log = f"{timestamp} {msg}\n"
                        
                        # Use raw SQL for maximum compatibility
                        from sqlalchemy import text
                        stmt = text(
                            "UPDATE backups SET logs = COALESCE(logs, '') || :new_log WHERE id = :backup_id"
                        )
                        await db.execute(stmt, {"new_log": new_log, "backup_id": backup_id})
                        await db.commit()
                    except Exception as e:
                        logger.error(f"Failed to write log to DB: {e}", exc_info=True)

                await log("Starting environment backup...")

                # Update status to running
                backup.status = BackupStatus.RUNNING
                await db.commit()

                # Initialize service
                from ..services.backup.backup_service import BackupService, BackupConfig, BackupType as ServiceBackupType
                from ..db.models.project import Project
                
                service = BackupService(db)
                
                # Fetch project for folder settings
                project_result = await db.execute(select(Project).where(Project.id == project_id))
                project = project_result.scalar_one_or_none()
                
                storage_config = {}
                
                # NUCLEAR FIX: Priority 1 - Explicit Override passed to task
                if override_gdrive_folder_id:
                     storage_config["gdrive_folder"] = override_gdrive_folder_id
                     await log(f"Using override GDrive folder ID: {override_gdrive_folder_id}")
                # Priority 2 - Environment specific override
                elif env_link and env_link.gdrive_backups_folder_id:
                     storage_config["gdrive_folder"] = env_link.gdrive_backups_folder_id
                     await log("Using environment-specific GDrive folder configuration")
                # Priority 3 - Project default
                elif project and project.gdrive_backups_folder_id:
                     storage_config["gdrive_folder"] = project.gdrive_backups_folder_id
                
                # Map string type to enum
                service_backup_type = ServiceBackupType.DATABASE
                if backup_type == "files":
                    service_backup_type = ServiceBackupType.FILES
                elif backup_type == "full":
                    service_backup_type = ServiceBackupType.FULL

                await log(f"Configuring backup type: {backup_type}")
                await log(f"Storage backends: {', '.join(storage_backends or ['local'])}")

                # Extract scalar values from ORM objects to prevent lazy-loading
                # This MUST happen while the session is active
                server = env_link.server
                is_remote = server is not None
                
                server_hostname = server.hostname if server else None
                server_ssh_user = env_link.ssh_user or (server.ssh_user if server else None)
                server_ssh_port = (server.ssh_port if server else None) or 22
                server_ssh_key_path = env_link.ssh_key_path or (server.ssh_key_path if server else None)
                server_ssh_password = server.ssh_password if server else None
                server_ssh_private_key = server.ssh_private_key if server else None
                wp_path = env_link.wp_path
                project_name = env_link.project.name if env_link.project else (project.name if project else "unknown")
                environment_type = env_link.environment.value if hasattr(env_link.environment, "value") else str(env_link.environment)

                # Configure backup with scalar values
                config = BackupConfig(
                    backup_type=service_backup_type,
                    include_database=True if backup_type in ["database", "full"] else False,
                    include_files=True if backup_type in ["files", "full"] else False,
                    include_uploads=True if backup_type in ["files", "full"] else False,
                    storage_backends=storage_backends or ["local"],
                    storage_config=storage_config,
                    # Remote server scalar values
                    is_remote=is_remote,
                    server_hostname=server_hostname,
                    server_ssh_user=server_ssh_user,
                    server_ssh_port=server_ssh_port,
                    server_ssh_key_path=server_ssh_key_path,
                    server_ssh_password=server_ssh_password,
                    server_ssh_private_key=server_ssh_private_key,
                    wp_path=wp_path,
                    project_name=project_name,
                    environment_type=environment_type
                )

                # Run backup
                await log("Initiating backup process...")
                # For remote, we use a dummy project path since valid path is on remote server
                project_path = Path("/tmp")

                result = await service.create_backup(
                    project_path=project_path,
                    config=config,
                    log_callback=log
                )

                if not result.success:
                    fail_msg = f"Backup failed: {result.error}"
                    await log(fail_msg)
                    backup.status = BackupStatus.FAILED
                    backup.error_message = result.error
                    await db.commit()
                    return {"success": False, "error": result.error}

                # Log results for debugging
                await log("Backup process finished. Verifying storage results...")
                logger.info(f"Backup {backup_id} storage results: {result.storage_results}")
                
                # Update success status
                from ..db.models.backup import BackupStorageType as StorageType
                
                # Determine final status and storage type
                storage_type_str = "local"
                final_storage_path = result.backup_path
                is_failed = False
                fail_reason = ""

                # Check GDrive
                if "gdrive" in storage_backends:
                    res = result.storage_results.get("gdrive", {})
                    if result.storage_results and "gdrive" in result.storage_results and res.get("success"):
                        storage_type_str = "google_drive"
                        final_storage_path = res.get("path")
                        drive_folder_id = res.get("storage_file_id") or result.storage_file_id
                        backup.storage_file_id = drive_folder_id
                        backup.drive_folder_id = drive_folder_id
                        await log("Google Drive upload successful.")
                        if not drive_folder_id:
                            is_failed = True
                            fail_reason = "Google Drive upload completed without a folder ID"
                            await log(f"Error: {fail_reason}")
                    else:
                        # GDrive requested but failed
                        is_failed = True
                        error = result.storage_results.get("gdrive", {}).get("error", "Unknown GDrive error")
                        fail_reason = f"GDrive upload failed: {error}"
                        await log(f"Error: {fail_reason}")
                
                # Check S3 (if we implemented it)
                elif "s3" in storage_backends:
                     if result.storage_results and "s3" in result.storage_results and result.storage_results["s3"]["success"]:
                        storage_type_str = "s3"
                        final_storage_path = result.storage_results["s3"]["path"]
                     else:
                        is_failed = True
                        fail_reason = "S3 upload failed"
                
                # If failed and no local fallback (or local wasn't the intent), mark as failed
                if is_failed:
                    backup.status = BackupStatus.FAILED
                    backup.error_message = fail_reason
                    await db.commit()
                    await log(f"Backup marked as failed: {fail_reason}")
                    if task_id:
                        update_task_status(task_id, "failed", fail_reason)
                    return {"success": False, "error": fail_reason}

                await log("Backup completed successfully.")
                backup.status = BackupStatus.COMPLETED
                backup.storage_type = StorageType(storage_type_str)
                backup.storage_path = final_storage_path
                backup.size_bytes = result.size_bytes
                backup.completed_at = datetime.utcnow()
                
                await db.commit()

                if task_id:
                    update_task_status(task_id, "completed", "Backup completed successfully")
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "file_path": final_storage_path,
                    "size_bytes": result.size_bytes
                }

            except Exception as e:
                if backup:
                    backup.status = BackupStatus.FAILED
                    backup.error_message = str(e)
                    await db.commit()
                logger.error(f"Environment backup {backup_id} failed: {e}")
                if task_id:
                    update_task_status(task_id, "failed", f"Backup failed: {str(e)}")
                return {"success": False, "error": str(e)}

    finally:
        pass  # Session cleanup handled by async context manager


@shared_task(name="forge.tasks.backup_tasks.check_backup_schedules")
def check_backup_schedules() -> dict:
    """Check for due backup schedules and run them."""
    return run_async(_check_backup_schedules())


async def _check_backup_schedules() -> dict:
    """Check and run due schedules."""
    from ..services.backup import BackupSchedulerService, BackupService, BackupConfig
    from ..services.backup.backup_service import normalize_storage_backend
    from ..db.models.project import Project
    from ..db.models.project_server import ProjectServer
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    
    async with AsyncSessionLocal() as db:
        scheduler = BackupSchedulerService(db)
        due_schedules = await scheduler.get_due_schedules()
        
        if not due_schedules:
            return {"run": 0, "message": "No schedules due"}
            
        results = []
        for schedule in due_schedules:
            try:
                logger.info(f"Running scheduled backup for schedule {schedule.id} ({schedule.name})")
                
                # Check project presence
                if not schedule.project:
                    result = await db.execute(select(Project).where(Project.id == schedule.project_id))
                    schedule.project = result.scalar_one_or_none()
                
                if not schedule.project:
                    logger.error(f"Project not found for schedule {schedule.id}")
                    await scheduler.record_run(schedule.id, success=False, error_message="Project not found")
                    continue

                project_path = Path(schedule.project.path)
                
                # Determine storage backend using normalize function
                storage_val = normalize_storage_backend(schedule.storage_type)

                # Check for environment linkage
                env = None
                storage_config = {}
                
                # Load environment if linked
                if hasattr(schedule, "environment_id") and schedule.environment_id:
                     env_res = await db.execute(
                         select(ProjectServer)
                         .where(ProjectServer.id == schedule.environment_id)
                         .options(
                             joinedload(ProjectServer.server),
                             joinedload(ProjectServer.project)
                         )
                     )
                     env = env_res.scalar_one_or_none()
                     
                     if env and env.gdrive_backups_folder_id:
                         storage_config["gdrive_folder"] = env.gdrive_backups_folder_id
                         logger.info(f"Using environment GDrive folder: {env.gdrive_backups_folder_id}")

                # Extract scalar values from ORM to prevent lazy-loading
                is_remote = env and env.server is not None
                server = env.server if env else None
                
                server_hostname = server.hostname if server else None
                server_ssh_user = (env.ssh_user if env else None) or (server.ssh_user if server else None)
                server_ssh_port = (server.ssh_port if server else None) or 22
                server_ssh_key_path = (env.ssh_key_path if env else None) or (server.ssh_key_path if server else None)
                server_ssh_password = server.ssh_password if server else None
                server_ssh_private_key = server.ssh_private_key if server else None
                wp_path = env.wp_path if env else None
                env_project_name = (env.project.name if env and env.project else None) or schedule.project.name
                environment_type = (env.environment.value if env and hasattr(env.environment, "value") else str(env.environment)) if env else "production"

                backup_config = BackupConfig(
                    backup_type=schedule.backup_type,
                    storage_backends=[storage_val],
                    storage_config=storage_config,
                    # Remote server scalar values
                    is_remote=is_remote,
                    server_hostname=server_hostname,
                    server_ssh_user=server_ssh_user,
                    server_ssh_port=server_ssh_port,
                    server_ssh_key_path=server_ssh_key_path,
                    server_ssh_password=server_ssh_password,
                    server_ssh_private_key=server_ssh_private_key,
                    wp_path=wp_path,
                    project_name=env_project_name,
                    environment_type=environment_type
                )

                
                backup_service = BackupService(db)
                result = await backup_service.create_backup(
                    project_path=project_path,
                    schedule=schedule,
                    config=backup_config,
                )
                
                await scheduler.record_run(schedule.id, success=result.success, error_message=result.error)
                results.append({"id": schedule.id, "success": result.success})
                
            except Exception as e:
                logger.error(f"Failed to run schedule {schedule.id}: {e}")
                # Try to record failure if possible
                try:
                    await scheduler.record_run(schedule.id, success=False, error_message=str(e))
                except:
                    pass
                results.append({"id": schedule.id, "success": False, "error": str(e)})
        
        return {
            "run": len(results),
            "results": results
        }
