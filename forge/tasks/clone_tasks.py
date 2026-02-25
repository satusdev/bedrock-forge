"""
Site clone tasks for Celery.

DB-decoupled implementation: standard clone is delegated to Nest projects API.
"""
from typing import Optional
import os
import requests

from celery import shared_task

from ..utils.logging import logger


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
        timeout=15,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def _api_post(path: str, payload: Optional[dict] = None):
    response = requests.post(
        f"{_nest_api_base()}{path}",
        json=payload,
        headers=_worker_headers(),
        timeout=20,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


@shared_task
def clone_site(
    source_project_server_id: int,
    target_server_id: int,
    target_domain: str,
    target_environment: str = "staging",
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_uploads: bool = True,
    search_replace: bool = True,
):
    """Clone a WordPress site between environments via Nest projects endpoint."""
    logger.info(
        f"Starting clone: ProjectServer {source_project_server_id} → {target_domain} ({target_environment})"
    )

    try:
        source_link = _api_get(f"/projects/project-servers/{source_project_server_id}")
        if not source_link:
            return {"success": False, "error": "Source project-server not found"}

        project_id = source_link.get("project_id")
        if project_id is None:
            return {"success": False, "error": "Source project mapping missing"}

        payload = {
            "source_env_id": source_project_server_id,
            "target_server_id": target_server_id,
            "target_domain": target_domain,
            "target_environment": target_environment,
            "create_cyberpanel_site": create_cyberpanel_site,
            "include_database": include_database,
            "include_uploads": include_uploads,
            "search_replace": search_replace,
        }

        result = _api_post(f"/projects/{int(project_id)}/clone", payload=payload)
        if not isinstance(result, dict):
            return {"success": False, "error": "Clone request failed"}

        success = bool(result.get("success", True))
        if success:
            logger.info(f"Clone completed successfully: {target_domain}")
        else:
            logger.error(f"Clone failed: {result.get('error')}")

        return {
            "success": success,
            "target_domain": target_domain,
            "result": result,
            "error": result.get("error") if not success else None,
        }
    except Exception as e:
        logger.error(f"Clone failed: {e}")
        return {"success": False, "error": str(e)}


@shared_task
def clone_site_from_drive(
    project_id: int,
    user_id: int,
    target_server_id: int,
    target_domain: str,
    environment: str,
    backup_timestamp: str,
    source_url: Optional[str] = None,
    target_url: Optional[str] = None,
    create_cyberpanel_site: bool = True,
    include_database: bool = True,
    include_files: bool = True,
    set_shell_user: Optional[str] = None,
    run_composer_install: bool = True,
    run_composer_update: bool = False,
    run_wp_plugin_update: bool = False,
    dry_run: bool = False,
    task_id: Optional[str] = None,
):
    """Clone a site from Drive backup via Nest projects clone/drive endpoint."""
    _ = user_id
    logger.info(
        f"Starting drive clone for project {project_id} → {target_domain} ({environment})"
    )

    try:
        payload = {
            "target_server_id": target_server_id,
            "target_domain": target_domain,
            "environment": environment,
            "backup_timestamp": backup_timestamp,
            "source_url": source_url,
            "target_url": target_url,
            "create_cyberpanel_site": create_cyberpanel_site,
            "include_database": include_database,
            "include_files": include_files,
            "set_shell_user": set_shell_user,
            "run_composer_install": run_composer_install,
            "run_composer_update": run_composer_update,
            "run_wp_plugin_update": run_wp_plugin_update,
            "dry_run": dry_run,
            "task_id": task_id,
        }

        result = _api_post(f"/projects/{project_id}/clone/drive", payload=payload)
        if not isinstance(result, dict):
            return {"success": False, "error": "Drive clone request failed"}

        accepted = result.get("status") in {"accepted", "queued"}
        return {
            "success": accepted,
            "project_id": project_id,
            "task_id": result.get("task_id"),
            "status": result.get("status", "accepted"),
            "message": result.get("message", "Drive clone task queued"),
            "result": result,
            "error": None if accepted else result.get("error", "Drive clone rejected"),
        }
    except Exception as e:
        logger.error(f"Drive clone failed: {e}")
        return {"success": False, "project_id": project_id, "error": str(e)}
