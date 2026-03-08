# ORM Full Stability Migration (2026-03-02 09:05)

## Objective

Eliminate high-risk raw SQL in A/B modules by phased Prisma ORM migration,
prioritizing correctness, deterministic behavior, and transactional integrity.

## Status

- [x] Planned
- [x] In Progress
- [x] Passed

## Task List

1. [x] Phase 1 chunk A: migrate `InvoicesService` from raw SQL to Prisma ORM
       with race-safe invoice-number generation.
2. [x] Update invoice unit tests to Prisma delegate mocks and validate behavior
       parity.
3. [x] Run targeted invoice tests and Nest build; fix issues.
4. [x] Phase 1 chunk B: migrate `SchedulesService` remaining write paths
       (`create/update/delete`) to Prisma ORM.
5. [x] Update schedules unit tests for write-path ORM migration and verify
       contract/controller specs remain green.
6. [x] Phase 1 chunk C: migrate `DomainsService` from raw SQL to Prisma ORM.
7. [x] Update domains unit/contract/controller tests to Prisma delegate mock
       behavior and validate response parity.
8. [x] Phase 1 chunk D: migrate `UsersService` from raw SQL to Prisma ORM.
9. [x] Update users unit/contract/controller tests to Prisma delegate mock
       behavior and verify authorization/permissions paths.
10. [x] Phase 1 chunk E: migrate contained raw-SQL modules (`GithubService`,
        `SyncService` project-server lookup, `ClientAuthService`, and
        `ImportProjectsService`) to Prisma delegates.
11. [x] Phase 1 chunk F: migrate `ClientsService` and `TagsService` from raw SQL
        to Prisma delegates.
12. [x] Phase 1 chunk G: migrate `SubscriptionsService` from raw SQL to Prisma
        delegates.
13. [x] Phase 1 chunk H: migrate `ProjectsService` high-density raw SQL
        hotspots.
14. [x] Repeat verify loop per chunk and log pass/fail.

## Logs

- Initialized full migration task file.
- Migrated `InvoicesService` off raw SQL for
  list/get/create/update/delete/send/record-payment and stats paths.
- Introduced race-safe invoice numbering using create-then-format with invoice
  `id` inside a transaction.
- Migrated `SchedulesService` remaining raw SQL write paths to Prisma delegates
  (`projects.findFirst`, `project_servers.findFirst`,
  `backup_schedules.create/update/delete`).
- Added typed enum normalization and deterministic 400 errors for invalid
  schedule write enums.
- Verification:
  - `npm test -- src/invoices/invoices.service.spec.ts` (pass)
  - `npm test -- src/invoices/invoices.service.spec.ts src/schedules/schedules.service.spec.ts src/schedules/schedules.controller.spec.ts src/schedules/schedules.contract.spec.ts`
    (pass)
  - `npm run build` (pass)
- Migrated `DomainsService` list/get/create/update/delete/renew/whois/stats off
  raw SQL to Prisma delegates (`domains`, `clients`, `ssl_certificates`).
- Preserved permissive status filtering behavior and domain response envelope
  contracts while removing SQL ambiguity/injection surfaces.
- Verification:
  - `npm test -- src/domains/domains.service.spec.ts src/domains/domains.controller.spec.ts src/domains/domains.contract.spec.ts`
    (pass)
  - `npm run build` (pass)
- Migrated `UsersService` off raw SQL for list/get/create/update/delete,
  password reset, role assignment, and permissions resolution.
- Replaced join-heavy SQL lookups with Prisma relation includes and
  delegate-based existence checks while preserving API response contract.
- Verification:
  - `npm test -- src/users/users.service.spec.ts src/users/users.controller.spec.ts src/users/users.contract.spec.ts`
    (pass)
  - `npm run build` (pass)
- Migrated `GithubService` token upsert/status/disconnect paths from raw SQL to
  `oauth_tokens` delegates (`upsert`, `findFirst`, `deleteMany`).
- Migrated `SyncService` project-server ownership lookup from join SQL to
  relation-scoped `project_servers.findFirst` with selected `servers` fields.
- Migrated `ClientAuthService` email/client lookups and login timestamp update
  from raw SQL to `client_users`/`clients` delegates.
- Migrated `ImportProjectsService` server/project/project-server/monitor flows
  from raw SQL to delegates (`servers`, `projects`, `project_servers`,
  `monitors`) with enum-safe environment typing.
- Updated corresponding service specs to delegate-mock shape and removed raw-SQL
  assertion coupling.
- Verification:
  - `npm test -- src/github/github.service.spec.ts src/sync/sync.service.spec.ts src/client-auth/client-auth.service.spec.ts src/import-projects/import-projects.service.spec.ts`
    (pass)
  - `npm run build` (pass)
- Migrated `ClientsService` list/detail/create/update/delete and assignment
  flows from raw SQL to Prisma delegates (`clients`, `projects`, `invoices`).
- Migrated `TagsService` CRUD/seed/assignment and linked lookup flows from raw
  SQL to Prisma delegates (`tags`, `project_tags`, `client_tags`,
  `server_tags`), including delegate-based usage count recalculation.
- Updated clients/tags unit specs to delegate-mock shape.
- Verification:
  - `npm test -- src/clients/clients.service.spec.ts src/tags/tags.service.spec.ts`
    (pass)
  - `npm run build` (pass)
- Migrated `SubscriptionsService` from raw SQL to Prisma delegates for
  list/detail/create/update/cancel/renew/invoice/stats flows, including
  owner-scoped relation filters and enum validation helpers.
- Updated `subscriptions` unit spec mocks to delegate shape.
- Regenerated Prisma client to align generated types with schema fields used by
  the migration.
- Verification:
  - `npx prisma generate` (pass)
  - `npm test -- src/subscriptions/subscriptions.service.spec.ts` (pass)
  - `npm run build` (pass)
- Migrated a first `ProjectsService` core sub-chunk from raw SQL to Prisma
  delegates, covering project-name/tag lookups, create/delete, WHOIS refresh,
  environment upsert checks, GitHub integration update, repository status/pull,
  bulk start flow, security scan, and clone orchestration helpers.
- Updated `projects` service unit specs to delegate-mock shape for the migrated
  methods and fixed mock literal regressions introduced during refactor.
- Verification:
  - `npm test -- src/projects/projects.service.spec.ts` (pass)
  - `npm run build` (pass)
- Residual work remains in `ProjectsService` environment/backup/drive
  compatibility paths (current raw SQL matches in file: 29), so chunk H stays
  open for follow-on sub-chunks.
- Migrated `ProjectsService` environment/project-server compatibility block off
  raw SQL to delegates for `listProjectServers`, `linkEnvironment`,
  `updateEnvironment`, and `unlinkEnvironment`.
- Added enum-safe environment normalization for environment link/update flows
  and preserved existing not-found/conflict behavior.
- Updated `projects` service unit specs for delegate-based mocks in environment
  CRUD paths.
- Verification:
  - `npm test -- src/projects/projects.service.spec.ts` (pass)
  - `npm run build` (pass)
- Residual raw SQL in `ProjectsService` now stands at 14 matches, mostly in
  backups/drive/index and remote-project compatibility read paths.
- Migrated `ProjectsService` backups/drive compatibility block off raw SQL for
  `getProjectBackups`, `getEnvironmentBackups`,
  `getProjectBackupDownloadMetadata`, `getProjectDriveRow`,
  `updateProjectDriveSettings`, and `getProjectDriveBackupIndex`.
- Replaced backup list/count/index joins with delegate-based
  `backups.findMany/count`, `project_servers.findMany`, and `projects`
  `findUnique/update` while preserving pagination and response envelopes.
- Updated `projects` service unit specs for backup/drive delegate mock flows.
- Verification:
  - `npm test -- src/projects/projects.service.spec.ts` (pass)
  - `npm run build` (pass)
- Residual raw SQL in `ProjectsService` now stands at 3 matches (remote projects
  feed + two project-name compatibility read helpers).
- Migrated final `ProjectsService` raw SQL helpers to delegates:
  `getRemoteProjects`, `getProjectServerById`, and `getProjectServerLink`.
- Updated `projects` service unit specs for delegate-based remote feed and
  project-server link mock flows.
- Verification:
  - `npm test -- src/projects/projects.service.spec.ts` (pass)
  - `npm run build` (pass)
  - `grep -E "\$queryRaw|\$executeRaw" nest-api/src/projects/projects.service.ts`
    (no matches)
- `ProjectsService` chunk H is complete; raw SQL migration hotspots listed in
  this plan are now fully migrated.
