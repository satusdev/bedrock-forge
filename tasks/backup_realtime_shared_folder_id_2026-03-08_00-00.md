# Task: Backup Realtime + Shared Folder ID + Remote Preflight

## Status

- In Progress (lint blocked by missing dashboard ESLint config)

## Context

- Backup uploads can fail late when rclone remote section is missing.
- Backup log/status surfaces currently rely on polling.
- Shared-with-me selection must persist/use raw folder IDs.

## Plan

1. Add backup upload preflight for configured rclone remote.
2. Emit websocket backup lifecycle/log updates from backup execution.
3. Support folder-id based upload destination semantics.
4. Wire dashboard backup views to websocket updates with polling fallback.
5. Add/adjust backend/frontend tests and run verification.

## Risks

- Event payload compatibility with existing websocket listeners.
- Folder-id/path mixed legacy values.
- Runner + direct run path behavior parity.

## Verification

- Backend: targeted backup/gdrive specs + full test suite.
- Frontend: build + lint + manual smoke for backup updates.

## Implementation Notes

- Added Google Drive remote preflight in backup execution before upload:
  - validates config path existence and file type
  - validates configured section `[FORGE_BACKUP_GDRIVE_REMOTE]`
  - returns actionable failure details in backup logs/API error
- Added websocket backup update broadcasts from backup execution lifecycle:
  - `backup_update` events for status changes and incremental log lines
  - emitted for running/completed/failed and log appends
- Added folder-ID aware upload behavior:
  - if destination looks like Google folder ID, upload uses
    `remote,root_folder_id=<id>:` target semantics
  - preserves year/month partitioning under the selected folder root
  - retains path-based behavior for legacy path values
- Updated Drive folder listing payload to include ID-aware entries:
  - `id`, `name`, `path`, `source`
  - supports picker persistence of raw folder IDs
- Updated dashboard backup views to consume websocket events:
  - `TaskLogModal` streams log/status updates via websocket
  - `Backups` page refreshes list on `backup_update` events
  - `ProjectDetail` backups data refreshes on project-matching events
  - polling remains fallback when websocket is disconnected

## Verification Results

- `nest-api`:
  `npm test -- backups.service.spec.ts gdrive.service.spec.ts gdrive.controller.spec.ts gdrive.contract.spec.ts`
  ✅ (27/27)
- `nest-api`: `npm test -- backups.runner.service.spec.ts` ✅ (5/5)
- `dashboard`: `npm run build` ✅
- `dashboard`: `npm run lint` ❌ blocked
  (`ESLint couldn't find a configuration file`)
