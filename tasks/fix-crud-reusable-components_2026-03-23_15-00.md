# Task: Fix CRUD bugs + extract reusable components

**Created**: 2026-03-23 15:00  
**Status**: COMPLETE

## Objectives

1. Fix 3 critical `limit=500` bugs causing HTTP 400 on dropdown queries
2. Extract reusable crud primitives: `PageHeader`, `SearchBar`, `DataTable`,
   `Pagination`
3. Replace `<p>Loading…</p>` with skeleton rows in DataTable across all pages
4. Refactor all CRUD pages to use shared components

## Checklist

- [x] Fix `limit=500` → `limit=100` in ProjectsPage (clients dropdown)
- [x] Fix `limit=500` → `limit=100` in DomainsPage (projects dropdown)
- [x] Fix `limit=500` → `limit=100` in EnvironmentsTab (servers dropdown)
- [x] Create `apps/web/src/components/crud/PageHeader.tsx`
- [x] Create `apps/web/src/components/crud/SearchBar.tsx`
- [x] Create `apps/web/src/components/crud/DataTable.tsx`
- [x] Create `apps/web/src/components/crud/Pagination.tsx`
- [x] Create `apps/web/src/components/crud/index.ts`
- [x] Refactor ClientsPage
- [x] Refactor ProjectsPage
- [x] Refactor ServersPage
- [x] Refactor DomainsPage (merged double dialog + fixed limit)
- [x] Refactor MonitorsPage (DataTable skeleton)
- [x] Refactor BackupsPage (DataTable skeleton)
- [x] Add skeleton to DashboardPage stat cards + monitors list
- [x] Build verification: `tsc --noEmit` passes, `vite build` passes
