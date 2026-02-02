"""
Monitor Service for uptime and health tracking.
"""
import asyncio
import logging
import aiohttp
import json
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models.monitor import Monitor, MonitorType, MonitorStatus
from ..db.models.heartbeat import Heartbeat

logger = logging.getLogger(__name__)


class MonitorService:
    """Service for managing monitors and performing health checks."""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_monitor(
        self,
        name: str,
        url: str,
        user_id: int,
        project_id: Optional[int] = None,
        monitor_type: MonitorType = MonitorType.UPTIME,
        interval_seconds: int = 300
    ) -> Monitor:
        """Create a new monitor."""
        monitor = Monitor(
            name=name,
            url=url,
            monitor_type=monitor_type,
            interval_seconds=interval_seconds,
            project_id=project_id,
            created_by_id=user_id,
            is_active=True,
            last_status=None
        )
        self.session.add(monitor)
        await self.session.commit()
        await self.session.refresh(monitor)
        return monitor

    async def get_monitor(self, monitor_id: int) -> Optional[Monitor]:
        """Get monitor by ID."""
        result = await self.session.execute(
            select(Monitor).where(Monitor.id == monitor_id)
        )
        return result.scalar_one_or_none()
    
    async def get_due_monitors(self) -> List[Monitor]:
        """Get list of monitors due for a check."""
        # Simple Logic: where last_check_at + interval < now
        # Note: In a real scalable system, this would be more complex or distributed
        # For now, we fetch all active monitors and check strictly in python or relying on celery beat to just iterate all
        # To make it efficient for now assuming moderate count: fetch all active
        result = await self.session.execute(
            select(Monitor).where(Monitor.is_active == True)
        )
        monitors = result.scalars().all()
        
        due_monitors = []
        now = datetime.now(timezone.utc)
        
        for monitor in monitors:
            if not monitor.last_check_at:
                due_monitors.append(monitor)
                continue
                
            elapsed = (now - monitor.last_check_at).total_seconds()
            if elapsed >= monitor.interval_seconds:
                due_monitors.append(monitor)
                
        return due_monitors

    async def check_monitor(self, monitor_id: int) -> dict:
        """
        Perform a single check for a monitor.
        Handles status updates, heartbeats, incidents, and notifications.
        """
        # Import here to avoid circular dependencies if any, though services usually fine
        from ..db.models.heartbeat import Heartbeat, HeartbeatStatus
        from ..db.models.incident import Incident, IncidentStatus
        from ..services.notification_service import notification_service
        from ..db.models.notification_channel import NotificationChannel
        
        monitor = await self.get_monitor(monitor_id)
        if not monitor or not monitor.is_active:
             return {"skipped": True}

        start = datetime.now()
        success = False
        response_time = 0
        message = ""
        
        # 1. Perform Check
        try:
            if monitor.monitor_type == MonitorType.UPTIME:
                async with aiohttp.ClientSession() as session:
                    async with session.get(monitor.url, timeout=monitor.timeout_seconds) as resp:
                        elapsed = int((datetime.now() - start).total_seconds() * 1000)
                        response_time = elapsed
                        if 200 <= resp.status < 400:
                            success = True
                            message = "OK"
                        else:
                            success = False
                            message = f"HTTP {resp.status}"
            # Add other types here (TCP, PING, etc.) in future
        except asyncio.TimeoutError:
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            message = "Timeout"
        except Exception as e:
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            message = str(e)[:100]
            
        # 2. Update Monitor State
        previous_status = monitor.last_status
        now = datetime.now(timezone.utc)
        
        monitor.last_check_at = now
        monitor.last_status = MonitorStatus.UP if success else MonitorStatus.DOWN
        monitor.last_response_time_ms = response_time
        monitor.last_error_message = message if not success else None
        monitor.consecutive_failures = 0 if success else (monitor.consecutive_failures + 1)
        
        # 3. Record Heartbeat
        heartbeat = Heartbeat(
            monitor_id=monitor.id,
            status=HeartbeatStatus.UP if success else HeartbeatStatus.DOWN,
            response_time_ms=response_time,
            message=message,
            checked_at=now
        )
        self.session.add(heartbeat)
        
        # 4. Incident Management & Notifications
        incident_created = False
        incident_resolved = False
        
        # Create Incident if threshold reached
        if not success and monitor.consecutive_failures >= monitor.max_retries:
            # Check for existing open incident
            result = await self.session.execute(
                select(Incident)
                .where(Incident.monitor_id == monitor.id)
                .where(Incident.status == IncidentStatus.ONGOING)
            )
            existing = result.scalar_one_or_none()
            
            if not existing:
                incident = Incident(
                    monitor_id=monitor.id,
                    title=f"{monitor.name} is DOWN",
                    status=IncidentStatus.ONGOING,
                    started_at=now,
                    created_at=now,
                    updated_at=now
                )
                self.session.add(incident)
                incident_created = True
                
                # Send Down Notification
                if monitor.alert_on_down and monitor.notification_channels:
                    await self._send_notification(monitor, "DOWN", f"{monitor.name} is DOWN. Error: {message}")

        # Resolve Incident if back UP
        elif success and previous_status == MonitorStatus.DOWN:
            result = await self.session.execute(
                select(Incident)
                .where(Incident.monitor_id == monitor.id)
                .where(Incident.status == IncidentStatus.ONGOING)
            )
            existing_incidents = result.scalars().all()
            
            for incident in existing_incidents:
                incident.status = IncidentStatus.RESOLVED
                incident.resolved_at = now
                incident.updated_at = now
                incident_resolved = True
            
            if incident_resolved and monitor.alert_on_down and monitor.notification_channels:
                 await self._send_notification(monitor, "UP", f"{monitor.name} is UP. Response time: {response_time}ms")

        await self.session.commit()
        return {
            "monitor_id": monitor.id,
            "success": success,
            "response_time": response_time,
            "incident_created": incident_created,
            "incident_resolved": incident_resolved
        }

    async def _send_notification(self, monitor: Monitor, alert_type: str, message: str):
        """Helper to send notifications."""
        from ..services.notification_service import notification_service
        from ..db.models.notification_channel import NotificationChannel
        
        try:
            channel_ids = json.loads(monitor.notification_channels)
            if not channel_ids: return
            
            result = await self.session.execute(
                select(NotificationChannel).where(NotificationChannel.id.in_(channel_ids))
            )
            channels = result.scalars().all()
            
            for channel in channels:
                await notification_service.send(
                    channel=channel,
                    title=f"Monitor Alert: {monitor.name} is {alert_type}",
                    message=message,
                    level="error" if alert_type == "DOWN" else "success"
                )
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
