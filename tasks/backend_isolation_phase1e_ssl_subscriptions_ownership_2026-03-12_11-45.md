# Backend Isolation Phase 1E SSL + Subscriptions Ownership Parity

- Status: IN_PROGRESS
- Started: 2026-03-12 11:45
- Scope: Align SSL/subscriptions ownership behavior with domains/invoices

## Task

Harden ownership isolation consistency for SSL and subscriptions so
authenticated requests are tenant-scoped while preserving compatibility for
admin/system flows that run without user auth context.

## Context

- Domains/invoices were updated to use owner-aware behavior with optional owner
  scoping.
- SSL/subscriptions still defaulted missing auth owner context to `owner_id=1`,
  creating inconsistent cross-module behavior and hidden coupling.

## Plan

1. Remove fallback owner defaulting in SSL/subscriptions services.
2. Resolve owner context as optional (`number | undefined`) with input guards.
3. Apply owner filter only when owner context is present.
4. Keep existing controller/API contracts unchanged.
5. Run targeted SSL/subscriptions tests, then full backend tests/build.

## Verification

- `npm --prefix api test -- --runInBand src/ssl src/subscriptions`
- `npm --prefix api test -- --runInBand`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/ssl/ssl.service.ts`
- `api/src/subscriptions/subscriptions.service.ts`
- `PROJECT.md`

## Execution Log

- Replaced fallback owner resolution (`owner_id=1`) in SSL/subscriptions
  services with optional owner normalization.
- Updated SSL raw-query filters and project ownership checks to apply owner
  constraints only when owner context is present.
- Updated subscriptions query filters and ownership checks (`list`, `detail`,
  `create`, `invoice`, `stats`) to apply owner constraints conditionally.
- Preserved controller signatures and response shapes for compatibility.

## Verification Results

- ✅ `npm --prefix api test -- --runInBand src/ssl src/subscriptions` (8 suites,
  21 tests passing)
- ✅ `npm --prefix api test -- --runInBand` (123 suites, 576 tests passing)
- ✅ `npm --prefix api run build`
- ⚠️ Lint remains blocked at workspace level (`eslint.config.js` missing for
  ESLint v9 flat config).
