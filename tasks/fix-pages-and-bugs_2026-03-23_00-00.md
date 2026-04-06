# Task: Fix Critical Bugs + Complete All Pages

**Status: IN PROGRESS** **Date:** 2026-03-23

## Bugs Fixed

- [ ] BigInt serialization crash (`JSON.stringify` fails on `bigint` IDs)
- [ ] PaginationQuery string coercion (`take: "1"` instead of `1`)
- [ ] BackupsPage fetches `/environments` 404 (nested under projects)
- [ ] ServersPage status badge mismatch (`active` vs `online/offline/unknown`)
- [ ] ClientsPage `website` column not in schema

## Features Implemented

- [ ] shadcn/ui component library scaffold
- [ ] ClientsPage: create/edit/delete + search + pagination
- [ ] ServersPage: create/edit/delete + SSH key input + test connection
- [ ] ProjectsPage: create/edit/delete + search + pagination
- [ ] MonitorsPage: create/delete dialog
- [ ] DomainsPage: create/edit/delete + search + pagination
- [ ] SettingsPage: create + delete settings
- [ ] BackupsPage: fix environment fetch + backup type selector
- [ ] DashboardPage: fix stat card queries

## Verification

- [ ] `pnpm build` passes with zero errors
- [ ] All pages load without console errors
- [ ] CRUD operations work on each page
