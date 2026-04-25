<div align="center">
  <h1>Bedrock Forge</h1>
  <p>Self-hosted WordPress infrastructure management platform — CyberPanel-centric, SSH-native, queue-driven</p>
</div>

<div align="center">

[![CI](https://github.com/satusdev/bedrock-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/satusdev/bedrock-forge/actions/workflows/ci.yml)
[![Node.js 22](https://img.shields.io/badge/node-22-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5-blue.svg)](https://www.typescriptlang.org/)
[![NestJS 11](https://img.shields.io/badge/nestjs-11-red.svg)](https://nestjs.com/)
[![React 19](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![Version](https://img.shields.io/badge/version-0.1.1-orange.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## What Is Bedrock Forge?

Bedrock Forge is a **self-hosted WordPress infrastructure management platform**,
designed as a single-operator or small-team alternative to ManageWP/MainWP. It
manages multiple WordPress/Bedrock environments across multiple Linux servers
through SSH — no agent installed on managed servers, no wp-cli dependency.

**Built for CyberPanel-hosted Bedrock stacks.** Standard WordPress
(`wp-config.php`) is supported for backups, plugin scanning, and sync.
CyberPanel-specific features (auto-login, site provisioning, database creation)
require CyberPanel.

**This is v0.2.x — solidly functional.** Core infrastructure, RBAC, operational
workflows, and UI are all complete. Several advanced/edge-case features remain
roadmap only. See the [Feature Status](#feature-status) table for the precise
picture.

---

## What It Is NOT (Yet)

Before adopting, understand the current scope boundaries:

- **Not multi-tenant.** One installation serves one team. There is no per-team
  data isolation or workspace separation.
- **Not a payment processor.** Billing is invoice tracking only — no Stripe, no
  payment gateway.
- **No 2FA/MFA.** Authentication is JWT only. TOTP is not implemented.
- **No email notifications.** Alerts are Slack-only. No SMTP integration exists.
- **No plugin auto-updates.** Plugin management covers inventory,
  enable/disable/delete, and install/remove via Composer. Scheduled update jobs
  are not implemented.
- **No incremental backups.** All backups are full-snapshot operations (full,
  DB-only, or files-only).
- **No cross-server restore.** Restore runs only within the same environment.
  Restoring a backup to a different server is not implemented.
- **Google Drive is the only remote backup target.** S3, SFTP, and other rclone
  targets are not wired into the UI.
- **Uptime monitoring is HTTP-only.** SSL certificate expiry, DNS resolution
  checks, and keyword/content matching are not implemented.
- **Reports are Slack-only.** Weekly summary reports are delivered to a Slack
  channel. No email, PDF, or in-app export.

---

## Feature Status

> Status definitions: **Implemented** = backend + frontend complete and tested.
> **Partial** = backend exists, frontend incomplete or feature has gaps. **Not
> Implemented** = planned, stubbed, or roadmap only.

| Feature                                    | Status             | Notes                                                                                                  |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------ |
| 🖥️ Server Management                       | ✅ Implemented     | SSH key vault (AES-256-GCM), CyberPanel auto-login, server scanning; admin-only create/edit            |
| 📁 Project & Client Management             | ✅ Implemented     | Client → Project → Environment hierarchy, tags, bulk import; admin-only create/edit clients            |
| 🌍 Environment Management                  | ✅ Implemented     | Multi-env per project, DB credential vault, env scanning                                               |
| 💾 Backup — Create & Schedule              | ✅ Implemented     | Full / DB-only / files-only; daily/weekly/monthly schedules; Google Drive upload via rclone            |
| 💾 Backup — Retention Policies             | ✅ Implemented     | Count-based and age-based pruning on schedule configuration                                            |
| 💾 Backup — Restore (same environment)     | ✅ Implemented     | Restore to source environment with real-time progress streaming                                        |
| 💾 Backup — Cross-server Restore           | ❌ Not Implemented | Restore is scoped to the originating environment only                                                  |
| 💾 Backup — Incremental                    | ❌ Not Implemented | All backups are full snapshots; block-level incrementals are roadmap                                   |
| 💾 Backup — S3 / SFTP targets              | ❌ Not Implemented | Only Google Drive is wired; other rclone-compatible targets are roadmap                                |
| 🔌 Plugin Scanning                         | ✅ Implemented     | On-demand scan via PHP script (no wp-cli); returns structured inventory                                |
| 🔌 Plugin — Enable / Disable / Delete      | ✅ Implemented     | Direct management from plugin detail page                                                              |
| 🔌 Plugin — Install / Remove (Composer)    | ✅ Implemented     | Composer-based install/remove for Bedrock environments                                                 |
| 🔌 Plugin — Update (manual trigger)        | ⚠️ Partial         | API endpoints exist (`plugin install/remove/update`); frontend UI coverage is limited                  |
| 🔌 Plugin — Scheduled Auto-updates         | ❌ Not Implemented | Roadmap only                                                                                           |
| 🔌 Plugin — Vulnerability Scanning         | ❌ Not Implemented | No CVE/WPScan integration; scanning is inventory-only                                                  |
| 🔄 Environment Sync                        | ✅ Implemented     | Files via rsync, DB via mysqldump; dry-run mode; conflict detection; safety backup before clone        |
| 🔄 Config Drift Detection                  | ✅ Implemented     | Compares active `.env` against last committed config; flags mismatches in project detail               |
| 📡 Uptime Monitoring — HTTP checks         | ✅ Implemented     | Configurable interval, response time, uptime %, down/up/degraded logging; incident log with pagination |
| 📡 Uptime Monitoring — SSL / DNS / Content | ❌ Not Implemented | HTTP status check only; keyword, certificate, and DNS checks are roadmap                               |
| 🌐 Domain WHOIS                            | ✅ Implemented     | Expiry tracking, cached WHOIS data, expiry alerts; SSL standalone check                                |
| 🏗️ Bedrock Provisioning (CyberPanel)       | ✅ Implemented     | End-to-end queue job: CyberPanel site + DB creation, Bedrock install, environment clone                |
| 💰 Invoices & Billing                      | ✅ Implemented     | Yearly invoice generation, draft/sent/paid/overdue/cancelled statuses, bulk operations                 |
| 💰 Invoice PDF Export                      | ❌ Not Implemented | Invoices are data records only; no PDF generation                                                      |
| 💰 Payment Processing                      | ❌ Not Implemented | No payment gateway integration                                                                         |
| 🔔 Slack Notifications                     | ✅ Implemented     | Per-event channel subscriptions, delivery logs with pagination, error capture                          |
| 🔔 Email / Discord / Webhook Notifications | ❌ Not Implemented | Roadmap only                                                                                           |
| 📋 Weekly Reports                          | ✅ Implemented     | Generated by BullMQ `report:generate` job, delivered to Slack channel                                  |
| 📊 Audit & Activity Logs                   | ✅ Implemented     | User action audit trail + per-job execution log (step-by-step, JSONB trace); both paginated            |
| 📊 Problems / Attention Feed               | ✅ Implemented     | Cross-project attention feed: expiring domains, down monitors, outdated plugins, config drift          |
| 📈 Dashboard                               | ✅ Implemented     | Stats summary, live job feed via WebSocket, WP quick actions                                           |
| 🔐 Auth — JWT + Refresh Rotation           | ✅ Implemented     | 15-min access tokens, 7-day refresh tokens (bcrypt-hashed, rotated on use)                             |
| 🔐 Auth — RBAC (4-tier)                    | ✅ Implemented     | `admin` > `manager` > `maintainer` > `client`; API guards + frontend navigation; per-role UI gating    |
| 🔐 Auth — 2FA / MFA                        | ❌ Not Implemented | No TOTP or MFA. Roadmap.                                                                               |
| 🔐 Auth — SSO / Social Login               | ❌ Not Implemented | Not planned                                                                                            |
| 🌑 Dark Mode                               | ✅ Implemented     | Per-session toggle in sidebar; preference stored in UI store (Zustand)                                 |
| 📦 Package Management                      | ✅ Implemented     | Hosting and support package definitions linked to projects for billing; both tabs paginated            |
| 🗂️ Command Palette                         | ✅ Implemented     | Global search (⌘K / Ctrl+K): pages, clients, servers, projects; role-filtered results                  |
| 🎨 Theme Management                        | ❌ Not Implemented | Roadmap only                                                                                           |
| 🌐 WordPress Core Updates                  | ❌ Not Implemented | Roadmap only                                                                                           |
| 👥 Multi-tenant Workspaces                 | ❌ Not Implemented | Single-tenant per installation                                                                         |

---

## Architecture

Three Docker services. Minimal footprint — runs on a 4 GB RAM VPS.

```
┌───────────────────────────────────────────────────────────┐
│  forge (single container)                                 │
│  ├─ NestJS 11 API  :3000                                  │
│  │   REST routes, JWT auth, rate limiting, WebSocket GW   │
│  └─ BullMQ Worker (no HTTP port)                          │
│      ├─ 8 processor modules                               │
│      ├─ SSH connection pool (ssh2, max 15/server)         │
│      ├─ rclone → Google Drive                             │
│      └─ whois (system command)                            │
└────────┬──────────────────────────────────────────────────┘
         │
    ┌────▼──────┐   ┌──────────────────────────┐
    │ postgres  │   │ redis 7                  │
    │ :5432     │   │ BullMQ queues            │
    │ 31 tables │   │ WebSocket pub/sub        │
    └───────────┘   │ Rate limiting            │
                    └──────────────────────────┘

┌──────────────────────────────────┐
│ web (nginx container)            │
│ :80 → React SPA static files     │
│ /api/* → proxy → forge:3000      │
│ /ws    → upgrade → forge:3000    │
└──────────────────────────────────┘

  Managed servers (any Linux host with SSH access)
┌──────────────────────────────────────────────────┐
│ WordPress / Bedrock sites                        │
│ No agent installed — SSH only                    │
│ Two PHP scripts pushed on-demand, then cleaned   │
└──────────────────────────────────────────────────┘
```

### Remote Execution Model

All SSH operations go through `@bedrock-forge/remote-executor`:

- **`SshPoolManager`** — Connection pool keyed by server ID. Max 15 concurrent
  connections per server.
- **`RemoteExecutorService`** — Executes commands, pushes files (SFTP), pulls
  files. Stall detection via 5-minute timeout + heartbeat.
- **`CredentialParserService`** — Extracts WordPress DB credentials from
  `wp-config.php` (standard WP) or `.env` (Bedrock) using regex only. Files are
  never sourced, eval'd, or passed to a shell.

### Queue System

Every long-running operation is a BullMQ job. Controllers enqueue; the worker
executes. Real-time progress streams to the frontend via WebSocket + Redis
pub/sub.

| Queue           | Job Types                                                                   | Retries | Timeout |
| --------------- | --------------------------------------------------------------------------- | ------- | ------- |
| `backups`       | `backup:create`, `backup:restore`, `backup:scheduled`, `backup:delete-file` | 3       | 30 min  |
| `plugin-scans`  | `plugin-scan:run`, `plugin:manage`                                          | 3       | 5 min   |
| `sync`          | `sync:clone`, `sync:push`                                                   | 3       | 15 min  |
| `monitors`      | `monitor:check` (repeatable)                                                | 2       | 30 s    |
| `domains`       | `domain:whois`                                                              | 3       | 30 s    |
| `projects`      | `project:create-bedrock`                                                    | 2       | 20 min  |
| `notifications` | `notification:send`                                                         | 3       | 30 s    |
| `reports`       | `report:generate`                                                           | 3       | 5 min   |

All queues use exponential backoff (base 1 s) and a dead-letter queue
(`<name>-dlq`).

---

## Tech Stack

| Layer            | Technology                                   |
| ---------------- | -------------------------------------------- |
| Runtime          | Node.js 22                                   |
| Backend          | NestJS 11, TypeScript 5, REST API            |
| ORM              | Prisma 7                                     |
| Database         | PostgreSQL 16 (31 tables, 7 enums)           |
| Queue            | BullMQ 5 + Redis 7                           |
| Remote execution | `ssh2` connection pool (no wp-cli, no agent) |
| Frontend         | React 19 + Vite 5                            |
| UI components    | shadcn/ui + Tailwind CSS 4                   |
| Server state     | TanStack Query v5                            |
| Client state     | Zustand (UI/session)                         |
| Forms            | React Hook Form + Zod                        |
| Real-time        | NestJS WebSocket Gateway + Redis pub/sub     |
| Monorepo         | pnpm workspaces + Turborepo                  |
| Containers       | Docker Compose                               |

---

## Security

- **Credential encryption:** AES-256-GCM at rest. SSH keys, CyberPanel
  credentials, WordPress DB credentials, and Slack tokens are encrypted.
  Decrypted in memory only during use; never returned in API responses.
- **Credential parsing:** `wp-config.php` / `.env` values extracted via regex
  only — never sourced, never eval'd, never passed to a shell.
- **JWT:** 15-minute access tokens + 7-day refresh tokens. Refresh tokens stored
  as bcrypt hashes with rotation on every use.
- **Rate limiting:** 5 login attempts per 15 minutes (Redis-backed); 100
  requests per minute globally.
- **RBAC:** 4-tier role hierarchy: `admin` > `manager` > `maintainer` >
  `client`. Guards on both API routes and frontend navigation. `admin` is
  required for all create/update operations on servers, clients, users, and
  settings. `manager` can view all data and trigger operational actions
  (backups, scans, monitors). `maintainer` can view all operational data and
  change their own password. `client` is a soft permission tier — no
  database-level row isolation per client user.
- **Input validation:** Global `ValidationPipe` with `whitelist: true` and
  `forbidNonWhitelisted: true`. All inputs validated via `class-validator` DTOs.
- **HTTP headers:** Helmet + custom CSP, X-Frame-Options, X-Content-Type-Options
  applied by nginx.
- **Remote execution:** All SSH operations route through `RemoteExecutorService`
  — no `child_process.exec`, no shell spawning, no `eval`.

---

## Quick Start

**Prerequisites:** Docker, Docker Compose, `curl`

```bash
git clone https://github.com/satusdev/bedrock-forge.git
cd bedrock-forge
./install.sh
```

`install.sh` auto-generates all secrets, builds the image, starts all services,
runs migrations, and seeds the database (roles, admin user, default tags and
packages). No manual `.env` editing required on first run.

Open **http://localhost:3000**. Admin credentials are printed at the end of
install output.

> **Change the default admin password immediately after first login.**

See [docs/getting-started/QUICK_START.md](docs/getting-started/QUICK_START.md)
for a walkthrough of adding your first server, project, backup, and monitor.

---

## Development Setup

```bash
# Prerequisites: Node.js 22, pnpm 9+
docker compose -f docker-compose.dev.yml up -d postgres redis

pnpm install
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, JWT_SECRET

pnpm db:generate
pnpm db:migrate
pnpm dev
```

This starts:

- **API** on `:3000` (NestJS with hot reload)
- **Worker** (BullMQ with hot reload)
- **Web** on `:5173` (Vite dev server, proxies `/api` → `:3000`)

See [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md) for module
conventions, testing, and code standards.

---

## Docker Operations

| Script         | npm alias            | What it does                                                                |
| -------------- | -------------------- | --------------------------------------------------------------------------- |
| `./install.sh` | `pnpm docker:setup`  | First-time: build → start → migrate → seed                                  |
| `./update.sh`  | `pnpm docker:update` | Rebuild image, rolling restart, auto-migrate (data preserved)               |
| `./reset.sh`   | `pnpm docker:reset`  | **Destructive.** Wipe all volumes, regenerate secrets, rebuild from scratch |

```bash
pnpm docker:seed          # Seed database (idempotent)
pnpm docker:migrate       # Apply pending migrations without restart
pnpm docker:shell         # Shell into forge container
pnpm docker:ps            # Show running service status
pnpm docker:logs          # Tail forge logs
pnpm docker:logs:all      # Tail all service logs
pnpm docker:restart       # Restart forge container (no rebuild)
```

---

## Environment Variables

Auto-generated by `install.sh`. Only needed for manual setup.

| Variable               | Description                                    | Required |
| ---------------------- | ---------------------------------------------- | -------- |
| `DATABASE_URL`         | PostgreSQL connection string                   | ✅       |
| `REDIS_PASSWORD`       | Redis auth password                            | ✅       |
| `REDIS_URL`            | Redis connection string                        | ✅       |
| `JWT_SECRET`           | JWT signing secret                             | ✅       |
| `JWT_REFRESH_SECRET`   | Refresh token signing secret                   | ✅       |
| `ENCRYPTION_KEY`       | AES-256-GCM key — 64 hex characters (32 bytes) | ✅       |
| `POSTGRES_DB`          | Postgres database name                         | ✅       |
| `POSTGRES_USER`        | Postgres user                                  | ✅       |
| `POSTGRES_PASSWORD`    | Postgres password                              | ✅       |
| `NODE_ENV`             | `production` or `development`                  |          |
| `API_PORT`             | API listen port (default: `3000`)              |          |
| `CORS_ORIGIN`          | Allowed CORS origin for production             |          |
| `BACKUP_STORAGE_PATH`  | Local temp path for backup archives            |          |
| `SCRIPTS_PATH`         | Override PHP scripts directory                 |          |
| `GDRIVE_CLIENT_ID`     | Google Drive OAuth client ID                   |          |
| `GDRIVE_CLIENT_SECRET` | Google Drive OAuth client secret               |          |
| `GDRIVE_TOKEN`         | rclone token JSON                              |          |
| `GDRIVE_FOLDER_ID`     | Default Google Drive backup folder             |          |

---

## Project Structure

```
bedrock-forge/
├── apps/
│   ├── api/                    # NestJS 11 REST API + WebSocket gateway
│   │   └── src/modules/        # 22 feature modules (controller → service → repository)
│   │   └── scripts/            # backup.php, plugin-scan.php (pushed on-demand)
│   └── web/                    # React 19 SPA (21 pages, all lazy-loaded)
│       └── src/features/       # Feature-scoped components and hooks
├── packages/
│   ├── shared/                 # Queue names, roles, Zod schemas
│   └── remote-executor/        # SSH pool + credential parser
├── prisma/
│   ├── schema.prisma           # 27-model schema
│   └── migrations/
├── docs/
│   ├── getting-started/
│   ├── guides/
│   └── reference/
├── Dockerfile                  # 4-stage build
├── docker-compose.yml          # Production
├── docker-compose.dev.yml      # Development
├── install.sh                  # First-time setup
├── update.sh                   # Rolling update
└── reset.sh                    # Destructive reset
```

---

## Missing Capabilities & Planned Work

The following are absent from the current codebase. They are not partial — they
do not exist. Contributions are welcome.

### 🔴 High Priority (Core gaps for production use)

- **Cross-server backup restore** — Restore currently requires the same
  environment as the source. Restoring to a different server or environment is
  not supported.
- **2FA / TOTP authentication** — No second factor for any role. All accounts
  are password-only.
- **Plugin update scheduling** — Plugin update endpoints exist on the API;
  scheduled update jobs with rollback are not implemented.
- **Email notifications (SMTP)** — All alerts are Slack-only. Operators without
  Slack have no out-of-band alerting.

### 🟡 Medium Priority (Important for broader adoption)

- **S3-compatible backup storage** — Only Google Drive is wired. Backblaze B2,
  Wasabi, MinIO, Amazon S3 (all rclone-compatible) require UI integration.
- **Invoice PDF export** — Invoices are database records only; no rendered PDF
  output.
- **Advanced uptime monitoring** — SSL certificate expiry, keyword/content
  checks, and custom header validation are not implemented.
- **Incremental backups** — All backups are full snapshots. rsync-based
  incrementals are roadmap.
- **Bulk operations** — No multi-select for backup, scan, or sync across
  multiple environments at once.
- **Multi-tenant workspaces** — Data is not isolated between operator teams.
  Single-tenant per installation.

### ⚪ Low Priority / Enhancements

- **Theme management** — No theme inventory or management capability.
- **WordPress core version management** — No automated or manual WP core update
  support.
- **Discord / Telegram / webhook notifications** — Additional notification
  channels beyond Slack.
- **White-label / custom branding** — No logo, color, or domain customization.
- **WordPress Multisite support** — Not tested or documented.
- **Cloud provider provisioning** — DigitalOcean, Hetzner, Vultr, AWS Lightsail
  VPS creation (shell scripts exist for Hetzner; no integrated UI).
- **Panel integrations** — cPanel/WHM, Plesk, DirectAdmin, CloudPanel, RunCloud
  are roadmap only. CyberPanel is the only supported panel.

---

## Documentation

| Document                                                                     | Description                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| [docs/getting-started/QUICK_START.md](docs/getting-started/QUICK_START.md)   | First server, project, backup, and monitor in 5 minutes   |
| [docs/getting-started/INSTALLATION.md](docs/getting-started/INSTALLATION.md) | System requirements, Docker setup, env vars               |
| [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md)             | System design, data model, queue system, security model   |
| [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)                     | Adding modules, tests, code conventions, local dev        |
| [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)                       | Production deployment, SSL, updating, server requirements |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Follow module conventions in
   [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)
4. Run `pnpm build && pnpm lint` before submitting
5. Open a pull request against `main`

---

## License

MIT — see [LICENSE](LICENSE) for details.
