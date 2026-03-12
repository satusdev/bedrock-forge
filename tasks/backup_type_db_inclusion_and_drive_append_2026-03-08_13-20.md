# Task: backup_type_db_inclusion_and_drive_append

- Status: PASSED
- Date: 2026-03-08 13:20

## Context

User reported `full` backup produced files-only artifact and requested reliable
type selection plus tests that Drive destination path appends `year/month` under
existing folder.

## Plan

1. Implement backup execution branching by `backup_type` (`full`, `files`,
   `database`).
2. Add database dump creation and include it in backup archive when DB is
   selected.
3. Preserve/verify Drive destination append behavior
   (`<folder>/<year>/<month>/<file>`).
4. Add unit tests for selection logic and Drive path behavior.
5. Run targeted test suite and mark status.

## Risks

- DB dump command availability (`mysqldump` vs `mariadb-dump`).
- Missing DB credentials for selected environment.

## Verification

- `npm --prefix nest-api test -- backups.service.spec.ts`
- `npm --prefix nest-api test -- backups`
- `npm --prefix nest-api test -- backups.service.spec.ts backups.controller.spec.ts backups.contract.spec.ts`
