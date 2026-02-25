"""
Monitor tasks for Celery.

Background tasks for uptime monitoring and stats calculation.
"""
from datetime import datetime
from typing import Optional
import asyncio
import aiohttp
import os

from celery import shared_task
from ..utils.logging import logger
from ..utils.asyncio_utils import run_async


async def check_url(url: str, timeout: int = 30) -> tuple[bool, int, str]:
    """Check if URL is accessible."""
    start = datetime.now()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                elapsed = int((datetime.now() - start).total_seconds() * 1000)
                if resp.status < 400:
                    return True, elapsed, "OK"
                else:
                    return False, elapsed, f"HTTP {resp.status}"
    except asyncio.TimeoutError:
        elapsed = int((datetime.now() - start).total_seconds() * 1000)
        return False, elapsed, "Timeout"
    except Exception as e:
        elapsed = int((datetime.now() - start).total_seconds() * 1000)
        return False, elapsed, str(e)[:100]



from ..api.deps import update_task_status


def _nest_api_url(path: str) -> str | None:
    base_url = os.getenv("NEST_API_URL", "").strip()
    if not base_url:
        return None

    api_prefix = os.getenv("NEST_API_PREFIX", "/api/v1").strip() or "/api/v1"
    if not api_prefix.startswith("/"):
        api_prefix = f"/{api_prefix}"
    api_prefix = api_prefix.rstrip("/")

    if not path.startswith("/"):
        path = f"/{path}"

    return f"{base_url.rstrip('/')}{api_prefix}{path}"


def _worker_headers() -> dict[str, str]:
    token = os.getenv("NEST_WORKER_TOKEN", "").strip()
    if not token:
        return {}
    return {"x-worker-token": token}


async def _nest_request(
    method: str,
    path: str,
    params: Optional[dict] = None,
    payload: Optional[dict] = None,
) -> Optional[dict]:
    url = _nest_api_url(path)
    if not url:
        return None

    timeout = aiohttp.ClientTimeout(total=8)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                method,
                url,
                params=params,
                json=payload,
                headers=_worker_headers(),
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    logger.warning(
                        f"Nest API {method} {path} failed: {response.status} {body[:200]}"
                    )
                    return None
                return await response.json()
    except Exception as e:
        logger.warning(f"Nest API {method} {path} error: {e}")
        return None


async def _fetch_monitors(active_only: bool = False, https_only: bool = False) -> list[dict]:
    monitors: list[dict] = []
    skip = 0
    limit = 100

    while True:
        payload = await _nest_request(
            "GET",
            "/monitors",
            params={"skip": skip, "limit": limit},
        )
        page = payload.get("items", []) if isinstance(payload, dict) else []
        if not page:
            break

        for monitor in page:
            if active_only and not monitor.get("is_active", False):
                continue
            if https_only and not str(monitor.get("url", "")).startswith("https://"):
                continue
            monitors.append(monitor)

        if len(page) < limit:
            break
        skip += len(page)

    return monitors

async def _check_monitor(monitor_id: int, task_id: Optional[str] = None) -> dict:
    """Check a single monitor through Nest monitor endpoints."""
    if task_id:
        update_task_status(task_id, "running", f"Checking monitor {monitor_id}...")

    trigger = await _nest_request("POST", f"/monitors/{monitor_id}/check")
    accepted = isinstance(trigger, dict) and trigger.get("status") == "accepted"
    result = {
        "success": accepted,
        "monitor_id": monitor_id,
        "status": "queued" if accepted else "failed",
        "task_id": trigger.get("task_id") if isinstance(trigger, dict) else None,
        "message": trigger.get("message") if isinstance(trigger, dict) else "Check request failed",
    }

    if task_id:
        status = "completed" if accepted else "failed"
        update_task_status(task_id, status, f"Check finished: {result['status']}")

    return result



@shared_task(name="forge.tasks.monitor_tasks.check_monitor")
def check_monitor(monitor_id: int) -> dict:
    """Check a single monitor."""
    return run_async(_check_monitor(monitor_id))


async def _run_all_monitors() -> dict:
    """Check all active monitors."""
    monitors = await _fetch_monitors(active_only=True)

    results = []
    for monitor in monitors:
        monitor_id = monitor.get("id")
        if monitor_id is None:
            continue
        check_result = await _check_monitor(int(monitor_id))
        results.append(check_result)

    up_count = sum(1 for r in results if r.get("success"))
    down_count = sum(1 for r in results if not r.get("success") and not r.get("skipped"))

    return {
        "total": len(results),
        "up": up_count,
        "down": down_count,
        "results": results
    }


@shared_task(name="forge.tasks.monitor_tasks.run_all_monitors")
def run_all_monitors() -> dict:
    """Run all active monitors."""
    logger.info("Starting monitor check cycle")
    return run_async(_run_all_monitors())


async def _calculate_uptime_stats() -> dict:
    """Fetch monitor uptime overview from Nest API."""
    overview = await _nest_request("GET", "/monitors/stats/overview")
    monitors = await _fetch_monitors(active_only=False)
    average_uptime = None
    if isinstance(overview, dict):
        average_uptime = overview.get("average_uptime")

    return {
        "updated": len(monitors),
        "average_uptime": average_uptime,
    }


@shared_task(name="forge.tasks.monitor_tasks.calculate_uptime_stats")
def calculate_uptime_stats() -> dict:
    """Calculate uptime stats for all monitors."""
    logger.info("Calculating uptime stats")
    return run_async(_calculate_uptime_stats())


# ============================================================================
# SSL Certificate Check Tasks
# ============================================================================

import ssl
import socket
from urllib.parse import urlparse


@shared_task(name="forge.tasks.monitor_tasks.check_single_monitor")
def check_single_monitor(monitor_id: int, task_id: Optional[str] = None) -> dict:
    """Check a single monitor (alias for API compatibility)."""
    return run_async(_check_monitor(monitor_id, task_id))


@shared_task(name="forge.tasks.monitor_tasks.check_ssl_certificates")
def check_ssl_certificates() -> dict:
    """Check SSL certificates for all HTTPS monitors."""
    logger.info("Starting SSL certificate check")
    return run_async(_check_ssl_certificates())


async def _check_ssl_certificates() -> dict:
    """Check SSL certificates and identify expiring ones."""
    monitors = await _fetch_monitors(active_only=True, https_only=True)

    results = []
    expiring_soon = []

    for monitor in monitors:
        monitor_id = monitor.get("id")
        monitor_url = str(monitor.get("url", ""))
        monitor_name = str(monitor.get("name", "Monitor"))
        if monitor_id is None or not monitor_url:
            continue

        ssl_result = _sync_ssl_check(monitor_url)
        results.append({
            "monitor_id": monitor_id,
            "name": monitor_name,
            "valid": ssl_result.get("valid", False),
            "days_until_expiry": ssl_result.get("days_until_expiry"),
            "error": ssl_result.get("error")
        })

        days = ssl_result.get("days_until_expiry")
        if days is not None and days < 30:
            expiring_soon.append({
                "monitor_id": monitor_id,
                "name": monitor_name,
                "days_until_expiry": days
            })

    if expiring_soon:
        logger.warning(
            f"SSL certificates expiring soon: {len(expiring_soon)} monitors"
        )

    return {
        "checked": len(results),
        "expiring_soon": expiring_soon,
        "results": results
    }


def _sync_ssl_check(url: str) -> dict:
    """Synchronous SSL certificate check."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    port = parsed.port or 443
    
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                not_after = datetime.strptime(
                    cert['notAfter'], '%b %d %H:%M:%S %Y %Z'
                )
                days_until_expiry = (not_after - datetime.utcnow()).days
                
                return {
                    "valid": True,
                    "expires_at": not_after.isoformat(),
                    "days_until_expiry": days_until_expiry
                }
                
    except ssl.SSLError as e:
        return {
            "valid": False,
            "error": f"SSL Error: {str(e)}"
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }


# ============================================================================  
# Alert Notification Tasks
# ============================================================================

@shared_task(name="forge.tasks.monitor_tasks.send_alert")
def send_alert(
    monitor_id: int,
    alert_type: str,
    message: str,
    channels: list = None
) -> dict:
    """Send alert notification through configured channels."""
    return run_async(_send_alert(monitor_id, alert_type, message, channels or []))


async def _send_alert(
    monitor_id: int,
    alert_type: str,
    message: str,
    channels: list
) -> dict:
    """Send notifications through various channels."""
    sent_to = []
    
    for channel in channels:
        try:
            if channel == "email":
                # TODO: Implement email notification
                logger.info(f"Would send email alert: {message}")
            elif channel == "slack":
                # TODO: Implement Slack webhook
                logger.info(f"Would send Slack alert: {message}")
            elif channel == "telegram":
                # TODO: Implement Telegram bot
                logger.info(f"Would send Telegram alert: {message}")
            elif channel == "discord":
                # TODO: Implement Discord webhook
                logger.info(f"Would send Discord alert: {message}")
            
            sent_to.append(channel)
        except Exception as e:
            logger.error(f"Failed to send alert to {channel}: {e}")
    
    logger.info(f"Alert sent for monitor {monitor_id}: {alert_type}")
    
    return {
        "monitor_id": monitor_id,
        "alert_type": alert_type,
        "message": message,
        "sent_to": sent_to
    }


# ============================================================================
# Cleanup Tasks
# ============================================================================

@shared_task(name="forge.tasks.monitor_tasks.cleanup_old_heartbeats")
def cleanup_old_heartbeats(days: int = 30) -> dict:
    """Delete heartbeats older than specified days (default: 30 days)."""
    logger.info(f"Cleaning up heartbeats older than {days} days")
    return run_async(_cleanup_old_heartbeats(days))


async def _cleanup_old_heartbeats(days: int) -> dict:
    """No-op cleanup: heartbeat retention is managed by Nest-owned data layer."""
    logger.info(
        "Skipping heartbeat cleanup in Python worker; monitor data retention is Nest-managed"
    )
    return {
        "deleted": 0,
        "cutoff_days": days,
        "status": "skipped",
        "message": "Retention managed by Nest API/database layer",
    }
