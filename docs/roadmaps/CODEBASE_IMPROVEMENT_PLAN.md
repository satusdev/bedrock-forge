# Codebase Improvement Plan

This roadmap defines how to make Bedrock Forge easier to maintain without
changing product behavior during cleanup work. It is intentionally phased so
large refactors do not land together with feature fixes.

## Current State

The codebase is functional, but several areas have grown beyond comfortable
maintenance size. The largest current hotspots are:

- `apps/web/src/pages/project-detail/PluginsTab.tsx` — about 2,744 lines.
- `apps/web/src/pages/project-detail/EnvironmentsTab.tsx` — about 1,910
  lines.
- `apps/web/src/pages/project-detail/SyncTab.tsx` — about 1,094 lines.
- `apps/web/src/pages/project-detail/BackupsTab.tsx` — about 1,039 lines.
- `apps/web/src/pages/project-detail/ToolsTab.tsx` — about 961 lines.
- `apps/worker/src/processors/sync/sync.processor.ts` — about 3,500 lines.
- `apps/worker/src/processors/security/security-server-scan.processor.ts` —
  about 1,228 lines.
- `apps/api/src/modules/security/security.service.ts` — about 878 lines.

These files are large because they combine several responsibilities:

- Frontend tabs mix data fetching, job state, dialogs, tables, form
  normalization, and domain logic.
- Worker processors mix orchestration, remote command construction, remote file
  handling, validation, and cache cleanup.
- API modules mostly follow `controller -> service -> repository`, but some
  controllers still carry inline DTOs and some services carry repeated job
  enqueue patterns.
- Shared contracts exist in `packages/shared`, but several API/web/worker
  response shapes are still duplicated locally.

## Status Snapshot

The current worktree contains active sync-protection changes in worker, API,
web, tests, and usage docs. Do not start broad refactors until those changes are
committed or intentionally included in the same branch. In particular,
`sync.processor.ts` should not be split until the protected-post-type sync
behavior and tests are stable.

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

## Phase 0: Stabilize Current Work [COMPLETED]

Before starting refactors, make the working state explicit:

- [x] Commit or group the current dirty worktree.
- [x] Run targeted checks for recently touched areas.
- [x] Record any known failing tests or unstable features.
- [x] Avoid formatting the whole repo until the refactor branch is clean.

Acceptance:

- [x] `git status` is understood and no unrelated user changes are mixed into a
      cleanup commit.
- [x] `pnpm --filter @bedrock-forge/web type-check`
- [x] `pnpm --filter @bedrock-forge/api build`
- [x] `pnpm --filter @bedrock-forge/worker build`

## Phase 1: Documentation And Boundaries [COMPLETED]

This phase is mostly complete: the overall, frontend, and backend/worker
roadmaps exist under `docs/roadmaps/`, and `docs/guides/DEVELOPMENT.md` links
to them. Keep this phase current as new cleanup work lands.

Maintain these review thresholds:

- [x] Pages/tabs above 700 lines should be split.
- [x] Worker processors above 900 lines should be split by workflow.
- [x] Controllers with inline DTOs should move DTOs into `dto/`.

Acceptance:

- [x] Roadmaps exist under `docs/roadmaps/`.
- [x] Development guide links them.
- [x] Each later refactor phase has a clear acceptance gate.
- [x] No runtime code changes are required for documentation-only updates.

## Phase 2: Shared Standards [PARTIALLY COMPLETED]

Establish conventions by extracting one representative feature at a time.
Prefer small helpers with focused tests over broad abstractions.

Initial standards to create through code:

- [x] Frontend feature API modules, query keys, hooks, and mutation toast patterns.
- [x] Job execution UI wrappers around `ExecutionLogPanel`.
- [x] Worker job lifecycle helpers for active/completed/failed execution status.
- [x] Remote command builders for MySQL, WP-CLI, rsync, tar, and script execution.

Acceptance:

- [x] At least one representative frontend feature uses feature-local `api.ts`,
      `hooks.ts`, `types.ts`, and typed components.
- [x] At least one worker processor uses a small extracted helper or service with
      focused tests.
- [x] New conventions are documented in the matching roadmap or development guide.

## Phase 3: High-Impact Refactors [IN PROGRESS]

Prioritize high-churn and high-risk files, but do not start with the riskiest
worker extraction while sync behavior is still settling.

Recommended order:

- [x] `apps/web/src/pages/project-detail/PluginsTab.tsx` [COMPLETED]
- [x] `apps/web/src/pages/project-detail/EnvironmentsTab.tsx` [COMPLETED]
- [x] `apps/web/src/pages/project-detail/SyncTab.tsx`
- [x] `apps/web/src/pages/project-detail/BackupsTab.tsx`
- [x] `apps/web/src/pages/project-detail/ToolsTab.tsx`
- [x] `apps/worker/src/processors/sync/sync.processor.ts` [COMPLETED]
- [x] `apps/worker/src/processors/security/security-server-scan.processor.ts` [COMPLETED]
- [x] `apps/api/src/modules/settings/settings.controller.ts`
- [x] `apps/api/src/modules/security/security.service.ts` [COMPLETED]

Use the detailed frontend/backend plans for exact extraction shapes:

- [Frontend refactor plan](FRONTEND_REFACTOR_PLAN.md)
- [Backend and worker refactor plan](BACKEND_REFACTOR_PLAN.md)

Acceptance:

- Each extracted module has a clear purpose and limited public surface.
- Tests/type checks pass after each feature-area refactor.
- No unrelated product behavior changes are included.
- File size drops because responsibilities moved to typed hooks, components, or
  helpers, not because logic was deleted.

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
- Update this roadmap with completed phases and deferred work.

Acceptance:

- Full build/test suite is run before merge.
- Roadmap status is updated with completed and deferred items.

## Recommended First Workstream

Start with `PluginsTab.tsx`. It is the largest frontend file and is lower
operational risk than changing database sync internals.

Target outcome:

- Move plugin API calls and query keys into a feature-local API/hooks layer.
- Extract plugin tables, dialogs, and status helpers into typed modules.
- Keep request payloads, query behavior, and UI copy stable.
- Verify with `pnpm --filter @bedrock-forge/web type-check`.

After that, move to `EnvironmentsTab.tsx`. It recently changed for protected
post type sync, so refactor only after the current sync-protection branch is
committed or intentionally grouped.

Defer `sync.processor.ts` extraction until its protected table and protected
post type tests are stable and passing on the cleanup branch.

## Phase Tracking

Use small commits grouped by phase:

- `docs: add codebase improvement roadmap`
- `refactor(web): extract plugin tab hooks`
- `refactor(worker): extract sync database helpers`
- `refactor(api): move settings dtos`
- `test(worker): cover sync helper extraction`

Do not combine unrelated frontend/backend refactors in the same commit unless
they share a contract change.
