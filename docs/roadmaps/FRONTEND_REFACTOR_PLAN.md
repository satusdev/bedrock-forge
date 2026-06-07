# Frontend Refactor Plan

The frontend cleanup should make project tabs and settings pages smaller,
more predictable, and easier to extend. The goal is not a visual redesign. The
goal is better organization, lower repetition, and safer state management.

## Current Pain Points

- Large page/tab files mix API calls, derived data, dialogs, tables, and action
  state.
- Repeated TanStack Query patterns appear across project tabs and settings tabs.
- Job execution log state is handled differently across features.
- Several API response shapes are declared locally in page files.
- Some feature helpers are hidden inside large components and cannot be tested.

Largest targets found during inspection:

- `project-detail/PluginsTab.tsx`
- `project-detail/EnvironmentsTab.tsx`
- `project-detail/SyncTab.tsx`
- `project-detail/BackupsTab.tsx`
- `project-detail/ToolsTab.tsx`
- `settings/CustomPluginsSettings.tsx`
- `settings/IntegrationsTab.tsx`

## Target Feature Structure

Use this structure for project-detail feature areas:

```text
apps/web/src/pages/project-detail/<feature>/
├── <Feature>Tab.tsx
├── api.ts
├── hooks.ts
├── types.ts
├── utils.ts
└── components/
```

Keep route-level imports stable by re-exporting the tab from an `index.ts` when
needed.

## Phase 1: Query And Mutation Organization

Extract repeated API work first, before splitting JSX:

- Move endpoint calls into feature `api.ts`.
- Move TanStack Query hooks into feature `hooks.ts`.
- Define query keys in one place per feature.
- Standardize mutation success/error toast patterns.
- Keep invalidation close to the hook that owns the mutation.

Initial targets:

- Plugin scan/custom plugin actions.
- Environment CRUD and protected table browsing.
- Sync clone/push history and cancellation.
- Settings integrations and backup schedule actions.

Acceptance:

- Page components no longer call `api.get/post/put/delete` directly for the
  extracted feature.
- Existing type checks pass.
- No behavior change in request payloads or query keys unless documented.

## Phase 2: Component Extraction

Extract JSX into small components after data hooks are stable:

- Tables:
  - plugin table
  - GitHub catalog table
  - environment cards
  - sync history table
- Dialogs:
  - add plugin
  - edit environment
  - protected table picker
  - sync confirmation
- Panels:
  - execution progress/log panel wrapper
  - schedule cards
  - status summaries

Acceptance:

- Extracted components receive typed props and avoid fetching data directly.
- Components are named by domain behavior, not visual shape only.
- No component file should exceed 500 lines after extraction unless justified.

## Phase 3: Shared Operational UI

Create reusable UI for patterns repeated across project tabs:

- `JobExecutionCard` wrapping `ExecutionLogPanel`.
- `DangerConfirmDialog` usage for destructive environment actions.
- `EnvironmentSelect` for source/target environment selectors.
- `SourceStatusBadge` for Composer/GitHub/manual/source states.
- `OperationToolbar` for scan/add/update action bars.
- `ProtectedTablesNotice` for sync warnings.

Acceptance:

- Repeated job log card markup is removed from feature pages.
- Confirmation dialogs have consistent labels and pending states.
- Source/status badges use consistent colors and copy.

## Phase 4: Type Tightening

- Replace page-local `any[]` response types with feature types.
- Move cross-feature API response types to `packages/shared` only when API and
  web both need the same contract.
- Keep UI-only types inside the feature folder.
- Extract pure data derivation helpers, such as plugin catalog row building, into
  `utils.ts` and test them if they branch on several states.

Acceptance:

- No new production `any`.
- Derived row/state helpers are callable outside React.
- Type check passes after every feature extraction.

## Phase 5: Frontend Test Strategy

Current verification is mostly type-check based. Add tests where extraction
creates pure logic:

- plugin source/update classification.
- protected table manual validation.
- sync status derivation.
- settings form normalization.

Keep UI rendering tests limited to high-risk reusable components.

## Recommended Order

1. `PluginsTab`
2. `EnvironmentsTab`
3. `SyncTab`
4. `ToolsTab`
5. `BackupsTab`
6. Settings tabs

This order matches current file size and recent feature churn.
