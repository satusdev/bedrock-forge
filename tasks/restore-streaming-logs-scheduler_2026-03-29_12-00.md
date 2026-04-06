# Restore Streaming + Logs + Backup Scheduler

**Date:** 2026-03-29  
**Status:** IN PROGRESS

## Task

Three interconnected improvements to the backup system:

1. **Restore directly on server** — stream the backup archive from Google Drive
   through the worker SSH pipe directly onto the managed server. No local temp
   files, no memory buffering.
2. **Real-time step logs for restore** — every restore step is tracked via
   StepTracker (matching backup behavior), shown live in RestoreTab via
   `ExecutionLogPanel` with 2s auto-polling.
3. **Backup scheduler** — per-environment scheduled backups
   (daily/weekly/monthly) with BullMQ repeatable jobs, managed from the
   BackupsTab.

## Plan

### Backend

- `backup.php` restore mode: fix tar extraction path (`dirname($docroot)`), add
  DB import via `mysql --defaults-extra-file`
- `RemoteExecutorService`: add
  `pushFileFromStream(remotePath, readable, timeoutMs, onProgress?)` — pipes a
  Readable into SFTP write stream
- `RcloneService`: add `downloadStream(filePath)` — spawns `rclone cat` and
  returns `{child, stream: child.stdout}`
- `BackupProcessor.handleRestore()`: full rewrite — GDrive→SSH pipe (no local
  staging), 50MB progress tracking, DB credentials passed to restore script
- `packages/shared/queues.ts`: add `BACKUP_SCHEDULED` job type, `JOB_LOG` WS
  event
- `packages/shared/types.ts`: add `BackupScheduledPayload`, `BackupSchedule`
  interface
- `prisma/schema.prisma`: add `BackupSchedule` model
- New API module: `backup-schedules` (controller + service + repository + DTOs)
- `backups.module.ts`: register new providers
- `BackupProcessor`: add `handleScheduled()` handler

### Frontend

- `execution-log-panel.tsx`: add `isActive` prop → `refetchInterval: 2000`
- `RestoreTab.tsx`: track `jobExecutionId` from mutation, show
  `ExecutionLogPanel` during active restore
- `BackupsTab.tsx`: add schedule management UI section per environment

## Verification

- [ ] Restore streams without local temp files (memory stays bounded)
- [ ] DB import runs after file extraction
- [ ] Restore logs show step-by-step in UI with 2s refresh
- [ ] 50MB increment progress logs appear in execution log
- [ ] Scheduler creates/deletes BullMQ repeatable jobs correctly
- [ ] `pnpm build` passes for all apps
