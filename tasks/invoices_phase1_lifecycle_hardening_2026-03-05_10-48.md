# Task: Invoices Phase 1 — Lifecycle Hardening

Date: 2026-03-05 10:48  
Branch: chore/split-commits-plan  
Status: Passed

## Objective

Harden invoice send/payment/PDF metadata behavior with stricter business rules
while preserving existing API contracts.

## Plan

1. [x] Tighten `sendInvoice` preconditions to prevent invalid transitions.
2. [x] Tighten `recordPayment` rules for invalid amounts and overpayment.
3. [x] Improve state transitions for partial payments and paid invoices.
4. [x] Improve PDF metadata generation (safe filename + richer content payload).
5. [x] Update invoice service tests for new rules.
6. [x] Run focused invoice tests and backend build.

## Proposed Changes (Before Execution)

- `api/src/invoices/invoices.service.ts`
  - Add lifecycle guards for send/payment.
  - Add safe filename helper and richer metadata generation.
- `api/src/invoices/invoices.service.spec.ts`
  - Add/adjust tests for overpayment, draft-payment restriction, and send
    preconditions.

## Acceptance Criteria

- Invalid send/payment transitions are rejected with clear errors.
- Overpayment and non-positive amounts are rejected.
- Invoice PDF metadata remains downloadable with safer filename semantics.
- Focused invoice tests and backend build pass.

## Execution Log

- 2026-03-05 10:48: Task initialized and proposed changes captured.
- 2026-03-05 11:05: Updated `InvoicesService` lifecycle rules:
  - blocked send for invoices without items or zero total,
  - blocked payment on draft/paid/cancelled/refunded invoices,
  - blocked overpayments,
  - preserved overdue status on partial payments.
- 2026-03-05 11:05: Improved PDF metadata generation with safer filename
  normalization and richer invoice summary content.
- 2026-03-05 11:07: Expanded `invoices.service.spec.ts` for new guardrails and
  metadata behavior.
- 2026-03-05 11:08: Ran focused invoice tests:
  - `npm run test -- src/invoices/invoices.service.spec.ts src/invoices/invoices.controller.spec.ts src/invoices/invoices.runner.service.spec.ts`
  - Result: 3 suites passed, 18 tests passed.
- 2026-03-05 11:09: Ran `npm run build` in `api` (passed).
