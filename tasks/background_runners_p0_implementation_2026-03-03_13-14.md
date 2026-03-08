# Task: Background runners P0 implementation

## Objective

Implement Phase P0 background execution so queued backups/schedules actually run
and monitoring/status data can be made runner-ready.

## Scope (P0 in this pass)

- Add scheduler runtime support in Nest API.
- Implement automatic pending backup execution loop.
- Implement schedule dispatcher loop for due schedules.
- Make schedule `run now` trigger executable backup work.
- Keep behavior env-gated and production-safe.
- Add/update backend unit tests and run verification.

## Plan Checklist

- [x] Add scheduler dependency and module wiring.
- [x] Add backups runner service (pending -> running/completed/failed).
- [x] Add schedules runner service (due schedules -> backup jobs).
- [x] Update schedules service run-now semantics and next_run_at handling.
- [x] Add/update tests for runner behavior and schedule execution.
- [x] Run targeted tests.
- [x] Run backend build.
- [x] Mark status Passed.

## Execution Log

- 2026-03-03 13:14: Task file created.
- 2026-03-03 13:20: Added scheduler runtime support (`@nestjs/schedule`) and
  global wiring in AppModule.
- 2026-03-03 13:24: Implemented `BackupsRunnerService` + pending claim helper
  (`claimPendingBackups`) and module registration.
- 2026-03-03 13:29: Implemented `SchedulesRunnerService`, due claim helper
  (`claimDueSchedules`), schedule `next_run_at` calculation, and real
  `runScheduleNow` execution via backups service.
- 2026-03-03 13:33: Added/updated unit tests for backup claim, schedule
  execution, and runner services.
- 2026-03-03 13:36: Targeted suites passed for backups/schedules runners and
  service behavior.
- 2026-03-03 13:38: Adjacent controller/contract suites passed.
- 2026-03-03 13:40: Full backend suite passed (`115/115`, `500/500`) and backend
  build passed.

## Status

`Passed`
