
"""
Debug script for BackupService.
"""
import asyncio
import logging
import sys
from pathlib import Path

# Add app to path
sys.path.append("/app")

from forge.db import AsyncSessionLocal
from forge.services.backup.backup_service import BackupService, BackupConfig
from forge.services.backup.scheduler_service import BackupSchedulerService
from forge.core.backup_types import BackupType
from forge.services.backup.backup_service import normalize_storage_backend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("forge")

async def main():
    logger.info("Starting debug backup run for Schedule 2")
    async with AsyncSessionLocal() as db:
        scheduler = BackupSchedulerService(db)
        
        # Load schedule
        # Note: scheduler.get_schedule DOES load environment/project
        schedule = await scheduler.get_schedule(2, include_project=True)
        if not schedule:
            logger.error("Schedule 2 not found!")
            return

        logger.info(f"Loaded Schedule: {schedule.name} ({schedule.id})")
        logger.info(f"Type: {schedule.backup_type} (Type: {type(schedule.backup_type)})")
        
        # Create config (Refactored)
        from forge.services.backup.config_factory import BackupConfigFactory
        logger.info(f"Building BackupConfig (via Factory) for Schedule {schedule.id}")
        config = BackupConfigFactory.create_from_schedule(schedule)
        
        logger.info(f"Config: {config}")
        
        service = BackupService(db)
        
        # Override log to print to stdout
        async def log_cb(msg):
            print(f"[Backup] {msg}")
            
        result = await service.create_backup(
            project_path=Path(schedule.project.local_path or "/tmp"),
            schedule=schedule,
            config=config,
            log_callback=log_cb
        )
        
        print("\n--- Result ---")
        print(f"Success: {result.success}")
        print(f"Status: {result.status}")
        print(f"Error: {result.error}")
        print(f"Backup Files: {result.storage_results}")

if __name__ == "__main__":
    asyncio.run(main())
