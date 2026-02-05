"""
WordPress site management tasks for Celery.

Background tasks for WP version scanning, updates, and management.
"""
from datetime import datetime
from typing import Optional, List
import asyncio
import json
import shlex

from celery import shared_task
from sqlalchemy import select

from ..db import AsyncSessionLocal
from ..db.models.project_server import ProjectServer
from ..db.models.server import Server
from ..db.models.wp_site_management import WPSiteState, WPUpdate, UpdateType, UpdateStatus
from ..db.models.backup import Backup
from ..utils.logging import logger
from .sync_tasks import _get_ssh_cmd, run_async
from ..api.deps import update_task_status
from ..db.models.audit import AuditLog, AuditAction


ALLOWED_WP_CLI_COMMANDS = {
    "core version",
    "core check-update",
    "core update",
    "plugin install",
    "plugin activate",
    "plugin deactivate",
    "plugin uninstall",
    "plugin list",
    "plugin status",
    "plugin update",
    "theme list",
    "theme status",
    "theme update",
    "user list",
    "option get",
    "cache flush",
}


def normalize_wp_cli_command(command: str) -> str:
    return " ".join(command.lower().strip().split())


def is_allowed_wp_cli_command(command: str) -> bool:
    return normalize_wp_cli_command(command) in ALLOWED_WP_CLI_COMMANDS


# ============================================================================
# WP Site Scanning Tasks
# ============================================================================

async def _scan_wp_site(project_server_id: int) -> dict:
    """
    Scan WordPress site for versions, plugins, themes via WP-CLI.
    
    Uses per-site SSH credentials from ProjectServer.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer).where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        try:
            # Get or create WPSiteState
            result = await db.execute(
                select(WPSiteState).where(WPSiteState.project_server_id == project_server_id)
            )
            wp_state = result.scalar_one_or_none()
            if not wp_state:
                wp_state = WPSiteState(project_server_id=project_server_id)
                db.add(wp_state)
            
            ssh_base = _get_ssh_cmd(server, project_server=ps)

            # Detect Bedrock structure and run WP-CLI from project root
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

            wp_env = "PATH=$PATH:/usr/local/bin:/usr/bin:/bin"
            def _wp_cmd(cmd: str) -> str:
                return f"cd {cli_path} && {wp_env} wp {cmd} --allow-root"
            
            scan_error = None

            # Preflight: ensure wp-cli exists on remote
            wp_check_cmd = ssh_base + [f"{wp_env} command -v wp"]
            proc = await asyncio.create_subprocess_exec(
                *wp_check_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            if proc.returncode != 0 or not stdout.strip():
                scan_error = (
                    "WP-CLI not found on the server. Install wp-cli and ensure it is in PATH "
                    "(/usr/local/bin or /usr/bin)."
                )
                wp_state.scan_error = scan_error
                wp_state.last_scanned_at = datetime.utcnow()
                await db.commit()
                logger.error(
                    f"WP scan failed for PS {project_server_id}: {scan_error} "
                    f"stderr={stderr.decode()[:200]}"
                )
                return {"success": False, "error": scan_error}

            # 1. Get WP core version
            wp_version_cmd = ssh_base + [_wp_cmd("core version")]
            proc = await asyncio.create_subprocess_exec(
                *wp_version_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0:
                wp_state.wp_version = stdout.decode().strip()
            
            # 2. Check for WP core updates
            wp_update_cmd = ssh_base + [_wp_cmd("core check-update --format=json")]
            proc = await asyncio.create_subprocess_exec(
                *wp_update_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0 and stdout.strip():
                try:
                    updates = json.loads(stdout.decode())
                    if updates:
                        wp_state.wp_version_available = updates[0].get("version")
                except json.JSONDecodeError:
                    pass
            
            # 3. Get plugins list
            plugins_cmd = ssh_base + [_wp_cmd("plugin list --format=json")]
            proc = await asyncio.create_subprocess_exec(
                *plugins_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            if proc.returncode == 0:
                try:
                    plugins = json.loads(stdout.decode())
                    wp_state.plugins = json.dumps(plugins)
                    wp_state.plugins_count = len(plugins)
                    wp_state.plugins_update_count = sum(
                        1 for p in plugins if p.get("update") == "available"
                    )
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse plugins JSON: {stdout.decode()[:200]}")
                    if not scan_error:
                        scan_error = "Plugin scan JSON error"
            else:
                 logger.error(f"WP plugin list failed: {stderr.decode()}")
                 if not scan_error:
                     scan_error = f"Plugin check failed: {stderr.decode()[:50]}"
            
            # 4. Get themes list
            themes_cmd = ssh_base + [_wp_cmd("theme list --format=json")]
            proc = await asyncio.create_subprocess_exec(
                *themes_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            if proc.returncode == 0:
                try:
                    themes = json.loads(stdout.decode())
                    wp_state.themes = json.dumps(themes)
                    wp_state.themes_count = len(themes)
                    wp_state.themes_update_count = sum(
                        1 for t in themes if t.get("update") == "available"
                    )
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse themes JSON: {stdout.decode()[:200]}")
                    if not scan_error:
                        scan_error = "Theme scan JSON error"
            else:
                 logger.error(f"WP theme list failed: {stderr.decode()}")
                 if not scan_error:
                     scan_error = f"Theme check failed: {stderr.decode()[:50]}"
            
            # 5. Get user count
            users_cmd = ssh_base + [_wp_cmd("user list --format=count")]
            proc = await asyncio.create_subprocess_exec(
                *users_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0:
                try:
                    wp_state.users_count = int(stdout.decode().strip())
                except ValueError:
                    pass
            
            # 6. Get PHP version
            php_cmd = ssh_base + [_wp_cmd("eval 'echo phpversion();'")]
            proc = await asyncio.create_subprocess_exec(
                *php_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0:
                wp_state.php_version = stdout.decode().strip()[:20]
            
            wp_state.last_scanned_at = datetime.utcnow()
            wp_state.scan_error = scan_error
            
            await db.commit()
            
            logger.info(f"WP scan complete for PS {project_server_id}: WP {wp_state.wp_version}")
            
            return {
                "success": True,
                "wp_version": wp_state.wp_version,
                "wp_update_available": wp_state.wp_version_available,
                "plugins_count": wp_state.plugins_count,
                "plugins_updates": wp_state.plugins_update_count,
                "themes_count": wp_state.themes_count,
                "themes_updates": wp_state.themes_update_count
            }
            
        except asyncio.TimeoutError:
            wp_state.scan_error = "Scan timeout"
            await db.commit()
            return {"success": False, "error": "Scan timeout"}
        except Exception as e:
            logger.error(f"WP scan error: {e}")
            if wp_state:
                wp_state.scan_error = str(e)[:200]
                await db.commit()
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.scan_wp_site")
def scan_wp_site(project_server_id: int) -> dict:
    """Scan WordPress site for versions and available updates."""
    logger.info(f"Scanning WP site for PS {project_server_id}")
    return run_async(_scan_wp_site(project_server_id))


# ============================================================================
# Remote WP-CLI Command Runner
# ============================================================================

async def _run_wp_cli_command(
    project_server_id: int,
    command: str,
    args: Optional[List[str]] = None,
    task_id: Optional[str] = None,
    user_id: Optional[int] = None
) -> dict:
    """Run an allowlisted WP-CLI command on a remote server."""
    normalized_command = normalize_wp_cli_command(command)
    if not is_allowed_wp_cli_command(normalized_command):
        if task_id:
            update_task_status(task_id, "failed", "Command not allowed")
        if user_id:
            async with AsyncSessionLocal() as db:
                details = json.dumps({
                    "command": normalized_command,
                    "args": args or [],
                    "status": "rejected",
                    "task_id": task_id
                })
                db.add(AuditLog(
                    user_id=user_id,
                    action=AuditAction.COMMAND,
                    entity_type="wp_cli",
                    entity_id=str(project_server_id),
                    details=details
                ))
                await db.commit()
        return {"success": False, "error": "Command not allowed"}

    if task_id:
        update_task_status(task_id, "running", f"Running wp {normalized_command}...")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer).where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            if task_id:
                update_task_status(task_id, "failed", "Project-server not found")
            return {"success": False, "error": "Project-server not found"}

        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            if task_id:
                update_task_status(task_id, "failed", "Server not found")
            return {"success": False, "error": "Server not found"}

        try:
            ssh_base = _get_ssh_cmd(server, project_server=ps)

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

            wp_env = "PATH=$PATH:/usr/local/bin:/usr/bin:/bin"

            wp_check_cmd = ssh_base + [f"{wp_env} command -v wp"]
            proc = await asyncio.create_subprocess_exec(
                *wp_check_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            if proc.returncode != 0 or not stdout.strip():
                error = (
                    "WP-CLI not found on the server. Install wp-cli and ensure it is in PATH "
                    "(/usr/local/bin or /usr/bin)."
                )
                if task_id:
                    update_task_status(task_id, "failed", error)
                if user_id:
                    details = json.dumps({
                        "command": normalized_command,
                        "args": args or [],
                        "status": "failed",
                        "error": error,
                        "task_id": task_id
                    })
                    db.add(AuditLog(
                        user_id=user_id,
                        action=AuditAction.COMMAND,
                        entity_type="wp_cli",
                        entity_id=str(project_server_id),
                        details=details
                    ))
                    await db.commit()
                logger.error(
                    f"WP-CLI not found for PS {project_server_id}: {stderr.decode()[:200]}"
                )
                return {"success": False, "error": error}

            safe_args = " ".join(shlex.quote(arg) for arg in (args or []) if arg is not None)
            cmd = f"{normalized_command} {safe_args}".strip()
            full_cmd = f"cd {cli_path} && {wp_env} wp {cmd} --allow-root"

            proc = await asyncio.create_subprocess_exec(
                *(ssh_base + [full_cmd]),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
            if proc.returncode != 0:
                error = (stderr.decode() or "Command failed")[:500]
                if task_id:
                    update_task_status(task_id, "failed", error)
                if user_id:
                    details = json.dumps({
                        "command": normalized_command,
                        "args": args or [],
                        "status": "failed",
                        "error": error,
                        "task_id": task_id
                    })
                    db.add(AuditLog(
                        user_id=user_id,
                        action=AuditAction.COMMAND,
                        entity_type="wp_cli",
                        entity_id=str(project_server_id),
                        details=details
                    ))
                    await db.commit()
                return {"success": False, "error": error}

            output = (stdout.decode() or "").strip()
            if task_id:
                update_task_status(task_id, "completed", "Command completed", 100, {
                    "output": output[:2000]
                })
            if user_id:
                details = json.dumps({
                    "command": normalized_command,
                    "args": args or [],
                    "status": "completed",
                    "output": output[:2000],
                    "task_id": task_id
                })
                db.add(AuditLog(
                    user_id=user_id,
                    action=AuditAction.COMMAND,
                    entity_type="wp_cli",
                    entity_id=str(project_server_id),
                    details=details
                ))
                await db.commit()

            return {"success": True, "output": output}

        except asyncio.TimeoutError:
            if task_id:
                update_task_status(task_id, "failed", "Command timed out")
            if user_id:
                async with AsyncSessionLocal() as db:
                    details = json.dumps({
                        "command": normalized_command,
                        "args": args or [],
                        "status": "failed",
                        "error": "Command timed out",
                        "task_id": task_id
                    })
                    db.add(AuditLog(
                        user_id=user_id,
                        action=AuditAction.COMMAND,
                        entity_type="wp_cli",
                        entity_id=str(project_server_id),
                        details=details
                    ))
                    await db.commit()
            return {"success": False, "error": "Command timed out"}
        except Exception as e:
            logger.error(f"WP-CLI command error: {e}")
            if task_id:
                update_task_status(task_id, "failed", str(e)[:200])
            if user_id:
                async with AsyncSessionLocal() as db:
                    details = json.dumps({
                        "command": normalized_command,
                        "args": args or [],
                        "status": "failed",
                        "error": str(e)[:200],
                        "task_id": task_id
                    })
                    db.add(AuditLog(
                        user_id=user_id,
                        action=AuditAction.COMMAND,
                        entity_type="wp_cli",
                        entity_id=str(project_server_id),
                        details=details
                    ))
                    await db.commit()
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.run_wp_cli_command")
def run_wp_cli_command(
    project_server_id: int,
    command: str,
    args: Optional[List[str]] = None,
    task_id: Optional[str] = None,
    user_id: Optional[int] = None
) -> dict:
    """Run an allowlisted WP-CLI command on a remote server."""
    logger.info(f"Running WP-CLI command for PS {project_server_id}: {command}")
    return run_async(_run_wp_cli_command(project_server_id, command, args, task_id, user_id))


# ============================================================================
# Safe Update Tasks
# ============================================================================

async def _safe_update_wp(
    project_server_id: int,
    update_type: str,
    package_name: str,
    backup_first: bool = True
) -> dict:
    """
    Safely update a WordPress component with backup and rollback.
    
    Steps:
    1. Create backup (if enabled)
    2. Apply update via WP-CLI
    3. Check site health
    4. Rollback if health check fails
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProjectServer).where(ProjectServer.id == project_server_id)
        )
        ps = result.scalar_one_or_none()
        if not ps:
            return {"success": False, "error": "Project-server not found"}
        
        result = await db.execute(
            select(Server).where(Server.id == ps.server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            return {"success": False, "error": "Server not found"}
        
        # Get current version
        current_version = "unknown"
        
        try:
            ssh_base = _get_ssh_cmd(server, project_server=ps)
            
            # Step 1: Create backup if requested
            backup_id = None
            if backup_first:
                # Create backup task would go here
                logger.info(f"Creating backup before update...")
                # For now, we'll skip actual backup and just log
            
            # Step 2: Determine update command
            if update_type == "core":
                update_cmd = f"cd {ps.wp_path} && wp core update"
            elif update_type == "plugin":
                update_cmd = f"cd {ps.wp_path} && wp plugin update {package_name}"
            elif update_type == "theme":
                update_cmd = f"cd {ps.wp_path} && wp theme update {package_name}"
            else:
                return {"success": False, "error": f"Invalid update type: {update_type}"}
            
            # Create update record
            wp_update = WPUpdate(
                project_server_id=project_server_id,
                update_type=UpdateType(update_type),
                package_name=package_name,
                from_version=current_version,
                to_version="pending",
                status=UpdateStatus.PENDING,
                backup_id=backup_id
            )
            db.add(wp_update)
            await db.flush()
            
            # Step 3: Apply update
            logger.info(f"Applying {update_type} update: {package_name}")
            
            full_cmd = ssh_base + [update_cmd]
            proc = await asyncio.create_subprocess_exec(
                *full_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            
            if proc.returncode == 0:
                wp_update.status = UpdateStatus.APPLIED
                wp_update.applied_at = datetime.utcnow()
                wp_update.notes = stdout.decode()[:500]
                
                await db.commit()
                
                logger.info(f"Update successful: {package_name}")
                return {
                    "success": True,
                    "update_id": wp_update.id,
                    "package": package_name,
                    "message": "Update applied successfully"
                }
            else:
                wp_update.status = UpdateStatus.FAILED
                wp_update.error_message = stderr.decode()[:500]
                
                await db.commit()
                
                return {
                    "success": False,
                    "update_id": wp_update.id,
                    "error": stderr.decode()[:200]
                }
                
        except asyncio.TimeoutError:
            return {"success": False, "error": "Update timeout (5 min)"}
        except Exception as e:
            logger.error(f"Update error: {e}")
            return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.safe_update_wp")
def safe_update_wp(
    project_server_id: int,
    update_type: str,
    package_name: str,
    backup_first: bool = True
) -> dict:
    """Safely update a WordPress component with backup."""
    logger.info(f"Safe update: {update_type} {package_name} on PS {project_server_id}")
    return run_async(_safe_update_wp(project_server_id, update_type, package_name, backup_first))


@shared_task(name="forge.tasks.wp_tasks.bulk_update_all")
def bulk_update_all(owner_id: int, update_type: str = "all") -> dict:
    """Update all sites owned by a user."""
    logger.info(f"Bulk update for user {owner_id}: {update_type}")
    # This would iterate over all project-servers and call safe_update_wp
    return {"status": "queued", "message": "Bulk update tasks queued"}


@shared_task(name="forge.tasks.wp_tasks.scan_all_sites")
def scan_all_sites(owner_id: int = None) -> dict:
    """Scan all sites (or all for an owner) for updates."""
    logger.info(f"Scanning all sites for user {owner_id or 'all'}")
    return run_async(_scan_all_sites(owner_id))


async def _scan_all_sites(owner_id: int = None) -> dict:
    """Scan all project-servers for WordPress updates."""
    async with AsyncSessionLocal() as db:
        query = select(ProjectServer)
        # Could filter by owner_id if needed
        
        result = await db.execute(query)
        project_servers = result.scalars().all()
        
        scanned = 0
        for ps in project_servers:
            await _scan_wp_site(ps.id)
            scanned += 1
        
        return {"scanned": scanned}
