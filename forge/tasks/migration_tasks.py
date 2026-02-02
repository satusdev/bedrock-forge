from datetime import datetime
from pathlib import Path
import asyncio
import shlex
from typing import Optional

from celery import shared_task
from sqlalchemy import select

from ..db import AsyncSessionLocal
from ..db.models.project_server import ProjectServer
from ..db.models.server import Server
from ..db.models.project import Project
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async
from ..utils.ssh import SSHConnection
from ..api.deps import update_task_status


def _normalize_url(url: str) -> str:
    return url.rstrip("/")


def _get_ssh_connection(server: Server, project_server: ProjectServer) -> SSHConnection:
    ssh_user = project_server.ssh_user or server.ssh_user
    ssh_key_path = project_server.ssh_key_path or server.ssh_key_path
    return SSHConnection(
        server.hostname,
        ssh_user,
        ssh_key_path,
        server.ssh_port,
        password=server.ssh_password,
        private_key=server.ssh_private_key
    )


@shared_task(name="forge.tasks.migration_tasks.run_url_migration")
def run_url_migration(
    project_server_id: int,
    source_url: str,
    target_url: str,
    backup_before: bool = True,
    download_backup: bool = True,
    dry_run: bool = False,
    task_id: Optional[str] = None
) -> dict:
    return run_async(_run_url_migration(
        project_server_id,
        source_url,
        target_url,
        backup_before,
        download_backup,
        dry_run,
        task_id
    ))


async def _run_url_migration(
    project_server_id: int,
    source_url: str,
    target_url: str,
    backup_before: bool,
    download_backup: bool,
    dry_run: bool,
    task_id: Optional[str]
) -> dict:
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

        result = await db.execute(
            select(Project).where(Project.id == ps.project_id)
        )
        project = result.scalar_one_or_none()

        src = _normalize_url(source_url)
        dst = _normalize_url(target_url)

        if task_id:
            update_task_status(task_id, "running", "Starting URL migration", 5)

        backup_dir = Path.home() / ".forge" / "migrations"
        backup_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        remote_dump = f"/tmp/forge_migration_{project_server_id}_{timestamp}.sql"
        local_dump = backup_dir / f"{project.slug if project else 'project'}_{timestamp}.sql"

        try:
            with _get_ssh_connection(server, ps) as ssh:
                if backup_before:
                    if task_id:
                        update_task_status(task_id, "running", "Creating database backup", 20)

                    export_cmd = (
                        f"cd {shlex.quote(ps.wp_path)} && "
                        f"wp db export {shlex.quote(remote_dump)} --allow-root"
                    )
                    ssh.run(export_cmd)

                    if download_backup:
                        ssh.download(remote_dump, str(local_dump))

                    ssh.run(f"rm -f {shlex.quote(remote_dump)}", warn=True)

                if task_id:
                    update_task_status(task_id, "running", "Running search-replace", 60)

                sr_flags = "--all-tables --precise --skip-columns=guid"
                if dry_run:
                    sr_flags = f"{sr_flags} --dry-run"

                sr_cmd = (
                    f"cd {shlex.quote(ps.wp_path)} && "
                    f"wp search-replace {shlex.quote(src)} {shlex.quote(dst)} "
                    f"{sr_flags} --allow-root"
                )
                result = ssh.run(sr_cmd)

                ssh.run(
                    f"cd {shlex.quote(ps.wp_path)} && "
                    f"wp cache flush --allow-root 2>/dev/null || true",
                    warn=True
                )
                ssh.run(
                    f"cd {shlex.quote(ps.wp_path)} && "
                    f"wp rewrite flush --allow-root 2>/dev/null || true",
                    warn=True
                )

            if task_id:
                update_task_status(task_id, "completed", "URL migration completed", 100, {
                    "backup_file": str(local_dump) if download_backup else None,
                    "dry_run": dry_run,
                    "output": result.stdout[:500]
                })
            
            # Update ProjectServer URL if not dry_run
            if not dry_run:
                try:
                    ps.wp_url = dst
                    ps.updated_at = datetime.utcnow()
                    await db.commit()
                except Exception as db_e:
                    logger.error(f"Failed to update ProjectServer URL: {db_e}")

            return {
                "success": True,
                "backup_file": str(local_dump) if download_backup else None,
                "dry_run": dry_run,
                "output": result.stdout[:500]
            }

        except Exception as e:
            logger.error(f"URL migration failed: {e}")
            if task_id:
                update_task_status(task_id, "failed", str(e), 100)
            return {"success": False, "error": str(e)}