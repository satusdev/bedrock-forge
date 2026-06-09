# Backend And Worker Refactor Plan

This roadmap covers `apps/api`, `apps/worker`, remote helper scripts, and shared
contracts. The backend cleanup should reduce repeated queue orchestration,
split large processors, and improve type safety without changing behavior.

## Current Pain Points

- Worker processors contain multiple workflows in single large files.
- Remote command construction is mixed with job orchestration and persistence.
- Several API services repeat `JobExecution` creation, queue add, and failure
  rollback behavior.
- Some controllers define DTOs inline.
- JSON payloads and Prisma JSON fields often require casts instead of named
  contracts.

Largest targets found during inspection:

- `apps/worker/src/processors/sync/sync.processor.ts`
- `apps/worker/src/processors/security/security-server-scan.processor.ts`
- `apps/worker/src/processors/report/report.processor.ts`
- `apps/worker/src/processors/backup/backup.processor.ts`
- `apps/worker/src/processors/wp-actions/wp-actions.processor.ts`
- `apps/api/src/modules/security/security.service.ts`
- `apps/api/src/modules/settings/settings.controller.ts`
- `apps/api/src/gateways/jobs.gateway.ts`

## Phase 1: API Queue Orchestration [COMPLETED]

Create a small API-side helper for queue-backed operations:

- [x] create `JobExecution`.
- [x] enqueue BullMQ job.
- [x] mark execution failed if enqueue fails.
- [x] return `{ jobExecutionId, jobId }` consistently.

Initial services to migrate:

- [x] sync
- [x] plugin scans
- [x] theme scans
- [x] security
- [x] wp actions
- [x] custom plugins

Acceptance:

- [x] Repeated try/catch queue-add blocks are reduced.
- [x] Existing response shapes remain compatible.
- [x] Service tests cover enqueue failure behavior.

## Phase 2: Worker Job Lifecycle [COMPLETED]

Create worker utilities for common job execution state:

- [x] mark active at start.
- [x] mark completed on success.
- [x] mark failed with `last_error`.
- [x] create `StepTracker`.
- [x] check cancellation where supported.

Do not hide domain logic inside the lifecycle helper.

Acceptance:

- [x] Processors still clearly show job dispatch behavior.
- [x] Repeated `jobExecution.update` blocks are reduced.
- [x] Existing job status behavior remains unchanged.

## Phase 3: Sync Processor Extraction [COMPLETED]

Split `sync.processor.ts` by workflow:

```text
processors/sync/
├── sync.processor.ts
├── sync-db.service.ts
├── sync-files.service.ts
├── sync-url-replace.service.ts
├── sync-cache.service.ts
├── sync-safety-backup.service.ts
└── sync.types.ts
```

Move and test:

- [x] protected table normalization and command flags.
- [x] MySQL dump/import command construction.
- [x] target DB preserve/drop-create decisions.
- [x] WP-CLI/PHP/SQL URL replacement command builders.
- [x] rsync/tar file sync behavior.
- [x] cache flush fallback behavior.

Acceptance:

- [x] `sync.processor.ts` becomes orchestration only.
- [x] Existing sync tests move to the owning service/helper.
- [x] Protected table tests remain intact.

## Phase 4: Security Processor Extraction [COMPLETED]

Split the unified security processor while keeping one BullMQ consumer for the
queue dispatch rule:

- [x] schedule scan due calculation.
- [x] alert polling.
- [x] file snapshot diffing.
- [x] server scan execution.
- [x] environment scan execution.
- [x] hardening execution.

Acceptance:

- [x] One `@Processor(QUEUES.SECURITY)` remains the dispatcher.
- [x] Domain services are injectable and tested independently.
- [x] No job type is silently ignored.

## Phase 5: Remote Script And Command Utilities [COMPLETED]

Create tested utilities for remote command patterns:

- [x] MySQL defaults-extra-file creation and cleanup.
- [x] WP-CLI command prefix and `--path` handling.
- [x] shell-safe table lists and file paths.
- [x] remote helper script push/execute/cleanup.
- [x] Composer command builders.

Keep PHP scripts for server-side work where they are the safest option, but
document their CLI arguments and add script-level tests when possible.

Acceptance:

- [x] Command strings are built in small pure functions where practical.
- [x] Tests assert command output for dangerous paths such as sync, backup, and
      plugin management.
- [x] Cleanup commands are still best-effort and logged.

## Phase 6: API Module Cleanup [COMPLETED]

- [x] Move inline controller DTOs into `dto/`.
- [x] Keep controllers thin: validate, authorize, call service.
- [x] Keep Prisma access in repositories.
- [x] Split broad services by independent domain behavior:
  - [x] settings integrations vs billing vs advanced settings.
  - [x] security scan orchestration vs findings vs schedules vs reporting.
- [x] Add repository methods instead of embedding Prisma query construction in
  services.

Acceptance:

- [x] Controllers no longer contain helper functions or large DTO blocks.
- [x] Services do not import `PrismaService`.
- [x] Module tests still pass after each split.

## Phase 7: Shared Contracts [COMPLETED]

Expand `packages/shared` only for contracts used by more than one app:

- [x] job payload schemas.
- [x] scan output shapes.
- [x] common settings response shapes.
- [x] monitor/lighthouse result summaries.
- [x] notification event payloads.

Use Zod parsers for worker job payloads and JSON fields that cross process
boundaries.

Acceptance:

- [x] Worker processors parse job payloads before executing.
- [x] API and web share response types where contracts are stable.
- [x] Unsafe casts are reduced in production code.

## Verification Matrix

Run these after each matching phase:

```bash
pnpm --filter @bedrock-forge/api build
pnpm --filter @bedrock-forge/worker build
pnpm --filter @bedrock-forge/worker test -- sync.processor.spec.ts
pnpm --filter @bedrock-forge/api test -- security
pnpm --filter @bedrock-forge/api test -- settings
```

Use targeted tests first, then full `pnpm test` before merging larger backend
cleanup branches.
