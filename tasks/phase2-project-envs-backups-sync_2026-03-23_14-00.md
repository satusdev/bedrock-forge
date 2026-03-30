# Task: Phase 2 — Project Detail + Environment CRUD + Backup Overhaul + Sync + UI

**Date:** 2026-03-23  
**Status:** PASSED

## Context

Building on PASSED previous task. Core domain model (Project -> Environments ->
Backups/Sync) exists in DB and API but has zero frontend for environments, sync,
or plugin scans. Backups store files in /tmp (lost on reboot) and have no cloud
storage.

## Plan

### Phase 1 (this task): Project Detail Page + Environment CRUD

1. Prisma: change `EnvironmentType` enum to free-text `String`, add
   `backup_path` nullable field to `Environment`
2. Update Environment DTOs, create EnvironmentsRepository
3. Add `/projects/:id` route in App.tsx
4. Create `ProjectDetailPage` with tabbed layout
5. Create `EnvironmentsTab` with full CRUD (cards, create/edit/delete dialogs)
6. Build stub tabs: BackupsTab, PluginsTab, SyncTab, DomainsTab, CyberPanelTab
7. Make ProjectsPage rows clickable → navigate to detail page

### Phase 2 (next task): Backup Overhaul + Google Drive

### Phase 3 (next task): Full Sync Feature

### Phase 4 (next task): UI Polish + Remaining CRUD

## Risks

- Prisma enum-to-string migration: existing data must be preserved
- Environment type was `production | staging` — migration converts to plain
  strings
- Cross-server rsync in sync phase requires careful SSH tunnel design

## Verification

- [ ] `pnpm build` passes with zero TypeScript errors
- [ ] Navigate /projects → click row → lands on /projects/:id
- [ ] Environments tab: create, edit, delete environment within project
- [ ] Environment card shows: type label, server name+IP, URL, root_path,
      backup_path
- [ ] Quick action buttons visible per environment card
- [ ] All 6 tabs render without crash
- [ ] Prisma migration runs cleanly
