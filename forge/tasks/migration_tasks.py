from datetime import datetime
from pathlib import Path
import shlex
from typing import Optional
import os
import requests

from celery import shared_task
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async
from ..utils.ssh import SSHConnection
from ..api.deps import update_task_status


def _normalize_url(url: str) -> str:
    return url.rstrip("/")


def _nest_api_base() -> str:
    base_url = (os.getenv("NEST_API_URL") or "http://localhost:8100").rstrip("/")
    api_prefix = (os.getenv("NEST_API_PREFIX") or "/api/v1").strip()
    if not api_prefix.startswith("/"):
        api_prefix = f"/{api_prefix}"
    api_prefix = api_prefix.rstrip("/")
    return f"{base_url}{api_prefix}"


def _worker_headers() -> dict[str, str]:
    token = (os.getenv("NEST_WORKER_TOKEN") or "").strip()
    if not token:
        return {}
    return {"x-worker-token": token}


def _get_project_server(project_server_id: int) -> Optional[dict]:
    response = requests.get(
        f"{_nest_api_base()}/projects/project-servers/{project_server_id}",
        headers=_worker_headers(),
        timeout=8,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _get_server(server_id: int) -> Optional[dict]:
    response = requests.get(
        f"{_nest_api_base()}/servers/{server_id}",
        headers=_worker_headers(),
        timeout=8,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _update_project_server_url(project_id: int, project_server_id: int, wp_url: str) -> None:
    requests.put(
        f"{_nest_api_base()}/projects/{project_id}/servers/{project_server_id}",
        headers=_worker_headers(),
        json={"wp_url": wp_url},
        timeout=8,
    ).raise_for_status()


def _get_ssh_connection(server: dict, project_server: dict) -> SSHConnection:
    ssh_user = project_server.get("ssh_user") or server.get("ssh_user")
    ssh_key_path = project_server.get("ssh_key_path") or server.get("ssh_key_path")
    return SSHConnection(
        str(server.get("hostname", "")),
        ssh_user,
        ssh_key_path,
        int(server.get("ssh_port") or 22),
        password=server.get("ssh_password"),
        private_key=server.get("ssh_private_key")
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
    ps = _get_project_server(project_server_id)
    if not ps:
        return {"success": False, "error": "Project-server not found"}

    server = _get_server(int(ps.get("server_id") or 0))
    if not server:
        return {"success": False, "error": "Server not found"}

    project_id = ps.get("project_id")

    src = _normalize_url(source_url)
    dst = _normalize_url(target_url)

    if task_id:
        update_task_status(task_id, "running", "Starting URL migration", 5)

    backup_dir = Path.home() / ".forge" / "migrations"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    remote_dump = f"/tmp/forge_migration_{project_server_id}_{timestamp}.sql"
    project_slug = str(ps.get("project_slug") or f"project-{project_id}" if project_id else "project")
    local_dump = backup_dir / f"{project_slug}_{timestamp}.sql"

    try:
        with _get_ssh_connection(server, ps) as ssh:
            wp_path = str(ps.get("wp_path") or "")
            if not wp_path:
                raise RuntimeError("Missing wp_path for project-server")

            if backup_before:
                if task_id:
                    update_task_status(task_id, "running", "Creating database backup", 20)

                export_cmd = (
                    f"cd {shlex.quote(wp_path)} && "
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
                f"cd {shlex.quote(wp_path)} && "
                f"wp search-replace {shlex.quote(src)} {shlex.quote(dst)} "
                f"{sr_flags} --allow-root"
            )
            result = ssh.run(sr_cmd)

            ssh.run(
                f"cd {shlex.quote(wp_path)} && "
                f"wp cache flush --allow-root 2>/dev/null || true",
                warn=True
            )
            ssh.run(
                f"cd {shlex.quote(wp_path)} && "
                f"wp rewrite flush --allow-root 2>/dev/null || true",
                warn=True
            )

        if task_id:
            update_task_status(task_id, "completed", "URL migration completed", 100, {
                "backup_file": str(local_dump) if download_backup else None,
                "dry_run": dry_run,
                "output": result.stdout[:500]
            })

        if not dry_run and project_id is not None:
            try:
                _update_project_server_url(int(project_id), project_server_id, dst)
            except Exception as api_e:
                logger.error(f"Failed to update project-server URL via API: {api_e}")

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