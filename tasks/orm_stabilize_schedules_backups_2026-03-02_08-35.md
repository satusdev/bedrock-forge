# ORM Stabilization: Schedules + Backups (2026-03-02 08:35)

## Objective

Stabilize failing API flows by replacing risky schedules raw SQL with Prisma ORM
for read paths, hardening backup endpoint input handling, and normalizing
malformed JSON parser errors.

## Status

- [x] Planned
- [x] In Progress
- [x] Passed

## Task List

1. [x] Rewrite schedules `getScheduleRow` and `listSchedules` to Prisma ORM
       while preserving response shape.
2. [x] Keep permissive `status` query behavior (invalid values should not throw
       400).
3. [x] Harden backup endpoint query normalization and deterministic error
       handling.
4. [x] Add global malformed-JSON exception filter and wire in bootstrap.
5. [x] Update/add tests for schedules ORM path, backups validation behavior, and
       JSON parser error contract.
6. [x] Run targeted tests, then broader verification; capture outputs.

## Logs

- Initialized task file.
- Refactored schedules list/get to Prisma delegates (`findMany`/`findFirst`)
  with relation owner scoping.
- Added schedules query integer validation (`project_id`, `page`, `page_size`)
  with explicit 400 details.
- Refactored projects environment backup creation to Prisma delegates
  (`projects.findFirst`, `project_servers.findFirst`, `backups.create`).
- Added backup enum validation for `backup_type` and `storage_type` to return
  deterministic 400 on invalid values.
- Added global malformed JSON filter and registered via `app.useGlobalFilters`.
- Added/updated tests for schedules service/controller/contract, projects
  service, and malformed JSON filter.
- Verification:
  - `npm test -- src/schedules/schedules.service.spec.ts src/schedules/schedules.controller.spec.ts src/schedules/schedules.contract.spec.ts src/projects/projects.service.spec.ts src/common/filters/malformed-json.filter.spec.ts`
    (pass)
  - `npm run build` (pass)
  - `npm test -- src/projects/projects.contract.spec.ts` (pass)
