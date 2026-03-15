# Task: Backup + Scheduler SSH-First Rebuild

Date: 2026-03-11 11:04 Status: IN PROGRESS

## Task

Rebuild backup execution to a deterministic SSH-first flow with Bedrock-aware
credential resolution (`.env` first, `wp-config.php` fallback, manual fallback
last), and harden scheduler claiming with distributed-safe lease behavior.

## Context

Recent production backup failure showed unstable fallback churn:

- local DB dump timeout on unreachable DB host
- wp-cli path mismatch on remote host
- redundant remote fallback attempts

Selected implementation constraints:

- Scope: backup + scheduler only
- SSH policy: configured SSH user with sudo allowed
- Source-of-truth priority: `.env` > `wp-config.php` > manual fallback
- Compatibility: keep legacy path behind feature flag for one release
- Scheduler: distributed-safe claiming now

## Plan

1. Refactor backup DB dump orchestration to SSH-first deterministic path.
2. Implement explicit remote root detection and Bedrock `.env` parsing first.
3. Keep legacy fallback matrix behind feature flag and deprecation logs.
4. Introduce scheduler lease claim fields and claim/release semantics.
5. Update services/tests/docs for new behavior and compatibility flag.

## Risks

- Existing environments without SSH key or sudo privileges may fail SSH-first
  path.
- Non-Bedrock installations may rely on wp-config parsing edge cases.
- Lease migration must avoid duplicate schedule execution during rollout.

## Verification

- Targeted backup unit tests for SSH-first and config precedence.
- Targeted scheduler tests for lease claim collision and stale recovery.
- Full backend test run: `npm --prefix api test`.
- Backend lint/build checks if configured in workspace.

## Execution Log

- Implemented SSH-first deterministic backup dump ordering in
  `BackupsService.createDatabaseDump`.
- Added remote config source detection traces (`bedrock` vs `wp-config`) and
  remote-first credential resolution.
- Added legacy compatibility flag `FORGE_BACKUP_DB_LEGACY_FALLBACK` for
  temporary local/wp-cli fallback path.
- Updated SSH dump flags to include
  `--single-transaction --quick --lock-tables=false --connect-timeout`.
- Implemented schedule runner lease claims using
  `backup_schedules.celery_task_id` claim tokens and release-on-complete/fail
  behavior.
- Updated runner to pass lease token to `runScheduleNow` and enforce lease
  validation.
- Updated tests for new scheduler claim contract and SSH-first backup
  expectations.
- Updated docs (`PROJECT.md`, `docs/ENVIRONMENT_VARIABLES.md`) with new runtime
  behavior and env controls.

## Verification Results

- PASS:
  `npm --prefix api test -- backups.service.spec.ts schedules.service.spec.ts schedules.runner.service.spec.ts`
- PASS: `npm --prefix api test`
- PASS: `npm --prefix dashboard run build`
- FAIL: `npm --prefix dashboard run lint` (workspace has no ESLint config file
  in `dashboard/`, pre-existing tooling configuration issue)

## Execution Log (Hardening Pass)

- Hardened backup pending claim ownership in
  `BackupsService.claimPendingBackups` using per-row conditional update to
  prevent cross-runner claim drift.
- Hardened stale-running marking in
  `BackupsService.markStaleRunningBackupsFailed` using conditional update guard
  (`status=running` and stale timestamp) to avoid clobbering already-finished
  backups.
- Added schedule lease heartbeat in `SchedulesService.runScheduleNow` to keep
  claim freshness during long-running backup execution.
- Added token-scoped completion/failure updates in
  `SchedulesService.runScheduleNow` so schedule state is only finalized by the
  current lease owner.
- Added/updated tests for new race protections and claim semantics in:
  - `api/src/backups/backups.service.spec.ts`
  - `api/src/schedules/schedules.service.spec.ts`

## Verification Results (Hardening Pass)

- PASS:
  `npm --prefix api test -- src/backups/backups.service.spec.ts src/schedules/schedules.service.spec.ts src/schedules/schedules.runner.service.spec.ts --runInBand`
- PASS: `npm --prefix api test`
- PASS: `npm --prefix dashboard run build`
- FAIL: `npm --prefix dashboard run lint` (workspace has no ESLint config file
  in `dashboard/`, pre-existing tooling configuration issue)

## Pass Condition

Mark `Status: PASSED` only when tests pass, build/lint pass, and docs reflect
final behavior.
