# Background Runners P4 — Backup Retention Guardrails

Date: 2026-03-04 11:19 Branch: chore/split-commits-plan Status: Passed

## Scope

- Add backup retention pruning helper with safety guardrails.
- Extend backup maintenance runner to execute retention policy when enabled.
- Add focused unit coverage and compile verification.

## Checklist

- [x] Added
      `BackupsService.pruneTerminalBackups(retentionDays, keepPerProject, limit)`.
- [x] Added retention config fields in `BackupsRunnerService`.
- [x] Added retention execution in `runMaintenance()` behind env gate.
- [x] Updated backup service and runner specs.
- [x] Ran focused Jest suites (2/2 passed).
- [x] Ran `npm run build` (passed).

## Guardrails

- Retention run is disabled by default (`BACKUP_RETENTION_ENABLED=false`).
- Only terminal backups (`completed`, `failed`) are eligible.
- Only records older than retention window are eligible.
- Per-project newest history is preserved (`BACKUP_RETENTION_KEEP_PER_PROJECT`).
- Batch size is capped (`BACKUP_RETENTION_BATCH_SIZE`).

## Execution Log

1. Implemented terminal-backup prune SQL with per-project ranking and capped
   delete batch.
2. Wired retention pass into backup maintenance loop after stale-running
   recovery.
3. Added focused tests for service helper and runner maintenance behavior.
4. Ran: `npm test -- backups.service.spec.ts backups.runner.service.spec.ts`
   - Result: 2 suites passed, 18 tests passed.
5. Ran: `npm run build`
   - Result: passed.

## Environment Flags

- `BACKUP_RETENTION_ENABLED` (default: `false`)
- `BACKUP_RETENTION_DAYS` (default: `30`)
- `BACKUP_RETENTION_KEEP_PER_PROJECT` (default: `20`)
- `BACKUP_RETENTION_BATCH_SIZE` (default: `100`)
