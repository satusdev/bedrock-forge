# Backend Isolation Phase 1 Onboarding

- Status: IN_PROGRESS (verification partially blocked by workspace lint config)
- Started: 2026-03-12 11:06
- Scope: Nest API onboarding hardening (project URL monitor linkage + real SSH
  WP scan)

## Task

Implement phase-1 backend stabilization for onboarding flows with stronger
isolation and operational correctness:

1. Real SSH-based WordPress plugin/theme scanning on project environments.
2. Persist deterministic scan snapshots and errors in `wp_site_states`.
3. Tighten project onboarding ownership handling for create/link-environment
   monitor creation path.

## Execution Log

- Implemented real SSH + `wp-cli` scan flow in `api/src/wp/wp.service.ts`.
- Persisted WP scan snapshots and failures into `wp_site_states` with UPSERT
  semantics.
- Enforced authenticated owner context for WP operations (`get state`, `scan`,
  `updates`, `commands`).
- Hardened project onboarding URL handling by normalizing `domain` and `wp_url`
  before persistence.
- Threaded owner context into environment-link controller routes and enforced
  ownership checks when context is present.
- Updated unit tests for new behavior and controller signatures.

## Verification Results

- ✅ `npm --prefix api test -- wp.service.spec.ts`
- ✅ `npm --prefix api test -- wp.contract.spec.ts`
- ✅
  `npm --prefix api test -- projects.controller.spec.ts projects.service.spec.ts`
- ✅ `npm --prefix api test` (123 suites, 575 tests passing)
- ✅ `npm --prefix api run build`
- ⚠️ `npm --prefix api run lint` fails due missing ESLint v9 flat config
  (`eslint.config.js`) in workspace, not due changed code.

## Context

- Existing WP scan endpoint returns queued placeholder response and does not
  execute remote scan.
- Existing project create/link flows auto-create monitor records, but ownership
  handling is inconsistent and includes fallback defaults.
- Repository architecture is mixed; this phase applies minimal-surface hardening
  while preserving API contracts where possible.

## Plan

1. Add SSH execution path in `wp.service.ts` using server + project_server
   context.
2. Parse wp-cli outputs for core/php/plugins/themes/users and upsert
   `wp_site_states`.
3. Return scan result payload (`completed`/`failed`) with scan metadata.
4. Update/extend unit tests for WP service and controller contract behavior.
5. Apply onboarding ownership hardening for `createProject` and
   `linkEnvironment` entry points.
6. Run targeted tests, then backend test/lint/build verification.

## Risks

- SSH command execution differences across hosts may produce partial data.
- Existing consumers may rely on previous `queued` response for scan trigger.
- Ownership tightening can surface latent auth gaps in current clients.

## Verification

- `npm --prefix api test -- wp`
- `npm --prefix api test -- projects`
- `npm --prefix api test`
- `npm --prefix api run lint`
- `npm --prefix api run build`

## Proposed File Changes

- `api/src/wp/wp.service.ts`
- `api/src/wp/wp.service.spec.ts`
- `api/src/wp/wp.contract.spec.ts` (if payload shape changes)
- `api/src/projects/projects.controller.ts`
- `api/src/projects/projects.service.ts`
- `api/src/projects/projects.service.spec.ts` (ownership assertions)
- `PROJECT.md` (architecture/source-of-truth update for phase-1 changes)

## Architecture Impact

- Adds deterministic runtime path for WP scan (SSH + wp-cli) and state
  persistence.
- Keeps module boundaries intact; no cross-module direct data mutation outside
  service transactions.
- Improves ownership safety in onboarding path.

## Dependencies

- Host has `ssh` binary available.
- Remote environment has `wp` CLI available in project path.
- Existing server SSH key configuration (server or system key).
