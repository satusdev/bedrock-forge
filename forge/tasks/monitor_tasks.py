"""
Monitor tasks for Celery.

Background tasks for uptime monitoring and stats calculation.
"""
from datetime import datetime, timedelta
from typing import Optional
import asyncio
import aiohttp

from celery import shared_task
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AsyncSessionLocal, Monitor
from ..db.models.monitor import MonitorStatus
from ..db.models.heartbeat import Heartbeat, HeartbeatStatus
from ..db.models.incident import Incident, IncidentStatus
from ..utils.logging import logger


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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



from ..db.models.notification_channel import NotificationChannel
from ..services.notification_service import notification_service
import json

async def _send_notifications(monitor: Monitor, alert_type: str, message: str):
    """Send notifications to configured channels."""
    if not monitor.notification_channels:
        return
        
    try:
        channel_ids = json.loads(monitor.notification_channels)
        if not isinstance(channel_ids, list):
            logger.warning(f"Invalid notification_channels format for monitor {monitor.id}")
            return
            
        async with AsyncSessionLocal() as db:
            # Fetch channels
            result = await db.execute(
                select(NotificationChannel)
                .where(NotificationChannel.id.in_(channel_ids))
                .where(NotificationChannel.is_active == True)
            )
            channels = result.scalars().all()
            
            level = "error" if alert_type == "DOWN" else "success"
            title = f"Monitor Alert: {monitor.name}"
            
            for channel in channels:
                await notification_service.send(
                    channel=channel,
                    title=title,
                    message=message,
                    level=level
                )
                
    except Exception as e:
        logger.error(f"Failed to send notifications for monitor {monitor.id}: {e}")

async def _check_monitor(monitor_id: int) -> dict:
    """Check a single monitor, record heartbeat, and manage incidents."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Monitor).where(Monitor.id == monitor_id)
        )
        monitor = result.scalar_one_or_none()
        
        if not monitor or not monitor.is_active:
            return {"skipped": True}
        
        # Perform check
        success, response_time, message = await check_url(
            monitor.url, 
            monitor.timeout_seconds
        )
        
        previous_status = monitor.last_status
        new_status = HeartbeatStatus.UP if success else HeartbeatStatus.DOWN
        
        # Record heartbeat
        heartbeat = Heartbeat(
            monitor_id=monitor_id,
            status=new_status,
            response_time_ms=response_time,
            message=message,
            checked_at=datetime.utcnow()
        )
        db.add(heartbeat)
        
        # Update monitor
        monitor.last_check_at = datetime.utcnow()
        monitor.last_status = MonitorStatus.UP if success else MonitorStatus.DOWN
        monitor.last_response_time_ms = response_time
        monitor.consecutive_failures = 0 if success else (monitor.consecutive_failures or 0) + 1
        
        incident_created = False
        incident_resolved = False
        
        # Incident management
        if not success and monitor.consecutive_failures >= monitor.max_retries:
            # Check if there's already an ongoing incident
            existing = await db.execute(
                select(Incident)
                .where(Incident.monitor_id == monitor_id)
                .where(Incident.status == IncidentStatus.ONGOING)
            )
            if not existing.scalar_one_or_none():
                # Create new incident
                incident = Incident(
                    monitor_id=monitor_id,
                    title=f"{monitor.name} is DOWN",
                    status=IncidentStatus.ONGOING,
                    started_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(incident)
                incident_created = True
                logger.warning(f"Incident created for {monitor.name}")
                
                # Send DOWN notification
                if monitor.alert_on_down:
                    await _send_notifications(monitor, "DOWN", f"{monitor.name} is DOWN. Error: {message}")
        
        elif success and previous_status == MonitorStatus.DOWN:
            # Resolve any ongoing incidents
            result = await db.execute(
                select(Incident)
                .where(Incident.monitor_id == monitor_id)
                .where(Incident.status == IncidentStatus.ONGOING)
            )
            for incident in result.scalars().all():
                incident.resolve()
                incident_resolved = True
                logger.info(f"Incident resolved for {monitor.name}")
                
            if incident_resolved and monitor.alert_on_down:
                 # Send UP notification
                 await _send_notifications(monitor, "UP", f"{monitor.name} is UP. Response time: {response_time}ms")
        
        await db.commit()
        
        logger.info(f"Monitor {monitor.name}: {'UP' if success else 'DOWN'} ({response_time}ms)")
        
        return {
            "monitor_id": monitor_id,
            "name": monitor.name,
            "success": success,
            "response_time_ms": response_time,
            "message": message,
            "incident_created": incident_created,
            "incident_resolved": incident_resolved
        }



@shared_task(name="forge.tasks.monitor_tasks.check_monitor")
def check_monitor(monitor_id: int) -> dict:
    """Check a single monitor."""
    return run_async(_check_monitor(monitor_id))


async def _run_all_monitors() -> dict:
    """Check all active monitors."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Monitor).where(Monitor.is_active == True)
        )
        monitors = result.scalars().all()
        
        results = []
        for monitor in monitors:
            check_result = await _check_monitor(monitor.id)
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
    """Calculate uptime percentages for all monitors based on heartbeat history."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Monitor))
        monitors = result.scalars().all()
        
        # Calculate uptime based on last 30 days of heartbeats
        cutoff = datetime.utcnow() - timedelta(days=30)
        
        updated = 0
        for monitor in monitors:
            # Get heartbeat stats for this monitor
            total_result = await db.execute(
                select(func.count(Heartbeat.id))
                .where(Heartbeat.monitor_id == monitor.id)
                .where(Heartbeat.checked_at >= cutoff)
            )
            total_heartbeats = total_result.scalar() or 0
            
            if total_heartbeats == 0:
                # No data, use 100% as default
                uptime = 100.0
            else:
                # Count successful heartbeats (UP status)
                up_result = await db.execute(
                    select(func.count(Heartbeat.id))
                    .where(Heartbeat.monitor_id == monitor.id)
                    .where(Heartbeat.checked_at >= cutoff)
                    .where(Heartbeat.status == HeartbeatStatus.UP)
                )
                up_heartbeats = up_result.scalar() or 0
                
                uptime = round((up_heartbeats / total_heartbeats) * 100, 2)
            
            monitor.uptime_percentage = uptime
            updated += 1
        
        await db.commit()
        
        return {"updated": updated}


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
def check_single_monitor(monitor_id: int) -> dict:
    """Check a single monitor (alias for API compatibility)."""
    return check_monitor(monitor_id)


@shared_task(name="forge.tasks.monitor_tasks.check_ssl_certificates")
def check_ssl_certificates() -> dict:
    """Check SSL certificates for all HTTPS monitors."""
    logger.info("Starting SSL certificate check")
    return run_async(_check_ssl_certificates())


async def _check_ssl_certificates() -> dict:
    """Check SSL certificates and identify expiring ones."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Monitor)
            .where(Monitor.is_active == True)
            .where(Monitor.url.like("https://%"))
        )
        monitors = result.scalars().all()
        
        results = []
        expiring_soon = []
        
        for monitor in monitors:
            ssl_result = _sync_ssl_check(monitor.url)
            results.append({
                "monitor_id": monitor.id,
                "name": monitor.name,
                "valid": ssl_result.get("valid", False),
                "days_until_expiry": ssl_result.get("days_until_expiry"),
                "error": ssl_result.get("error")
            })
            
            # Flag certificates expiring within 30 days
            days = ssl_result.get("days_until_expiry")
            if days is not None and days < 30:
                expiring_soon.append({
                    "monitor_id": monitor.id,
                    "name": monitor.name,
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
    """Delete old heartbeat records to manage database size."""
    from sqlalchemy import delete
    from ..db.models.heartbeat import Heartbeat
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(Heartbeat).where(Heartbeat.checked_at < cutoff)
        )
        await db.commit()
        
        deleted = result.rowcount
        logger.info(f"Deleted {deleted} old heartbeats")
        
        return {"deleted": deleted, "cutoff_days": days}
