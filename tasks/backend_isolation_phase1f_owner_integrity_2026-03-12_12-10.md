# Backend Isolation Phase 1F Strict Owner + Cross-Entity Integrity

- Status: IN_PROGRESS
- Started: 2026-03-12 12:10
- Scope: tighten owner semantics in domains/invoices and enforce inter-entity
  integrity for domain/project + invoice item subscription/project links

## Task

Complete the next hardening slice by removing fallback-owner behavior in the
remaining domain/invoice write paths and adding explicit relational consistency
checks for linked operational entities.

## Context

- Prior phases established owner-aware behavior across domains, invoices, SSL,
  and subscriptions.
- Remaining risk: write-path linkage checks were still incomplete for:
  - domain create with linked `project_id`,
  - SSL create with linked `domain_id` + `project_id`,
  - invoice item links using `project_id` and `subscription_id`.
- Goal: fail fast with deterministic `404`/`400` semantics before persistence.

## Plan

1. Remove fallback owner assumptions from domain/invoice service paths touched
   in this slice.
2. Validate domain `project_id` ownership/existence at create time.
3. Validate SSL `domain_id` exists and does not conflict with provided
   `project_id`.
4. Validate invoice item `project_id`/`subscription_id` existence, client
   linkage, and cross-link consistency.
5. Extend service specs for all new validation branches.
6. Run targeted service/module tests, then full backend tests/build.

## Verification

- `npm --prefix api test -- --runInBand src/domains/domains.service.spec.ts src/invoices/invoices.service.spec.ts src/ssl/ssl.service.spec.ts`
- `npm --prefix api test -- --runInBand src/domains src/invoices src/ssl src/subscriptions`
- `npm --prefix api test -- --runInBand`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/domains/domains.service.ts`
- `api/src/domains/domains.service.spec.ts`
- `api/src/invoices/invoices.service.ts`
- `api/src/invoices/invoices.service.spec.ts`
- `api/src/ssl/ssl.service.ts`
- `api/src/ssl/ssl.service.spec.ts`
- `PROJECT.md`

## Execution Log

- Domains: replaced fallback owner handling with optional owner normalization in
  touched paths and added linked project ownership validation in `createDomain`.
- Invoices: replaced fallback owner handling with optional owner normalization
  in touched paths and added `validateInvoiceItemLinks` guard that validates
  projects/subscriptions plus subscription-project consistency.
- SSL: added `ensureDomainLinkIntegrity` check to block certificate creation
  when linked domain belongs to a different project or is inaccessible.
- Added/updated service tests for:
  - missing linked domain project on domain create,
  - invoice item subscription/project mismatch,
  - SSL domain/project mismatch.

## Verification Results

- ✅
  `npm --prefix api test -- --runInBand src/domains/domains.service.spec.ts src/invoices/invoices.service.spec.ts src/ssl/ssl.service.spec.ts`
  (3 suites, 33 tests passing)
- ✅
  `npm --prefix api test -- --runInBand src/domains src/invoices src/ssl src/subscriptions`
  (16 suites, 64 tests passing)
- ✅ `npm --prefix api test -- --runInBand` (123 suites, 579 tests passing)
- ✅ `npm --prefix api run build`
- ⚠️ Lint remains blocked at workspace level (`eslint.config.js` missing for
  ESLint v9 flat config).
