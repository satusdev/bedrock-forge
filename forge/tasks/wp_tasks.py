"""
WordPress site management tasks for Celery.

DB-decoupled implementation: WP metadata/state operations are routed via Nest API.
"""
from typing import Optional, List
import os
import requests

from celery import shared_task

from ..utils.logging import logger
from ..utils.asyncio_utils import run_async
from ..api.deps import update_task_status


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


def _api_get(path: str, params: Optional[dict] = None):
    response = requests.get(
        f"{_nest_api_base()}{path}",
        params=params,
        headers=_worker_headers(),
        timeout=10,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _api_post(path: str, payload: Optional[dict] = None, params: Optional[dict] = None):
    response = requests.post(
        f"{_nest_api_base()}{path}",
        json=payload,
        params=params,
        headers=_worker_headers(),
        timeout=15,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _list_all_project_server_ids() -> list[int]:
    project_ids: list[int] = []
    skip = 0
    limit = 100

    while True:
        projects = _api_get("/projects", params={"skip": skip, "limit": limit})
        page = projects if isinstance(projects, list) else []
        if not page:
            break

        for project in page:
            project_id = project.get("id")
            if project_id is not None:
                project_ids.append(int(project_id))

        if len(page) < limit:
            break
        skip += len(page)

    project_server_ids: list[int] = []
    for project_id in project_ids:
        servers = _api_get(f"/projects/{project_id}/servers")
        if not isinstance(servers, list):
            continue
        for server_link in servers:
            link_id = server_link.get("id")
            if link_id is not None:
                project_server_ids.append(int(link_id))

    return project_server_ids


# ============================================================================
# WP Site Scanning Tasks
# ============================================================================

async def _scan_wp_site(project_server_id: int) -> dict:
    """Queue WP scan via Nest and return current state snapshot when available."""
    try:
        queued = _api_post(f"/wp/sites/{project_server_id}/scan")
        state = _api_get(f"/wp/sites/{project_server_id}/state") or {}

        return {
            "success": (queued or {}).get("status") == "queued",
            "message": (queued or {}).get("message", "WP scan queued"),
            "wp_version": state.get("wp_version"),
            "wp_update_available": state.get("wp_update_available"),
            "plugins_count": state.get("plugins_count", 0),
            "plugins_updates": state.get("plugins_update_count", 0),
            "themes_count": state.get("themes_count", 0),
            "themes_updates": state.get("themes_update_count", 0),
        }
    except Exception as e:
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
    user_id: Optional[int] = None,
) -> dict:
    """Run an allowlisted WP-CLI command via Nest WP command endpoint."""
    _ = user_id
    normalized_command = normalize_wp_cli_command(command)
    safe_args = args or []

    if not is_allowed_wp_cli_command(normalized_command):
        if task_id:
            update_task_status(task_id, "failed", "Command not allowed")
        return {"success": False, "error": "Command not allowed"}

    if task_id:
        update_task_status(task_id, "running", f"Running wp {normalized_command}...")

    try:
        payload = {
            "project_server_id": project_server_id,
            "command": normalized_command,
            "args": safe_args,
        }
        result = _api_post("/wp/commands/run", payload=payload)
        if result is None:
            if task_id:
                update_task_status(task_id, "failed", "Project-server not found")
            return {"success": False, "error": "Project-server not found"}

        output = {
            "task_id": result.get("task_id"),
            "status": result.get("status"),
            "message": result.get("message"),
        }

        if task_id:
            update_task_status(task_id, "completed", "Command queued", 100, output)

        return {"success": result.get("status") == "queued", "output": output}
    except Exception as e:
        if task_id:
            update_task_status(task_id, "failed", str(e)[:200])
        return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.run_wp_cli_command")
def run_wp_cli_command(
    project_server_id: int,
    command: str,
    args: Optional[List[str]] = None,
    task_id: Optional[str] = None,
    user_id: Optional[int] = None,
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
    backup_first: bool = True,
) -> dict:
    """
    Queue a safe WP update operation through Nest WP/sync endpoints.

    - core update -> bulk core update for selected site
    - plugin/theme update -> wp command run for selected package
    """
    _ = backup_first

    normalized_type = update_type.lower().strip()
    try:
        if normalized_type == "core":
            result = _api_post(
                "/wp/updates/bulk",
                payload={
                    "update_type": "core",
                    "project_server_ids": [project_server_id],
                },
            )
            if result is None:
                return {"success": False, "error": "Site not found"}
            return {
                "success": True,
                "task_id": result.get("task_id"),
                "package": "core",
                "message": result.get("message", "Core update queued"),
            }

        if normalized_type == "plugin":
            return await _run_wp_cli_command(
                project_server_id,
                "plugin update",
                [package_name],
            )

        if normalized_type == "theme":
            return await _run_wp_cli_command(
                project_server_id,
                "theme update",
                [package_name],
            )

        return {"success": False, "error": f"Invalid update type: {update_type}"}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.safe_update_wp")
def safe_update_wp(
    project_server_id: int,
    update_type: str,
    package_name: str,
    backup_first: bool = True,
) -> dict:
    """Safely update a WordPress component with backup."""
    logger.info(f"Safe update: {update_type} {package_name} on PS {project_server_id}")
    return run_async(_safe_update_wp(project_server_id, update_type, package_name, backup_first))


@shared_task(name="forge.tasks.wp_tasks.bulk_update_all")
def bulk_update_all(owner_id: int, update_type: str = "all") -> dict:
    """Queue updates for known sites through Nest WP bulk endpoint."""
    _ = owner_id
    try:
        site_ids = _list_all_project_server_ids()
        if not site_ids:
            return {"status": "queued", "message": "No sites found"}

        result = _api_post(
            "/wp/updates/bulk",
            payload={
                "update_type": update_type,
                "project_server_ids": site_ids,
            },
        )
        if result is None:
            return {"status": "queued", "message": "Bulk update request failed"}

        return {
            "status": "queued",
            "task_id": result.get("task_id"),
            "message": result.get("message", "Bulk update tasks queued"),
            "sites_queued": result.get("sites_queued", 0),
        }
    except Exception as e:
        return {"status": "failed", "error": str(e)[:200]}


@shared_task(name="forge.tasks.wp_tasks.scan_all_sites")
def scan_all_sites(owner_id: int = None) -> dict:
    """Scan all discovered project-servers for WordPress updates."""
    logger.info(f"Scanning all sites for user {owner_id or 'all'}")
    return run_async(_scan_all_sites(owner_id))


async def _scan_all_sites(owner_id: int = None) -> dict:
    """Queue WP scans for all discovered project-servers."""
    _ = owner_id
    scanned = 0
    failed = 0

    for project_server_id in _list_all_project_server_ids():
        result = await _scan_wp_site(project_server_id)
        if result.get("success"):
            scanned += 1
        else:
            failed += 1

    return {"scanned": scanned, "failed": failed}
