# Task: Backup Credential Fix, Scanner Stability, Frontend Cleanup

**Date:** 2026-03-14  
**Status:** IN PROGRESS

## Problem

1. **Backup DB dump fails** — WP-CLI tries `/public_html/web/` (not a WP install
   for Bedrock). Falls through to mysqldump with `[saved]` credentials that are
   stale → Access Denied. Remote `.env` resolution only searches 1 level up from
   the candidate path, missing the Bedrock project root `.env` (2 levels above
   `web/wp`).

2. **Credential ordering** — `saved` (stale DB credentials) is tried across ALL
   connection×binary combos before `remote` (fresh `.env` values) is attempted.

3. **UI noise** — DDEV start/stop, Git Pull, and non-functional Quick Actions
   buttons clutter ProjectOverview, ProjectDetail, and ProjectDetailLayout.

## Plan

### Backend

1. `detectRemoteConfigSource`: extend `.env` search to
   `dirname(dirname(candidatePath))` (2 levels up)
2. `readDatabaseConfigFromRemotePath`: same depth extension for `envCandidates`
3. `buildDatabaseCredentialCandidates`: remote-first when complete, saved as
   fallback
4. Same depth fix for local `readDatabaseConfigFromPath`

### Frontend

- Remove DDEV/GitPull/Quick Actions from ProjectOverview, ProjectDetail,
  ProjectDetailLayout
- Delete dead LocalDevPanel.tsx
- Clean ddev_status from types, hooks, api, mock data

## Verification

- `cd api && npm test -- --runInBand` — 629+ tests pass
- `cd frontend && npx tsc --noEmit` — zero TS errors
- `cd frontend && npm run build` — clean build
