# Bedrock Forge 2.0

## Architecture Overview

Self-hosted WordPress management dashboard. Replaces ManageWP/MainWP. Deploy in
one command.

**Core decisions:**

- REST API (not GraphQL — overrides orchestrator default for this project)
- TanStack Query v5 (not Apollo — consistent with REST)
- Prisma 7 + strict Repository pattern (Prisma access only inside
  `*.repository.ts` files)
- BullMQ for every background operation (no `setInterval`, no inline remote
  calls from controllers)
- Global SSH connection pool via `ssh2` (max 15 concurrent per server). No
  agent, no Go binary.
- Zero `wp-cli`. Two tiny PHP scripts pushed on demand: `backup.php` +
  `plugin-scan.php`
- Zero `.env` sourcing. Credential extraction is regex-only via
  `CredentialParserService`.
- AES-256-GCM encryption for all credentials at rest
- 3 Docker Compose services: `postgres`, `redis`, `forge` (API + Worker + static
  web in one container)

---

## Tech Stack

| Layer              | Technology                                       |
| ------------------ | ------------------------------------------------ |
| Runtime            | Node.js 22                                       |
| Backend framework  | NestJS 11                                        |
| ORM                | Prisma 7                                         |
| Database           | PostgreSQL 16                                    |
| Queue              | BullMQ + Redis 7                                 |
| Remote execution   | ssh2 (connection pool)                           |
| Frontend framework | React 19 + Vite 5                                |
| UI components      | shadcn/ui + Tailwind CSS 4                       |
| Server state       | TanStack Query v5                                |
| Client state       | Zustand (UI/session only — never server data)    |
| Forms              | React Hook Form + Zod                            |
| Real-time          | NestJS WebSocket Gateway + Redis pub/sub adapter |
| Workspace          | pnpm workspaces + Turborepo                      |
| Containerization   | Docker Compose                                   |

---

## Monorepo Structure

```
bedrock-forge/
├── apps/
│   ├── api/                    # NestJS 11 REST API + WebSocket gateway
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── clients/
│   │   │   │   ├── tags/
│   │   │   │   ├── packages/
│   │   │   │   ├── servers/
│   │   │   │   ├── projects/
│   │   │   │   ├── environments/
│   │   │   │   ├── cyberpanel/
│   │   │   │   ├── backups/
│   │   │   │   ├── plugin-scans/
│   │   │   │   ├── sync/
│   │   │   │   ├── domains/
│   │   │   │   ├── monitors/
│   │   │   │   ├── settings/
│   │   │   │   ├── users/
│   │   │   │   ├── invoices/
│   │   │   │   ├── notifications/
│   │   │   │   ├── reports/
│   │   │   │   ├── job-executions/
│   │   │   │   ├── maintenance/
│   │   │   │   ├── audit-logs/
│   │   │   │   └── health/
│   │   │   ├── gateways/       # WebSocket gateways
│   │   │   ├── common/         # Guards, filters, interceptors, decorators
│   │   │   ├── prisma/         # PrismaService
│   │   │   └── main.ts
│   │   └── package.json
│   ├── web/                    # React 19 + Vite 5 dashboard
│   │   ├── src/
│   │   │   ├── features/       # Feature-scoped code
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── clients/
│   │   │   │   ├── servers/
│   │   │   │   ├── projects/
│   │   │   │   ├── backups/
│   │   │   │   ├── monitors/
│   │   │   │   └── settings/
│   │   │   ├── components/
│   │   │   │   ├── ui/         # shadcn primitives (owned, not a package)
│   │   │   │   └── layout/     # AppLayout, Sidebar, Header
│   │   │   ├── hooks/          # Shared custom hooks
│   │   │   ├── lib/            # api-client, websocket, utils, cn
│   │   │   ├── store/          # Zustand stores (UI state only)
│   │   │   └── styles/
│   │   └── package.json
│   └── worker/                 # NestJS standalone — BullMQ consumers only
│       ├── src/
│       │   ├── processors/
│       │   │   ├── backup/
│       │   │   │   └── backup.processor.ts
│       │   │   ├── plugin-scan/
│       │   │   │   └── plugin-scan.processor.ts
│       │   │   ├── sync/
│       │   │   │   └── sync.processor.ts
│       │   │   ├── monitor/
│       │   │   │   └── monitor.processor.ts
│       │   │   ├── domain-whois/
│       │   │   │   └── domain-whois.processor.ts
│       │   │   ├── create-bedrock/
│       │   │   │   └── create-bedrock.processor.ts
│       │   │   ├── notification/
│       │   │   │   └── notification.processor.ts
│       │   │   └── report/
│       │   │       └── report.processor.ts
│       │   ├── utils/
│       │   │   ├── cyberpanel-http.ts  # CyberPanel REST API + escapeMysql
│       │   │   └── processor-utils.ts  # shellQuote, flipProtocol
│       │   └── main.ts
│       ├── scripts/
│       │   ├── backup.php
│       │   └── plugin-scan.php
│       └── package.json
├── packages/
│   ├── shared/                 # @bedrock-forge/shared — types, queue defs, Zod schemas
│   │   └── src/
│   │       ├── queues.ts
│   │       ├── roles.ts
│   │       ├── types.ts
│   │       └── index.ts
│   └── remote-executor/        # @bedrock-forge/remote-executor — SSH pool + credential parser
│       └── src/
│           ├── ssh-pool.manager.ts
│           ├── remote-executor.service.ts
│           ├── credential-parser.service.ts
│           └── index.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── PROJECT.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
└── entrypoint.sh
```

---

## Module Structure Convention

Every backend module follows this exact structure:

```
src/modules/<feature>/
├── <feature>.module.ts      # @Module() — imports, controllers, providers, exports
├── <feature>.controller.ts  # HTTP handlers only. Validates input, calls service, returns DTO.
├── <feature>.service.ts     # Business logic. Calls repository. Never touches Prisma directly.
├── <feature>.repository.ts  # Prisma access ONLY. No business rules here.
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts
│   └── query-<feature>.dto.ts
├── models/
│   └── <feature>.model.ts   # TypeScript interfaces for domain objects
└── tests/
    ├── <feature>.service.spec.ts
    └── <feature>.repository.spec.ts
```

**Hard rules:**

- Controllers never call repositories directly
- Services never import or use `PrismaClient` or `PrismaService`
- Repositories never contain conditional business logic
- DTOs use `class-validator` decorators for validation
- All controller methods are async, return typed responses

---

## Domain Model (26 Tables)

### Identity & Access

- `users` — platform users (admin, manager, client)
- `roles` — exactly 3 roles: admin, manager, client
- `user_roles` — many-to-many join
- `refresh_tokens` — hashed JWT refresh tokens for rotation

### Client Management

- `clients` — managed clients / companies
- `tags` — color-coded labels
- `client_tags` — many-to-many: clients ↔ tags

### Packages

- `hosting_packages` — hosting tier definitions (price, storage, bandwidth,
  max_sites)
- `support_packages` — support tier definitions (price, response_hours)

### Infrastructure

- `servers` — managed servers (SSH credentials encrypted)
- `projects` — WordPress projects (linked to client + packages)
- `environments` — deployments of a project on a server (production/staging)
- `cyberpanel_users` — saved auto-login credentials per environment

### Operations

- `backups` — backup records (status, file_path, size)
- `plugin_scans` — plugin inventory snapshots (JSONB)
- `domains` — domain names with WHOIS cache (JSONB)
- `monitors` — uptime monitor config per environment
- `monitor_results` — individual uptime check results (rolling history)
- `wp_db_credentials` — encrypted DB\_\* credentials per environment

### System

- `execution_scripts` — versioned PHP scripts pushed to servers
- `job_executions` — BullMQ job audit trail (status, progress, errors)
- `app_settings` — key-value config store
- `audit_logs` — user action audit trail (actor, action, resource)
- `backup_schedules` — cron-based backup scheduling per environment

### Billing & Notifications

- `invoices` — yearly invoices linked to a project (hosting + support cost)
- `notification_channels` — Slack webhook channels (with event subscriptions)
- `notification_logs` — delivery log per notification dispatch

---

## BullMQ Queue Registry

| Queue           | Job Types           | Concurrency | Retries | Timeout |
| --------------- | ------------------- | ----------- | ------- | ------- |
| `backups`       | `create`, `restore` | 3/server    | 3       | 30min   |
| `plugin-scans`  | `run`               | 5           | 3       | 5min    |
| `sync`          | `clone`, `push`     | 2/server    | 3       | 15min   |
| `monitors`      | `check`             | 10          | 2       | 30s     |
| `domains`       | `whois`             | 10          | 3       | 30s     |
| `projects`      | `create-bedrock`    | 2/server    | 2       | 20min   |
| `notifications` | `send`              | 20          | 3       | 30s     |
| `reports`       | `weekly-report`     | 1           | 3       | 5min    |

All queues: exponential backoff (base 1s), dead-letter queue (`<name>-dlq`),
`removeOnComplete: 1000`, `removeOnFail: 5000`.

---

## Security Conventions

- **Credential encryption:** AES-256-GCM via `EncryptionService`. Key from
  `ENCRYPTION_KEY` env var. Never stored in DB.
- **SSH keys:** Encrypted at rest. Decrypted in memory only during SSH
  connection. Never returned in API responses.
- **JWT:** 15min access token + 7d refresh token. Refresh tokens stored as
  bcrypt hash. Rotation on every refresh.
- **Validation:** `ValidationPipe` global with `whitelist: true`,
  `forbidNonWhitelisted: true`, `transform: true`.
- **Rate limiting:** 5 login attempts/15min (Redis-backed), 100 req/min general.
- **No eval, no `require()`, no child_process shell:** Remote operations go
  through `RemoteExecutorService` only.

---

## Docker Compose Services

| Service    | Image               | Purpose                                           |
| ---------- | ------------------- | ------------------------------------------------- |
| `postgres` | postgres:16-alpine  | Primary database                                  |
| `redis`    | redis:7-alpine      | BullMQ + WebSocket pub/sub + rate limiting        |
| `forge`    | (multi-stage build) | NestJS API + NestJS Worker + static React web app |

`forge` container entrypoint: runs `prisma migrate deploy`, then starts API
(`apps/api`) and Worker (`apps/worker`) as parallel Node processes via
`entrypoint.sh`.

---

## UI Board Description

**Layout:** Fixed left sidebar (240px) + main content area. Sidebar collapses to
icon-only on md breakpoint.

**Sidebar navigation (13 items — role-gated):**

1. Dashboard
2. Clients
3. Servers
4. Projects
5. Backups
6. Domains
7. Monitors
8. Activity _(job execution feed)_
9. Settings
10. Packages _(manager+)_
11. Invoices _(manager+)_
12. Users & Roles _(admin only)_
13. Notifications _(admin only)_

**Dashboard home:** 4 big stat cards (active projects, recent backups, average
uptime, server count) + quick action buttons + recent job activity feed (live
via WebSocket).

**Project detail:** Tabbed view — Environments | Backups | Plugins | Sync |
Restore.

**Live updates:** Backup progress bars, toast notifications for job
completion/failure, activity feed — all via WebSocket subscription with TanStack
Query cache invalidation on completion.

**Design:** shadcn/ui components, Tailwind CSS 4, dark mode via `.dark` class on
`<html>`, HSL CSS variables, lucide-react icons. Mobile-first, responsive.
