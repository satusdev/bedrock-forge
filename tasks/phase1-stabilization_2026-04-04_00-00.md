# Phase 1: Stabilization & Architecture Debt

**Date:** 2026-04-04 **Status:** IN PROGRESS

## Task

Close the structural gaps identified in the gap analysis before adding new
features.

## Context

Post phase2 code audit revealed:

- `DashboardService` queries Prisma directly (violates repository pattern)
- `job-executions` and `audit-logs` controllers use raw `@Query()` string params
  with no DTO/validation
- Worker has no global `unhandledRejection`/`uncaughtException` handlers
- `auth/refresh` endpoint has no throttle (relies on global 100 req/min)
- `ExecutionScript` model exists in schema but is never referenced by any code

## Plan

1. Extract `DashboardRepository` from `DashboardService`; register it in
   `DashboardModule`
2. Create `dto/query-job-execution.dto.ts`; update controller to use typed DTO
3. Create `dto/query-audit-log.dto.ts`; update controller to use typed DTO
4. Add `unhandledRejection` + `uncaughtException` process handlers to worker
   `main.ts`
5. Add `@Throttle({ default: { ttl: 60_000, limit: 30 } })` to `auth/refresh`
6. (Deferred) `ExecutionScript` table removal — needs dedicated migration,
   tracked separately

## Risks

- Dashboard: no behavior change, pure extract
- DTOs: `ValidationPipe` is global with `whitelist: true` — new DTO must include
  every param the frontend sends, otherwise 400s

## Verification

- [ ] `pnpm --filter api build` passes
- [ ] `pnpm --filter api lint` passes
- [ ] `pnpm --filter worker build` passes
- [ ] `GET /api/job-executions?page=1&limit=25` still returns data
- [ ] `GET /api/audit-logs` still returns data
- [ ] `GET /api/dashboard/summary` still returns data
- [ ] `POST /api/auth/refresh` is now throttled at 30/min
