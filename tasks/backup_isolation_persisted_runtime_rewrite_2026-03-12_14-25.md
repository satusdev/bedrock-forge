# Backup Isolation Persisted Runtime Rewrite

- Status: IN_PROGRESS
- Started: 2026-03-12 14:25
- Scope: Backup module isolation, persisted-runtime-first execution, and remote
  file collection hardening

## Task

Refactor the backup backend so backup execution is simpler, more isolated, and
less failure-prone:

1. Move backup data access and context loading behind repository-style
   boundaries.
2. Make persisted project/project-server/server data the primary runtime source
   of truth.
3. Remove metadata-only file backup fallback and use real remote file collection
   for remote environments.
4. Reduce raw SQL in the main backup execution path.
5. Keep runner/controller contracts stable while improving failure determinism.

## Context

- Current backup failures come from runtime probing and fallback chains inside
  `BackupsService`.
- User explicitly wants current backend made simpler, isolated, and less
  dependent on raw SQL and heuristic runtime discovery.
- Selected execution policy:
  - backup-first slice
  - persisted DB rows first
  - real remote files only
  - SSH keys only

## Plan

1. Introduce a backup repository for owned backup/context CRUD and status
   updates.
2. Rewire `BackupsService` to use repository methods for
   list/get/create/context/status/log updates.
3. Simplify DB dump resolution to persisted-credentials-first,
   remote-discovery-only-when-needed.
4. Replace metadata-only file fallback with remote staging via SSH/SCP for
   remote environments.
5. Update tests for repository-backed flows and new backup-source behavior.
6. Run targeted backup tests, then full backend tests/build.

## Risks

- Test mocks currently assume direct Prisma/raw SQL usage in `BackupsService`.
- Remote file collection depends on `scp` and correct stored paths.
- Tightening source-of-truth behavior may surface stale saved environment data
  faster.

## Verification

- `npm --prefix api test -- --runInBand src/backups`
- `npm --prefix api test -- --runInBand`
- `npm --prefix api run build`

## Execution Log

- Added `BackupsRepository` to isolate owned backup CRUD, context loading, and
  backup status/log updates from `BackupsService`.
- Rewired backup list/create/get, execution context loading, and run status
  transitions to use repository methods instead of inline raw SQL.
- Changed DB dump execution to prefer persisted environment credentials first;
  remote config discovery now runs only when saved credentials are missing.
- Changed dump connection ordering to prefer default socket resolution before
  remote host/port fallbacks when no explicit env override is set.
- Removed metadata-only file backup fallback and replaced it with real remote
  source staging via SSH/SCP for non-local environments.
- Added backup service regression coverage for remote file staging, hard source
  failure, and persisted-runtime-first DB dump behavior.

## Verification Results

- ✅
  `npm --prefix api test -- --runInBand src/backups/backups.service.spec.ts src/backups/backups.runner.service.spec.ts src/backups/backups.controller.spec.ts`
- ✅ `npm --prefix api test -- --runInBand`
- ✅ `npm --prefix api run build`
- ⚠️ `npm --prefix api run lint` still fails because the workspace is on ESLint
  v9 without an `eslint.config.js` flat config.

## Pass Condition

- Status remains `IN_PROGRESS` because lint is still blocked by the existing
  workspace ESLint configuration gap.

## Proposed File Changes

- `api/src/backups/backups.repository.ts`
- `api/src/backups/backups.module.ts`
- `api/src/backups/backups.service.ts`
- `api/src/backups/backups.service.spec.ts`
- `PROJECT.md`
