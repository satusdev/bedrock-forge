# Task: Backup remote dump runtime hardening

Status: PASSED  
Created: 2026-03-10 16:20

## Task

Permanently harden remote backup DB dump execution to prevent shell/sudo
regressions, remove local path pollution in remote wp-cli discovery, and disable
implicit localhost fallback attempts in SSH mode.

## Context

- Backup failures show `sudo -n sh -lc` shell/profile incompatibility on
  CyberPanel hosts.
- Remote wp-cli attempts include local container path `/app`.
- DB target host attempts include implicit localhost variants causing noisy
  false failures.

## Plan

1. Replace sudo SSH dump command construction to avoid `sh -lc`.
2. Filter remote wp-cli path candidates to remove local/container paths.
3. Remove implicit localhost host fallback in SSH dump target resolution.
4. Add/adjust backups service tests for command construction and candidate
   selection.
5. Run targeted backup tests + backend build.

## Risks

- Some hosts may require sudo for dump command; fallback order must still
  preserve plain command path.
- Aggressive path filtering could skip legitimate paths if too strict.

## Verification

- `npm --prefix nest-api test -- src/backups/backups.service.spec.ts --runInBand`
- `npm --prefix nest-api run build`

## Result

- Replaced remote sudo dump execution wrapper to avoid `sudo -n sh -lc` and use
  `sudo -n env MYSQL_PWD=...` direct invocation.
- Removed local/container path pollution from remote wp-cli candidates (excludes
  `/app` and local backup workspace roots).
- Disabled implicit localhost fallback targets in SSH dump host selection; only
  explicit/config-resolved hosts are attempted.
- Preserved command-trace observability and failure aggregation semantics.

## Verification Results

- ✅
  `npm --prefix nest-api test -- src/backups/backups.service.spec.ts --runInBand`
- ✅ `npm --prefix nest-api test -- src/backups --runInBand`
- ✅ `npm --prefix nest-api run build`
