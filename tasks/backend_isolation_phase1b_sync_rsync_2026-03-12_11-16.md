# Backend Isolation Phase 1B Sync/Rsync

- Status: IN_PROGRESS
- Started: 2026-03-12 11:16
- Scope: Real rsync execution for sync file tasks with SSH key handling and
  task-status logs

## Task

Replace simulated-only file sync traces with real `rsync` execution for
`sync.pull_files` and `sync.push_files`, while preserving queue/runner behavior
and current API contracts.

## Context

- `SyncService.processPendingTask` currently logs simulated command traces for
  all task kinds.
- User requires SSH-first operations, robust logs, and stable cron/runner
  behavior.
- Existing runners and task-status persistence are already present and should be
  reused.

## Plan

1. Extend sync server context to include SSH connection fields.
2. Add secure SSH key resolution (`server key path` -> `inline private key` ->
   `system key`).
3. Implement real rsync command execution for file pull/push task kinds.
4. Persist command-level logs/results into existing task-status logs.
5. Keep non-file sync kinds simulated to minimize regression surface.
6. Add/adjust tests and run targeted + full backend verification.

## Risks

- Missing `rsync` binary in runtime environment.
- Remote path differences (`Bedrock` vs non-Bedrock paths) can cause transfer
  failures.
- SSH password-only configs remain unsupported for non-interactive rsync.

## Verification

- `npm --prefix api test -- sync.service.spec.ts sync.runner.service.spec.ts`
- `npm --prefix api test -- sync.contract.spec.ts`
- `npm --prefix api test`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/sync/sync.service.ts`
- `api/src/sync/sync.service.spec.ts`
- `PROJECT.md`

## Execution Log

- Added real rsync execution path for `sync.pull_files` and `sync.push_files` in
  `sync.service.ts`.
- Added SSH key resolution precedence (`project_server/server key path` ->
  `server private key` -> `system key`).
- Added remote Bedrock/non-Bedrock path candidate resolution for
  `uploads/plugins/themes`.
- Added command/result log streaming to task-status logs for each rsync command.
- Kept non-file sync kinds simulated to minimize behavioral regression.
- Added sync service unit test covering routing to rsync executor branch.

## Verification Results

- ✅
  `npm --prefix api test -- sync.service.spec.ts sync.runner.service.spec.ts sync.contract.spec.ts`
- ✅ `npm --prefix api test` (123 suites, 576 tests passing)
- ✅ `npm --prefix api run build`
