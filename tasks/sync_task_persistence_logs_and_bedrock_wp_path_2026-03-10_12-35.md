# Task: Sync task persistence, logs visibility, and Bedrock wp_path fallback

Status: COMPLETE  
Created: 2026-03-10 12:35 Completed: 2026-03-10 12:56

## Task

Fix Sync Environments UX so queued/running tasks remain visible after modal
close/reopen, show task logs/status details reliably, and harden backup DB dump
WP-CLI path fallback for Bedrock roots (`public_html` vs `public_html/web`).

## Context

- Sync modal/panel currently resets local task id state, causing active task
  status to disappear on close.
- Sync task status payload has only short message/progress and no accumulated
  log output in UI.
- Backup failures show WP-CLI attempts at `/web` paths where root path fallback
  should be attempted.

## Plan

1. Extend task status payload shape to support optional `logs` text.
2. Add sync service task log append helper and lifecycle logs.
3. Persist active sync task id per project in modal/panel and restore on reopen.
4. Render sync logs in modal/panel status cards.
5. Improve polling stop conditions for terminal statuses.
6. Add Bedrock `/web` -> root candidate fallback in backup WP-CLI dump path
   handling.
7. Add targeted tests and verify.

## Risks

- Existing tests may assume exact task status shape.
- LocalStorage key scope must avoid collisions between projects.
- Backup path fallback ordering must not regress standard installs.

## Verification

- ✅
  `npm --prefix api test -- src/sync/sync.service.spec.ts src/sync/sync.contract.spec.ts src/task-status/task-status.service.spec.ts src/backups/backups.service.spec.ts`
- ✅ `npm --prefix dashboard run build`
- ℹ️ `npm --prefix dashboard run lint` was not re-run in this cycle (previously
  blocked by missing ESLint config in dashboard workspace).
