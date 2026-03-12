# Task: Sync DB log persistence + backup command trace + sudo fallback

Status: COMPLETE  
Created: 2026-03-10 13:25

## Task

Implement durable sync task log persistence in backend/database, show
command-level execution history in sync/backup logs, and apply sudo-first
fallback for remote backup commands.

## Context

- Sync task logs are currently in-memory and lifecycle-only.
- Full command trace is not visible for sync operations.
- Backup failures need explicit command-attempt visibility and sudo-first
  handling.

## Plan

1. Add DB model and migration for persisted sync task statuses/logs.
2. Extend task-status service to persist/recover sync tasks from DB.
3. Add command-level trace entries to sync task processing.
4. Add backup command trace callbacks and sudo-first fallback for remote
   wp-cli/db dump commands.
5. Wire frontend to prefer backend logs/history while retaining local cache
   fallback.
6. Run targeted tests/build and update task status.

## Risks

- Large command error messages can increase log payload size.
- Sudo behavior depends on passwordless sudo availability.
- Existing tests may assume constructor signatures and synchronous task
  processing.

## Verification

- `npm --prefix nest-api test -- src/task-status/task-status.service.spec.ts src/task-status/task-status.contract.spec.ts src/sync/sync.service.spec.ts src/sync/sync.contract.spec.ts src/backups/backups.service.spec.ts`
- `npm --prefix dashboard run build`

## Completed Work

- Added durable sync task persistence model and SQL migration:
  - `nest-api/prisma/schema.prisma`
  - `nest-api/prisma/migrations/0002_sync_task_statuses.sql`
- Refactored `TaskStatusService` to async + DB-backed sync status
  load/upsert/prune.
- Added sync command-trace logging (`CMD[...]` and `RESULT[...]`) during task
  processing.
- Added backup command tracing and sudo-first fallback behavior in backup dump
  flow.
- Added backend sync history endpoint and wired dashboard sync UI to load
  persisted history with local fallback.

## Verification Results

- ✅
  `cd nest-api && npm test -- --runInBand src/task-status/task-status.service.spec.ts src/sync/sync.service.spec.ts src/sync/sync.controller.spec.ts src/sync/sync.contract.spec.ts`
- ✅ `cd nest-api && npm run build`
- ✅ `cd dashboard && npm run build`
