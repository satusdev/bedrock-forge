# Background Runners P7 — Monitors/Domains/Subscriptions Observability

Date: 2026-03-05 10:19 Branch: chore/split-commits-plan Status: Passed

## Scope

- Extend maintenance/runner observability pattern used in backups to:
  - monitors
  - domains
  - subscriptions
- Expose status endpoints for each module.
- Add focused unit tests and compile verification.

## Checklist

- [x] Added snapshot state and APIs in `MonitorsService`: `getRunnerSnapshot()`
      and `recordRunnerSnapshot(...)`.
- [x] Added snapshot state and APIs in `DomainsService`: `getRunnerSnapshot()`
      and `recordRunnerSnapshot(...)`.
- [x] Added snapshot state and APIs in `SubscriptionsService`:
      `getRunnerSnapshot()` and `recordRunnerSnapshot(...)`.
- [x] Updated each runner to record per-run metrics and errors.
- [x] Added endpoint `GET /monitors/maintenance/status`.
- [x] Added endpoint `GET /domains/maintenance/status`.
- [x] Added endpoint `GET /subscriptions/maintenance/status`.
- [x] Updated service/runner/controller specs for all three modules.
- [x] Ran focused Jest suites (9/9 passed).
- [x] Ran `npm run build` (passed).

## Exposed Status Payloads

- `monitors`: `enabled`, `interval_minutes`, `runs_total`, `last_run_at`, and
  last outcome (`claimed`, `executed`, `succeeded`, `failed`, `error`).
- `domains`: `enabled`, `interval_hours`, `runs_total`, `last_run_at`, and last
  outcome (`claimed`, `whois_succeeded`, `whois_failed`, `reminders_processed`,
  `reminders_sent`, `error`).
- `subscriptions`: `enabled`, `interval_hours`, `runs_total`, `last_run_at`, and
  last outcome (`processed`, `reminders_sent`, `error`).

## Execution Log

1. Added in-memory runner snapshots to monitors/domains/subscriptions services.
2. Wired runner loops to record success/error summaries after each run.
3. Exposed `GET /maintenance/status` endpoints on all three controllers.
4. Added/updated tests for service recording logic, runner recording calls, and
   controller status endpoints.
5. Ran focused tests:
   `npm run test -- src/monitors/monitors.service.spec.ts src/monitors/monitors.runner.service.spec.ts src/monitors/monitors.controller.spec.ts src/domains/domains.service.spec.ts src/domains/domains.runner.service.spec.ts src/domains/domains.controller.spec.ts src/subscriptions/subscriptions.service.spec.ts src/subscriptions/subscriptions.runner.service.spec.ts src/subscriptions/subscriptions.controller.spec.ts`
   - Result: 9 suites passed, 31 tests passed.
6. Ran: `npm run build`
   - Result: passed.
