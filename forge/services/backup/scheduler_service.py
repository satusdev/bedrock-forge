"""
Backup scheduler service.

Manages backup schedules and integrates with Celery Beat for
automated backup execution.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from croniter import croniter
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forge.db.models.backup_schedule import (
    BackupSchedule,
    ScheduleFrequency,
    ScheduleStatus,
)
from forge.db.models.backup import BackupType, BackupStorageType
from forge.db.models.project import Project
from forge.core.config import settings


class BackupSchedulerService:
    """
    Service for managing backup schedules.
    
    Handles schedule CRUD operations, next run time calculations,
    and Celery Beat integration for automated backups.
    """
    
    def __init__(self, db: AsyncSession):
        """Initialize the scheduler service."""
        self.db = db
    
    async def create_schedule(
        self,
        project_id: int,
        created_by_id: int,
        name: str,
        frequency: ScheduleFrequency,
        cron_expression: Optional[str] = None,
        backup_type: BackupType = BackupType.FULL,
        storage_type: BackupStorageType = BackupStorageType.LOCAL,
        hour: int = 2,
        minute: int = 0,
        day_of_week: Optional[int] = None,
        day_of_month: Optional[int] = None,
        timezone: str = settings.APP_TIMEZONE,
        retention_count: int = 7,
        retention_days: Optional[int] = None,
        config: Optional[dict] = None,
        enabled: bool = True,
        description: Optional[str] = None,
        environment_id: Optional[int] = None,
    ) -> BackupSchedule:
        """
        Create a new backup schedule.
        
        Args:
            project_id: Project to backup
            created_by_id: User creating the schedule
            name: Schedule name
            frequency: Backup frequency
            cron_expression: Custom cron expression (for custom frequency)
            backup_type: Type of backup (full, database, files, uploads)
            storage_type: Storage backend type
            hour: Hour to run (0-23)
            minute: Minute to run (0-59)
            day_of_week: Day of week (0=Mon, 6=Sun) for weekly
            day_of_month: Day of month (1-31) for monthly
            timezone: Timezone for scheduling
            retention_count: Number of backups to keep
            retention_days: Days to keep backups (alternative)
            config: Additional configuration
            enabled: Whether schedule is active
            description: Optional description
            environment_id: Optional environment ID to link schedule for
            
        Returns:
            Created BackupSchedule instance
        """
        # Validate project exists
        project = await self.db.get(Project, project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        # Create schedule
        schedule = BackupSchedule(
            project_id=project_id,
            environment_id=environment_id,
            created_by_id=created_by_id,
            name=name,
            description=description,
            frequency=frequency,
            cron_expression=cron_expression,
            backup_type=backup_type,
            storage_type=storage_type,
            hour=hour,
            minute=minute,
            day_of_week=day_of_week,
            day_of_month=day_of_month,
            timezone=timezone,
            retention_count=retention_count,
            retention_days=retention_days,
            config=config or {},
            status=ScheduleStatus.ACTIVE if enabled else ScheduleStatus.PAUSED,
        )

        
        # Calculate next run time
        schedule.next_run_at = self._calculate_next_run(schedule)
        
        self.db.add(schedule)
        await self.db.commit()
        await self.db.refresh(schedule)
        
        return schedule
    
    async def update_schedule(
        self,
        schedule_id: int,
        **updates,
    ) -> Optional[BackupSchedule]:
        """
        Update an existing backup schedule.
        
        Args:
            schedule_id: Schedule to update
            **updates: Fields to update
            
        Returns:
            Updated BackupSchedule or None if not found
        """
        schedule = await self.db.get(BackupSchedule, schedule_id)
        if not schedule:
            return None
        
        # Apply updates
        for key, value in updates.items():
            if hasattr(schedule, key) and value is not None:
                setattr(schedule, key, value)
        
        # Recalculate next run if scheduling fields changed
        scheduling_fields = {
            "frequency",
            "cron_expression",
            "hour",
            "minute",
            "day_of_week",
            "day_of_month",
            "timezone",
        }
        if scheduling_fields.intersection(updates.keys()):
            schedule.next_run_at = self._calculate_next_run(schedule)
        
        schedule.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(schedule)
        
        return schedule
    
    async def delete_schedule(self, schedule_id: int) -> bool:
        """
        Delete a backup schedule.
        
        Args:
            schedule_id: Schedule to delete
            
        Returns:
            True if deleted, False if not found
        """
        schedule = await self.db.get(BackupSchedule, schedule_id)
        if not schedule:
            return False
        
        await self.db.delete(schedule)
        await self.db.commit()
        return True
    
    async def get_schedule(
        self,
        schedule_id: int,
        include_project: bool = True,
    ) -> Optional[BackupSchedule]:
        """
        Get a backup schedule by ID.
        
        Args:
            schedule_id: Schedule ID
            include_project: Whether to load project relationship
            
        Returns:
            BackupSchedule or None if not found
        """
        stmt = select(BackupSchedule).where(BackupSchedule.id == schedule_id)
        
        if include_project:
            from forge.db.models.project_server import ProjectServer
            stmt = stmt.options(
                selectinload(BackupSchedule.project),
                selectinload(BackupSchedule.environment).selectinload(ProjectServer.server),
                selectinload(BackupSchedule.environment).selectinload(ProjectServer.project)
            )
        
        result = await self.db.execute(stmt)

        return result.scalar_one_or_none()
    
    async def list_schedules(
        self,
        project_id: Optional[int] = None,
        user_id: Optional[int] = None,
        status: Optional[ScheduleStatus] = None,
        include_project: bool = True,
        limit: int = 50,
        offset: int = 0,
    ) -> list[BackupSchedule]:
        """
        List backup schedules with optional filters.
        
        Args:
            project_id: Filter by project
            user_id: Filter by creator
            status: Filter by status
            include_project: Whether to load project relationship
            limit: Maximum results
            offset: Results offset
            
        Returns:
            List of BackupSchedule instances
        """
        stmt = select(BackupSchedule)
        
        # Apply filters
        conditions = []
        if project_id:
            conditions.append(BackupSchedule.project_id == project_id)
        if user_id:
            conditions.append(BackupSchedule.created_by_id == user_id)
        if status:
            conditions.append(BackupSchedule.status == status)
        
        if conditions:
            stmt = stmt.where(and_(*conditions))
        
        if include_project:
            stmt = stmt.options(
                selectinload(BackupSchedule.project),
                selectinload(BackupSchedule.environment)
            )
        
        stmt = stmt.order_by(BackupSchedule.created_at.desc())
        stmt = stmt.limit(limit).offset(offset)
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    async def get_due_schedules(
        self,
        buffer_minutes: int = 5,
    ) -> list[BackupSchedule]:
        """
        Get schedules that are due to run.
        
        Args:
            buffer_minutes: Minutes buffer for due time
            
        Returns:
            List of schedules due for execution
        """
        now = datetime.now(timezone.utc)
        buffer = timedelta(minutes=buffer_minutes)
        
        stmt = select(BackupSchedule).where(
            and_(
                BackupSchedule.status == ScheduleStatus.ACTIVE,
                or_(
                    BackupSchedule.next_run_at.is_(None),
                    BackupSchedule.next_run_at <= now + buffer,
                ),
            )
        ).options(
            selectinload(BackupSchedule.project),
            selectinload(BackupSchedule.environment)
        )
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    async def pause_schedule(self, schedule_id: int) -> Optional[BackupSchedule]:
        """Pause a backup schedule."""
        return await self.update_schedule(
            schedule_id,
            status=ScheduleStatus.PAUSED,
        )
    
    async def resume_schedule(self, schedule_id: int) -> Optional[BackupSchedule]:
        """Resume a paused backup schedule."""
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return None
        
        schedule.status = ScheduleStatus.ACTIVE
        schedule.next_run_at = self._calculate_next_run(schedule)
        schedule.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(schedule)
        
        return schedule
    
    async def record_run(
        self,
        schedule_id: int,
        success: bool,
        error_message: Optional[str] = None,
    ) -> Optional[BackupSchedule]:
        """
        Record a backup run for a schedule.
        
        Updates last_run, run_count, and calculates next_run.
        
        Args:
            schedule_id: Schedule that was executed
            success: Whether the run succeeded
            error_message: Error message if failed
            
        Returns:
            Updated BackupSchedule
        """
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return None
        
        now = datetime.now(timezone.utc)
        
        schedule.last_run_at = now
        schedule.run_count += 1
        schedule.next_run_at = self._calculate_next_run(schedule)
        
        if success:
            schedule.last_run_success = True
            schedule.failure_count = 0
        else:
            schedule.last_run_success = False
            schedule.last_run_error = error_message
            schedule.failure_count += 1
            
            # Auto-pause after too many failures
            if schedule.failure_count >= 5:
                schedule.status = ScheduleStatus.DISABLED
        
        schedule.updated_at = now
        
        await self.db.commit()
        await self.db.refresh(schedule)
        
        return schedule
    
    def _calculate_next_run(
        self,
        schedule: BackupSchedule,
        from_time: Optional[datetime] = None,
    ) -> datetime:
        """
        Calculate the next run time for a schedule.
        
        Args:
            schedule: Schedule to calculate for
            from_time: Base time (defaults to now)
            
        Returns:
            Next scheduled run time
        """
        tz_name = schedule.timezone or settings.APP_TIMEZONE
        try:
            schedule_tz = ZoneInfo(tz_name)
        except Exception:
            schedule_tz = timezone.utc

        if from_time is None:
            base_time = datetime.now(schedule_tz)
        else:
            base_time = from_time
            if base_time.tzinfo is None:
                base_time = base_time.replace(tzinfo=timezone.utc)
            base_time = base_time.astimezone(schedule_tz)
        
        # Get cron expression - use method from model
        cron_expr = schedule.cron_expression or schedule.get_cron_schedule()
        
        # Use croniter to calculate next run
        cron = croniter(cron_expr, base_time)
        next_local = cron.get_next(datetime)
        if next_local.tzinfo is None:
            next_local = next_local.replace(tzinfo=schedule_tz)
        return next_local.astimezone(timezone.utc)
    
    async def get_schedule_stats(
        self,
        project_id: Optional[int] = None,
        user_id: Optional[int] = None,
    ) -> dict:
        """
        Get statistics about backup schedules.
        
        Returns:
            Dict with schedule statistics
        """
        stmt = select(BackupSchedule)
        
        conditions = []
        if project_id:
            conditions.append(BackupSchedule.project_id == project_id)
        if user_id:
            conditions.append(BackupSchedule.created_by_id == user_id)
        
        if conditions:
            stmt = stmt.where(and_(*conditions))
        
        result = await self.db.execute(stmt)
        schedules = list(result.scalars().all())
        
        total = len(schedules)
        active = sum(1 for s in schedules if s.status == ScheduleStatus.ACTIVE)
        paused = sum(1 for s in schedules if s.status == ScheduleStatus.PAUSED)
        disabled = sum(1 for s in schedules if s.status == ScheduleStatus.DISABLED)
        
        total_runs = sum(s.run_count for s in schedules)
        total_failures = sum(s.failure_count for s in schedules)
        
        return {
            "total": total,
            "active": active,
            "paused": paused,
            "disabled": disabled,
            "total_runs": total_runs,
            "total_failures": total_failures,
            "pending_runs": sum(
                1 for s in schedules
                if s.next_run_at and s.next_run_at <= datetime.now(timezone.utc) + timedelta(hours=1)
            ),
        }
    
    async def trigger_immediate_backup(
        self,
        schedule_id: int,
    ) -> BackupSchedule:
        """
        Trigger an immediate backup for a schedule.
        
        Sets next_run_at to now so the Celery worker picks it up.
        
        Args:
            schedule_id: Schedule to trigger
            
        Returns:
            Updated BackupSchedule
        """
        schedule = await self.get_schedule(schedule_id, include_project=True)
        if not schedule:
            raise ValueError(f"Schedule {schedule_id} not found")
        
        # Set next_run_at to now
        schedule.next_run_at = datetime.now(timezone.utc)
        
        # Ensure it's active
        if schedule.status == ScheduleStatus.PAUSED:
            schedule.status = ScheduleStatus.ACTIVE
        
        schedule.updated_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(schedule)
        
        return schedule
