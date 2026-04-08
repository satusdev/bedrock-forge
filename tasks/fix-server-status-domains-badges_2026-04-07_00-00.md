# Fix: Server Status, Subdomain Domains, Badge Colors

**Date:** 2026-04-07

## Task

Fix three runtime/UX bugs discovered during testing:

1. All servers show "unknown" status on the Servers page
2. Subdomains (e.g. `quranlibya.staging.ly`) are added to the Domains page
   instead of the root domain (`staging.ly`)
3. `destructive` badges/tags are nearly invisible in dark mode; color contrast
   issues across light and dark theme

## Context

- Server status is never persisted: `testConnection()` runs `echo ok` via SSH
  but only returns `{ success, message }` — never calls
  `prisma.server.update({ data: { status } })`
- Domain extraction: `environments.service.ts` and `projects.service.ts` use
  `new URL(url).hostname` directly for domain creation; the correct
  `extractMainDomain()` logic exists in `servers.service.ts` but is only used
  during bulk import
- Badge `destructive` variant uses CSS theme variables (`bg-destructive`) which
  in dark mode resolve to `hsl(0, 62.8%, 30.6%)` — nearly invisible against dark
  backgrounds; `success`/`warning` variants already use explicit Tailwind colors
  with proper dark overrides

## Plan

### Fix 1 — Server Status Persistence

- Add `updateStatus(id, status)` to `servers.repository.ts`
- Call it from `testConnection()` in `servers.service.ts` on both success and
  failure paths

### Fix 2 — Domain Root Extraction

- Add private `extractRegistrableDomain(hostname)` to `projects.service.ts` and
  `environments.service.ts`
- Use it instead of raw hostname when creating domain records

### Fix 3 — Badge Color Contrast

- Replace `destructive` variant in `badge.tsx` with explicit Tailwind colors
  (mirrors `success`/`warning` pattern)
- Brighten `--destructive` in `.dark` block of `index.css` from `0 62.8% 30.6%`
  → `0 72% 51%`

## Files Modified

- `apps/api/src/modules/servers/servers.repository.ts`
- `apps/api/src/modules/servers/servers.service.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/environments/environments.service.ts`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/index.css`

## Verification

- `pnpm turbo build` passes with no TypeScript errors
- Server connection test → status updates to online/offline in DB
- Create env with subdomain URL → domain record is root domain only
- Destructive badges visible in both light and dark mode
- `text-destructive` error messages readable in dark mode

## Notes

- Provisioning failure "Server has no CyberPanel credentials configured" is a
  user configuration issue — user must add CyberPanel credentials on the server
  settings page
- Existing `quranlibya.staging.ly` domain record needs manual deletion after
  deploy
- `extractRegistrableDomain()` is duplicated across 2 services — acceptable for
  now; single-purpose utility with no shared abstraction value yet
