
import asyncio
import json
import logging
import sys
import os
from datetime import datetime

# Add app to path
sys.path.append(os.getcwd())

from forge.db import AsyncSessionLocal
from forge.db.models.notification_channel import NotificationChannel, ChannelType
from forge.db.models.monitor import Monitor, MonitorType
from forge.db.models.user import User
from forge.tasks.monitor_tasks import _check_monitor
from forge.utils.logging import logger

# Configure logging
logging.basicConfig(level=logging.INFO)

async def verify():
    async with AsyncSessionLocal() as db:
        # 1. Create dummy user if needed
        from sqlalchemy import select
        result = await db.execute(select(User).limit(1))
        user = result.scalars().first()
        if not user:
            print("Creating test user...")
            from forge.api.security import hash_password
            user = User(
                username="testuser",
                email="test@example.com",
                hashed_password="dummy_hash_for_test",
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # 2. Create Notification Channel
        channel = NotificationChannel(
            name="Test Webhook",
            channel_type=ChannelType.WEBHOOK.value,
            config=json.dumps({
                "url": "https://httpbin.org/post", 
                "method": "POST"
            }),
            is_active=True,
            owner_id=user.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(channel)
        await db.commit()
        await db.refresh(channel)
        print(f"Created NotificationChannel: {channel.id}")

        # 3. Create Monitor
        monitor = Monitor(
            name="Test Monitor (Expect Failure)",
            monitor_type=MonitorType.UPTIME,
            url="http://non-existent-domain-12345.com", # Should fail
            interval_seconds=60,
            timeout_seconds=5,
            is_active=True,
            created_by_id=user.id,
            notification_channels=json.dumps([channel.id]),
            max_retries=1, # Trigger immediately after 1 failure (or 0?)
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(monitor)
        await db.commit()
        await db.refresh(monitor)
        print(f"Created Monitor: {monitor.id}")

        # 4. Run Check (Trigger Incident)
        print("Running monitor check...")
        # Force consecutive failures to exceed max_retries immediately?
        # The logic is: if not success and consecutive_failures >= max_retries
        # First run: consecutive_failures becomes 1?
        # let's set monitor.consecutive_failures = max_retries - 1
        monitor.consecutive_failures = monitor.max_retries 
        await db.commit()
        
        result = await _check_monitor(monitor.id)
        
        print("Check Result:", json.dumps(result, default=str, indent=2))
        
        if result.get('incident_created'):
            print("✅ SUCCESS: Incident created.")
        else:
            print("❌ FAILURE: Incident NOT created.")

        # 5. Cleanup
        await db.delete(monitor)
        await db.delete(channel)
        await db.commit()
        print("Cleanup done.")

if __name__ == "__main__":
    asyncio.run(verify())
