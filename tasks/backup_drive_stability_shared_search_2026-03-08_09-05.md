# Task: Backup Drive Stability + Shared Search

Status: IN_REVIEW Created: 2026-03-08 09:05

## Task

Stabilize Google Drive backup uploads and folder selection so staging backups do
not fail on missing rclone section mismatches, and folder browsing/search works
across My Drive + Shared with me.

## Context

- Backup failure observed: `didn't find section in config file ("gdrive")`
  during rclone upload.
- Folder picker shows `No folders available` and must support shared/general
  Drive discovery.
- Existing architecture uses backup env runtime settings and gdrive DB settings
  separately.

## Plan

1. Introduce shared Drive runtime config resolver with explicit precedence and
   diagnostics.
2. Use shared resolver in backup preflight/upload and gdrive status.
3. Replace DB-derived gdrive folder list with live rclone listing/search (My
   Drive + Shared).
4. Keep `/gdrive/folders` API backward-compatible; add metadata fields.
5. Update folder picker to consume new metadata and improve shared/path
   behavior.
6. Add targeted backend/frontend tests for new behavior.
7. Update docs for config precedence and troubleshooting.

## Risks

- Rclone listing performance for broad search may be slower on large remotes.
- Shared-with-me visibility depends on rclone remote token scope and account
  permissions.
- Folder ID/path legacy values require careful compatibility handling.

## Verification

- Backend targeted tests: backups + gdrive + rclone interactions.
- Frontend targeted tests for GoogleDriveFolderPicker behavior.
- Manual API checks for `/gdrive/status` and `/gdrive/folders` query/path/shared
  variants.

## Proposal Summary (Approved)

- Standardize runtime source via rclone-backed resolver.
- Default search to both base and shared sets.
- Preserve existing response fields; add metadata only.

## Execution

1. Added shared runtime resolver for Google Drive config:
   - New `nest-api/src/drive-runtime/drive-runtime-config.service.ts`.
   - Resolves remote/config/base path with deterministic precedence.
   - Validates rclone config + remote section for both backup and gdrive flows.
2. Wired shared module into backend domains:
   - Added `nest-api/src/drive-runtime/drive-runtime.module.ts`.
   - Imported into `backups.module.ts` and `gdrive.module.ts`.
3. Hardened backup upload path:
   - `BackupsService` now uses shared runtime config for preflight + upload.
   - Upload logs now include resolved remote source + config path.
   - Removes drift between status endpoint and actual backup runtime target.
4. Reworked gdrive folder listing to live Drive/rclone listing:
   - `GdriveService.listFolders` now uses `rclone lsjson`.
   - Supports shared-with-me + base listing, dedupe, and additive metadata
     (`display_path`, `parent_path`, `drive_type`, `remote_source`).
   - Search with `query` and empty `path` now searches from Drive root.
5. Updated folder picker to consume additive metadata:
   - Uses `display_path` for readable labels.
   - Navigates via `id` when available for shared/ID-based folder traversal.
6. Updated docs and architecture notes:
   - `docs/ENVIRONMENT_VARIABLES.md`: precedence + folder listing/search rules.
   - `docs/TROUBLESHOOTING.md`: rclone remote mismatch diagnostics.
   - `PROJECT.md`: added `drive-runtime` architecture notes.

## Verification Results

- Backend targeted tests:
  - `cd nest-api && npm test -- src/backups/backups.service.spec.ts src/gdrive/gdrive.service.spec.ts src/gdrive/gdrive.controller.spec.ts src/gdrive/gdrive.contract.spec.ts --runInBand`
    ✅
  - Result: 4 suites, 27 tests passed.
- Frontend build:
  - `cd dashboard && npm run build` ✅
- Frontend lint:
  - `cd dashboard && npm run lint` ❌ blocked (no ESLint config in repository)

## Follow-up Verification (Live + Expanded Tests)

- Live Docker API smoke (after rebuilding `forge-api` with current code):
  - `GET /api/v1/gdrive/status` returns enriched payload with `remote_source`,
    `configured`, and actionable missing-config message.
  - `GET /api/v1/gdrive/folders` returns stable empty payload with
    `configured=false` and same actionable message when rclone config is
    missing.
  - Triggered staging backup
    (`POST /api/v1/projects/1/environments/1/backups?...storage_type=gdrive`)
    and verified runner transition to `failed` with explicit preflight
    diagnostic:
    - `Google Drive backup remote 'gdrive' is unavailable: rclone config not found ...`
    - confirms old opaque rclone section error is now intercepted early.

- Added unit tests:
  - `nest-api/src/drive-runtime/drive-runtime-config.service.spec.ts`
    - precedence (env > settings > default)
    - config missing, remote missing, remote present branches
  - `nest-api/src/gdrive/gdrive.service.spec.ts`
    - unavailable-remote response branch
    - base/shared dedupe branch
  - `nest-api/src/backups/backups.service.spec.ts`
    - google drive preflight failure branch (ensures upload not attempted)

- Targeted backend tests (expanded):
  - `cd nest-api && npm test -- src/drive-runtime/drive-runtime-config.service.spec.ts src/backups/backups.service.spec.ts src/gdrive/gdrive.service.spec.ts src/gdrive/gdrive.controller.spec.ts src/gdrive/gdrive.contract.spec.ts --runInBand`
    ✅
  - Result: 5 suites, 35 tests passed.

- Full backend suite:
  - `cd nest-api && npm test -- --runInBand` ✅
  - Result: 123 suites, 553 tests passed.

- Frontend verification:
  - `cd dashboard && npm run type-check` ✅
  - `cd dashboard && npm run build` ✅
  - `cd dashboard && npm run lint` ❌ blocked (missing ESLint config in repo)

## Notes

- Full pass condition is pending lint configuration availability for dashboard.
