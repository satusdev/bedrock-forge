# Import Project: Server Scanner + Bulk Import

**Status:** PASSED **Date:** 2026-03-24

## Task

Replace the single-path manual import dialog with a server scanner that
auto-discovers all WordPress/Bedrock projects under `/home/*/public_html` via
one SSH command, presents a bulk-selection table with per-row client assignment,
and persists DB credentials (encrypted) during import.

## Plan

### Backend

1. `GET /servers/:id/scan-projects` — SSH scan endpoint + new DTO
2. `ServersService.scanProjects()` — single shell command over SSH, delimited
   output parser, dedup via DB lookup
3. `ServersRepository.findExistingEnvironmentPaths()` — dedup query
4. `BulkImportProjectsDto` — array of import entries with optional DB
   credentials
5. `POST /projects/import-bulk` — controller + service + repository
6. `ProjectsRepository.importBulk()` — single transaction, creates Project +
   Environment + WpDbCredentials (encrypted)
7. Fix existing `importFromServer()` to also persist WpDbCredentials
8. Inject `EncryptionService` into `ProjectsRepository`

### Frontend

1. New `ImportFromServerDialog` component extracted to its own file
2. Step 1 — Server select + Scan button
3. Step 2 — Scan results table: checkbox, editable name, path, URL, type badge,
   DB detected, client dropdown
4. Step 3 — Import progress/results with links to created projects

## Verification

- `POST /servers/:id/scan-projects` returns correct ScannedProject[] with
  alreadyImported flags
- `POST /projects/import-bulk` creates Project + Environment + WpDbCredentials
  in one transaction
- `pnpm build` and `pnpm lint` pass
