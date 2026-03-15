# PROJECT

## Overview

Bedrock Forge is a Docker-first monorepo for WordPress infrastructure
operations. It includes a NestJS API, a React/Vite dashboard, and supporting
scripts/docs for deployment, backups, schedules, subscriptions, and operational
workflows.

## Architecture

- `api/`: Backend API (NestJS + Prisma + PostgreSQL + Redis URL support)
  - Modular feature domains under `src/`.
  - HTTP controllers map to `/api/v1/*` routes.
  - Background processing uses `@nestjs/schedule` interval runners (for
    schedules/backups).
  - Google Drive runtime config is centralized in
    `src/drive-runtime/drive-runtime-config.service.ts` and reused by backup and
    gdrive modules.
- `dashboard/`: Frontend (React + Vite + Tailwind + shadcn-style components)
  - Server state fetched from API endpoints.
  - Task and backup visibility through dashboard pages and shared modal
    components.
- `docs/`: Operational and development runbooks.
- `tasks/`: Engineering execution logs and implementation plans.
- Root Docker artifacts (`docker-compose.yml`, `Dockerfile.*`) define
  local/prod-like runtime.

## Domain Model (high-level)

- Users/clients authenticate and manage projects.
- Projects contain environments (`project_servers`) and backup/schedule
  resources.
- Linking a `staging`/`production` environment auto-provisions an uptime monitor
  keyed by project + URL, skipping duplicates.
- Project and environment onboarding URLs are normalized before persistence so
  monitor dedupe and domain tracking are deterministic.
- Backups lifecycle: `pending -> running -> completed|failed`.
- File sync tasks (`sync.pull_files`, `sync.push_files`) execute real `rsync`
  commands over SSH and append command/result traces into task-status logs.
- Backup runner observability exposes both pending-loop and maintenance-loop
  snapshots (counts, failures, duration, and last error) via
  `/api/v1/backups/maintenance/status`.
- Backup execution is being isolated behind backup-specific repository/runtime
  boundaries instead of keeping queueing, context loading, dump execution, file
  staging, and persistence in one raw-SQL-heavy service path.
- Database backup runtime is persisted-config-first: saved
  `projects`/`project_servers`/`servers` data is the primary execution source,
  while remote `.env` / `wp-config.php` discovery is fallback-only for missing
  credentials.
- File backups no longer treat metadata-only snapshots as a valid success path
  for missing local files; remote environments must stage real files over SSH.
- Project plugin policy reads are deterministic: when no project override row
  exists, API returns a default inherit-from-global payload instead of a 404.
- WordPress site scans execute SSH + wp-cli at runtime and persist snapshots in
  `wp_site_states` (versions, plugin/theme counts, update counts, and scan
  errors).
- Domains and invoices API operations are owner-aware when auth context is
  present, reducing cross-tenant access risk while preserving admin/system
  compatibility.
- SSL and subscriptions API operations follow the same owner-aware behavior:
  authenticated calls are owner-scoped, while missing auth context keeps
  compatibility for admin/system automation flows.
- Domain create flow validates linked `project_id` existence/ownership before
  persistence when `project_id` is provided.
- SSL certificate create flow validates linked `domain_id` access and blocks
  domain/project mismatches.
- Invoice create flow validates item-level `project_id` and `subscription_id`
  links (existence, client ownership, and subscription-project consistency)
  before writes.
- Legacy local/wp-cli dump fallback is feature-flagged for compatibility via
  `FORGE_BACKUP_DB_LEGACY_FALLBACK`.
- Schedules lifecycle uses runner lease claims (stored in
  `backup_schedules.celery_task_id`) before execution.
- Operational entities include domains, SSL, invoices, subscriptions, and status
  analytics.

## Folder Structure

- `api/src/<feature>/`: Controllers/services/repositories-style module
  boundaries.
- `api/src/drive-runtime/`: Shared runtime config resolver for rclone
  remote/config/base-path precedence.
- `dashboard/src/`: Pages, components, hooks, utilities.
- `scripts/`: Local setup, diagnostics, deploy helpers.
- `logs/`: Deployment log artifacts.

## Conventions

- Prefer strict typing and explicit DTO validation in backend routes.
- Keep business logic in services; keep controllers thin.
- Background jobs should be idempotent and observable via status/log fields.
- Use minimal, targeted changes; avoid unrelated refactors.
- Validate changes with backend tests and frontend build/lint.

## Runtime Assumptions

- Primary local runtime via Docker Compose service `api` on port `8000`.
- PostgreSQL and Redis containers are expected healthy before API startup.
- Environment configuration is loaded from root `.env` via compose `env_file`.
