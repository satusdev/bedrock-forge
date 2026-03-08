# Task: Background runners P2 (ssl + subscriptions + invoices + sync)

## Objective

Implement autonomous runner behavior for SSL renewals, subscription
billing/reminders, invoice overdue transitions, and queued sync task
progression.

## Scope

- Add SSL due-renewal claim + runner execution path.
- Add subscription due-billing claim + reminder sweep + runner execution path.
- Add invoice overdue mark sweep runner.
- Add sync pending-task queue progression runner.
- Keep loops env-gated and bounded.
- Add/update backend unit tests and run verification.

## Plan Checklist

- [x] Add SSL claim/process helpers and runner + module wiring.
- [x] Add subscription claim/process/reminder helpers and runner + module
      wiring.
- [x] Add invoice overdue sweep helper and runner + module wiring.
- [x] Add sync queue claim/process helpers and runner + module wiring.
- [x] Add/update unit tests for new runner/service logic.
- [x] Run targeted tests.
- [x] Run backend build.
- [x] Mark status Passed.

## Execution Log

- 2026-03-03 14:48: Task file created.
- 2026-03-03 14:56: Implemented SSL due-renewal claim+process helpers and runner
  wiring.
- 2026-03-03 15:01: Implemented subscriptions due-auto-renew claim,
  billing/reminder processing helpers, and runner wiring.
- 2026-03-03 15:04: Implemented invoices overdue sweep helper and runner wiring.
- 2026-03-03 15:09: Implemented sync queued-task claim/process helpers and
  runner wiring.
- 2026-03-03 15:11: Added/updated runner and service unit specs for
  ssl/subscriptions/invoices/sync.
- 2026-03-03 15:13: Ran targeted Jest suites for P2 scope (8 passed).
- 2026-03-03 15:13: Ran backend build (pass).

## Status

`Passed`
