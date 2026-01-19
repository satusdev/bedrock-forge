"""
Celery Beat Database Scheduler.

Loads backup schedules from the database and syncs them with Celery Beat.
This enables dynamic schedule management via the dashboard/API.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from celery import Celery
from celery.beat import Scheduler, ScheduleEntry
from celery.schedules import crontab
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import selectinload

from ..db.models.backup_schedule import BackupSchedule, ScheduleStatus, ScheduleFrequency


logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper to run async code in sync Celery context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Create new loop if current one is running
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop exists, create one
        return asyncio.run(coro)


def schedule_to_crontab(schedule: BackupSchedule) -> crontab:
    """
    Convert BackupSchedule model to Celery crontab.
    
    Args:
        schedule: BackupSchedule instance
        
    Returns:
        Celery crontab schedule object
    """
    if schedule.frequency == ScheduleFrequency.CUSTOM and schedule.cron_expression:
        # Parse custom cron expression
        parts = schedule.cron_expression.split()
        if len(parts) >= 5:
            return crontab(
                minute=parts[0],
                hour=parts[1],
                day_of_month=parts[2],
                month_of_year=parts[3],
                day_of_week=parts[4],
            )
    
    # Build crontab from individual fields
    minute = str(schedule.minute)
    hour = str(schedule.hour)
    
    if schedule.frequency == ScheduleFrequency.HOURLY:
        return crontab(minute=minute)
    
    elif schedule.frequency == ScheduleFrequency.DAILY:
        return crontab(minute=minute, hour=hour)
    
    elif schedule.frequency == ScheduleFrequency.WEEKLY:
        dow = str(schedule.day_of_week) if schedule.day_of_week is not None else "0"
        return crontab(minute=minute, hour=hour, day_of_week=dow)
    
    elif schedule.frequency == ScheduleFrequency.MONTHLY:
        dom = str(schedule.day_of_month) if schedule.day_of_month is not None else "1"
        return crontab(minute=minute, hour=hour, day_of_month=dom)
    
    # Default: daily at configured time
    return crontab(minute=minute, hour=hour)


class DatabaseScheduler(Scheduler):
    """
    Celery Beat scheduler that loads schedules from the database.
    
    This scheduler:
    - Loads active BackupSchedule records from the database
    - Converts them to Celery schedule entries
    - Periodically syncs to pick up changes (add/remove/update schedules)
    - Persists schedule state to handle restarts
    
    Usage in celery config:
        celery_app.conf.beat_scheduler = 'forge.api.celery_schedule_loader:DatabaseScheduler'
    """
    
    # How often to sync with database (seconds)
    sync_every = 60
    
    # Task name for scheduled backups
    backup_task = "forge.tasks.scheduled_backup_tasks.execute_single_backup"
    
    def __init__(self, *args, **kwargs):
        """Initialize the database scheduler."""
        self._db_schedules: Dict[str, Dict[str, Any]] = {}
        self._last_sync: Optional[datetime] = None
        self._engine = None
        self._session_factory = None
        
        # Initialize parent
        super().__init__(*args, **kwargs)
        
        # Do initial sync
        self._sync_schedules()
    
    def _get_session_factory(self) -> async_sessionmaker:
        """Get or create async session factory."""
        if self._session_factory is None:
            import os
            database_url = os.getenv(
                "DATABASE_URL",
                "sqlite+aiosqlite:///./forge.db"
            )
            
            if database_url.startswith("postgresql://"):
                database_url = database_url.replace(
                    "postgresql://", "postgresql+asyncpg://", 1
                )
            
            self._engine = create_async_engine(database_url, pool_pre_ping=True)
            self._session_factory = async_sessionmaker(
                self._engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
        
        return self._session_factory
    
    async def _load_schedules_from_db(self) -> list[BackupSchedule]:
        """Load active backup schedules from database."""
        session_factory = self._get_session_factory()
        
        async with session_factory() as session:
            stmt = select(BackupSchedule).where(
                BackupSchedule.status == ScheduleStatus.ACTIVE
            ).options(selectinload(BackupSchedule.project))
            
            result = await session.execute(stmt)
            return list(result.scalars().all())
    
    def _sync_schedules(self):
        """Sync schedules from database to Celery Beat."""
        try:
            schedules = run_async(self._load_schedules_from_db())
            
            # Build new schedule dict
            new_schedules = {}
            
            for schedule in schedules:
                schedule_name = f"backup-schedule-{schedule.id}"
                
                try:
                    celery_schedule = schedule_to_crontab(schedule)
                    
                    new_schedules[schedule_name] = {
                        "task": self.backup_task,
                        "schedule": celery_schedule,
                        "args": (schedule.id,),  # Pass schedule ID to task
                        "kwargs": {"force": False},
                        "options": {
                            "queue": "backups",
                            "expires": 3600,  # Task expires after 1 hour
                        },
                        "enabled": True,
                    }
                    
                    logger.debug(
                        f"Loaded schedule {schedule_name}: "
                        f"{schedule.name} ({schedule.frequency.value})"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Failed to convert schedule {schedule.id}: {e}"
                    )
            
            # Update internal schedule dict
            self._db_schedules = new_schedules
            self._last_sync = datetime.utcnow()
            
            logger.info(f"Synced {len(new_schedules)} backup schedules from database")
            
        except Exception as e:
            logger.exception(f"Failed to sync schedules from database: {e}")
    
    def setup_schedule(self):
        """Set up the schedule - called on startup."""
        # Sync from database
        self._sync_schedules()
        
        # Add static schedules (monitoring tasks, etc.)
        self.merge_inplace(self.app.conf.beat_schedule or {})
        
        # Add database schedules
        self.merge_inplace(self._db_schedules)
    
    def tick(self):
        """
        Called every iteration of the scheduler loop.
        
        We use this to periodically refresh schedules from the database.
        """
        # Check if we should sync
        now = datetime.utcnow()
        if (
            self._last_sync is None or
            (now - self._last_sync).total_seconds() >= self.sync_every
        ):
            self._sync_schedules()
            
            # Update the schedule with new entries
            self.merge_inplace(self._db_schedules)
        
        # Call parent tick
        return super().tick()
    
    def reserve(self, entry: ScheduleEntry) -> ScheduleEntry:
        """
        Reserve a schedule entry for execution.
        
        We override this to update next_run_at in the database.
        """
        new_entry = super().reserve(entry)
        
        # Update database if this is a backup schedule
        if entry.name.startswith("backup-schedule-"):
            try:
                schedule_id = int(entry.name.split("-")[-1])
                run_async(self._update_next_run(schedule_id, new_entry.last_run_at))
            except Exception as e:
                logger.error(f"Failed to update next_run for {entry.name}: {e}")
        
        return new_entry
    
    async def _update_next_run(self, schedule_id: int, last_run: datetime):
        """Update the next_run_at field in the database."""
        from croniter import croniter
        
        session_factory = self._get_session_factory()
        
        async with session_factory() as session:
            schedule = await session.get(BackupSchedule, schedule_id)
            if schedule:
                # Calculate next run
                cron_expr = schedule.cron_expression or schedule.get_cron_schedule()
                cron = croniter(cron_expr, last_run or datetime.utcnow())
                
                schedule.next_run_at = cron.get_next(datetime)
                schedule.updated_at = datetime.utcnow()
                
                await session.commit()
    
    @property
    def info(self):
        """Return scheduler info for monitoring."""
        return (
            f"DatabaseScheduler: {len(self._db_schedules)} schedules, "
            f"last sync: {self._last_sync}"
        )


class ScheduleSyncService:
    """
    Service to manually sync schedules to Celery Beat.
    
    This is useful for immediately syncing after creating/updating
    a schedule via the API, rather than waiting for the next sync interval.
    """
    
    def __init__(self, celery_app: Celery):
        """Initialize with Celery app."""
        self.app = celery_app
    
    def trigger_sync(self):
        """
        Trigger an immediate schedule sync.
        
        This sends a control command to the Beat scheduler.
        """
        try:
            # Send control command to Beat
            self.app.control.broadcast(
                "scheduler_sync",
                arguments={},
                destination=None,  # All workers
            )
            logger.info("Triggered schedule sync broadcast")
        except Exception as e:
            logger.error(f"Failed to trigger sync: {e}")
    
    def add_schedule_entry(
        self,
        schedule_id: int,
        schedule: BackupSchedule,
    ):
        """
        Add a schedule entry directly to Beat's schedule.
        
        This is a faster alternative to full sync for single additions.
        """
        schedule_name = f"backup-schedule-{schedule_id}"
        
        try:
            celery_schedule = schedule_to_crontab(schedule)
            
            entry = {
                "task": "forge.tasks.scheduled_backup_tasks.execute_single_backup",
                "schedule": celery_schedule,
                "args": (schedule_id,),
                "kwargs": {"force": False},
                "options": {"queue": "backups"},
            }
            
            # Add to app's beat_schedule
            self.app.conf.beat_schedule[schedule_name] = entry
            
            logger.info(f"Added schedule entry: {schedule_name}")
            
        except Exception as e:
            logger.error(f"Failed to add schedule entry: {e}")
    
    def remove_schedule_entry(self, schedule_id: int):
        """Remove a schedule entry from Beat's schedule."""
        schedule_name = f"backup-schedule-{schedule_id}"
        
        if schedule_name in self.app.conf.beat_schedule:
            del self.app.conf.beat_schedule[schedule_name]
            logger.info(f"Removed schedule entry: {schedule_name}")
