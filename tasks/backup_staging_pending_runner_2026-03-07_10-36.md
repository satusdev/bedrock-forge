# Task: Backup STAGING jobs stuck in pending

Status: IN_REVIEW Created: 2026-03-07 10:36

## Task

Fix the backup execution pipeline where newly created STAGING backups remain
`pending` with empty logs and do not transition to `running`/terminal status.

## Context

- User reports backup task entries stay pending with no logs.
- API container is healthy and routes are mounted.
- Backup flow is queue-based: creation enqueues `pending`, background runner
  claims and executes.
- Scope indicates all new backups are affected, not a single record.

## Plan

1. Verify runner/scheduler activation and runtime guard conditions.
2. Verify pending-claim query and transition contract for backups.
3. Reproduce and confirm stuck behavior with targeted runtime checks.
4. Implement minimal root-cause fix in backup runner/runtime wiring.
5. Add/adjust tests for the changed behavior.
6. Run verification commands (`pnpm test`, dashboard `pnpm build` and
   `pnpm lint`).

## Risks

- Fix may hide operational misconfiguration if code-level diagnostics are weak.
- Background interval behavior can be hard to observe without explicit
  startup/runtime logging.
- DB/runtime mismatch can mimic code defects.

## Verification

- Create a controlled backup and observe transition:
  `pending -> running -> completed|failed`.
- Confirm logs are appended after runner execution attempts.
- Backend tests pass.
- Frontend build/lint pass.

## Notes

- Will keep changes minimal and localized to backup runner + associated
  observability/tests.

## Proposal (approved)

- Files to modify:
  - `dashboard/src/components/TaskLogModal.tsx`
  - `dashboard/src/pages/Backups.tsx`
  - `dashboard/src/pages/ProjectDetail.tsx`
  - `docs/TROUBLESHOOTING.md`
  - `PROJECT.md`
- Architecture impact:
  - No backend data model changes.
  - Frontend now auto-refreshes active backup states and keeps task logs polling
    until terminal states.
  - Troubleshooting docs now point to the correct compose service for API logs.

## Execution

1. Validated runtime state in Docker:
   - `forge-api` had scheduler activity (`/api/v1/backups/maintenance/status`
     advancing).
   - Postgres row for backup ID `2` was `completed` with non-empty logs.
2. Implemented dashboard fixes:
   - `TaskLogModal` polling now continues for `pending`, `running`, and
     `in_progress` statuses.
   - `Backups` page now auto-refreshes every 5s when active backups exist.
   - `ProjectDetail` backup query now auto-refetches every 5s while active
     backups exist.
   - Both backup views now treat `pending` as active for log polling.
3. Fixed docs drift:
   - Updated troubleshooting command from `docker compose logs -f nest-api` to
     `docker compose logs -f api`.

## Verification Results

- Backend: `cd nest-api && npm test -- --runInBand` ✅ PASSED
- Frontend build: `cd dashboard && npm run build` ✅ PASSED
- Frontend lint: `cd dashboard && npm run lint` ❌ BLOCKED (repository currently
  has no ESLint config discoverable by ESLint in this path)

## Outcome

- Root runtime was not stalled for local API backup ID `2`; DB confirmed
  terminal completion with logs.
- User-facing stuck behavior is addressed by frontend active-status polling and
  log refresh behavior.
- Full pass condition is pending lint environment/config resolution.

## Follow-up Implementation (2026-03-07 11:41)

- Implemented real Google Drive backup upload flow in
  `nest-api/src/backups/backups.service.ts`:
  - Replaced local mirror-copy path with `rclone copyto` upload to configured
    remote.
  - Added `FORGE_BACKUP_GDRIVE_REMOTE` support (defaults to `gdrive`).
  - Upload failures now fail the backup (status `failed`) with explicit error
    details.
- Implemented step-by-step persisted backup logs:
  - Added timestamped incremental log writes for start, context/source
    resolution, archive creation, upload start/completion, and finalization.
  - Failure path now records timestamped terminal error details in `logs` +
    `error_message`.
- Updated runtime image dependencies in `Dockerfile.nest` to include `rclone` in
  base and production stages.
- Added/updated tests in `nest-api/src/backups/backups.service.spec.ts`:
  - Relaxed setup-failure assertion for incremental log writes.
  - Added coverage for successful google-drive upload execution path.
- Updated `docs/ENVIRONMENT_VARIABLES.md` with `FORGE_BACKUP_GDRIVE_REMOTE` and
  rclone remote requirement note.

## Follow-up Verification Results

- Backend: `cd nest-api && npm test -- --runInBand` ✅ PASSED (122/122 suites)
- Frontend build: `cd dashboard && npm run build` ✅ PASSED
- Frontend lint: `cd dashboard && npm run lint` ❌ BLOCKED (ESLint config file
  missing in repository)

Status: IN_REVIEW

## Follow-up Hardening (2026-03-07 12:08)

- Root cause of repeated `Unexpected token 'n', "null" is not valid JSON` on
  backup trigger endpoint was strict JSON body parsing rejecting literal `null`
  payloads.
- Implemented parser hardening in `nest-api/src/main.ts`:
  - Disabled Nest default body parser (`bodyParser: false`).
  - Registered explicit Express parsers with `json({ strict: false })` and
    `urlencoded(...)`.
- Added regression contract coverage in
  `nest-api/src/projects/projects.contract.spec.ts`:
  - New test posts literal JSON `null` to
    `POST /projects/:id/environments/:envId/backups` and asserts `202`.
  - Updated test app bootstrap to mirror production parser config.

## Follow-up Verification (2026-03-07 12:09)

- Focused tests:
  `npm test -- src/projects/projects.contract.spec.ts src/common/filters/malformed-json.filter.spec.ts --runInBand`
  ✅
- Full backend suite: `npm test -- --runInBand` ✅ (`122/122` suites, `540/540`
  tests).
- Live runtime check after container rebuild:
  - `POST /api/v1/projects/1/environments/1/backups?backup_type=full&storage_type=gdrive`
    with body `null` now returns `202 Accepted` ✅

## Follow-up Hardening Expansion (2026-03-07 12:23)

- Expanded regression coverage for backup trigger endpoint variants:
  - `storage_type=gdrive` + body `null` => `202`.
  - `storage_type=google_drive` + body `null` => `202`.
  - Malformed JSON body => normalized `{ "detail": "Malformed JSON body" }`.
- Hardened malformed JSON filter matching to normalize additional parser error
  forms (including `Expected ... in JSON at position ...`) while preserving
  non-parser `400` payload passthrough.

## Follow-up Verification (2026-03-07 12:24)

- Focused tests:
  - `npm test -- src/common/filters/malformed-json.filter.spec.ts src/projects/projects.contract.spec.ts --runInBand`
    ✅
- Full backend suite:
  - `npm test -- --runInBand` ✅ (`122/122` suites, `545/545` tests).
- Live runtime (after `docker compose up -d --build api`):
  - `null` body with `gdrive` => `202 Accepted` ✅
  - `null` body with `google_drive` => `202 Accepted` ✅
  - malformed JSON => `{ "detail": "Malformed JSON body" }` ✅

## Frontend Runtime Fix (2026-03-07 12:31)

- Fixed dashboard production crash:
  `TypeError: Cannot read properties of undefined (reading 'state')` caused by
  `TaskLogModal` using React Query v5-style `refetchInterval` callback shape in
  a v4 project.
- Updated `dashboard/src/components/TaskLogModal.tsx` to use v4-compatible
  callback arguments and guard against undefined query state.
- Verification:
  - `cd dashboard && npm run build` ✅
  - Rebuilt and redeployed dashboard container; `http://localhost:3000` returns
    `HTTP/1.1 200 OK` ✅
