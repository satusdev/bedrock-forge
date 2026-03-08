# Background Runners P5 — Backup Artifact Cleanup (Dry-Run First)

Date: 2026-03-04 13:21 Branch: chore/split-commits-plan Status: Passed

## Scope

- Add backup artifact cleanup behavior after retention pruning.
- Keep cleanup opt-in and dry-run by default.
- Add focused tests and compile verification.

## Checklist

- [x] Extended retention prune return payload with `storage_type` and
      `storage_path`.
- [x] Added `BackupsService.cleanupPrunedLocalArtifacts(pruned, dryRun)` with
      root-path guardrails.
- [x] Added file cleanup env controls in `BackupsRunnerService`.
- [x] Added maintenance cleanup execution path and structured cleanup log
      output.
- [x] Updated backup service and runner specs.
- [x] Ran focused Jest suites (2/2 passed).
- [x] Ran `npm run build` (passed).

## Guardrails

- Cleanup runs only when `BACKUP_FILE_CLEANUP_ENABLED=true`.
- Cleanup defaults to simulation mode via `BACKUP_FILE_CLEANUP_DRY_RUN=true`.
- Only `storage_type='local'` artifacts are considered.
- Only artifacts under `FORGE_BACKUP_ROOT` are eligible.
- Unsafe paths are skipped and counted.

## Execution Log

1. Updated retention prune SQL to return path/type metadata for deleted records.
2. Implemented safe artifact cleanup helper with dry-run, missing-file, and
   failure counters.
3. Wired cleanup call into maintenance runner after retention pruning.
4. Added tests for cleanup guardrails and retention+cleanup maintenance path.
5. Ran: `npm test -- backups.service.spec.ts backups.runner.service.spec.ts`
   - Result: 2 suites passed, 20 tests passed.
6. Ran: `npm run build`
   - Result: passed.

## Environment Flags

- `BACKUP_FILE_CLEANUP_ENABLED` (default: `false`)
- `BACKUP_FILE_CLEANUP_DRY_RUN` (default: `true`)
