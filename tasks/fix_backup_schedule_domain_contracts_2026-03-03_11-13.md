# Task: Fix backup/schedule payload contracts + domain defaults

## Objective
Resolve reported API 400 errors and implement domain defaults:
- `property notes should not exist`
- `property config should not exist`
- malformed JSON edge handling observed in requests
- do not require manual domain expiry input; default via WHOIS/fallback
- when project domain is subdomain (e.g., `something.staging.ly`), ensure apex (`staging.ly`) exists in domains table if missing
- add/update unit tests for touched modules and verify passing

## Decisions Applied
- Frontend cleanup for unsupported schedule fields (`config`, legacy `notes`).
- Domain expiry resolution: input value if provided, otherwise WHOIS best-effort, otherwise fallback to +1 year.
- Project create keeps entered domain in project; additionally upserts apex domain record.
- Apex upsert default client: `client_id = 1` when project has no client.
- Test scope: touched modules only (`projects`, `domains`, `schedules`, `backups`) plus frontend build/type-check.

## Plan Checklist
- [x] Remove unsupported schedule payload fields from dashboard request builders/components.
- [x] Align dashboard schedule input types to backend DTO.
- [x] Make domain `expiry_date` optional at DTO boundary.
- [x] Implement expiry default resolution in domains service (WHOIS/fallback).
- [x] Add apex-domain extraction and project-create domain upsert logic.
- [x] Update/add unit tests for new behavior.
- [x] Run targeted backend tests.
- [x] Run dashboard type-check and build.
- [x] Mark task status `Passed`.

## Execution Log
- 2026-03-03 11:13: Task file created.
- 2026-03-03 11:24: Frontend fixes applied: removed schedule `config` payload emission, changed env backup POST body from `null` to `{}`, made domain form/service expiry optional.
- 2026-03-03 11:29: Backend changes applied: domain DTO optional expiry, WHOIS/fallback expiry resolution, project create apex-domain upsert with duplicate+client checks.
- 2026-03-03 11:36: Added/updated unit tests for `projects` and `domains`; targeted backend tests passed.
- 2026-03-03 11:38: Dashboard `type-check` and `build` passed.

## Status
`Passed`
