# Task: Link Environment Save + Drive Picker Reliability

Status: IN_REVIEW  
Created: 2026-03-10 12:00

## Task

Fix Link Environment save failures (400 validation errors), persist WordPress
admin credentials during link flow, and correct Google Drive folder picker
path/search/default behavior.

## Context

- Link save currently sends unsupported fields (`backup_path`,
  `backup_folder_name`, `wp_admin_*`) to strict DTO validation.
- Drive picker default/initial path behavior is inconsistent and
  slash-containing input can fail to show folders.
- Existing credentials domain supports secure WP credential storage and quick
  login.

## Plan

1. Shape Link Environment submit payload to backend DTO contract only.
2. After successful environment creation, create credential record when admin
   username/password are present.
3. Keep admin email by appending to credential notes.
4. Add dashboard API helper for credentials create endpoint.
5. Update Drive picker initialization to use `initialFolderId` and configured
   default/base path.
6. Implement path-first navigation with automatic fallback to name search.
7. Verify with targeted tests/build/lint and mark pass/fail.

## Risks

- Environment create response shape may vary; extraction of new environment id
  must be defensive.
- Drive path strings and Drive folder IDs are mixed legacy values; navigation
  must remain backward-compatible.
- Frontend lint baseline may contain unrelated errors.

## Verification

- `pnpm --dir api test -- src/projects/projects.contract.spec.ts src/credentials/credentials.contract.spec.ts src/gdrive/gdrive.service.spec.ts src/gdrive/gdrive.controller.spec.ts src/gdrive/gdrive.contract.spec.ts --runInBand`
- `pnpm --dir dashboard build`
- `pnpm --dir dashboard lint`

## Proposal

- Files to modify:
  - `dashboard/src/components/LinkEnvironmentModal.tsx`
  - `dashboard/src/components/GoogleDriveFolderPicker.tsx`
  - `dashboard/src/services/api.ts`
- Architecture impact:
  - No backend schema/DTO relaxation.
  - Frontend request boundary enforces API contract.
  - Credential persistence reuses existing credentials domain endpoint.
- Dependencies:
  - Existing `/credentials/:projectServerId/credentials` endpoint.
  - Existing `/gdrive/status` and `/gdrive/folders` endpoints.

## Execution

1. Added typed frontend API helper for credential persistence:
   - `dashboard/src/services/api.ts`
   - New method `createEnvironmentCredential(envId, data)` posting to
     `/credentials/:envId/credentials`.
2. Fixed Link Environment payload contract and save behavior:
   - `dashboard/src/components/LinkEnvironmentModal.tsx`
   - Added explicit payload shaping for environment create DTO fields only.
   - Removed unsupported fields from submit payload (kept in UI state only):
     `backup_path`, `backup_folder_name`, `wp_admin_username`,
     `wp_admin_password`, `wp_admin_email`.
   - Added defensive environment id extraction from link response.
   - Added post-link credential creation when admin username/password are
     provided.
   - Mapped admin email into credential notes for traceability.
3. Fixed Drive picker initialization/search behavior:
   - `dashboard/src/components/GoogleDriveFolderPicker.tsx`
   - Uses `initialFolderId` and runtime `base_path` during initialization.
   - Added path-first behavior for slash-containing input with automatic
     fallback to query search when path returns empty.
   - Retained existing navigation and selection UX.

## Verification Results

- Frontend build:
  - `npm --prefix dashboard run build` ✅
- Frontend lint:
  - `npm --prefix dashboard run lint` ❌ blocked (ESLint config missing in repo)
- Backend targeted tests:
  - `npm --prefix api test -- src/projects/projects.contract.spec.ts src/credentials/credentials.contract.spec.ts src/gdrive/gdrive.service.spec.ts src/gdrive/gdrive.controller.spec.ts src/gdrive/gdrive.contract.spec.ts --runInBand`
    ✅
  - Result: 5 suites, 54 tests passed.

## Notes

- Full pass condition is pending lint configuration availability for dashboard.
