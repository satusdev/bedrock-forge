# Task: Sync Safety, Execution Logging, Activity Page

**Created:** 2026-03-29 14:00 **Status:** IN PROGRESS

---

## Task

Fix sync pipeline, add comprehensive execution logging across all job types, and
build a global Activity page so all job actions (backup, restore, sync, plugin
scan, scheduled) can be tracked and reviewed.

---

## Scope

1. **Generic `/job-executions` API module** — move execution log endpoint out of
   backups module so any queue's logs are accessible
2. **Sync safety** — mandatory backup-before-sync to GDrive; blocked if target
   has no GDrive folder (API + UI)
3. **Sync auto-detect URLs** — remove manual search-replace input; detect
   source/target URLs from wp_options DB query (fallback to env.url)
4. **Sync StepTracker** — add per-step execution logging to sync processor (same
   pattern as backup processor)
5. **Sync secure credentials** — use `MYSQL_PWD='...' mysqldump/mysql` instead
   of `-p${password}` inline; support Bedrock `.env` parse fallback
6. **Sync repository layer** — extract Prisma access from SyncService into
   SyncRepository (per project convention)
7. **Plugin scan StepTracker** — add execution logging to plugin scan processor
8. **SyncTab UI** — remove search-replace input, add GDrive warning/block, add
   ExecutionLogPanel
9. **Activity page** — `/activity` global page listing all JobExecutions with
   filtering, expandable logs, live WebSocket updates
10. **Sidebar + router** — register Activity page

---

## Risks

- Sync processor rewrite must preserve exact same DB clone logic; only
  credentials handling and logging added
- Auto-detect URL from wp_options DB query requires target creds to already be
  parsed; order matters
- Safety backup in sync processor requires RcloneService injection into
  SyncProcessorModule
- `execution-log-panel.tsx` URL change from `/backups/execution/` to
  `/job-executions/` must not break BackupsTab which already uses it

---

## Verification

- [ ] `pnpm build` passes all workspaces
- [ ] `pnpm -w run lint` passes web app
- [ ] Sync blocked at API level when target has no GDrive folder
- [ ] Sync blocked at UI level (disabled button + warning)
- [ ] Sync execution log visible in SyncTab after job queued
- [ ] Plugin scan shows execution log entries in BackupsPage/activity
- [ ] `/activity` page loads, filters work, logs expand correctly
- [ ] BackupsTab execution log panel still works (URL change validated)
