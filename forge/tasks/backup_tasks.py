"""
Backup tasks for Celery.

DB-decoupled implementation: backup orchestration is delegated to Nest APIs.
"""
from typing import Optional
import os

from celery import shared_task
import requests

from ..api.deps import update_task_status
from ..utils.asyncio_utils import run_async
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
        timeout=20,
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


def _safe_update_task_status(task_id: Optional[str], status: str, message: str) -> None:
    if not task_id:
        return
    try:
        update_task_status(task_id, status, message)
    except Exception as e:
        logger.warning(f"Task status update failed for {task_id}: {e}")


def _derive_backup_type(backup_db: bool, backup_uploads: bool, fallback: str = "full") -> str:
    if backup_db and backup_uploads:
        return "full"
    if backup_db:
        return "database"
    if backup_uploads:
        return "files"
    return fallback


@shared_task(name="forge.tasks.backup_tasks.create_project_backup")
def create_project_backup(
    project_id: int,
    backup_db: bool = True,
    backup_uploads: bool = True,
    sync_gdrive: bool = False,
) -> dict:
    """Create a backup by queueing a Nest backup request."""
    return run_async(_create_project_backup(project_id, backup_db, backup_uploads, sync_gdrive))


async def _create_project_backup(
    project_id: int,
    backup_db: bool,
    backup_uploads: bool,
    sync_gdrive: bool,
) -> dict:
    backup_type = _derive_backup_type(backup_db, backup_uploads)

    try:
        payload = {
            "project_id": project_id,
            "backup_type": backup_type,
            "storage_type": "google_drive" if sync_gdrive else "local",
            "notes": "Queued by Python worker compatibility task",
        }
        created = _api_post("/backups", payload)
        if not isinstance(created, dict):
            return {"success": False, "error": "Backup API unavailable"}

        return {
            "success": True,
            "project_id": project_id,
            "backup_id": created.get("backup_id"),
            "task_id": created.get("task_id"),
            "status": created.get("status", "pending"),
            "message": created.get("message", "Backup queued"),
        }
    except Exception as e:
        logger.error(f"Failed to queue backup for project {project_id}: {e}")
        return {"success": False, "error": str(e)}


async def _run_scheduled_backups() -> dict:
    """Run scheduled backups using Nest schedule APIs."""
    results = []
    page = 1
    page_size = 100

    try:
        while True:
            schedules = _api_get(
                "/schedules",
                params={"status": "active", "page": page, "page_size": page_size},
            )
            batch = schedules if isinstance(schedules, list) else []
            if not batch:
                break

            for schedule in batch:
                schedule_id = schedule.get("id")
                if schedule_id is None:
                    continue

                try:
                    queued = _api_post(f"/schedules/{int(schedule_id)}/run")
                    accepted = isinstance(queued, dict) and queued.get("status") == "accepted"
                    results.append(
                        {
                            "schedule_id": schedule_id,
                            "success": accepted,
                            "task_id": queued.get("task_id") if isinstance(queued, dict) else None,
                            "error": None if accepted else "Run request rejected",
                        }
                    )
                except Exception as e:
                    results.append(
                        {
                            "schedule_id": schedule_id,
                            "success": False,
                            "error": str(e),
                        }
                    )

            if len(batch) < page_size:
                break
            page += 1

        success_count = sum(1 for item in results if item.get("success"))
        return {
            "total": len(results),
            "success": success_count,
            "failed": len(results) - success_count,
            "results": results,
        }
    except Exception as e:
        logger.error(f"Failed running scheduled backups: {e}")
        return {"total": 0, "success": 0, "failed": 1, "results": [], "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.run_scheduled_backups")
def run_scheduled_backups() -> dict:
    """Run scheduled backups for all enabled schedules."""
    logger.info("Starting scheduled backup cycle")
    return run_async(_run_scheduled_backups())


@shared_task(name="forge.tasks.backup_tasks.cleanup_old_backups")
def cleanup_old_backups(retention_days: int = 7) -> dict:
    """No-op in DB-decoupled mode: retention cleanup is Nest-owned."""
    return run_async(_cleanup_old_backups(retention_days))


async def _cleanup_old_backups(retention_days: int) -> dict:
    logger.info(
        "Skipping old backup cleanup in Python worker; retention is managed by Nest"
    )
    return {
        "deleted": 0,
        "status": "skipped",
        "retention_days": retention_days,
        "message": "Retention managed by Nest API/database layer",
    }


@shared_task(name="forge.tasks.backup_tasks.create_project_backup_task")
def create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str = "full",
    task_id: Optional[str] = None,
) -> dict:
    """Legacy compatibility task for project backup execution."""
    return run_async(_create_project_backup_task(project_id, backup_id, backup_type, task_id))


async def _create_project_backup_task(
    project_id: int,
    backup_id: int,
    backup_type: str,
    task_id: Optional[str] = None,
) -> dict:
    _safe_update_task_status(task_id, "running", "Queueing backup execution")

    try:
        backup = _api_get(f"/backups/{backup_id}")
        if not isinstance(backup, dict):
            _safe_update_task_status(task_id, "failed", "Backup record not found")
            return {"success": False, "error": "Backup record not found"}

        queued = _api_post(
            f"/backups/{backup_id}/run",
            {
                "project_id": project_id,
                "backup_type": backup_type,
                "task_id": task_id,
            },
        )
        if not isinstance(queued, dict):
            _safe_update_task_status(task_id, "failed", "Backup run API unavailable")
            return {"success": False, "error": "Backup run API unavailable"}

        accepted = queued.get("status") == "accepted"
        _safe_update_task_status(
            task_id,
            "completed" if accepted else "failed",
            "Backup execution queued" if accepted else "Backup execution rejected",
        )

        return {
            "success": accepted,
            "backup_id": backup_id,
            "project_id": project_id,
            "backup_type": backup_type,
            "status": queued.get("status", "accepted"),
            "task_id": queued.get("task_id"),
            "message": queued.get("message", "Backup execution queued"),
        }
    except Exception as e:
        _safe_update_task_status(task_id, "failed", f"Backup failed: {str(e)}")
        return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.pull_remote_backup_task")
def pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool = True,
    include_uploads: bool = True,
    include_plugins: bool = False,
    include_themes: bool = False,
    task_id: Optional[str] = None,
) -> dict:
    """Pull backup from remote server using Nest backup API."""
    return run_async(
        _pull_remote_backup_task(
            project_server_id,
            backup_id,
            include_database,
            include_uploads,
            include_plugins,
            include_themes,
            task_id,
        )
    )


async def _pull_remote_backup_task(
    project_server_id: int,
    backup_id: int,
    include_database: bool,
    include_uploads: bool,
    include_plugins: bool,
    include_themes: bool,
    task_id: Optional[str] = None,
) -> dict:
    _safe_update_task_status(task_id, "running", "Queueing remote backup pull")

    requested_type = "full"
    if include_database and not any([include_uploads, include_plugins, include_themes]):
        requested_type = "database"
    elif not include_database and any([include_uploads, include_plugins, include_themes]):
        requested_type = "files"

    try:
        payload = {
            "project_server_id": project_server_id,
            "backup_type": requested_type,
            "include_database": include_database,
            "include_uploads": include_uploads,
            "include_plugins": include_plugins,
            "include_themes": include_themes,
        }
        queued = _api_post("/backups/remote/pull", payload)
        if not isinstance(queued, dict):
            _safe_update_task_status(task_id, "failed", "Remote backup API unavailable")
            return {"success": False, "error": "Remote backup API unavailable"}

        _safe_update_task_status(task_id, "completed", "Remote backup pull queued")
        return {
            "success": queued.get("status") == "accepted",
            "backup_id": backup_id,
            "project_server_id": project_server_id,
            "task_id": queued.get("task_id"),
            "project_id": queued.get("project_id"),
            "status": queued.get("status", "accepted"),
            "message": queued.get("message", "Remote backup pull queued"),
        }
    except Exception as e:
        _safe_update_task_status(task_id, "failed", f"Remote backup failed: {str(e)}")
        return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.restore_backup_task")
def restore_backup_task(
    backup_id: int,
    target: str = "local",
) -> dict:
    """Restore from backup through Nest backup restore API."""
    return run_async(_restore_backup_task(backup_id, target))


async def _restore_backup_task(
    backup_id: int,
    target: str,
) -> dict:
    if target != "local":
        try:
            project_server_id = int(target)
        except ValueError:
            return {
                "success": False,
                "backup_id": backup_id,
                "target": target,
                "error": "Invalid target. Expected 'local' or numeric project_server_id",
            }

        try:
            restored = _api_post(
                f"/backups/{backup_id}/restore/remote",
                {
                    "project_server_id": project_server_id,
                    "database": True,
                    "files": True,
                },
            )
            if not isinstance(restored, dict):
                return {"success": False, "error": "Remote restore API unavailable"}

            return {
                "success": restored.get("status") == "accepted",
                "backup_id": backup_id,
                "target": target,
                "task_id": restored.get("task_id"),
                "status": restored.get("status", "pending"),
                "message": restored.get("message", "Remote restore initiated"),
            }
        except Exception as e:
            logger.error(f"Remote restore failed for backup {backup_id}: {e}")
            return {"success": False, "error": str(e)}

    try:
        restored = _api_post(f"/backups/{backup_id}/restore", {"database": True, "files": True})
        if not isinstance(restored, dict):
            return {"success": False, "error": "Restore API unavailable"}

        return {
            "success": True,
            "backup_id": backup_id,
            "target": "local",
            "task_id": restored.get("task_id"),
            "status": restored.get("status", "pending"),
            "message": restored.get("message", "Restore initiated"),
        }
    except Exception as e:
        logger.error(f"Restore failed for backup {backup_id}: {e}")
        return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.create_environment_backup_task")
def create_environment_backup_task(
    project_id: int,
    env_id: int,
    backup_id: int,
    backup_type: str = "database",
    storage_backends: list = None,
    override_gdrive_folder_id: str = None,
    task_id: Optional[str] = None,
) -> dict:
    """Legacy compatibility task for environment backup execution."""
    return run_async(
        _create_environment_backup_task(
            project_id,
            env_id,
            backup_id,
            backup_type,
            storage_backends,
            override_gdrive_folder_id,
            task_id,
        )
    )


async def _create_environment_backup_task(
    project_id: int,
    env_id: int,
    backup_id: int,
    backup_type: str,
    storage_backends: list,
    override_gdrive_folder_id: str = None,
    task_id: Optional[str] = None,
) -> dict:
    _safe_update_task_status(task_id, "running", "Queueing environment backup execution")

    try:
        backup = _api_get(f"/backups/{backup_id}")
        if not isinstance(backup, dict):
            _safe_update_task_status(task_id, "failed", "Backup record not found")
            return {"success": False, "error": "Backup record not found"}

        queued = _api_post(
            f"/backups/{backup_id}/run",
            {
                "project_id": project_id,
                "environment_id": env_id,
                "backup_type": backup_type,
                "storage_backends": storage_backends or ["local"],
                "override_gdrive_folder_id": override_gdrive_folder_id,
                "task_id": task_id,
            },
        )
        if not isinstance(queued, dict):
            _safe_update_task_status(task_id, "failed", "Backup run API unavailable")
            return {"success": False, "error": "Backup run API unavailable"}

        accepted = queued.get("status") == "accepted"
        _safe_update_task_status(
            task_id,
            "completed" if accepted else "failed",
            "Environment backup execution queued"
            if accepted
            else "Environment backup execution rejected",
        )

        return {
            "success": accepted,
            "project_id": project_id,
            "env_id": env_id,
            "backup_id": backup_id,
            "backup_type": backup_type,
            "storage_backends": storage_backends or ["local"],
            "status": queued.get("status", "accepted"),
            "task_id": queued.get("task_id"),
            "message": queued.get("message", "Environment backup execution queued"),
        }
    except Exception as e:
        _safe_update_task_status(task_id, "failed", f"Backup failed: {str(e)}")
        return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.backup_tasks.check_backup_schedules")
def check_backup_schedules() -> dict:
    """Check and run due backup schedules through Nest schedule APIs."""
    return run_async(_check_backup_schedules())


async def _check_backup_schedules() -> dict:
    try:
        run_result = await _run_scheduled_backups()
        return {
            "run": run_result.get("total", 0),
            "results": run_result.get("results", []),
            "success": run_result.get("success", 0),
            "failed": run_result.get("failed", 0),
        }
    except Exception as e:
        logger.error(f"Failed checking backup schedules: {e}")
        return {"run": 0, "results": [], "success": 0, "failed": 1, "error": str(e)}
