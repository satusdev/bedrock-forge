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

## Phase 1: API Queue Orchestration

Create a small API-side helper for queue-backed operations:

- create `JobExecution`.
- enqueue BullMQ job.
- mark execution failed if enqueue fails.
- return `{ jobExecutionId, jobId }` consistently.

Initial services to migrate:

- sync
- plugin scans
- theme scans
- security
- wp actions
- custom plugins

Acceptance:

- Repeated try/catch queue-add blocks are reduced.
- Existing response shapes remain compatible.
- Service tests cover enqueue failure behavior.

## Phase 2: Worker Job Lifecycle

Create worker utilities for common job execution state:

- mark active at start.
- mark completed on success.
- mark failed with `last_error`.
- create `StepTracker`.
- check cancellation where supported.

Do not hide domain logic inside the lifecycle helper.

Acceptance:

- Processors still clearly show job dispatch behavior.
- Repeated `jobExecution.update` blocks are reduced.
- Existing job status behavior remains unchanged.

## Phase 3: Sync Processor Extraction

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

- protected table normalization and command flags.
- MySQL dump/import command construction.
- target DB preserve/drop-create decisions.
- WP-CLI/PHP/SQL URL replacement command builders.
- rsync/tar file sync behavior.
- cache flush fallback behavior.

Acceptance:

- `sync.processor.ts` becomes orchestration only.
- Existing sync tests move to the owning service/helper.
- Protected table tests remain intact.

## Phase 4: Security Processor Extraction

Split the unified security processor while keeping one BullMQ consumer for the
queue dispatch rule:

- schedule scan due calculation.
- alert polling.
- file snapshot diffing.
- server scan execution.
- environment scan execution.
- hardening execution.

Acceptance:

- One `@Processor(QUEUES.SECURITY)` remains the dispatcher.
- Domain services are injectable and tested independently.
- No job type is silently ignored.

## Phase 5: Remote Script And Command Utilities

Create tested utilities for remote command patterns:

- MySQL defaults-extra-file creation and cleanup.
- WP-CLI command prefix and `--path` handling.
- shell-safe table lists and file paths.
- remote helper script push/execute/cleanup.
- Composer command builders.

Keep PHP scripts for server-side work where they are the safest option, but
document their CLI arguments and add script-level tests when possible.

Acceptance:

- Command strings are built in small pure functions where practical.
- Tests assert command output for dangerous paths such as sync, backup, and
  plugin management.
- Cleanup commands are still best-effort and logged.

## Phase 6: API Module Cleanup

- Move inline controller DTOs into `dto/`.
- Keep controllers thin: validate, authorize, call service.
- Keep Prisma access in repositories.
- Split broad services by independent domain behavior:
  - settings integrations vs billing vs advanced settings.
  - security scan orchestration vs findings vs schedules vs reporting.
- Add repository methods instead of embedding Prisma query construction in
  services.

Acceptance:

- Controllers no longer contain helper functions or large DTO blocks.
- Services do not import `PrismaService`.
- Module tests still pass after each split.

## Phase 7: Shared Contracts

Expand `packages/shared` only for contracts used by more than one app:

- job payload schemas.
- scan output shapes.
- common settings response shapes.
- monitor/lighthouse result summaries.
- notification event payloads.

Use Zod parsers for worker job payloads and JSON fields that cross process
boundaries.

Acceptance:

- Worker processors parse job payloads before executing.
- API and web share response types where contracts are stable.
- Unsafe casts are reduced in production code.

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
