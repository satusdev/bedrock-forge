# PROJECT

## Overview

Bedrock Forge is a Docker-first monorepo for WordPress infrastructure
operations. It includes a NestJS API, a React/Vite dashboard, and supporting
scripts/docs for deployment, backups, schedules, subscriptions, and operational
workflows.

## Architecture

- `nest-api/`: Backend API (NestJS + Prisma + PostgreSQL + Redis URL support)
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
- Backups lifecycle: `pending -> running -> completed|failed`.
- Database backup runtime is SSH-first: remote config source priority is `.env`
  (Bedrock) -> `wp-config.php` -> saved environment credentials.
- Project plugin policy reads are deterministic: when no project override row
  exists, API returns a default inherit-from-global payload instead of a 404.
- Legacy local/wp-cli dump fallback is feature-flagged for compatibility via
  `FORGE_BACKUP_DB_LEGACY_FALLBACK`.
- Schedules lifecycle uses runner lease claims (stored in
  `backup_schedules.celery_task_id`) before execution.
- Operational entities include domains, SSL, invoices, subscriptions, and status
  analytics.

## Folder Structure

- `nest-api/src/<feature>/`: Controllers/services/repositories-style module
  boundaries.
- `nest-api/src/drive-runtime/`: Shared runtime config resolver for rclone
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
