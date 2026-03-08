# Task: UI Sidebar Shadcn Pass + Invoice No-Dispatch Semantics

Date: 2026-03-05 10:55  
Branch: chore/split-commits-plan  
Status: Passed

## Objective

- Keep invoice send behavior non-delivery (no real sending integration).
- Improve dashboard UI/sidebar with proper shadcn-style primitive usage and
  cleaner structure.

## Plan

1. [x] Adjust invoice send response semantics to explicitly indicate no external
       delivery dispatch.
2. [x] Add shadcn-style missing primitive(s) needed by portal forms.
3. [x] Refactor client portal form controls to use shared UI primitives instead
       of raw form fields.
4. [x] Extract sidebar config for cleaner organization and update `Layout` to
       consume it.
5. [x] Run dashboard type-check/build and focused invoice tests/build.

## Proposed Changes (Before Execution)

- `nest-api/src/invoices/invoices.service.ts`
  - Keep status transition only, add explicit no-dispatch metadata in send
    response.
- `dashboard/src/components/ui/Textarea.tsx`
  - Add reusable textarea primitive with `cn` utility.
- `dashboard/src/pages/ClientPortal.tsx`
  - Replace raw `input`/`textarea` with `Input`/`Textarea` primitive usage.
- `dashboard/src/components/navigation/sidebar-config.ts`
  - Centralize sidebar section/item configuration.
- `dashboard/src/components/Layout.tsx`
  - Consume extracted sidebar config and use `cn` helper for class composition.

## Acceptance Criteria

- Invoice sending remains status-only and explicitly non-dispatched.
- Sidebar/nav organization is cleaner and centrally configured.
- Client portal forms use shared UI primitives.
- Frontend type-check/build and focused invoice tests/build pass.

## Execution Log

- 2026-03-05 10:55: Task initialized and proposed changes captured.
- 2026-03-05 11:14: Added reusable `Textarea` primitive at
  `dashboard/src/components/ui/Textarea.tsx`.
- 2026-03-05 11:14: Extracted sidebar nav definitions to
  `dashboard/src/components/navigation/sidebar-config.ts`.
- 2026-03-05 11:15: Updated `dashboard/src/components/Layout.tsx` to consume
  extracted config and use `cn` for class composition.
- 2026-03-05 11:16: Updated `dashboard/src/pages/ClientPortal.tsx` to use shared
  `Input`/`Textarea` primitives for auth/ticket forms.
- 2026-03-05 11:16: Updated `nest-api/src/invoices/invoices.service.ts` send
  response to explicitly indicate no external dispatch
  (`delivery_dispatched: false`).
- 2026-03-05 11:17: Ran dashboard verification:
  - `npm run type-check` (passed)
  - `npm run build` (passed)
- 2026-03-05 11:18: Ran invoice backend verification:
  - `npm run test -- src/invoices/invoices.service.spec.ts src/invoices/invoices.controller.spec.ts src/invoices/invoices.runner.service.spec.ts`
    (3 suites passed)
  - `npm run build` (passed)
