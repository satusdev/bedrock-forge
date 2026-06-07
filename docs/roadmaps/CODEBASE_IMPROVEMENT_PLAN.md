# Codebase Improvement Plan

This roadmap defines how to make Bedrock Forge easier to maintain without
changing product behavior during cleanup work. It is intentionally phased so
large refactors do not land together with feature fixes.

## Current State

The codebase is functional but several areas have grown beyond comfortable
maintenance size:

- Large frontend files combine data fetching, job state, dialogs, tables, and
  domain logic.
- Large worker processors combine orchestration, remote command construction,
  remote file handling, validation, and cache cleanup.
- API modules mostly follow `controller -> service -> repository`, but some
  controllers still carry inline DTOs and some services carry repeated job
  enqueue patterns.
- Shared contracts exist in `packages/shared`, but several API/web/worker
  response shapes are still duplicated locally.
- The worktree currently contains broad feature changes, so cleanup should start
  only after those changes are committed or intentionally grouped.

## Goals

- Keep behavior stable while reducing repeated code.
- Make feature code easier to find by organizing around domains.
- Move reusable API, job, and remote-command patterns into small tested helpers.
- Improve type safety by replacing local `any` response shapes with shared
  contracts or feature-local types.
- Document the standards clearly enough that future features follow the same
  shape.

## Non-Goals

- Do not redesign the product UI during this cleanup.
- Do not rewrite worker processors from scratch.
- Do not change database schema only for organization.
- Do not change public API behavior unless a phase explicitly calls it out and
  tests cover it.

## Phase 0: Stabilize

Before starting refactors:

- Commit or group the current dirty worktree.
- Run targeted checks for recently touched areas.
- Record any known failing tests or unstable features.
- Avoid formatting the whole repo until the refactor branch is clean.

Acceptance:

- `git status` is understood and no unrelated user changes are mixed into a
  cleanup commit.
- `pnpm --filter @bedrock-forge/web type-check`
- `pnpm --filter @bedrock-forge/api build`
- `pnpm --filter @bedrock-forge/worker build`

## Phase 1: Documentation And Boundaries

- Add this overview plus the frontend and backend roadmaps.
- Link the roadmaps from `docs/guides/DEVELOPMENT.md`.
- Define file-size thresholds for review:
  - Pages/tabs above 700 lines should be split.
  - Worker processors above 900 lines should be split by workflow.
  - Controllers with inline DTOs should move DTOs into `dto/`.
- Define acceptance gates for each later phase.

Acceptance:

- Roadmaps exist under `docs/roadmaps/`.
- Development guide links them.
- No runtime code changes are required for this phase.

## Phase 2: Shared Standards

- Create conventions for feature API hooks, query keys, job execution UI, worker
  job lifecycle, and remote command builders.
- Prefer small helpers with focused tests over broad abstraction.
- Update docs when a convention is adopted in code.

Acceptance:

- At least one representative frontend feature uses the new hook/query-key
  pattern.
- At least one worker processor uses a small extracted helper with tests.

## Phase 3: High-Impact Refactors

Prioritize high-churn and high-risk files:

- `apps/web/src/pages/project-detail/PluginsTab.tsx`
- `apps/web/src/pages/project-detail/EnvironmentsTab.tsx`
- `apps/web/src/pages/project-detail/SyncTab.tsx`
- `apps/worker/src/processors/sync/sync.processor.ts`
- `apps/worker/src/processors/security/security-server-scan.processor.ts`
- `apps/api/src/modules/settings/settings.controller.ts`
- `apps/api/src/modules/security/security.service.ts`

Acceptance:

- Each extracted module has a clear purpose and limited public surface.
- Tests/type checks pass after each feature-area refactor.
- No unrelated product behavior changes are included.

## Phase 4: Type And Contract Tightening

- Move cross-app types into `packages/shared`.
- Use Zod parsers for JSON job payloads and scan outputs where worker/API share
  contracts.
- Replace local `any[]` and broad `Record<string, unknown>` types in product
  code with named interfaces.
- Keep test-only casts where they simplify mocks, but isolate them in test
  helpers.

Acceptance:

- New API routes and worker jobs use shared payload contracts.
- Feature response types are exported from feature API modules or shared package.
- No new `any` in production code unless explicitly justified.

## Phase 5: Cleanup And Review

- Remove dead helper code and stale docs.
- Review dependency drift and generated artifacts.
- Add follow-up tickets for any remaining large files that were intentionally
  deferred.

Acceptance:

- Full build/test suite is run before merge.
- Roadmap status is updated with completed and deferred items.

## Phase Tracking

Use small commits grouped by phase:

- `docs: add codebase improvement roadmap`
- `refactor(web): extract plugin tab hooks`
- `refactor(worker): extract sync database helpers`
- `refactor(api): move settings dtos`
- `test(worker): cover sync helper extraction`

Do not combine unrelated frontend/backend refactors in the same commit unless
they share a contract change.
