# Task: Bedrock scan classification and env autofill fix

- Status: PASSED
- Started: 2026-03-10 10:40

## Context

Selected scanned sites with paths ending in `/web` can be Bedrock installs but
are labeled Standard, which blocks `.env` credential autofill in Link
Environment.

## Plan

1. Normalize Bedrock root detection in server scan.
2. Use scanned `wp_path` for form path and env fetch in Link Environment modal.
3. Harden read-env candidate path generation for `/web` inputs.
4. Add regression tests for scan classification and read-env candidate paths.
5. Run targeted backend tests and relevant frontend tests if present.

## Risks

- Misclassifying non-Bedrock `/web` directories.
- Breaking existing env path resolution for non-Bedrock installs.

## Verification

- `npm --prefix api test -- servers.service.spec.ts`
- `npm --prefix api test -- servers`

## Result

- Bedrock sites discovered with `wp-config.php` under `/web` are now normalized
  to project root `wp_path` and classified as Bedrock.
- Link Environment modal now uses normalized `wp_path` for form population and
  `.env` fetch.
- `readEnv` no longer probes invalid `/web/web/.env` when target path already
  ends with `/web`.
- Backend test suites passed:
  - `npm --prefix api test -- servers.service.spec.ts` (18/18)
  - `npm --prefix api test -- servers` (30/30)
