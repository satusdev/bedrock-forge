<div align="center">
  <h1>Bedrock Forge</h1>
  <p>Self-hosted WordPress management dashboard — manage all your sites from one place</p>
</div>

<div align="center">

[![Node.js 22](https://img.shields.io/badge/node-22-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5-blue.svg)](https://www.typescriptlang.org/)
[![NestJS 11](https://img.shields.io/badge/nestjs-11-red.svg)](https://nestjs.com/)
[![React 19](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

## What Is Bedrock Forge?

Bedrock Forge is a **self-hosted alternative to ManageWP / MainWP** — a web
dashboard to manage multiple WordPress (Bedrock) sites across multiple servers
from a single interface.

It handles backups (with Google Drive upload), plugin scanning,
cross-environment sync, uptime monitoring, domain WHOIS tracking, billing, Slack
notifications, and real-time job progress streaming. Everything runs in three
Docker containers and deploys with a single command.

---

## Current Status

| Feature                            | Status      | Notes                                                       |
| ---------------------------------- | ----------- | ----------------------------------------------------------- |
| 🖥️ **Server Management**           | ✅ Complete | SSH key vault, CyberPanel auto-login, server scanning       |
| 📁 **Project & Client Management** | ✅ Complete | Projects → Clients → Packages hierarchy, bulk import        |
| 🌍 **Environment Management**      | ✅ Complete | Production / staging per project, DB credential vault       |
| 💾 **Backup & Restore**            | ✅ Complete | Full / DB-only / files-only, Google Drive upload, schedules |
| 🔌 **Plugin Scanning**             | ✅ Complete | On-demand scan, plugin enable/disable/delete                |
| 🔄 **Environment Sync**            | ✅ Complete | Cross-server file + DB sync via rsync / mysqldump           |
| 📡 **Uptime Monitoring**           | ✅ Complete | Configurable interval, response time, uptime %, alert logs  |
| 🌐 **Domain WHOIS**                | ✅ Complete | Expiry tracking, cached WHOIS data                          |
| 🏗️ **Bedrock Provisioning**        | ✅ Complete | Create fresh Bedrock WordPress + CyberPanel site via queue  |
| 💰 **Invoices & Billing**          | ✅ Complete | Yearly invoice generation per project, status tracking      |
| 🔔 **Slack Notifications**         | ✅ Complete | Per-event channel subscriptions, delivery logs              |
| 📊 **Activity & Audit Logs**       | ✅ Complete | BullMQ job audit trail + user action audit log              |
| 📈 **Dashboard**                   | ✅ Complete | Stats summary, recent job feed via WebSocket                |
| 🔐 **Auth & RBAC**                 | ✅ Complete | JWT with refresh rotation, 3-tier role system               |
| 📦 **Package Management**          | ✅ Complete | Hosting + support package definitions                       |
| 📋 **Reports**                     | ✅ Complete | Weekly summary report generation                            |

---

## Quick Start

## Quick Start

**Prerequisites:** Docker, Docker Compose, `curl`

```bash
git clone https://github.com/satusdev/bedrock-forge.git
cd bedrock-forge
./install.sh
```

`install.sh` auto-generates all secrets, builds the image, starts all services,
runs migrations, and seeds the database (roles, admin user, tags, packages). No
manual `.env` editing required on first run.

Open **http://localhost:3000** — the admin credentials are printed at the end of
the install output.

Default credentials are printed at the end of the install output — **change them
immediately after first login.**

> See [docs/getting-started/QUICK_START.md](docs/getting-started/QUICK_START.md) for a walkthrough of adding
> your first server, project, backup, and monitor.

---

## Key Features

### 🖥️ Server Management

Centralised SSH key vault. Connect any Linux server via SSH — password or
private key, with passphrase support. Keys are encrypted at rest with
AES-256-GCM. CyberPanel auto-login credentials stored per-environment. Server
scanning to import all detected WordPress environments in one shot.

### 📁 Project & Client Management

Organise sites by client with color-coded tags, hosting packages (storage /
bandwidth / max sites), and support packages (response hours / SLA). Projects
are linked to clients and packages, giving you a full billing-ready hierarchy.

### 🌍 Environments & Provisioning

Each project supports multiple environments (production, staging, etc.) on any
server. Create a fresh Bedrock WordPress install with automatic CyberPanel site
provisioning via a queued background job — no SSH manual steps.

### 💾 Backup & Restore

- **Backup types:** Full, database-only, files-only
- **Schedules:** Daily, weekly, or monthly cron — per environment
- **Google Drive upload** via `rclone` after every backup
- **Retention policies:** Count-based and age-based pruning
- **Restore:** Stream progress in real time from any backup version

### 🔌 Plugin Scanning & Management

On-demand scan pushes a minimal PHP script to the server, parses the plugin
registry, and returns a structured inventory — no wp-cli required. Enable,
disable, or delete plugins directly from the dashboard.

### 🔄 Environment Sync

Push or clone between environments in a single operation. Files sync via
`rsync`; databases sync via `mysqldump` + remote import. Credentials are read
directly from `wp-config.php` / `.env` without sourcing the file.

### 📡 Uptime Monitoring

Configurable polling interval per environment (default 10 minutes). Tracks
response time, HTTP status, uptime percentage, and logs every down/up/degraded
event with duration. Triggers Slack notifications on state changes.

### 🌐 Domain WHOIS

Track domain expiry across all your sites. WHOIS data is fetched via the system
`whois` command and cached — alerts when domains are close to expiry.

### 💰 Invoices & Billing

Generate yearly invoices per project combining hosting and support package
prices. Track draft / sent / paid / overdue / cancelled status with client
snapshots for historical accuracy.

### 🔔 Notifications & Reports

Slack notification channels with per-event subscriptions (backup completed,
backup failed, site down, site up, manual trigger). Weekly summary reports. Full
delivery log with error capture.

### 📋 Audit Trail & Activity Feed

Every user action (create, update, delete) generates an audit log entry. Every
background job writes a timestamped execution log with step-by-step progress.
Live feed on the dashboard via WebSocket.

---

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Runtime          | Node.js 22                                          |
| Backend          | NestJS 11, REST API, TypeScript 5                   |
| ORM              | Prisma 7                                            |
| Database         | PostgreSQL 16                                       |
| Queue            | BullMQ 5 + Redis 7                                  |
| Remote execution | `ssh2` connection pool (no wp-cli, no agent binary) |
| Frontend         | React 19 + Vite 5                                   |
| UI components    | shadcn/ui + Tailwind CSS 4                          |
| Server state     | TanStack Query v5                                   |
| Client state     | Zustand (UI/session only)                           |
| Forms            | React Hook Form + Zod                               |
| Real-time        | NestJS WebSocket Gateway + Redis pub/sub            |
| Monorepo         | pnpm workspaces + Turborepo                         |
| Containers       | Docker Compose                                      |

---

## Architecture

Three Docker services:

```
┌───────────────────────────────┐     ┌──────────────┐
│  forge (single container)     │     │  web (nginx) │
│  ├─ NestJS API  :3000         │◄────│  :80 → :3000 │
│  └─ BullMQ Worker             │     └──────────────┘
│       └─ SSH pool (ssh2)      │
│       └─ rclone (Google Drive)│
│       └─ whois (system cmd)   │
└────────┬──────────────────────┘
         │
    ┌────▼─────┐   ┌───────┐
    │ postgres │   │ redis │
    │ :5432    │   │ :6379 │
    └──────────┘   └───────┘
```

**Remote execution model:** All operations on managed servers go through
`RemoteExecutorService` (SSH pool, max 15 concurrent connections per server).
Two minimal PHP scripts are pushed on-demand to remote servers — no wp-cli
dependency.

**Queue-based design:** Every long-running operation (backup, sync, scan,
monitor check, WHOIS lookup, provisioning, notification) is a BullMQ job.
Controllers enqueue; workers execute. Real-time progress streams via WebSocket.

### Queue Registry

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

## Project Structure

```
bedrock-forge/
├── apps/
│   ├── api/                    # NestJS 11 REST API + WebSocket gateway
│   │   └── src/modules/        # 22 feature modules
│   ├── worker/                 # BullMQ processors (8 processor modules)
│   │   └── scripts/            # backup.php, plugin-scan.php (pushed on-demand)
│   └── web/                    # React 19 SPA (19 pages, all lazy-loaded)
│       └── src/features/       # Feature-scoped code
├── packages/
│   ├── shared/                 # @bedrock-forge/shared — queue names, roles, Zod schemas
│   └── remote-executor/        # @bedrock-forge/remote-executor — SSH pool + credential parser
├── prisma/
│   ├── schema.prisma           # 27-model schema (27 tables, 7 enums)
│   └── migrations/
├── docs/
│   ├── getting-started/        # QUICK_START.md, INSTALLATION.md
│   ├── guides/                 # DEVELOPMENT.md, DEPLOYMENT.md
│   └── reference/              # ARCHITECTURE.md, PROJECT.md
├── Dockerfile                  # 4-stage build (deps → builder → runtime → web)
├── docker-compose.yml          # Production (tuned for 4 GB RAM VPS)
├── docker-compose.dev.yml      # Development
├── install.sh                  # First-time setup
├── update.sh                   # Rolling update (preserves data)
├── reset.sh                    # Destructive full reset
└── deploy.sh                   # Push + deploy to remote server via rsync + SSH
```

---

## Docker Operations

| Script         | npm alias            | What it does                                                                |
| -------------- | -------------------- | --------------------------------------------------------------------------- |
| `./install.sh` | `pnpm docker:setup`  | First-time: build → start → migrate → seed                                  |
| `./update.sh`  | `pnpm docker:update` | Rebuild image, rolling restart, auto-migrate (data preserved)               |
| `./reset.sh`   | `pnpm docker:reset`  | **Destructive.** Wipe all volumes, regenerate secrets, rebuild from scratch |

### One-off commands

```bash
# Seed the database (idempotent — safe to run multiple times)
pnpm docker:seed

# Apply pending migrations without restarting
pnpm docker:migrate

# Open a shell inside the forge container
pnpm docker:shell

# View running service status
pnpm docker:ps

# Tail forge API/worker logs
pnpm docker:logs

# Tail all service logs (postgres + redis + forge + web)
pnpm docker:logs:all

# Restart forge only (no rebuild)
pnpm docker:restart
```

---

## Environment Variables

Generated automatically by `install.sh`. Only required if setting up manually.

| Variable               | Description                                        | Required |
| ---------------------- | -------------------------------------------------- | -------- |
| `DATABASE_URL`         | PostgreSQL connection string                       | ✅       |
| `REDIS_PASSWORD`       | Redis auth password                                | ✅       |
| `REDIS_URL`            | Redis connection string                            | ✅       |
| `JWT_SECRET`           | JWT signing secret                                 | ✅       |
| `JWT_REFRESH_SECRET`   | Refresh token signing secret                       | ✅       |
| `ENCRYPTION_KEY`       | AES-256-GCM key — 64 hex characters (32 bytes)     | ✅       |
| `POSTGRES_DB`          | Postgres database name (Docker Compose)            | ✅       |
| `POSTGRES_USER`        | Postgres user (Docker Compose)                     | ✅       |
| `POSTGRES_PASSWORD`    | Postgres password (Docker Compose)                 | ✅       |
| `NODE_ENV`             | `production` or `development`                      |          |
| `API_PORT`             | API listen port (default: `3000`)                  |          |
| `CORS_ORIGIN`          | Allowed CORS origin (production URL)               |          |
| `BACKUP_STORAGE_PATH`  | Local path for backup temp files                   |          |
| `SCRIPTS_PATH`         | Override PHP scripts dir (auto-detected)           |          |
| `GDRIVE_CLIENT_ID`     | Google Drive OAuth client ID (optional)            |          |
| `GDRIVE_CLIENT_SECRET` | Google Drive OAuth client secret (optional)        |          |
| `GDRIVE_TOKEN`         | rclone token JSON for Google Drive (optional)      |          |
| `GDRIVE_FOLDER_ID`     | Default Google Drive folder for backups (optional) |          |

---

## Security

- **Credential encryption:** AES-256-GCM. SSH keys, CyberPanel credentials,
  WordPress DB credentials, and Slack tokens are all encrypted at rest.
  Decrypted in memory only during use, never returned in API responses.
- **Credential parsing:** WordPress credentials are extracted from
  `wp-config.php` / `.env` via **regex only** — files are never sourced, never
  eval'd, never passed to a shell.
- **JWT:** 15-minute access tokens + 7-day refresh tokens. Refresh tokens stored
  as bcrypt hashes with rotation on every use.
- **Rate limiting:** 5 login attempts per 15 minutes (Redis-backed). 100
  requests per minute globally.
- **RBAC:** 3-tier role hierarchy: `admin` > `manager` > `client`. Guards on
  both API routes and frontend navigation.
- **Validation:** Global `ValidationPipe` with `whitelist: true` and
  `forbidNonWhitelisted: true`. All inputs validated via `class-validator` DTOs.
- **Headers:** Helmet + custom Content-Security-Policy, X-Frame-Options,
  X-Content-Type-Options applied by nginx.
- **Remote execution:** All SSH operations go through `RemoteExecutorService`
  only — no `child_process.exec`, no shell spawning, no `eval`.

---

## Development

```bash
# Prerequisites: Node.js 22, pnpm 9+
# Start postgres + redis via Docker, run API + Worker + Web locally:
docker compose -f docker-compose.dev.yml up -d postgres redis

pnpm install
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, JWT_SECRET

pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

This starts:

- **API** on `:3000` (NestJS with hot reload)
- **Worker** (BullMQ with hot reload)
- **Web** on `:5173` (Vite dev server, proxies `/api` → `:3000`)

> See [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md) for the full guide — adding
> modules, running tests, code conventions.

---

## Roadmap

### Panel & Provider Support 🏗️

- [ ] **cPanel / WHM** — host integration for cPanel-based shared hosting
      environments
- [ ] **Plesk** — Plesk Obsidian panel integration
- [ ] **DirectAdmin** — DirectAdmin panel support
- [ ] **CloudPanel** — CloudPanel REST API integration
- [ ] **RunCloud** — RunCloud managed server integration

### Server Provisioning 🔧

- [ ] **DigitalOcean** — Droplet creation + auto-configuration
- [ ] **Vultr** — VPS provisioning
- [ ] **AWS Lightsail** — Lightsail instance management
- [ ] **Linode / Akamai Cloud** — Instance lifecycle management
- [ ] **DNS automation** — Cloudflare API integration for DNS record management
- [ ] **SSL automation** — Certbot / ACME integration for Let's Encrypt certs

### Backup & Storage 💾

- [ ] **S3-compatible storage** — Backblaze B2, Wasabi, MinIO, Amazon S3
- [ ] **SFTP remote storage** — Push backups to any SFTP target
- [ ] **Incremental backups** — Block-level / rsync-based incremental backups
- [ ] **Cross-server backup restore** — Restore a backup to a different server

### Notifications & Monitoring 🔔

- [ ] **Email notifications** — SMTP-based alerts for all existing Slack events
- [ ] **Discord notifications** — Discord webhook integration
- [ ] **Telegram notifications** — Telegram bot notification channel
- [ ] **Webhook notifications** — Generic outbound webhook for custom
      integrations
- [ ] **Performance monitoring** — Core Web Vitals, TTFB, load time tracking
      over time
- [ ] **Advanced monitor conditions** — Keyword checks, certificate expiry,
      custom headers

### WordPress Management 🌐

- [ ] **Plugin auto-updates** — Scheduled plugin update jobs with rollback
      safety
- [ ] **Theme management** — Theme inventory scanning and management
- [ ] **WordPress auto-updates** — Core WordPress version management
- [ ] **WordPress Multisite** — Network site management support
- [ ] **WooCommerce integration** — Order count, revenue stats per environment

### Platform & UX 🎨

- [ ] **CLI companion** — Terminal tool for power users / CI pipelines
- [ ] **REST API for integrations** — Public API with API key auth for
      third-party tooling
- [ ] **White-label / custom branding** — Logo, colours, domain via settings
- [ ] **Team workspace** — Per-team data isolation, member management
- [ ] **Two-factor authentication** — TOTP-based 2FA for all accounts
- [ ] **Mobile-responsive PWA** — Installable progressive web app
- [ ] **Dark / light mode toggle** — Per-user theme preference persistence
- [ ] **Bulk operations** — Multi-select backup, scan, sync across projects

---

## Documentation

| Document                                     | Description                                               |
| -------------------------------------------- | --------------------------------------------------------- |
| [docs/getting-started/QUICK_START.md](docs/getting-started/QUICK_START.md)   | First server, project, backup, and monitor in 5 minutes   |
| [docs/getting-started/INSTALLATION.md](docs/getting-started/INSTALLATION.md) | System requirements, Docker setup, dev setup, env vars    |
| [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md)             | System design, data model, queue system, security model   |
| [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)                     | Adding modules, tests, code conventions, local dev        |
| [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)                       | Production deployment, SSL, updating, server requirements |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow the module conventions in [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)
4. Run `pnpm build && pnpm lint` before submitting
5. Open a pull request against `main`

---

## License

MIT — see [LICENSE](LICENSE) for details.
