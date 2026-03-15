# WP + Backup Runtime Hardening

- Status: PASSED
- Date: 2026-03-12 13:40

## Task

Fix the live WP scan and backup runtime failures without regressing the recent
owner/integrity hardening.

## Context

- WP scans currently fail on real hosts with
  `Error: 'core version' is not a registered wp command`.
- WP scans also fail when the stored `wp_path` is stale or too narrow.
- Backup DB dumps currently prefer remote-derived credentials but can fail
  repeatedly when the remote host/port/user combination is not directly usable
  for dump execution.
- User requirement: always use force-enabled root execution semantics for WP
  commands run as root.
- Production follow-up: WP scan still returned a failed payload that only showed
  the SSH known-host warning, and staging backup still failed on raw
  `mariadb-dump`/`mysqldump` attempts after update.

## Plan

1. Fix WP command construction so multi-word WP-CLI operations are tokenized
   correctly.
2. Add a bounded remote WordPress path candidate matrix for scan execution.
3. Ensure root WP commands use explicit root-safe flags for all supported
   invocations.
4. Harden backup DB dump resolution to use remote-first values with
   saved-environment fallback when remote connection details fail.
5. Normalize persisted `wp_path` values at environment write paths.
6. Align WP contract/unit tests with synchronous scan behavior and add
   regression coverage.
7. Run targeted WP/backup tests, then full backend tests and build.
8. Rework runtime behavior so root `wp db export` is the primary WordPress
   backup path and raw dump binaries are fallback only.
9. Suppress or strip benign SSH warning noise from WP scan failures so real
   WP-CLI errors are visible.

## Risks

- Over-broad WP path guessing could hit the wrong directory.
- Using unsupported WP flags globally could break commands.
- Backup fallback logic could accidentally mask genuinely broken credentials.

## Verification

- Focused Jest: `src/wp/wp.service.spec.ts`, `src/wp/wp.contract.spec.ts`,
  `src/backups/backups.service.spec.ts`, `src/projects/projects.service.spec.ts`
  all passed.
- Full backend Jest suite passed: 123 suites, 585 tests.
- Nest production build passed via `npm --prefix api run build`.

## Follow-up

- Reopened on 2026-03-12 after live runtime still showed masked WP scan errors
  and staging backup raw dump failures.
- Completed follow-up implementation:
  - WP SSH commands now use quiet SSH log level and strip benign host-key noise
    from surfaced errors.
  - WP scan read commands now run with root-safe skip flags to avoid
    plugin/theme bootstrap failures.
  - WordPress backups now try root `wp db export` first and only fall back to
    raw `mariadb-dump`/`mysqldump` if wp-cli export fails.
  - Regression coverage updated for masked WP failures, quiet SSH options, and
    root-first WordPress backup behavior.
- Targeted rewrite completed:
  - Shared bounded WordPress path utilities now normalize and expand canonical
    runtime candidates consistently across scan and backup flows.
  - WP scan now discovers remote `wp-config.php` paths, derives canonical
    Bedrock/standard runtime roots, and persists corrected `wp_path` values when
    discovery finds a better project root.
  - Backup wp-cli export now resolves canonical remote runtime candidates from
    remote `wp-config.php` discovery before attempting `wp db export`.
  - Environment write-path normalization now collapses `/web` Bedrock inputs to
    the canonical project root before persistence.

## Verification Refresh

- Focused Jest passed: `src/wp/wp.service.spec.ts`,
  `src/wp/wp.contract.spec.ts`, `src/backups/backups.service.spec.ts`.
- Full backend Jest suite passed: 123 suites, 589 tests.
- Nest production build passed via `npm --prefix api run build`.
