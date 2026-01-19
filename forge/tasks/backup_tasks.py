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


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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
        
        project_path = Path(project.directory)
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


@shared_task(name="forge.tasks.backup_tasks.create_project_backup_task")
def create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str = "full"
) -> dict:
    """Create a backup with database tracking."""
    return run_async(_create_project_backup_task(project_id, backup_id, backup_type))


async def _create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str
) -> dict:
    """Create backup and update database record."""
    async with AsyncSessionLocal() as db:
        # Get backup record
        result = await db.execute(
            select(Backup).where(Backup.id == backup_id)
        )
        backup = result.scalar_one_or_none()
        if not backup:
            return {"error": "Backup record not found"}
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            backup.status = BackupStatus.FAILED
            await db.commit()
            return {"error": "Project not found"}
        
        # Update status to in progress
        backup.status = BackupStatus.IN_PROGRESS
        await db.commit()
        
        project_path = Path(project.directory)
        backup_dir = project_path / ".ddev" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        try:
            if backup_type in ("full", "database"):
                # Database backup
                db_file = backup_dir / f"db_{backup.id}_{timestamp}.sql"
                proc = await asyncio.create_subprocess_exec(
                    "ddev", "export-db", "-f", str(db_file),
                    cwd=str(project_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if backup_type in ("full", "files"):
                # Files backup
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
            
            logger.info(f"Backup {backup_id} completed: {final_path}")
            
            return {
                "success": True,
                "backup_id": backup_id,
                "file_path": final_path,
                "size_bytes": file_size
            }
            
        except Exception as e:
            backup.status = BackupStatus.FAILED
            await db.commit()
            logger.error(f"Backup {backup_id} failed: {e}")
            return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.pull_remote_backup_task")
def pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool = True,
    include_uploads: bool = True,
    include_plugins: bool = False,
    include_themes: bool = False
) -> dict:
    """Pull backup from remote server."""
    return run_async(_pull_remote_backup_task(
        project_server_id, backup_id,
        include_database, include_uploads,
        include_plugins, include_themes
    ))


async def _pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool,
    include_uploads: bool,
    include_plugins: bool,
    include_themes: bool
) -> dict:
    """Pull backup from remote server with database tracking."""
    async with AsyncSessionLocal() as db:
        # Get backup record
        result = await db.execute(
            select(Backup).where(Backup.id == backup_id)
        )
        backup = result.scalar_one_or_none()
        if not backup:
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
            return {"error": "Project-server not found"}
        
        # Get server
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            backup.status = BackupStatus.FAILED
            await db.commit()
            return {"error": "Server not found"}
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == ps.project_id)
        )
        project = result.scalar_one_or_none()
        
        # Update status
        backup.status = BackupStatus.IN_PROGRESS
        await db.commit()
        
        project_path = Path(project.directory) if project else Path("/tmp")
        backup_dir = project_path / ".ddev" / "backups" / "remote"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        try:
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
                logger.info(f"Pulling database from {server.name}...")
                remote_sql = f"/tmp/remote_db_{timestamp}.sql"
                local_sql = backup_dir / f"db_{backup.id}_{timestamp}.sql"
                
                # Export on remote
                export_cmd = f"cd {ps.wp_path} && wp db export {remote_sql} --allow-root"
                ssh_cmd = ssh_base + [remote_host, export_cmd]
                
                proc = await asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
                
                # Download
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
                    backup_files.append(str(local_sql))
                    total_size += local_sql.stat().st_size
                
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
                logger.info(f"Pulling {path} from {server.name}...")
                remote_path = f"{ps.wp_path}/{path}"
                local_archive = backup_dir / f"{path.replace('/', '_')}_{backup.id}_{timestamp}.tar.gz"
                
                # Create archive on remote
                archive_name = f"/tmp/{path.replace('/', '_')}_{timestamp}.tar.gz"
                tar_cmd = f"tar -czf {archive_name} -C {ps.wp_path} {path}"
                ssh_cmd = ssh_base + [remote_host, tar_cmd]
                
                proc = await asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=600)
                
                # Download archive
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
                    backup_files.append(str(local_archive))
                    total_size += local_archive.stat().st_size
                
                # Cleanup remote
                cleanup_cmd = ssh_base + [remote_host, f"rm -f {archive_name}"]
                await asyncio.create_subprocess_exec(*cleanup_cmd)
            
            # Update backup record
            backup.status = BackupStatus.COMPLETED
            backup.file_path = backup_files[0] if backup_files else None
            backup.size_bytes = total_size
            backup.completed_at = datetime.utcnow()
            await db.commit()
            
            logger.info(f"Remote backup {backup_id} completed from {server.name}")
            
            return {
                "success": True,
                "backup_id": backup_id,
                "files": backup_files,
                "total_size": total_size
            }
            
        except Exception as e:
            backup.status = BackupStatus.FAILED
            await db.commit()
            logger.error(f"Remote backup {backup_id} failed: {e}")
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
        
        project_path = Path(project.directory)
        
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

