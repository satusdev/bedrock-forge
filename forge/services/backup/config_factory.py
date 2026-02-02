
"""
Backup Configuration Factory.

Responsible for building BackupConfig objects from Schedules or arbitrary dictionaries,
encapsulating logic for remote detection, path resolution, and flag normalization.
"""
from typing import Optional, Union, TYPE_CHECKING
import logging
from pathlib import Path

from forge.core.backup_types import BackupConfig, BackupType
from forge.services.backup.backup_service import normalize_storage_backend

if TYPE_CHECKING:
    from forge.db.models.backup_schedule import BackupSchedule

logger = logging.getLogger(__name__)


class BackupConfigFactory:
    """Factory for creating BackupConfig instances."""

    @staticmethod
    def create_from_schedule(schedule: 'BackupSchedule') -> BackupConfig:
        """
        Create a BackupConfig from a BackupSchedule model.
        
        Handles:
        - Robust Enum type conversion
        - Explicit flag calculation (include_database/files)
        - Remote environment detection
        - Path resolution with fallback
        """
        env = schedule.environment
        
        # 1. Determine Remote Status
        # Check if environment is linked and has a server
        is_remote = env is not None and getattr(env, 'server_id', None) is not None
        server = env.server if is_remote else None
        
        # 2. Robust Flag Calculation
        # Handle case where backup_type might be an Enum object or string
        raw_type = schedule.backup_type
        if hasattr(raw_type, "value"):
            b_type_str = str(raw_type.value).lower()
        else:
            b_type_str = str(raw_type).lower()
            
        inc_db = b_type_str in ["full", "database"]
        inc_files = b_type_str in ["full", "files"]
        
        # 3. Path Resolution
        # If remote, prefer env.wp_path. Fallback to project local path (which might be wrong for remote, 
        # but better than None). If env.wp_path is None, use project path.
        project_path_str = str(schedule.project.local_path or "") if schedule.project else ""
        
        if is_remote and env:
             # Use env specific path, fallback to project path
             wp_path = env.wp_path or project_path_str
             # If both fail? User needs to config. But let's avoid None crash.
             if not wp_path:
                 wp_path = "/var/www/html" # Desperate fallback
                 logger.warning(f"Schedule {schedule.id}: No wp_path found in Env or Project. Using default {wp_path}")
        else:
             wp_path = project_path_str
             
        logger.info(
            f"Building Config for Schedule {schedule.id}: "
            f"Type={b_type_str} (DB={inc_db}, Files={inc_files}), "
            f"Remote={is_remote}, Path={wp_path}"
        )

        return BackupConfig(
            backup_type=schedule.backup_type,
            include_database=inc_db,
            include_files=inc_files,
            storage_backends=[normalize_storage_backend(schedule.storage_type)],
            storage_config={"gdrive_folder": env.gdrive_backups_folder_id} if env and getattr(env, 'gdrive_backups_folder_id', None) else {},
            
            is_remote=is_remote,
            server_hostname=server.hostname if server else None,
            server_ssh_user=(env.ssh_user if env else None) or (server.ssh_user if server else None),
            server_ssh_port=server.ssh_port if server else 22,
            server_ssh_key_path=(env.ssh_key_path if env else None) or (server.ssh_key_path if server else None),
            server_ssh_password=server.ssh_password if server else None,
            server_ssh_private_key=server.ssh_private_key if server else None,
            
            wp_path=wp_path,
            project_name=env.project.name if env and env.project else schedule.project.name,
            environment_type=(env.environment.value if env and hasattr(env.environment, "value") else str(env.environment)) if env else "production"
        )
