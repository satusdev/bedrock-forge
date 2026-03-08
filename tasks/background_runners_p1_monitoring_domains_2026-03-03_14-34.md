# Task: Background runners P1 (monitoring + domains)

## Objective

Implement autonomous runner behavior for monitoring checks/incidents and domains
WHOIS/reminder maintenance.

## Scope

- Add monitor runner loop and due-monitor execution path.
- Add domain runner loop for WHOIS refresh and expiry reminder stamping.
- Keep loops env-gated and bounded.
- Add/update backend unit tests and run verification.

## Plan Checklist

- [x] Add monitor claim/check execution helpers in monitors service.
- [x] Add monitors runner service + module wiring.
- [x] Add domain maintenance helpers in domains service.
- [x] Add domains runner service + module wiring.
- [x] Add/update unit tests for new runner/service logic.
- [x] Run targeted tests.
- [x] Run backend build.
- [x] Mark status Passed.

## Execution Log

- 2026-03-03 14:34: Task file created.
- 2026-03-03 14:41: Implemented monitor due-claim + check execution, added
  runner + module wiring.
- 2026-03-03 14:44: Implemented domain WHOIS claim/refresh + expiry reminder
  sweep, added runner + module wiring.
- 2026-03-03 14:46: Added/updated monitor/domain service+runner specs.
- 2026-03-03 14:47: Ran targeted Jest suites for monitor/domain runner scope (4
  passed).
- 2026-03-03 14:47: Ran backend build (pass).

## Status

`Passed`
