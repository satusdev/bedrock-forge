# Backend Isolation Phase 1C Backup Runner Observability

- Status: IN_PROGRESS
- Started: 2026-03-12 11:23
- Scope: Backup runner lease-cycle visibility and monitoring telemetry

## Task

Harden backup cron runner observability by tracking pending-loop outcomes and
maintenance-loop duration/error metrics, and expose them through existing backup
maintenance status API.

## Context

- Pending backup runner loop currently logs only per-backup failures.
- Maintenance snapshot exists but lacks pending-loop counters and duration
  telemetry.
- User requested stronger backup/cron monitoring and logs.

## Plan

1. Extend backup maintenance snapshot model with pending runner telemetry.
2. Add service method to record pending runner run outcomes.
3. Wire pending-loop metrics in `BackupsRunnerService`
   (claimed/processed/failed/error/duration).
4. Add maintenance duration metric for consistency.
5. Update unit tests for service + runner behavior.
6. Run targeted backup tests + full backend tests/build.

## Verification

- `npm --prefix api test -- backups.service.spec.ts backups.runner.service.spec.ts backups.controller.spec.ts`
- `npm --prefix api test`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/backups/backups.service.ts`
- `api/src/backups/backups.runner.service.ts`
- `api/src/backups/backups.service.spec.ts`
- `api/src/backups/backups.runner.service.spec.ts`
- `PROJECT.md`

## Execution Log

- Extended backup maintenance snapshot schema to include pending-runner
  telemetry (`claimed/processed/failed/error/duration_ms`).
- Added `recordPendingRunnerSnapshot` in `BackupsService` and included
  maintenance duration capture.
- Wired `BackupsRunnerService.runPendingBackups` to capture and record
  claim/process/failure/error/duration metrics each interval run.
- Added summary runner logs for pending and maintenance loops to improve
  operational traceability.
- Updated backup runner/service tests for telemetry recorder calls and new
  snapshot fields.

## Verification Results

- ✅
  `npm --prefix api test -- backups.service.spec.ts backups.runner.service.spec.ts backups.controller.spec.ts`
- ✅ `npm --prefix api test` (123 suites, 576 tests passing)
- ✅ `npm --prefix api run build`
- ⚠️ Lint remains blocked at workspace level (`eslint.config.js` missing for
  ESLint v9 flat config).
