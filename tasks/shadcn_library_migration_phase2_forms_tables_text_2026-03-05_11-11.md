# Task: Shadcn Library Migration — Phase 2 (Forms/Tables/Text)

Date: 2026-03-05 11:11  
Branch: chore/split-commits-plan  
Status: Passed

## Objective

Apply shadcn-style coverage across forms/tables/text/card presentation globally
via shared primitives and base styling updates.

## Plan

1. Add missing shadcn form primitives (`Label`, `Select`) using Radix.
2. Upgrade reusable labeled field components to use shared shadcn primitives.
3. Improve table/text/card baseline styling consistency via global
   base/component CSS.
4. Keep backward compatibility for existing page-level JSX to avoid risky mass
   rewrites.
5. Verify dashboard type-check/build.

## Proposed Changes (Before Execution)

- `dashboard/package.json`
  - Add `@radix-ui/react-select` and `@radix-ui/react-label`.
- `dashboard/src/components/ui/Label.tsx`
  - New label primitive.
- `dashboard/src/components/ui/Select.tsx`
  - New Radix Select primitive collection.
- `dashboard/src/components/ui/LabeledInput.tsx`
- `dashboard/src/components/ui/LabeledSelect.tsx`
- `dashboard/src/components/ui/LabeledTextarea.tsx`
  - Migrate to shared primitives.
- `dashboard/src/index.css`
  - Add global base styles for native inputs/selects/textareas and table text
    defaults.

## Acceptance Criteria

- Shared form/table/text primitives are shadcn-style library-backed.
- Existing pages inherit improved styling without requiring full-file rewrites.
- Dashboard type-check/build pass.

## Execution Log

- 2026-03-05 11:11: Task initialized and proposed changes captured.
- 2026-03-05 11:17: Added Radix dependencies (`@radix-ui/react-select`,
  `@radix-ui/react-label`).
- 2026-03-05 11:20: Added `Label` and `Select` primitives; migrated
  `LabeledInput`, `LabeledSelect`, and `LabeledTextarea` to shared shadcn-style
  primitives.
- 2026-03-05 11:24: Applied global base styles in `index.css` for native
  input/select/textarea and table typography consistency.
- 2026-03-05 11:29: Validation complete — `npm run type-check` passed and
  `npm run build` passed in `dashboard/`.
- 2026-03-05 11:41: Refined `SummaryCard` and `Notification` to use consistent
  shared utility patterns (`cn`/`cva`) and improved dark-mode variant behavior.
- 2026-03-05 11:43: Re-validation complete — `npm run type-check` passed and
  `npm run build` passed in `dashboard/`.
- 2026-03-05 11:52: Applied focused table consistency refinements in
  `Table`/`DataTable` (header typography, cell text defaults, clearer empty
  state, and pagination/footer spacing).
- 2026-03-05 11:54: Re-validation complete — `npm run type-check` passed and
  `npm run build` passed in `dashboard/`.
