# Background Runners P3 — Housekeeping

Date: 2026-03-04 10:35 Branch: chore/split-commits-plan Status: Passed

## Scope

- Add backup maintenance loop for stale running backups.
- Add task-status in-memory retention cleanup loop.
- Add focused unit tests and compile verification.

## Checklist

- [x] Added `BackupsService.markStaleRunningBackupsFailed(staleMinutes, limit)`.
- [x] Added `BackupsRunnerService.runMaintenance()` interval with env flags.
- [x] Added/updated backup service and runner specs.
- [x] Added `TaskStatusService.pruneTerminalStatuses(maxAgeMinutes)`.
- [x] Added `TaskStatusRunnerService.runCleanup()` interval with env flags.
- [x] Wired task-status runner in `TaskStatusModule`.
- [x] Added task-status service and runner specs.
- [x] Ran focused Jest suites (4/4 passed).
- [x] Ran `npm run build` (passed).

## Execution Log

1. Implemented stale backup failover helper and maintenance runner.
2. Implemented task-status retention pruning helper and cleanup runner.
3. Added tests for both helpers and both runners.
4. Ran:
   `npm test -- backups.service.spec.ts backups.runner.service.spec.ts task-status.service.spec.ts task-status.runner.service.spec.ts`
   - Result: 4 suites passed, 22 tests passed.
5. Ran: `npm run build`
   - Result: passed.

## Environment Flags

- `BACKUP_MAINTENANCE_ENABLED` (default: `true`)
- `BACKUP_MAINTENANCE_BATCH_SIZE` (default: `10`)
- `BACKUP_STALE_MINUTES` (default: `120`)
- `TASK_STATUS_RUNNER_ENABLED` (default: `true`)
- `TASK_STATUS_RETENTION_MINUTES` (default: `180`)
