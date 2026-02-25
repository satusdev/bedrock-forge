"""
Expiry check tasks for domains and SSL certificates.

Runs daily to check for expiring items and send notifications.
"""
from celery import shared_task
from datetime import date, timedelta
from typing import List, Dict, Any
import os

import httpx
import requests

from ..utils.logging import logger
from ..utils.asyncio_utils import run_async
from ..utils.redis_client import get_redis_client


def _nest_api_base() -> str:
    base_url = (os.getenv("NEST_API_URL") or "http://localhost:8100").rstrip("/")
    api_prefix = (os.getenv("NEST_API_PREFIX") or "/api/v1").strip()
    if not api_prefix.startswith("/"):
        api_prefix = f"/{api_prefix}"
    api_prefix = api_prefix.rstrip("/")
    return f"{base_url}{api_prefix}"


def _redis_key(kind: str, item_id: int) -> str:
    return f"expiry-reminder:{kind}:{item_id}"


def _should_send_reminder(kind: str, item_id: int, cooldown_days: int) -> bool:
    try:
        redis = get_redis_client()
        key = _redis_key(kind, item_id)
        if redis.get(key):
            return False

        redis.setex(key, cooldown_days * 24 * 60 * 60, "1")
        return True
    except Exception as e:
        logger.warning(f"Reminder throttle unavailable ({kind}:{item_id}): {e}")
        return True


def _list_all_domains(status: str = "active") -> List[Dict[str, Any]]:
    base = _nest_api_base()
    limit = 100
    offset = 0
    total = None
    rows: List[Dict[str, Any]] = []

    while total is None or offset < total:
        response = requests.get(
            f"{base}/domains",
            params={"status": status, "limit": limit, "offset": offset},
            timeout=5,
        )
        response.raise_for_status()
        payload = response.json()
        batch = payload.get("domains", [])
        rows.extend(batch)
        total = int(payload.get("total", len(rows)))
        offset += limit
        if not batch:
            break

    return rows


def _list_all_ssl(is_active: bool = True) -> List[Dict[str, Any]]:
    base = _nest_api_base()
    limit = 100
    offset = 0
    total = None
    rows: List[Dict[str, Any]] = []

    while total is None or offset < total:
        response = requests.get(
            f"{base}/ssl",
            params={
                "is_active": str(is_active).lower(),
                "limit": limit,
                "offset": offset,
            },
            timeout=5,
        )
        response.raise_for_status()
        payload = response.json()
        batch = payload.get("certificates", [])
        rows.extend(batch)
        total = int(payload.get("total", len(rows)))
        offset += limit
        if not batch:
            break

    return rows


def _days_left(iso_date: str) -> int:
    expiry = date.fromisoformat(iso_date)
    return (expiry - date.today()).days


@shared_task(name="check_expiring_domains_ssl")
def check_expiring_domains_ssl():
    """
    Check for domains and SSL certificates expiring soon.
    Sends notifications for items within their reminder_days threshold.
    
    This task should be scheduled to run daily via Celery Beat.
    """
    from ..services.notification_service import NotificationService
    
    logger.info("Starting expiry check for domains and SSL certificates")
    
    notifications_sent = 0
    errors = []
    
    try:
        domains = _list_all_domains(status="active")
        for domain in domains:
            try:
                domain_id = int(domain.get("id"))
                domain_name = str(domain.get("domain_name", ""))
                expiry_date = str(domain.get("expiry_date", ""))
                if not domain_name or not expiry_date:
                    continue

                days_left = int(domain.get("days_until_expiry", _days_left(expiry_date)))
                if days_left < 0 or days_left > 60:
                    continue

                should_notify = _should_send_reminder(
                    "domain", domain_id, cooldown_days=7
                )
                if not should_notify:
                    continue

                NotificationService.send_expiry_alert(
                    item_type="domain",
                    item_name=domain_name,
                    expiry_date=expiry_date,
                    days_left=days_left,
                )
                notifications_sent += 1
                logger.info(f"Sent expiry alert for domain: {domain_name}")
            except Exception as e:
                errors.append(f"Domain {domain.get('domain_name', 'unknown')}: {str(e)}")

        certificates = _list_all_ssl(is_active=True)
        for cert in certificates:
            try:
                cert_id = int(cert.get("id"))
                common_name = str(cert.get("common_name", ""))
                expiry_date = str(cert.get("expiry_date", ""))
                if not common_name or not expiry_date:
                    continue

                days_left = int(cert.get("days_until_expiry", _days_left(expiry_date)))
                if days_left < 0 or days_left > 14:
                    continue

                should_notify = _should_send_reminder("ssl", cert_id, cooldown_days=3)
                if not should_notify:
                    continue

                NotificationService.send_expiry_alert(
                    item_type="ssl",
                    item_name=common_name,
                    expiry_date=expiry_date,
                    days_left=days_left,
                )
                notifications_sent += 1
                logger.info(f"Sent expiry alert for SSL: {common_name}")
            except Exception as e:
                errors.append(f"SSL {cert.get('common_name', 'unknown')}: {str(e)}")

    except Exception as e:
        logger.error(f"Error in expiry check task: {e}")
        errors.append(str(e))
    
    logger.info(f"Expiry check complete. Notifications sent: {notifications_sent}, Errors: {len(errors)}")
    
    return {
        "notifications_sent": notifications_sent,
        "errors": errors
    }


@shared_task(name="get_expiry_summary")
def get_expiry_summary(days: int = 30) -> Dict[str, Any]:
    """
    Get a summary of items expiring within the specified days.
    Useful for dashboard widgets.
    """

    result = {
        "domains": [],
        "ssl_certificates": [],
        "total_expiring": 0
    }

    try:
        base = _nest_api_base()
        domains_resp = requests.get(
            f"{base}/domains/expiring",
            params={"days": max(1, int(days))},
            timeout=5,
        )
        domains_resp.raise_for_status()
        domains_payload = domains_resp.json()

        ssl_resp = requests.get(
            f"{base}/ssl/expiring",
            params={"days": max(1, int(days))},
            timeout=5,
        )
        ssl_resp.raise_for_status()
        ssl_payload = ssl_resp.json()

        for d in domains_payload.get("domains", []):
            result["domains"].append({
                "id": d.get("id"),
                "name": d.get("domain_name"),
                "expiry_date": d.get("expiry_date"),
                "days_left": d.get("days_until_expiry"),
                "auto_renew": d.get("auto_renew"),
            })

        for s in ssl_payload.get("certificates", []):
            result["ssl_certificates"].append({
                "id": s.get("id"),
                "common_name": s.get("common_name"),
                "expiry_date": s.get("expiry_date"),
                "days_left": s.get("days_until_expiry"),
                "auto_renew": s.get("auto_renew"),
            })

        result["total_expiring"] = len(result["domains"]) + len(result["ssl_certificates"])

    except Exception as e:
        logger.error(f"Error getting expiry summary: {e}")
    
    return result


# ============================================================================
# WHOIS Sync Tasks
# ============================================================================

@shared_task(name="forge.tasks.expiry_tasks.sync_domain_whois")
def sync_domain_whois():
    """
    Sync WHOIS data for all active domains.
    Updates expiry dates, registrars, and nameservers.
    """
    logger.info("Starting automatic domain WHOIS sync")
    return run_async(_sync_domain_whois())


async def _sync_domain_whois():
    """Async worker for domain sync."""
    base = _nest_api_base()

    try:
        list_response = requests.get(
            f"{base}/domains",
            params={"status": "active", "limit": 100, "offset": 0},
            timeout=5,
        )
        list_response.raise_for_status()
        first_page = list_response.json()
        domains = first_page.get("domains", [])
        total = int(first_page.get("total", len(domains)))

        offset = 100
        while offset < total:
            response = requests.get(
                f"{base}/domains",
                params={"status": "active", "limit": 100, "offset": offset},
                timeout=5,
            )
            response.raise_for_status()
            payload = response.json()
            domains.extend(payload.get("domains", []))
            offset += 100
    except Exception as e:
        logger.error(f"Failed to list domains for WHOIS sync: {e}")
        return {"synced": 0, "failed": 0, "error": str(e)}

    synced = 0
    failed = 0

    async with httpx.AsyncClient(timeout=8.0) as client:
        for domain in domains:
            domain_id = domain.get("id")
            domain_name = domain.get("domain_name", "unknown")
            try:
                if not domain_id:
                    failed += 1
                    continue

                response = await client.post(f"{base}/domains/{domain_id}/whois/refresh")
                response.raise_for_status()
                synced += 1
            except Exception as e:
                logger.error(f"Failed to sync domain {domain_name}: {e}")
                failed += 1

    return {"synced": synced, "failed": failed}
