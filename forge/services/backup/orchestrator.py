
"""
Backup Orchestrator.

Manages the high-level workflow of backup execution:
1. Database Backup
2. Files Backup
3. Archiving/Compression
4. Upload to Storage
5. Result Compilation
"""
import logging
import asyncio
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

from forge.core.backup_types import BackupConfig, BackupResult, BackupStatus
from forge.services.backup.backup_service import BackupService  # For dependencies if needed, or better pass them in
# Ideally Orchestrator uses BackupService methods or Runners directly.
# To avoid massive rewrite of runners inside BackupService, we will call BACK to BackupService methods 
# but wrap them in robust error handling here OR move runners out.
# Since user asked to "split it up", I should prefer using Runners directly if possible.
# But Runners are distinct classes not fully isolated yet. `RemoteBackupRunner` exists. `LocalBackupRunner` logic is inside BackupService methods.

# For now, Orchestrator will wrap the legacy `BackupService` low-level methods if possible, 
# or we refactor `LocalBackupRunner` too.
# Let's stick to calling `BackupService` internal methods but managing the FLOW here.
# Wait, that creates circular dependency if Orchestrator is imported by BackupService.
# Better: Orchestrator is the main entry point, and delegates to Runners.
# But `BackupService` holds the Runner methods currently (except Remote).

# Pragmatic approach: Orchestrator Logic -> BackupService.create_backup (replacement).
# We will Define `BackupOrchestrator` inside `backup_service.py`? 
# No, user wanted "split up".
# So `orchestrator.py` should import Runners.
# `RemoteBackupRunner` is available.
# `LocalBackupRunner` needs to be extracted from `backup_service.py` lines 566+.

logger = logging.getLogger(__name__)

class BackupOrchestrator:
    def __init__(self, db_session, service):
        """
        Initialize Orchestrator.
        Args:
            db_session: Database session
            service: Instance of BackupService (to access legacy helpers/storage) - Temporary bridge
        """
        self.db = db_session
        self.service = service 

    async def run(
        self,
        project_path: Path,
        schedule, # Optional[BackupSchedule]
        config: BackupConfig,
        log_callback: Optional[Callable] = None
    ) -> BackupResult:
        """
        Execute the full backup workflow.
        """
        if log_callback:
            self.service.log = log_callback

        async def _log(msg: str):
             if self.service.log:
                 await self.service.log(msg)
             logger.info(f"[Backup] {msg}")

        start_time = datetime.utcnow()
        timestamp = start_time.strftime("%Y%m%d_%H%M%S")
        backup_id = f"backup_{timestamp}"
        
        await _log(f"Starting backup workflow for {config.project_name} ({config.environment_type})")
        await _log(f"Config: Type={config.backup_type}, Remote={config.is_remote}, DB={config.include_database}, Files={config.include_files}")

        temp_dir = Path(tempfile.mkdtemp(prefix="forge_backup_"))
        
        result = BackupResult(
            success=False,
            backup_id=backup_id,
            status=BackupStatus.IN_PROGRESS,
        )
        
        backup_files = []
        errors = []

        try:
            # 1. Database Backup
            if config.include_database:
                try:
                    await _log("Step 1/3: Database Backup...")
                    if config.is_remote:
                        # Use Remote Runner directly (it is cleaner)
                        from forge.services.backup.remote_runner import RemoteBackupRunner
                        runner = RemoteBackupRunner(self.db)
                        db_path = await runner.backup_database(config, temp_dir, backup_id, _log)
                    else:
                        # Use Legacy Local method
                        db_path = await self.service._backup_database(project_path, temp_dir, backup_id, _log)
                    
                    if db_path:
                        backup_files.append(db_path)
                        result.database_backup = str(db_path)
                        await _log("Database backup successful.")
                    else:
                        raise Exception("Database backup returned no file (Silent Failure)")
                        
                except Exception as e:
                    msg = f"Database backup failed: {str(e)}"
                    logger.exception(msg)
                    errors.append(msg)
                    await _log(f"ERROR: {msg}")
                    # Decide: Abort or Continue?
                    # Generally if DB fails, backup is partial. Continue to files.

            # 2. Files Backup
            if config.include_files:
                try:
                    await _log("Step 2/3: Files Backup...")
                    if config.is_remote:
                        from forge.services.backup.remote_runner import RemoteBackupRunner
                        runner = RemoteBackupRunner(self.db)
                        files_path = await runner.backup_files(config, temp_dir, backup_id, _log)
                    else:
                        files_path = await self.service._backup_files(project_path, temp_dir, backup_id, config, _log)

                    if files_path:
                        backup_files.append(files_path)
                        result.files_backup = str(files_path)
                        await _log("Files backup successful.")
                    else:
                         raise Exception("Files backup returned no file (Silent Failure)")

                except Exception as e:
                    msg = f"Files backup failed: {str(e)}"
                    logger.exception(msg)
                    errors.append(msg)
                    await _log(f"ERROR: {msg}")

            # Verification
            if not backup_files:
                result.status = BackupStatus.FAILED
                result.error = "; ".join(errors) if errors else "No backup files generated (Configuration mismatch?)"
                await _log(f"Backup FAILED: {result.error}")
                return result

            # 3. Archive & Upload
            await _log("Step 3/3: Archive and Upload...")
            
            # (Reuse existing logic or rewrite? Reusing logic via `service` helper for now to keep diff small)
            # We need to manually invoke the upload logic which is embedded in old `create_backup`.
            # I will EXTRACT upload logic to a helper in BackupService or here.
            # To keep it clean, I'll rely on `BackupService.upload_artifacts` (I should create this).
            
            # For this Refactor, I'll copy the upload logic part or move it in next step.
            # I'll invoke a NEW method `_process_uploads` on service.
            
            upload_result = await self.service._process_uploads(
                backup_files, config, schedule, start_time, project_path, _log
            )
            
            # Merge results
            result.storage_results = upload_result.storage_results
            result.backup_path = upload_result.backup_path
            result.size_bytes = upload_result.size_bytes
            result.storage_file_id = upload_result.storage_file_id
            
            # Final Status Calculation
            if any(r['success'] for r in result.storage_results.values()):
                if errors:
                    result.status = BackupStatus.PARTIAL
                    result.error = "; ".join(errors)
                    result.success = True # Partial is success-ish
                else:
                    result.status = BackupStatus.COMPLETED
                    result.success = True
            else:
                 result.status = BackupStatus.FAILED
                 result.error = "; ".join(errors) + " (Uploads Failed)"
                 result.success = False

        except Exception as e:
            logger.exception("Critical workflow error")
            result.status = BackupStatus.FAILED
            result.error = f"Workflow Error: {str(e)}"
            await _log(f"CRITICAL: {result.error}")
            
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
                
            end_time = datetime.utcnow()
            result.duration_seconds = (end_time - start_time).total_seconds()
            await _log(f"Workflow finished in {result.duration_seconds:.2f}s. Status: {result.status}")
            
        return result
