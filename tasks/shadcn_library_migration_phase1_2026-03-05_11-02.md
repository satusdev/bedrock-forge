# Task: Shadcn Library Migration — Phase 1

Date: 2026-03-05 11:02  
Branch: chore/split-commits-plan  
Status: Passed

## Objective

Upgrade dashboard UI to proper shadcn library-backed primitives and apply them
app-wide via shared component replacements.

## Plan

1. [x] Install required shadcn/Radix dependencies in dashboard workspace.
2. [x] Upgrade `Button` to shadcn `Slot`-compatible variant system.
3. [x] Upgrade `Card` and `Badge` to shadcn-style primitive implementations
       while preserving current API usage.
4. [x] Upgrade `Dialog` to Radix-backed implementation while preserving current
       props interface.
5. [x] Verify dashboard type-check and build.

## Proposed Changes (Before Execution)

- `dashboard/package.json`
  - Add Radix dependencies for shadcn-backed primitives.
- `dashboard/src/components/ui/Button.tsx`
  - Add `asChild` + `@radix-ui/react-slot` support.
- `dashboard/src/components/ui/Card.tsx`
  - Use `cn` + shadcn-style base structure, preserve title/subtitle/actions API.
- `dashboard/src/components/ui/Badge.tsx`
  - Convert to `cva` variant-based implementation.
- `dashboard/src/components/ui/Dialog.tsx`
  - Use `@radix-ui/react-dialog` primitives with overlay/content/title.

## Acceptance Criteria

- Shared UI primitives are library-backed and shadcn-style.
- Existing imports/usages remain functional without page-by-page rewrites.
- Dashboard type-check/build pass.

## Execution Log

- 2026-03-05 11:02: Task initialized and proposed changes captured.
- 2026-03-05 11:08: Installed shadcn library dependencies in dashboard:
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-slot`
- 2026-03-05 11:10: Updated `dashboard/src/components/ui/Button.tsx` with
  `asChild` support via Radix `Slot` and shadcn-style variant baseline.
- 2026-03-05 11:11: Updated `dashboard/src/components/ui/Card.tsx` and
  `dashboard/src/components/ui/Badge.tsx` to shadcn-style primitive
  implementations using `cn`/`cva`.
- 2026-03-05 11:12: Updated `dashboard/src/components/ui/Dialog.tsx` to Radix
  Dialog primitives while preserving current prop contract (`open`,
  `onOpenChange`, `title`, `children`, `className`).
- 2026-03-05 11:13: Ran dashboard verification:
  - `npm run type-check` (passed)
  - `npm run build` (passed)
