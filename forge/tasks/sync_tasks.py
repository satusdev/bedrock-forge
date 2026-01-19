"""
Sync tasks for Celery.

Background tasks for GitHub sync and server health checks.
"""
from datetime import datetime
from typing import Optional
import asyncio
import subprocess

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AsyncSessionLocal, Server
from ..db.models.server import ServerStatus
from ..utils.logging import logger


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _check_server_ssh(server_id: int) -> dict:
    """Check SSH connection to a server."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Server).where(Server.id == server_id)
        )
        server = result.scalar_one_or_none()
        
        if not server:
            return {"error": "Server not found"}
        
        try:
            ssh_cmd = [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                "-o", "BatchMode=yes",
                "-p", str(server.ssh_port),
            ]
            if server.ssh_key_path:
                ssh_cmd.extend(["-i", server.ssh_key_path])
            ssh_cmd.extend([
                f"{server.ssh_user}@{server.hostname}",
                "echo 'OK'"
            ])
            
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            
            if proc.returncode == 0:
                server.status = ServerStatus.ONLINE
                server.last_health_check = datetime.utcnow()
                success = True
                message = "Connection successful"
            else:
                server.status = ServerStatus.OFFLINE
                success = False
                message = stderr.decode().strip()[:100] or "Connection failed"
                
        except asyncio.TimeoutError:
            server.status = ServerStatus.OFFLINE
            success = False
            message = "Connection timed out"
        except Exception as e:
            server.status = ServerStatus.OFFLINE
            success = False
            message = str(e)[:100]
        
        await db.commit()
        
        logger.info(f"Server {server.name}: {'ONLINE' if success else 'OFFLINE'}")
        
        return {
            "server_id": server_id,
            "name": server.name,
            "success": success,
            "message": message
        }


@shared_task(name="forge.tasks.sync_tasks.check_server_ssh")
def check_server_ssh(server_id: int) -> dict:
    """Check SSH connection to a server."""
    return run_async(_check_server_ssh(server_id))


async def _check_all_servers() -> dict:
    """Check all servers."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Server))
        servers = result.scalars().all()
        
        results = []
        for server in servers:
            check_result = await _check_server_ssh(server.id)
            results.append(check_result)
        
        online = sum(1 for r in results if r.get("success"))
        offline = sum(1 for r in results if not r.get("success") and "error" not in r)
        
        return {
            "total": len(results),
            "online": online,
            "offline": offline,
            "results": results
        }


@shared_task(name="forge.tasks.sync_tasks.check_all_servers")
def check_all_servers() -> dict:
    """Check all servers health."""
    logger.info("Starting server health check cycle")
    return run_async(_check_all_servers())


@shared_task(name="forge.tasks.sync_tasks.sync_github_repository")
def sync_github_repository(project_dir: str, branch: str = "main") -> dict:
    """Sync a project's GitHub repository."""
    try:
        result = subprocess.run(
            ["git", "pull", "origin", branch],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            logger.info(f"Git pull successful for {project_dir}")
            return {
                "success": True,
                "output": result.stdout[:500]
            }
        else:
            logger.error(f"Git pull failed for {project_dir}: {result.stderr}")
            return {
                "success": False,
                "error": result.stderr[:500]
            }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Git pull timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)[:100]}


@shared_task(name="forge.tasks.sync_tasks.deploy_to_server")
def deploy_to_server(server_id: int, project_dir: str, remote_path: str) -> dict:
    """Deploy project to a server via rsync."""
    return run_async(_deploy_to_server(server_id, project_dir, remote_path))


async def _deploy_to_server(server_id: int, project_dir: str, remote_path: str) -> dict:
    """Deploy project to server."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Server).where(Server.id == server_id)
        )
        server = result.scalar_one_or_none()
        
        if not server:
            return {"error": "Server not found"}
        
        try:
            rsync_cmd = [
                "rsync", "-avz", "--delete",
                "-e", f"ssh -p {server.ssh_port}",
                f"{project_dir}/",
                f"{server.ssh_user}@{server.hostname}:{remote_path}"
            ]
            
            proc = await asyncio.create_subprocess_exec(
                *rsync_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
            
            if proc.returncode == 0:
                logger.info(f"Deployed {project_dir} to {server.name}")
                return {
                    "success": True,
                    "server": server.name,
                    "message": "Deployment successful"
                }
            else:
                return {
                    "success": False,
                    "error": stderr.decode()[:500]
                }
        except asyncio.TimeoutError:
            return {"success": False, "error": "Deployment timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}


# ============================================================================
# Database Sync Tasks
# ============================================================================

from ..db.models.project_server import ProjectServer
from ..db.models.server import PanelType
from pathlib import Path
import tempfile
import os


def _get_ssh_cmd(server, extra_args: list = None, project_server: ProjectServer = None) -> list:
    """Build SSH command with server credentials.
    
    Uses per-site SSH credentials from project_server if available,
    otherwise falls back to server-level credentials.
    """
    # Use site-specific SSH user if available, else server default
    ssh_user = (project_server.ssh_user if project_server and project_server.ssh_user 
                else server.ssh_user)
    ssh_key = (project_server.ssh_key_path if project_server and project_server.ssh_key_path 
               else server.ssh_key_path)
    
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-p", str(server.ssh_port),
    ]
    if ssh_key:
        cmd.extend(["-i", ssh_key])
    if extra_args:
        cmd.extend(extra_args)
    cmd.append(f"{ssh_user}@{server.hostname}")
    return cmd


def _get_scp_cmd(server, source: str, dest: str, download: bool = True, project_server: ProjectServer = None) -> list:
    """Build SCP command for file transfer.
    
    Uses per-site SSH credentials from project_server if available,
    otherwise falls back to server-level credentials.
    """
    # Use site-specific SSH user if available, else server default
    ssh_user = (project_server.ssh_user if project_server and project_server.ssh_user 
                else server.ssh_user)
    ssh_key = (project_server.ssh_key_path if project_server and project_server.ssh_key_path 
               else server.ssh_key_path)
    
    cmd = [
        "scp",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-P", str(server.ssh_port),
    ]
    if ssh_key:
        cmd.extend(["-i", ssh_key])
    
    if download:
        cmd.extend([f"{ssh_user}@{server.hostname}:{source}", dest])
    else:
        cmd.extend([source, f"{ssh_user}@{server.hostname}:{dest}"])
    
    return cmd


def _get_db_export_cmd(panel_type: PanelType, wp_path: str, output_file: str) -> str:
    """Get database export command based on panel type."""
    if panel_type in (PanelType.NONE, PanelType.CYBERPANEL):
        # Use WP-CLI if available, fallback to mysqldump
        return f"""
        cd {wp_path} && \
        if command -v wp &> /dev/null; then
            wp db export {output_file} --allow-root 2>/dev/null || \
            wp db export {output_file} 2>/dev/null
        else
            # Parse wp-config.php for database credentials
            DB_NAME=$(grep "DB_NAME" wp-config.php | cut -d "'" -f 4)
            DB_USER=$(grep "DB_USER" wp-config.php | cut -d "'" -f 4)
            DB_PASSWORD=$(grep "DB_PASSWORD" wp-config.php | cut -d "'" -f 4)
            DB_HOST=$(grep "DB_HOST" wp-config.php | cut -d "'" -f 4)
            mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > {output_file}
        fi
        """
    elif panel_type == PanelType.CPANEL:
        # cPanel: use WP-CLI or mysqldump via SSH
        return f"cd {wp_path} && wp db export {output_file} --allow-root"
    else:
        # Default to WP-CLI
        return f"cd {wp_path} && wp db export {output_file} --allow-root"


def _get_db_import_cmd(panel_type: PanelType, wp_path: str, input_file: str) -> str:
    """Get database import command based on panel type."""
    if panel_type in (PanelType.NONE, PanelType.CYBERPANEL):
        return f"""
        cd {wp_path} && \
        if command -v wp &> /dev/null; then
            wp db import {input_file} --allow-root 2>/dev/null || \
            wp db import {input_file} 2>/dev/null
        else
            DB_NAME=$(grep "DB_NAME" wp-config.php | cut -d "'" -f 4)
            DB_USER=$(grep "DB_USER" wp-config.php | cut -d "'" -f 4)
            DB_PASSWORD=$(grep "DB_PASSWORD" wp-config.php | cut -d "'" -f 4)
            DB_HOST=$(grep "DB_HOST" wp-config.php | cut -d "'" -f 4)
            mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < {input_file}
        fi
        """
    else:
        return f"cd {wp_path} && wp db import {input_file} --allow-root"


async def _sync_database_pull(
    server_id: int,
    project_server_id: int,
    local_path: str,
    search_replace: bool = True
) -> dict:
    """
    Pull database from remote server to local.
    
    Steps:
    1. SSH to server and export database
    2. SCP download the SQL file
    3. Import to local DDEV
    4. Run search-replace if enabled
    """
    async with AsyncSessionLocal() as db:
        # Get project server link with server details
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server link not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        try:
            # Create temp file for SQL
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            remote_sql = f"/tmp/db_export_{timestamp}.sql"
            local_sql = f"/tmp/db_import_{timestamp}.sql"
            
            # Step 1: Export database on remote server
            export_cmd = _get_db_export_cmd(server.panel_type, ps.wp_path, remote_sql)
            ssh_cmd = _get_ssh_cmd(server, project_server=ps)
            ssh_cmd.append(export_cmd)
            
            logger.info(f"Exporting database from {server.name}...")
            
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Database export failed: {stderr.decode()[:200]}"
                }
            
            # Step 2: Download SQL file
            logger.info(f"Downloading database from {server.name}...")
            scp_cmd = _get_scp_cmd(server, remote_sql, local_sql, download=True, project_server=ps)
            
            proc = await asyncio.create_subprocess_exec(
                *scp_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Download failed: {stderr.decode()[:200]}"
                }
            
            # Step 3: Import to local DDEV
            logger.info(f"Importing database to local DDEV...")
            if local_path:
                import_proc = await asyncio.create_subprocess_exec(
                    "ddev", "import-db", "--file", local_sql,
                    cwd=local_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(import_proc.communicate(), timeout=300)
                
                if import_proc.returncode != 0:
                    return {
                        "success": False,
                        "error": f"Import failed: {stderr.decode()[:200]}"
                    }
                
                # Step 4: Run search-replace if enabled
                if search_replace:
                    logger.info("Running URL search-replace...")
                    # Get local DDEV URL
                    url_proc = await asyncio.create_subprocess_exec(
                        "ddev", "describe", "-j",
                        cwd=local_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    url_stdout, _ = await url_proc.communicate()
                    
                    try:
                        import json
                        ddev_info = json.loads(url_stdout.decode())
                        local_url = ddev_info.get("raw", {}).get("primary_url", "")
                        
                        if local_url and ps.wp_url:
                            # Run search-replace
                            sr_proc = await asyncio.create_subprocess_exec(
                                "ddev", "wp", "search-replace", 
                                ps.wp_url, local_url, "--all-tables",
                                cwd=local_path,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.PIPE
                            )
                            await sr_proc.communicate()
                    except:
                        pass  # Search-replace is optional
            
            # Cleanup remote file
            cleanup_cmd = _get_ssh_cmd(server, project_server=ps)
            cleanup_cmd.append(f"rm -f {remote_sql}")
            await asyncio.create_subprocess_exec(*cleanup_cmd)
            
            # Cleanup local temp file
            try:
                os.unlink(local_sql)
            except:
                pass
            
            logger.info(f"Database pull completed from {server.name}")
            
            return {
                "success": True,
                "message": f"Database pulled from {server.name}",
                "server": server.name,
                "environment": ps.environment.value
            }
            
        except asyncio.TimeoutError:
            return {"success": False, "error": "Operation timed out"}
        except Exception as e:
            logger.error(f"Database pull error: {e}")
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.sync_tasks.sync_database_pull")
def sync_database_pull(
    server_id: int,
    project_server_id: int,
    local_path: str,
    search_replace: bool = True
) -> dict:
    """Pull database from remote server to local."""
    return run_async(_sync_database_pull(
        server_id, project_server_id, local_path, search_replace
    ))


async def _sync_database_push(
    project_server_id: int,
    local_path: str,
    backup_first: bool = True,
    search_replace: bool = True
) -> dict:
    """
    Push local database to remote server.
    
    Steps:
    1. Export local DB with ddev export-db
    2. Optionally backup remote DB first
    3. Upload SQL file via SCP
    4. Import on remote server
    5. Run search-replace for URL changes
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server link not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            local_sql = f"/tmp/db_push_{timestamp}.sql"
            remote_sql = f"/tmp/db_push_{timestamp}.sql"
            
            # Step 1: Export local database
            logger.info("Exporting local database...")
            export_proc = await asyncio.create_subprocess_exec(
                "ddev", "export-db", "--file", local_sql,
                cwd=local_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(export_proc.communicate(), timeout=300)
            
            if export_proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Local export failed: {stderr.decode()[:200]}"
                }
            
            # Step 2: Optionally backup remote database
            if backup_first:
                logger.info(f"Backing up remote database on {server.name}...")
                backup_sql = f"/tmp/db_backup_{timestamp}.sql"
                backup_cmd = _get_db_export_cmd(server.panel_type, ps.wp_path, backup_sql)
                ssh_cmd = _get_ssh_cmd(server, project_server=ps)
                ssh_cmd.append(backup_cmd)
                
                proc = await asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=300)
                # Backup failure is not critical, continue
            
            # Step 3: Upload SQL file
            logger.info(f"Uploading database to {server.name}...")
            scp_cmd = _get_scp_cmd(server, local_sql, remote_sql, download=False, project_server=ps)
            
            proc = await asyncio.create_subprocess_exec(
                *scp_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Upload failed: {stderr.decode()[:200]}"
                }
            
            # Step 4: Import on remote server
            logger.info(f"Importing database on {server.name}...")
            import_cmd = _get_db_import_cmd(server.panel_type, ps.wp_path, remote_sql)
            ssh_cmd = _get_ssh_cmd(server, project_server=ps)
            ssh_cmd.append(import_cmd)
            
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Import failed: {stderr.decode()[:200]}"
                }
            
            # Step 5: Run search-replace
            if search_replace:
                logger.info("Running URL search-replace on remote...")
                # Get local DDEV URL
                try:
                    import json
                    url_proc = await asyncio.create_subprocess_exec(
                        "ddev", "describe", "-j",
                        cwd=local_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    url_stdout, _ = await url_proc.communicate()
                    ddev_info = json.loads(url_stdout.decode())
                    local_url = ddev_info.get("raw", {}).get("primary_url", "")
                    
                    if local_url and ps.wp_url:
                        sr_cmd = f"cd {ps.wp_path} && wp search-replace '{local_url}' '{ps.wp_url}' --all-tables --allow-root"
                        ssh_cmd = _get_ssh_cmd(server, project_server=ps)
                        ssh_cmd.append(sr_cmd)
                        
                        proc = await asyncio.create_subprocess_exec(
                            *ssh_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE
                        )
                        await proc.communicate()
                except:
                    pass  # Search-replace is optional
            
            # Cleanup
            cleanup_cmd = _get_ssh_cmd(server, project_server=ps)
            cleanup_cmd.append(f"rm -f {remote_sql}")
            await asyncio.create_subprocess_exec(*cleanup_cmd)
            
            try:
                os.unlink(local_sql)
            except:
                pass
            
            logger.info(f"Database push completed to {server.name}")
            
            return {
                "success": True,
                "message": f"Database pushed to {server.name}",
                "server": server.name,
                "environment": ps.environment.value
            }
            
        except asyncio.TimeoutError:
            return {"success": False, "error": "Operation timed out"}
        except Exception as e:
            logger.error(f"Database push error: {e}")
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.sync_tasks.sync_database_push")
def sync_database_push(
    project_server_id: int,
    local_path: str,
    backup_first: bool = True,
    search_replace: bool = True
) -> dict:
    """Push local database to remote server."""
    return run_async(_sync_database_push(
        project_server_id, local_path, backup_first, search_replace
    ))


# ============================================================================
# File Sync Tasks
# ============================================================================

def _get_uploads_path(wp_path: str, is_bedrock: bool = True) -> str:
    """Get uploads path based on WordPress type."""
    if is_bedrock:
        return f"{wp_path}/web/app/uploads"
    return f"{wp_path}/wp-content/uploads"


async def _sync_files_pull(
    project_server_id: int,
    paths: list,
    dry_run: bool = False
) -> dict:
    """Pull files from remote server using rsync."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server link not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        # Get project for local path
        from ..db.models.project import Project
        result = await db.execute(
            select(Project).where(Project.id == ps.project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return {"success": False, "error": "Project not found"}
        
        local_base = project.directory
        results = []
        
        for path in paths:
            try:
                # Determine source and destination paths
                if path == "uploads":
                    remote_path = _get_uploads_path(ps.wp_path, is_bedrock=True)
                    local_path = f"{local_base}/web/app/uploads/"
                elif path == "plugins":
                    remote_path = f"{ps.wp_path}/web/app/plugins"
                    local_path = f"{local_base}/web/app/plugins/"
                elif path == "themes":
                    remote_path = f"{ps.wp_path}/web/app/themes"
                    local_path = f"{local_base}/web/app/themes/"
                else:
                    remote_path = f"{ps.wp_path}/{path}"
                    local_path = f"{local_base}/{path}/"
                
                # Build rsync command with per-site SSH credentials
                ssh_user = ps.ssh_user or server.ssh_user
                ssh_key = ps.ssh_key_path or server.ssh_key_path
                
                rsync_cmd = ["rsync", "-avz", "--progress"]
                if dry_run:
                    rsync_cmd.append("--dry-run")
                
                ssh_opts = f"ssh -p {server.ssh_port}"
                if ssh_key:
                    ssh_opts += f" -i {ssh_key}"
                
                rsync_cmd.extend([
                    "-e", ssh_opts,
                    f"{ssh_user}@{server.hostname}:{remote_path}/",
                    local_path
                ])
                
                logger.info(f"Pulling {path} from {server.name}...")
                
                proc = await asyncio.create_subprocess_exec(
                    *rsync_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
                
                results.append({
                    "path": path,
                    "success": proc.returncode == 0,
                    "message": stdout.decode()[:500] if proc.returncode == 0 else stderr.decode()[:200]
                })
                
            except Exception as e:
                results.append({
                    "path": path,
                    "success": False,
                    "message": str(e)[:200]
                })
        
        success_count = sum(1 for r in results if r["success"])
        
        return {
            "success": success_count == len(paths),
            "message": f"Pulled {success_count}/{len(paths)} paths",
            "results": results,
            "dry_run": dry_run
        }


@shared_task(name="forge.tasks.sync_tasks.sync_files_pull")
def sync_files_pull(
    project_server_id: int,
    paths: list,
    dry_run: bool = False
) -> dict:
    """Pull files from remote server."""
    return run_async(_sync_files_pull(project_server_id, paths, dry_run))


async def _sync_files_push(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
    delete_extra: bool = False
) -> dict:
    """Push files to remote server using rsync."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server link not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        from ..db.models.project import Project
        result = await db.execute(
            select(Project).where(Project.id == ps.project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return {"success": False, "error": "Project not found"}
        
        local_base = project.directory
        results = []
        
        for path in paths:
            try:
                if path == "uploads":
                    local_path = f"{local_base}/web/app/uploads/"
                    remote_path = _get_uploads_path(ps.wp_path, is_bedrock=True)
                elif path == "plugins":
                    local_path = f"{local_base}/web/app/plugins/"
                    remote_path = f"{ps.wp_path}/web/app/plugins"
                elif path == "themes":
                    local_path = f"{local_base}/web/app/themes/"
                    remote_path = f"{ps.wp_path}/web/app/themes"
                else:
                    local_path = f"{local_base}/{path}/"
                    remote_path = f"{ps.wp_path}/{path}"
                
                # Build rsync command with per-site SSH credentials
                ssh_user = ps.ssh_user or server.ssh_user
                ssh_key = ps.ssh_key_path or server.ssh_key_path
                
                rsync_cmd = ["rsync", "-avz", "--progress"]
                if dry_run:
                    rsync_cmd.append("--dry-run")
                if delete_extra:
                    rsync_cmd.append("--delete")
                
                ssh_opts = f"ssh -p {server.ssh_port}"
                if ssh_key:
                    ssh_opts += f" -i {ssh_key}"
                
                rsync_cmd.extend([
                    "-e", ssh_opts,
                    local_path,
                    f"{ssh_user}@{server.hostname}:{remote_path}/"
                ])
                
                logger.info(f"Pushing {path} to {server.name}...")
                
                proc = await asyncio.create_subprocess_exec(
                    *rsync_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
                
                results.append({
                    "path": path,
                    "success": proc.returncode == 0,
                    "message": stdout.decode()[:500] if proc.returncode == 0 else stderr.decode()[:200]
                })
                
            except Exception as e:
                results.append({
                    "path": path,
                    "success": False,
                    "message": str(e)[:200]
                })
        
        success_count = sum(1 for r in results if r["success"])
        
        return {
            "success": success_count == len(paths),
            "message": f"Pushed {success_count}/{len(paths)} paths",
            "results": results,
            "dry_run": dry_run
        }


@shared_task(name="forge.tasks.sync_tasks.sync_files_push")
def sync_files_push(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
    delete_extra: bool = False
) -> dict:
    """Push files to remote server."""
    return run_async(_sync_files_push(project_server_id, paths, dry_run, delete_extra))


# ============================================================================
# Full Environment Sync
# ============================================================================

async def _full_environment_sync(
    source_ps_id: int,
    target_ps_id: Optional[int],
    options: dict
) -> dict:
    """
    Full sync: database + uploads + optionally plugins/themes.
    
    If target_ps_id is None, syncs to local.
    """
    results = {
        "database": None,
        "uploads": None,
        "plugins": None,
        "themes": None
    }
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer)
            .where(ProjectServer.id == source_ps_id)
        )
        source_ps = result.scalar_one_or_none()
        if not source_ps:
            return {"success": False, "error": "Source project-server not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == source_ps.server_id)
        )
        server = result.scalar_one_or_none()
        
        from ..db.models.project import Project
        result = await db.execute(
            select(Project).where(Project.id == source_ps.project_id)
        )
        project = result.scalar_one_or_none()
        local_path = project.directory if project else None
    
    dry_run = options.get("dry_run", False)
    
    # Sync database
    if options.get("sync_database", True):
        logger.info("Syncing database...")
        if target_ps_id is None:
            # Pull to local
            results["database"] = await _sync_database_pull(
                server.id, source_ps_id, local_path, search_replace=True
            )
        else:
            # Push to remote (would need different logic)
            results["database"] = {"success": False, "error": "Server-to-server not yet supported"}
    
    # Build list of paths to sync
    paths = []
    if options.get("sync_uploads", True):
        paths.append("uploads")
    if options.get("sync_plugins", False):
        paths.append("plugins")
    if options.get("sync_themes", False):
        paths.append("themes")
    
    if paths:
        logger.info(f"Syncing files: {', '.join(paths)}...")
        if target_ps_id is None:
            file_result = await _sync_files_pull(source_ps_id, paths, dry_run)
        else:
            file_result = await _sync_files_push(target_ps_id, paths, dry_run)
        
        for path in paths:
            path_result = next(
                (r for r in file_result.get("results", []) if r["path"] == path),
                None
            )
            if path_result:
                results[path] = path_result
    
    success = all(
        r is None or r.get("success", False) 
        for r in results.values()
    )
    
    return {
        "success": success,
        "message": "Full sync completed" if success else "Some sync operations failed",
        "results": results,
        "dry_run": dry_run
    }


@shared_task(name="forge.tasks.sync_tasks.full_environment_sync")
def full_environment_sync(
    source_ps_id: int,
    target_ps_id: Optional[int],
    options: dict
) -> dict:
    """Full environment sync: database + files."""
    return run_async(_full_environment_sync(source_ps_id, target_ps_id, options))


# ============================================================================
# Remote Composer Tasks (Bedrock)
# ============================================================================

async def _run_remote_composer(
    project_server_id: int,
    command: str = "update",
    packages: list = None,
    flags: list = None
) -> dict:
    """
    Run composer command on a remote Bedrock site via SSH.
    
    Uses per-site SSH credentials from ProjectServer when available.
    """
    import time
    start_time = time.time()
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer).where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server link not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        try:
            # Build composer command
            composer_cmd = f"cd {ps.wp_path} && composer {command}"
            
            if packages:
                composer_cmd += " " + " ".join(packages)
            
            if flags:
                composer_cmd += " " + " ".join(flags)
            else:
                # Default flags for production
                composer_cmd += " --no-dev --prefer-dist --no-interaction"
            
            logger.info(f"Running remote composer on {server.name}: {composer_cmd}")
            
            # Build SSH command with per-site credentials
            ssh_cmd = _get_ssh_cmd(server, project_server=ps)
            ssh_cmd.append(composer_cmd)
            
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
            
            duration = time.time() - start_time
            
            if proc.returncode == 0:
                logger.info(f"Remote composer completed on {server.name}")
                return {
                    "success": True,
                    "output": stdout.decode()[:2000],
                    "duration_seconds": duration
                }
            else:
                return {
                    "success": False,
                    "output": stdout.decode()[:1000],
                    "error": stderr.decode()[:500],
                    "duration_seconds": duration
                }
                
        except asyncio.TimeoutError:
            return {"success": False, "error": "Composer command timed out (10 min limit)"}
        except Exception as e:
            logger.error(f"Remote composer error: {e}")
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.sync_tasks.run_remote_composer")
def run_remote_composer(
    project_server_id: int,
    command: str = "update",
    packages: list = None,
    flags: list = None
) -> dict:
    """Run composer command on a remote Bedrock site."""
    return run_async(_run_remote_composer(project_server_id, command, packages, flags))


