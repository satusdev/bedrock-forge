"""
Sync tasks for Celery.

DB-decoupled implementation: all metadata/state operations go through Nest API.
"""
from typing import Optional
import asyncio
import subprocess
import os
import requests

from celery import shared_task

from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


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


def _sync_get(path: str, params: Optional[dict] = None) -> Optional[dict]:
    try:
        response = requests.get(
            f"{_nest_api_base()}{path}",
            params=params,
            headers=_worker_headers(),
            timeout=8,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.warning(f"Nest GET {path} failed: {e}")
        return None


def _sync_post(path: str, payload: Optional[dict] = None, params: Optional[dict] = None) -> Optional[dict]:
    try:
        response = requests.post(
            f"{_nest_api_base()}{path}",
            json=payload,
            params=params,
            headers=_worker_headers(),
            timeout=12,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.warning(f"Nest POST {path} failed: {e}")
        return None


def _list_servers(limit: int = 100) -> list[dict]:
    servers: list[dict] = []
    skip = 0

    while True:
        batch = _sync_get("/servers", params={"skip": skip, "limit": limit})
        page = batch if isinstance(batch, list) else []
        if not page:
            break

        servers.extend(page)
        if len(page) < limit:
            break
        skip += len(page)

    return servers


async def _check_server_ssh(server_id: int) -> dict:
    """Check server health through Nest server health endpoints."""
    server = _sync_get(f"/servers/{server_id}")
    if not server:
        return {"error": "Server not found"}

    trigger = _sync_post(f"/servers/{server_id}/health/trigger")
    health = _sync_get(f"/servers/{server_id}/health")

    status = str((health or {}).get("status", "unknown")).lower()
    success = status in {"online", "up", "healthy"}

    message = "Connection successful" if success else "Connection failed"
    if isinstance(trigger, dict) and trigger.get("message"):
        message = str(trigger["message"])

    return {
        "server_id": server_id,
        "name": server.get("name", f"server-{server_id}"),
        "success": success,
        "message": message,
        "status": status,
    }


@shared_task(name="forge.tasks.sync_tasks.check_server_ssh")
def check_server_ssh(server_id: int) -> dict:
    """Check SSH/health connectivity to a server."""
    return run_async(_check_server_ssh(server_id))


async def _check_all_servers() -> dict:
    """Check all known servers through Nest."""
    servers = _list_servers()
    results = []

    for server in servers:
        server_id = server.get("id")
        if server_id is None:
            continue
        results.append(await _check_server_ssh(int(server_id)))

    online = sum(1 for r in results if r.get("success"))
    offline = sum(1 for r in results if not r.get("success") and "error" not in r)

    return {
        "total": len(results),
        "online": online,
        "offline": offline,
        "results": results,
    }


@shared_task(name="forge.tasks.sync_tasks.check_all_servers")
def check_all_servers() -> dict:
    """Check all servers health."""
    logger.info("Starting server health check cycle")
    return run_async(_check_all_servers())


@shared_task(name="forge.tasks.sync_tasks.sync_github_repository")
def sync_github_repository(project_dir: str, branch: str = "main") -> dict:
    """Sync a project's Git repository."""
    try:
        result = subprocess.run(
            ["git", "pull", "origin", branch],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode == 0:
            logger.info(f"Git pull successful for {project_dir}")
            return {"success": True, "output": result.stdout[:500]}

        logger.error(f"Git pull failed for {project_dir}: {result.stderr}")
        return {"success": False, "error": result.stderr[:500]}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Git pull timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)[:100]}


async def _deploy_to_server(server_id: int, project_dir: str, remote_path: str) -> dict:
    """Deploy project to a server via rsync using metadata from Nest."""
    server = _sync_get(f"/servers/{server_id}")
    if not server:
        return {"error": "Server not found"}

    try:
        ssh_user = server.get("ssh_user") or "root"
        ssh_port = int(server.get("ssh_port") or 22)
        ssh_key = server.get("ssh_key_path")
        hostname = server.get("hostname")

        if not hostname:
            return {"success": False, "error": "Server hostname missing"}

        ssh_opts = f"ssh -p {ssh_port}"
        if ssh_key:
            ssh_opts += f" -i {ssh_key}"

        rsync_cmd = [
            "rsync",
            "-avz",
            "--delete",
            "-e",
            ssh_opts,
            f"{project_dir}/",
            f"{ssh_user}@{hostname}:{remote_path}",
        ]

        proc = await asyncio.create_subprocess_exec(
            *rsync_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)

        if proc.returncode == 0:
            return {
                "success": True,
                "server": server.get("name", f"server-{server_id}"),
                "message": "Deployment successful",
            }

        return {"success": False, "error": stderr.decode()[:500]}
    except asyncio.TimeoutError:
        return {"success": False, "error": "Deployment timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)[:100]}


@shared_task(name="forge.tasks.sync_tasks.deploy_to_server")
def deploy_to_server(server_id: int, project_dir: str, remote_path: str) -> dict:
    """Deploy project to a server via rsync."""
    return run_async(_deploy_to_server(server_id, project_dir, remote_path))


async def _sync_database_pull(
    server_id: int,
    project_server_id: int,
    local_path: str,
    search_replace: bool = True,
) -> dict:
    """Pull database through Nest sync API."""
    _ = server_id
    payload = {
        "source_project_server_id": project_server_id,
        "target": local_path,
        "search_replace": search_replace,
    }
    response = _sync_post("/sync/database/pull", payload=payload)
    if response is None:
        return {"success": False, "error": "Database pull request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "Database pull queued"),
        "task_id": response.get("task_id"),
        "result": response,
    }


@shared_task(name="forge.tasks.sync_tasks.sync_database_pull")
def sync_database_pull(
    server_id: int,
    project_server_id: int,
    local_path: str,
    search_replace: bool = True,
) -> dict:
    """Pull database from remote server to local."""
    return run_async(_sync_database_pull(server_id, project_server_id, local_path, search_replace))


async def _sync_database_push(
    project_server_id: int,
    local_path: str,
    backup_first: bool = True,
    search_replace: bool = True,
) -> dict:
    """Push database through Nest sync API."""
    payload = {
        "source": local_path,
        "target_project_server_id": project_server_id,
        "search_replace": search_replace,
        "backup_first": backup_first,
    }
    response = _sync_post("/sync/database/push", payload=payload)
    if response is None:
        return {"success": False, "error": "Database push request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "Database push queued"),
        "task_id": response.get("task_id"),
        "result": response,
    }


@shared_task(name="forge.tasks.sync_tasks.sync_database_push")
def sync_database_push(
    project_server_id: int,
    local_path: str,
    backup_first: bool = True,
    search_replace: bool = True,
) -> dict:
    """Push local database to remote server."""
    return run_async(_sync_database_push(project_server_id, local_path, backup_first, search_replace))


async def _sync_files_pull(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
) -> dict:
    """Pull files through Nest sync API."""
    payload = {
        "source_project_server_id": project_server_id,
        "paths": paths,
        "target": "local",
        "dry_run": dry_run,
    }
    response = _sync_post("/sync/files/pull", payload=payload)
    if response is None:
        return {"success": False, "error": "File pull request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "File pull queued"),
        "task_id": response.get("task_id"),
        "result": response,
        "dry_run": dry_run,
    }


@shared_task(name="forge.tasks.sync_tasks.sync_files_pull")
def sync_files_pull(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
) -> dict:
    """Pull files from remote server."""
    return run_async(_sync_files_pull(project_server_id, paths, dry_run))


async def _sync_files_push(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
    delete_extra: bool = False,
) -> dict:
    """Push files through Nest sync API."""
    payload = {
        "source": "local",
        "target_project_server_id": project_server_id,
        "paths": paths,
        "dry_run": dry_run,
        "delete_extra": delete_extra,
    }
    response = _sync_post("/sync/files/push", payload=payload)
    if response is None:
        return {"success": False, "error": "File push request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "File push queued"),
        "task_id": response.get("task_id"),
        "result": response,
        "dry_run": dry_run,
    }


@shared_task(name="forge.tasks.sync_tasks.sync_files_push")
def sync_files_push(
    project_server_id: int,
    paths: list,
    dry_run: bool = False,
    delete_extra: bool = False,
) -> dict:
    """Push files to remote server."""
    return run_async(_sync_files_push(project_server_id, paths, dry_run, delete_extra))


async def _full_environment_sync(
    source_ps_id: int,
    target_ps_id: Optional[int],
    options: dict,
) -> dict:
    """Run full environment sync via Nest full-sync endpoint."""
    payload = {
        "source_project_server_id": source_ps_id,
        "target_project_server_id": target_ps_id,
        "sync_database": options.get("sync_database", True),
        "sync_uploads": options.get("sync_uploads", True),
        "sync_plugins": options.get("sync_plugins", False),
        "sync_themes": options.get("sync_themes", False),
        "dry_run": options.get("dry_run", False),
    }

    response = _sync_post("/sync/full", params={k: v for k, v in payload.items() if v is not None})
    if response is None:
        return {"success": False, "error": "Full sync request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "Full sync queued"),
        "task_id": response.get("task_id"),
        "result": response,
        "dry_run": options.get("dry_run", False),
    }


@shared_task(name="forge.tasks.sync_tasks.full_environment_sync")
def full_environment_sync(
    source_ps_id: int,
    target_ps_id: Optional[int],
    options: dict,
) -> dict:
    """Full environment sync: database + files."""
    return run_async(_full_environment_sync(source_ps_id, target_ps_id, options))


async def _run_remote_composer(
    project_server_id: int,
    command: str = "update",
    packages: list = None,
    flags: list = None,
) -> dict:
    """Run remote composer via Nest sync endpoint."""
    payload = {
        "project_server_id": project_server_id,
        "command": command,
        "packages": packages,
        "flags": flags,
    }

    response = _sync_post("/sync/composer", payload=payload)
    if response is None:
        return {"success": False, "error": "Remote composer request failed"}

    return {
        "success": response.get("status") == "accepted",
        "message": response.get("message", "Composer command queued"),
        "task_id": response.get("task_id"),
        "result": response,
    }


@shared_task(name="forge.tasks.sync_tasks.run_remote_composer")
def run_remote_composer(
    project_server_id: int,
    command: str = "update",
    packages: list = None,
    flags: list = None,
) -> dict:
    """Run composer command on a remote Bedrock site."""
    return run_async(_run_remote_composer(project_server_id, command, packages, flags))
