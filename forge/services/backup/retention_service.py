"""
Backup retention service.

Manages automatic cleanup of old backups based on retention policies.
"""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forge.db.models.backup_schedule import BackupSchedule


class RetentionStrategy(str, Enum):
    """Retention strategy types."""
    COUNT = "count"  # Keep N most recent backups
    DAYS = "days"    # Keep backups newer than N days
    HYBRID = "hybrid"  # Keep N backups AND backups newer than N days


@dataclass
class RetentionPolicy:
    """
    Retention policy configuration.
    
    Attributes:
        strategy: Retention strategy to use
        local_count: Number of local backups to keep (for COUNT/HYBRID)
        local_days: Days to keep local backups (for DAYS/HYBRID)
        remote_count: Number of remote backups to keep
        remote_days: Days to keep remote backups
        keep_daily: Number of daily backups to keep (GFS)
        keep_weekly: Number of weekly backups to keep (GFS)
        keep_monthly: Number of monthly backups to keep (GFS)
    """
    strategy: RetentionStrategy = RetentionStrategy.HYBRID
    local_count: int = 7
    local_days: int = 7
    remote_count: int = 30
    remote_days: int = 30
    keep_daily: int = 7
    keep_weekly: int = 4
    keep_monthly: int = 3

    @classmethod
    def from_schedule(cls, schedule: BackupSchedule) -> "RetentionPolicy":
        """Create retention policy from schedule settings."""
        return cls(
            strategy=RetentionStrategy.HYBRID,
            local_count=schedule.retention_count,
            local_days=schedule.retention_days or schedule.retention_count,
            remote_count=schedule.retention_count,
            remote_days=schedule.retention_days or schedule.retention_count,
        )


@dataclass
class RetentionResult:
    """Result of retention cleanup operation."""
    deleted_count: int = 0
    deleted_size_bytes: int = 0
    kept_count: int = 0
    errors: list[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


class RetentionService:
    """
    Service for managing backup retention.
    
    Handles automatic cleanup of old backups based on configurable
    retention policies. Supports both local and remote storage.
    """
    
    def __init__(self, db: AsyncSession):
        """Initialize retention service."""
        self.db = db
    
    async def apply_retention(
        self,
        schedule: BackupSchedule,
        storage_type: str = "local",
    ) -> RetentionResult:
        """
        Apply retention policy to backups for a schedule.
        
        Args:
            schedule: Backup schedule with retention settings
            storage_type: Storage type to clean ("local" or "remote")
            
        Returns:
            RetentionResult with cleanup statistics
        """
        from .storage import LocalStorage, GoogleDriveStorage, S3Storage
        
        policy = RetentionPolicy.from_schedule(schedule)
        result = RetentionResult()
        config = schedule.config or {}
        
        # Get appropriate storage backend
        if storage_type == "local":
            storage = LocalStorage()
            max_count = policy.local_count
            max_days = policy.local_days
        elif storage_type == "gdrive":
            storage = GoogleDriveStorage()
            max_count = policy.remote_count
            max_days = policy.remote_days
        elif storage_type == "s3":
            storage = S3Storage(
                bucket=config.get("s3_bucket", ""),
            )
            max_count = policy.remote_count
            max_days = policy.remote_days
        else:
            result.errors.append(f"Unknown storage type: {storage_type}")
            return result
        
        try:
            # List backups for this schedule
            prefix = f"schedules/{schedule.id}"
            files = await storage.list_files(prefix=prefix, max_results=1000)
            
            if not files:
                return result
            
            # Parse backup timestamps from filenames
            backups = []
            for file_path in files:
                timestamp = self._parse_backup_timestamp(file_path)
                if timestamp:
                    backups.append((file_path, timestamp))
            
            # Sort by timestamp (newest first)
            backups.sort(key=lambda x: x[1], reverse=True)
            
            # Apply retention policy
            cutoff_date = datetime.utcnow() - timedelta(days=max_days)
            to_delete = []
            
            for i, (file_path, timestamp) in enumerate(backups):
                should_delete = False
                
                if policy.strategy == RetentionStrategy.COUNT:
                    should_delete = i >= max_count
                elif policy.strategy == RetentionStrategy.DAYS:
                    should_delete = timestamp < cutoff_date
                elif policy.strategy == RetentionStrategy.HYBRID:
                    # Keep if within count OR within days
                    should_delete = (i >= max_count) and (timestamp < cutoff_date)
                
                # GFS strategy - always keep weekly/monthly
                if should_delete and self._should_keep_gfs(timestamp, policy):
                    should_delete = False
                
                if should_delete:
                    to_delete.append(file_path)
                else:
                    result.kept_count += 1
            
            # Delete old backups
            for file_path in to_delete:
                try:
                    size = await storage.get_size(file_path)
                    delete_result = await storage.delete(file_path)
                    
                    if delete_result.success:
                        result.deleted_count += 1
                        result.deleted_size_bytes += size
                    else:
                        result.errors.append(
                            f"Failed to delete {file_path}: {delete_result.error}"
                        )
                except Exception as e:
                    result.errors.append(f"Error deleting {file_path}: {e}")
            
        except Exception as e:
            result.errors.append(f"Retention cleanup failed: {e}")
        
        return result
    
    def _parse_backup_timestamp(self, file_path: str) -> Optional[datetime]:
        """
        Parse backup timestamp from filename.
        
        Expected format: backup_YYYYMMDD_HHMMSS.tar.gz
        """
        import re
        
        # Try to extract timestamp from filename
        patterns = [
            r"(\d{8}_\d{6})",  # YYYYMMDD_HHMMSS
            r"(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})",  # ISO format with dashes
            r"(\d{4}\d{2}\d{2}\d{6})",  # YYYYMMDDHHMMSS
        ]
        
        filename = Path(file_path).stem
        
        for pattern in patterns:
            match = re.search(pattern, filename)
            if match:
                timestamp_str = match.group(1)
                try:
                    if "_" in timestamp_str:
                        return datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                    elif "T" in timestamp_str:
                        return datetime.strptime(timestamp_str, "%Y-%m-%dT%H-%M-%S")
                    else:
                        return datetime.strptime(timestamp_str, "%Y%m%d%H%M%S")
                except ValueError:
                    continue
        
        return None
    
    def _should_keep_gfs(
        self,
        timestamp: datetime,
        policy: RetentionPolicy,
    ) -> bool:
        """
        Check if backup should be kept for GFS (Grandfather-Father-Son) strategy.
        
        Keeps:
        - First backup of each month (monthly)
        - First backup of each week (weekly)
        """
        now = datetime.utcnow()
        
        # Check monthly retention
        if policy.keep_monthly > 0:
            months_ago = (now.year - timestamp.year) * 12 + (now.month - timestamp.month)
            if months_ago < policy.keep_monthly and timestamp.day <= 7:
                # Keep first week of month backups
                return True
        
        # Check weekly retention
        if policy.keep_weekly > 0:
            days_ago = (now - timestamp).days
            weeks_ago = days_ago // 7
            if weeks_ago < policy.keep_weekly and timestamp.weekday() == 0:
                # Keep Monday backups for weekly
                return True
        
        return False
    
    async def get_retention_preview(
        self,
        schedule: BackupSchedule,
        storage_type: str = "local",
    ) -> dict:
        """
        Preview what retention policy would delete.
        
        Returns dict with 'to_keep' and 'to_delete' lists.
        """
        from .storage import LocalStorage, GoogleDriveStorage, S3Storage
        
        policy = RetentionPolicy.from_schedule(schedule)
        
        # Get appropriate storage
        if storage_type == "local":
            storage = LocalStorage()
            max_count = policy.local_count
            max_days = policy.local_days
        elif storage_type == "gdrive":
            storage = GoogleDriveStorage()
            max_count = policy.remote_count
            max_days = policy.remote_days
        else:
            return {"to_keep": [], "to_delete": [], "error": "Unknown storage type"}
        
        try:
            prefix = f"schedules/{schedule.id}"
            files = await storage.list_files(prefix=prefix, max_results=1000)
            
            backups = []
            for file_path in files:
                timestamp = self._parse_backup_timestamp(file_path)
                backups.append({
                    "path": file_path,
                    "timestamp": timestamp.isoformat() if timestamp else None,
                })
            
            # Sort by timestamp
            backups.sort(
                key=lambda x: x["timestamp"] or "",
                reverse=True,
            )
            
            cutoff_date = datetime.utcnow() - timedelta(days=max_days)
            cutoff_str = cutoff_date.isoformat()
            
            to_keep = []
            to_delete = []
            
            for i, backup in enumerate(backups):
                if policy.strategy == RetentionStrategy.HYBRID:
                    is_within_count = i < max_count
                    is_within_days = (
                        backup["timestamp"] and backup["timestamp"] >= cutoff_str
                    )
                    if is_within_count or is_within_days:
                        to_keep.append(backup)
                    else:
                        to_delete.append(backup)
                elif policy.strategy == RetentionStrategy.COUNT:
                    if i < max_count:
                        to_keep.append(backup)
                    else:
                        to_delete.append(backup)
                else:  # DAYS
                    if backup["timestamp"] and backup["timestamp"] >= cutoff_str:
                        to_keep.append(backup)
                    else:
                        to_delete.append(backup)
            
            return {
                "to_keep": to_keep,
                "to_delete": to_delete,
                "policy": {
                    "strategy": policy.strategy.value,
                    "max_count": max_count,
                    "max_days": max_days,
                },
            }
            
        except Exception as e:
            return {"to_keep": [], "to_delete": [], "error": str(e)}
    
    async def cleanup_orphaned_backups(
        self,
        storage_type: str = "local",
    ) -> RetentionResult:
        """
        Clean up backups for deleted schedules.
        
        Finds backup files that don't belong to any active schedule
        and deletes them.
        """
        from .storage import LocalStorage, GoogleDriveStorage
        
        result = RetentionResult()
        
        # Get all active schedule IDs
        stmt = select(BackupSchedule.id)
        db_result = await self.db.execute(stmt)
        active_ids = {str(row[0]) for row in db_result.fetchall()}
        
        # Get storage
        if storage_type == "local":
            storage = LocalStorage()
        elif storage_type == "gdrive":
            storage = GoogleDriveStorage()
        else:
            result.errors.append(f"Unknown storage type: {storage_type}")
            return result
        
        try:
            # List all backup folders
            files = await storage.list_files(prefix="schedules", max_results=10000)
            
            # Find orphaned files
            for file_path in files:
                # Extract schedule ID from path (schedules/{id}/...)
                parts = file_path.split("/")
                if len(parts) >= 2:
                    schedule_id = parts[1]
                    if schedule_id not in active_ids:
                        # Orphaned backup
                        try:
                            size = await storage.get_size(file_path)
                            delete_result = await storage.delete(file_path)
                            
                            if delete_result.success:
                                result.deleted_count += 1
                                result.deleted_size_bytes += size
                        except Exception as e:
                            result.errors.append(f"Error deleting orphan {file_path}: {e}")
                    else:
                        result.kept_count += 1
                        
        except Exception as e:
            result.errors.append(f"Orphan cleanup failed: {e}")
        
        return result
