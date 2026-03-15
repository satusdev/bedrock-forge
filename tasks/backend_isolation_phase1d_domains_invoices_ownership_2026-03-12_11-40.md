# Backend Isolation Phase 1D Domains + Invoices Ownership Hardening

- Status: IN_PROGRESS
- Started: 2026-03-12 11:40
- Scope: Owner-scoped interlinking and guardrails for domain/invoice operations

## Task

Harden domains and invoices APIs so read/write operations are owner-aware when
an authenticated user context is present, and ensure controller/service tests
cover auth-context delegation.

## Context

- User requested all operational entities to be “interlinked and working well
  together” with stability and isolation.
- Existing domains/invoices controllers did not consistently forward auth owner
  context into service methods.
- Service-level queries used broad `findUnique` paths that did not apply owner
  guardrails.

## Plan

1. Inject `AuthService` into domains and invoices controllers.
2. Resolve optional owner from auth header and pass into service methods.
3. Add optional owner filtering/guards in domains service CRUD/stats operations.
4. Add optional owner filtering/guards in invoices service CRUD/stats/payment
   operations.
5. Update controller/contract/service tests for new signatures and behavior.
6. Run targeted tests and full backend test/build verification.

## Verification

- `npm --prefix api test -- --runInBand src/domains src/invoices`
- `npm --prefix api test -- --runInBand`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/domains/domains.controller.ts`
- `api/src/domains/domains.service.ts`
- `api/src/domains/domains.controller.spec.ts`
- `api/src/domains/domains.contract.spec.ts`
- `api/src/domains/domains.service.spec.ts`
- `api/src/invoices/invoices.controller.ts`
- `api/src/invoices/invoices.service.ts`
- `api/src/invoices/invoices.controller.spec.ts`
- `api/src/invoices/invoices.contract.spec.ts`
- `api/src/invoices/invoices.service.spec.ts`
- `PROJECT.md`

## Execution Log

- Added auth owner resolution in domains/invoices controllers and forwarded
  owner context to list/get/create/update/delete and relevant action endpoints.
- Introduced owner-aware query shaping in domains service for record retrieval,
  updates/deletes, renewal actions, and stats/expiring queries.
- Introduced owner-aware invoice query guards for detail retrieval, updates,
  deletes, send/payment/pdf metadata, and stats filtering.
- Updated domains/invoices controller and contract specs for new auth provider
  dependency and forwarding expectations.
- Updated service specs to support owner-scoped `findFirst` query paths without
  changing existing fixture semantics.

## Verification Results

- ✅ `npm --prefix api test -- --runInBand src/domains src/invoices` (8 suites,
  40 tests passing)
- ✅ `npm --prefix api test -- --runInBand` (123 suites, 576 tests passing)
- ✅ `npm --prefix api run build`
- ⚠️ Lint remains blocked at workspace level (`eslint.config.js` missing for
  ESLint v9 flat config).
