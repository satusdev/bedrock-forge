# Task: Users, Packages UI, Invoices, and Slack Notifications

**Created:** 2026-03-29  
**Status:** PASSED

---

## Context

Four interconnected features on top of the existing Bedrock Forge monorepo.

- **Users page:** Admin CRUD for user + role management. Backend has auth
  self-service only; no user management endpoints exist.
- **Packages page:** Frontend is entirely missing. Backend CRUD is complete but
  service violates repository pattern (direct Prisma access). Fix repository
  layer and build the UI.
- **Invoices:** New domain. Auto-generated yearly invoices per project, amounts
  = package price_monthly × 12. Package name/price snapshotted at generation
  time.
- **Notifications:** New domain. Slack channel config (bot token + channel ID,
  token encrypted at rest). Dispatch via BullMQ `notifications` queue (worker
  handles Slack HTTP calls). All system event types wired in.

---

## Plan

### Prisma

- Add `InvoiceStatus` enum, `Invoice` model
- Add `NotificationChannel` model (encrypted bot token)
- Add `NotificationLog` model
- Add `invoices[]` relations to `Project` and `Client`

### Backend API (`apps/api`)

- `modules/users/` — full CRUD + role assignment (ADMIN guard)
- `modules/packages/` — add `packages.repository.ts`, refactor service to use it
- `modules/invoices/` — full CRUD + generate/generate-bulk (MANAGER guard)
- `modules/notifications/` — channel CRUD + test endpoint + logs (ADMIN guard)
- Register all 3 new modules in `app.module.ts`

### Worker (`apps/worker`)

- `processors/notification.processor.ts` — handles `notifications` queue jobs,
  calls Slack `chat.postMessage`
- Wire `NotificationsService.dispatch()` calls into backup, sync, monitor, auth,
  and server processors/services

### Shared (`packages/shared`)

- Add `QUEUES.NOTIFICATIONS` and `QUEUES.NOTIFICATIONS_DLQ`
- Add `NotificationEventType` union type and `NOTIFICATION_EVENTS` constant

### Frontend (`apps/web`)

- `pages/UsersPage.tsx` — admin only
- `pages/PackagesPage.tsx` — manager+, tabbed Hosting/Support
- `pages/InvoicesPage.tsx` — manager+, filterable list + generate dialog
- `pages/NotificationsPage.tsx` — admin only, channel CRUD + test + recent logs
- Update `Sidebar.tsx` — add 4 nav items with role gating
- Update `App.tsx` — add 4 routes

---

## Risks

- Packages repository refactor must keep service method signatures identical (no
  API breakage)
- Notification BullMQ jobs run in worker — ensure `NotificationsModule` and
  repository are accessible from worker context
- Slack bot token encrypted at rest; decrypt only at dispatch time

---

## Verification

1. `npx prisma migrate dev` — migration applies
2. `pnpm --filter api build` — no TypeScript errors
3. `pnpm --filter worker build` — no TypeScript errors
4. `pnpm --filter web build` — no errors
5. `pnpm --filter web lint` — no lint errors
6. All 4 new pages render and CRUD works end-to-end
7. Generate invoice for project with packages — amounts correct
8. Slack channel test message delivered

---

## Status: IN PROGRESS
