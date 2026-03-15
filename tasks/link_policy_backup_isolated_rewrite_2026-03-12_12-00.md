# Task: Link Environment + Policy + Backup Isolated Rewrite

Date: 2026-03-12 12:00 Status: IN PROGRESS

## Task

Implement isolated rewrites for:

1. Link Environment auto-monitor creation by site URL + project/environment name
   (staging/production only), with duplicate prevention.
2. Project plugin policy read behavior to return deterministic default payload
   when no project policy row exists.
3. SSH database dump command compatibility by removing unsupported timeout flag
   usage.

## Context

User reports:

- Link Environment should also add monitoring by site URL and
  project/environment.
- GET /api/v1/plugin-policies/projects/:id returns 404 on first load.
- SSH backup dump fails with unknown option `--connect-timeout` for
  `mariadb-dump` / `mysqldump`.

## Plan

1. Rewrite project policy missing-row behavior in plugin policies service and
   contract tests.
2. Rewrite environment-link monitor provisioning logic in projects service and
   tests.
3. Rewrite SSH dump argument builder in backups service and tests.
4. Run targeted backend tests per slice.
5. Run full backend tests and dashboard build/lint verification.

## Risks

- Behavior change from 404 to default payload for missing project policy may
  affect existing consumers.
- Monitor duplicate matching must avoid false positives while preventing
  duplicate rows.
- Dump command argument changes must preserve quoting and secret masking.

## Verification

- `npm --prefix api test -- src/plugin-policies`
- `npm --prefix api test -- src/projects`
- `npm --prefix api test -- src/backups/backups.service.spec.ts`
- `npm --prefix api test`
- `npm --prefix dashboard run build`
- `npm --prefix dashboard run lint`

## Execution Log

- Initialized task file and rewrite scope.
- Rewrote `PluginPoliciesService.getProjectPolicy` to return deterministic
  default project policy payload when override row is missing.
- Updated plugin policy HTTP contract and service specs to validate default
  payload behavior (200) for missing override rows.
- Reworked `ProjectsService.linkEnvironment` to auto-provision uptime monitors
  for `staging`/`production` only, keyed by project/url and skipping duplicates.
- Extended `ProjectsService` unit tests for monitor create/skip branches
  (production create, development skip, duplicate skip).
- Rebuilt SSH DB dump argument composition in `BackupsService` to remove
  unsupported `--connect-timeout` in remote `mariadb-dump`/`mysqldump` attempts.
- Strengthened backup unit test assertion to ensure remote dump command omits
  `--connect-timeout`.
- Updated `PROJECT.md` domain model notes with new monitor auto-link and
  project-policy default-read behavior.

## Verification Results

- PASS:
  `npm --prefix api test -- src/plugin-policies/plugin-policies.service.spec.ts src/plugin-policies/plugin-policies.contract.spec.ts src/projects/projects.service.spec.ts src/backups/backups.service.spec.ts --runInBand`
- PASS: `npm --prefix api test`
- PASS: `npm --prefix dashboard run build`
- FAIL: `npm --prefix dashboard run lint` (pre-existing workspace issue:
  dashboard ESLint config file not found)

## Pass Condition

Status remains `IN PROGRESS` because dashboard lint gate is not passing in this
workspace due to missing ESLint configuration.
