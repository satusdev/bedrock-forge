"""
Scheduled backup tasks for Celery Beat integration.

DB-decoupled implementation: schedule and backup orchestration is delegated to Nest APIs.
"""
from typing import Optional
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


def _api_get(path: str, params: Optional[dict] = None):
    response = requests.get(
        f"{_nest_api_base()}{path}",
        params=params,
        headers=_worker_headers(),
        timeout=12,
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
        timeout=12,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


@shared_task(
    name="forge.tasks.scheduled_backup_tasks.process_due_schedules",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_due_schedules(self):
    """Process due schedules by queueing run-now through Nest schedules API."""
    _ = self
    return run_async(_process_due_schedules())


async def _process_due_schedules() -> dict:
    """Fetch active schedules and queue run-now operations through Nest."""
    results = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "schedules": [],
    }

    try:
        page = 1
        page_size = 100
        schedules: list[dict] = []

        while True:
            payload = _api_get(
                "/schedules",
                params={"status": "active", "page": page, "page_size": page_size},
            )
            batch = payload if isinstance(payload, list) else []
            if not batch:
                break
            schedules.extend(batch)
            if len(batch) < page_size:
                break
            page += 1

        for schedule in schedules:
            schedule_id = schedule.get("id")
            if schedule_id is None:
                continue

            results["processed"] += 1
            try:
                run_payload = _api_post(f"/schedules/{int(schedule_id)}/run")
                accepted = isinstance(run_payload, dict) and run_payload.get("status") == "accepted"
                if accepted:
                    results["success"] += 1
                else:
                    results["failed"] += 1

                results["schedules"].append(
                    {
                        "schedule_id": str(schedule_id),
                        "success": accepted,
                        "error": None if accepted else "Run request rejected",
                        "task_id": run_payload.get("task_id") if isinstance(run_payload, dict) else None,
                    }
                )
            except Exception as e:
                results["failed"] += 1
                results["schedules"].append(
                    {
                        "schedule_id": str(schedule_id),
                        "success": False,
                        "error": str(e),
                    }
                )

        return results
    except Exception as e:
        logger.error(f"Failed processing due schedules: {e}")
        return {"processed": 0, "success": 0, "failed": 1, "schedules": [], "error": str(e)}


@shared_task(
    name="forge.tasks.scheduled_backup_tasks.execute_single_backup",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def execute_single_backup(
    self,
    schedule_id: int,
    force: bool = False,
):
    """Execute a backup by queueing immediate run for a schedule."""
    _ = self
    logger.info(f"Executing backup for schedule {schedule_id} (force={force})")
    return run_async(_execute_single_backup(schedule_id, force))


async def _execute_single_backup(schedule_id: int, force: bool = False) -> dict:
    """Queue a run-now operation for the given schedule."""
    _ = force
    try:
        run_payload = _api_post(f"/schedules/{schedule_id}/run")
        if not isinstance(run_payload, dict):
            return {"success": False, "error": "Schedule not found or run failed"}

        accepted = run_payload.get("status") == "accepted"
        return {
            "success": accepted,
            "message": run_payload.get("message", "Backup queued"),
            "schedule_id": schedule_id,
            "task_id": run_payload.get("task_id"),
            "backup_id": None,
            "error": None if accepted else "Run request rejected",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@shared_task(name="forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups")
def cleanup_orphaned_backups(storage_type: str = "local"):
    """No-op in DB-decoupled mode: retention/orphan cleanup is Nest-owned."""
    return run_async(_cleanup_orphaned_backups(storage_type))


async def _cleanup_orphaned_backups(storage_type: str) -> dict:
    """No-op cleanup task for compatibility."""
    logger.info(
        "Skipping orphaned backup cleanup in Python worker; retention is Nest-managed"
    )
    return {
        "deleted_count": 0,
        "deleted_size_bytes": 0,
        "kept_count": 0,
        "errors": [],
        "storage_type": storage_type,
        "status": "skipped",
        "message": "Retention managed by Nest API/database layer",
    }


@shared_task(name="forge.tasks.scheduled_backup_tasks.apply_retention_all")
def apply_retention_all():
    """No-op in DB-decoupled mode: retention policies are Nest-owned."""
    return run_async(_apply_retention_all())


async def _apply_retention_all() -> dict:
    """No-op retention task for compatibility."""
    logger.info(
        "Skipping retention policy application in Python worker; retention is Nest-managed"
    )
    return {
        "processed": 0,
        "deleted_total": 0,
        "freed_bytes": 0,
        "errors": [],
        "status": "skipped",
        "message": "Retention managed by Nest API/database layer",
    }


CELERY_BEAT_SCHEDULE = {
    "process-backup-schedules": {
        "task": "forge.tasks.scheduled_backup_tasks.process_due_schedules",
        "schedule": 60.0,
    },
    "cleanup-orphaned-backups": {
        "task": "forge.tasks.scheduled_backup_tasks.cleanup_orphaned_backups",
        "schedule": 86400.0,
        "args": ("local",),
    },
    "apply-retention-policies": {
        "task": "forge.tasks.scheduled_backup_tasks.apply_retention_all",
        "schedule": 3600.0,
    },
}
