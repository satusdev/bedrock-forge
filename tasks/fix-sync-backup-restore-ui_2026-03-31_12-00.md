# Task: Fix Sync + Backup/Restore History UI

**Date:** 2026-03-31  
**Status:** PASSED

## Problem

1. SyncProcessor stalls at "Reading source database credentials" — BullMQ lock
   expires (30s default) on long SSH operations, causing repeated
   restalls/retries.
2. Sync tab has no history table — can't view past sync jobs or their logs.
3. No `skipSafetyBackup` option for users who want to skip the mandatory
   pre-sync backup (e.g., when target has no GDrive folder configured).
4. Restore tab has no history section for past restore operations.
5. Sync operations don't appear in the Backups tab or anywhere easily
   discoverable per-project.

## Plan

1. Fix `lockDuration` in SyncProcessor (set 90 min like BackupProcessor).
2. Add `skipSafetyBackup: boolean` optional flag to SyncCloneDto, service
   (bypass GDrive validation when true), and processor (skip
   `createSafetyBackup` call with destructive warning log).
3. Add `job_type String?` column to `job_executions` table via Prisma migration.
4. Populate `job_type` in all services that create JobExecution rows (backups,
   sync, plugin-scans).
5. Update job-executions repository/controller to support `environment_ids`
   (comma-sep) and `job_type` filter params.
6. Update SyncTab: add skip-backup checkbox + destructive confirm dialog, add
   Sync History table with expandable execution logs.
7. Update RestoreTab: add Restore History section below backup list.

## Verification

- [ ] `pnpm -F worker build` passes
- [ ] `pnpm -F api build` passes
- [ ] `pnpm -F web build` passes
- [ ] `pnpm -F web lint` passes
- [ ] Migration applied successfully
