# Task: Invoices Client-Search, Plugin CRUD, Sync Push, Codebase Consolidation

**Date:** 2026-04-01  
**Status:** IN PROGRESS

---

## Context

Three feature gaps and one architecture violation identified:

1. **Invoice dialog** — single-project mode uses raw numeric ID input. No client
   search or project picker.
2. **Plugin management** — read-only filesystem scanner only. No `composer.json`
   awareness for Bedrock sites. No add/remove/update operations.
3. **Sync push** — `processPush()` is a stub (logs "not implemented", exits).
4. **Architecture violation** — `InvoicesService` directly injects and uses
   `PrismaService` for project lookups. Violates the rule: "Services never
   import or use PrismaClient or PrismaService."

---

## Plan

### Phase 1 — Invoice: Client-First Selection (this session)

**Backend:**

- Add `findProjectWithPackages(id)` and
  `findActiveProjectsWithPackages(clientId?, projectIds?)` to
  `InvoicesRepository` — move project Prisma access off the service
- Fix `InvoicesService`: remove `PrismaService` injection, use repo methods
- Add `GenerateClientInvoiceDto` + `POST /invoices/generate-client` endpoint
  (client-scoped generation with optional project subset)
- Add `client_id` filter to `GET /projects` (new `QueryProjectsDto`, update
  repository `where` clause)

**Frontend:**

- Rewrite `GenerateDialog` in `InvoicesPage.tsx`:
  - Mode toggle: "All Projects" | "By Client"
  - By Client: searchable client `<Select>` → project checklist → year →
    Generate
  - Native HTML checkboxes (no new shadcn deps required)
  - Shows created/skipped counts in success toast

### Phase 2 — Plugin CRUD via composer.json (this session)

**Worker scripts:**

- Enhance `plugin-scan.php`: add `is_bedrock` flag and
  `managed_by_composer`/`composer_constraint` per plugin
- New `composer-manager.php`: `read | add | remove | update | update-all`
  actions (restricted to `wpackagist-plugin/*`)

**Shared:**

- New job types: `PLUGIN_ADD`, `PLUGIN_REMOVE`, `PLUGIN_UPDATE`,
  `PLUGIN_UPDATE_ALL`
- New payload schemas: `PluginManagePayload`

**Backend:**

- New endpoints:
  `POST/DELETE/PUT /plugin-scans/environment/:envId/plugins[/:slug]`
- New service method: `enqueuePluginOp(envId, action, slug?, version?)`
- New worker processor: `plugin-manager.processor.ts`

**Frontend:**

- Enhance `PluginsTab.tsx`: Bedrock sites show Add/Remove/Update buttons +
  "Update All"; standard WP sites remain read-only

### Phase 3 — Sync Push Implementation

- Implement `processPush()` in `sync.processor.ts`:
  - `scope: database` — reverse clone (source→target with URL replacement)
  - `scope: files` — rsync relay via worker memory (pull→push)
  - `scope: both` — files first then database
- Update `SyncPushPayloadSchema` and `SyncPushDto` to match

### Phase 4 — Consolidation

- Fix Prisma schema comment on `PluginScan.plugins` to match actual `PluginInfo`
  structure
- Replace raw ID input in project edit dialog client selector with proper
  searchable flow
- Add invoice detail expandable row (hosting amount, support amount, package
  snapshots, notes)

---

## Risks

- `composer` must be on `$PATH` on Bedrock servers — processor should fail
  gracefully if not found
- Sync push file relay for large sites could be slow — use streaming transfer,
  not in-memory buffer
- Removing `PrismaService` from `InvoicesService` constructor changes DI graph —
  module does not explicitly list `PrismaService` so this is a clean removal

---

## Verification

- `cd /home/nadbad/Work/Wordpress/bedrock-forge && pnpm build` — must pass with
  zero type errors
- PHP scripts are syntactically valid: `php -l`

---

## Progress

- [ ] Phase 1 backend (repository fix, new endpoint, projects filter)
- [ ] Phase 1 frontend (GenerateDialog rewrite)
- [ ] Phase 2 backend (plugin CRUD endpoints + processor)
- [ ] Phase 2 frontend (PluginsTab enhancements)
- [ ] Phase 3 (sync push implementation)
- [ ] Phase 4 (consolidation)
