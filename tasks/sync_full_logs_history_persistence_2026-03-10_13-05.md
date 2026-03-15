# Task: Sync full logs viewer + history persistence

Status: COMPLETE  
Created: 2026-03-10 13:05 Completed: 2026-03-10 13:14

## Task

Add a full sync logs viewer, keep track of sync task history, and persist logs
so users can review what happened after close/reopen.

## Context

- Sync status cards currently show inline logs but no dedicated full-screen
  review.
- Users need full timeline visibility and persistent history per project.
- Existing backend status includes `logs`, but UI history persistence is
  minimal.

## Plan

1. Add shared local history storage helpers for sync task logs.
2. Add a dedicated sync logs modal with current task logs + recent task history.
3. Integrate modal and persistence into `SyncModal` and `SyncPanel`.
4. Persist/update history whenever sync status updates.
5. Validate with frontend build and targeted backend tests.

## Risks

- LocalStorage parsing/size edge cases.
- Duplicate history entries if upsert logic is incorrect.
- Divergence between active task status and stored snapshots.

## Verification

- ✅ `npm --prefix dashboard run build`
- ✅
  `npm --prefix api test -- src/sync/sync.service.spec.ts src/task-status/task-status.service.spec.ts`
