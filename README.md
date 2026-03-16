# Bedrock Forge

WordPress management platform built with NestJS, Prisma, BullMQ, and React 19.

## Quick Start

**Prerequisites:** Docker + Docker Compose

```bash
chmod +x install.sh
./install.sh
```

Then open **http://localhost:3000**.

The installer generates secrets automatically and writes them to `.env`.

---

## Architecture

### Services (3)

| Service    | Image              | Role                           |
| ---------- | ------------------ | ------------------------------ |
| `postgres` | postgres:16-alpine | Primary database (23 tables)   |
| `redis`    | redis:7-alpine     | BullMQ queue backend           |
| `forge`    | Multi-stage build  | API + Worker + static React UI |

The `forge` container runs two Node processes via `entrypoint.sh`:

- **API** (`apps/api`) — NestJS REST server on `:3000`, serves React SPA in
  production
- **Worker** (`apps/worker`) — BullMQ processor (no HTTP port)

### Database (23 tables)

`users`, `roles`, `user_roles`, `refresh_tokens`, `clients`, `tags`,
`client_tags`, `hosting_packages`, `support_packages`, `servers`, `projects`,
`environments`, `cyberpanel_users`, `backups`, `plugin_scans`, `domains`,
`monitors`, `monitor_results`, `wp_db_credentials`, `execution_scripts`,
`job_executions`, `app_settings`, `audit_logs`

### Queue Jobs (6)

| Queue          | Job Types                         |
| -------------- | --------------------------------- |
| `backups`      | `backup:create`, `backup:restore` |
| `plugin-scans` | `plugin-scan:run`                 |
| `sync`         | `sync:clone`, `sync:push`         |
| `monitors`     | `monitor:check` (repeatable)      |
| `domains`      | `domain:whois`                    |
| `projects`     | `project:create-bedrock`          |

---

## Development

### Prerequisites

- Node.js 22
- pnpm 9+
- PostgreSQL 16 + Redis 7 (or use Docker)

```bash
# Install dependencies
pnpm install

# Copy environment
cp .env.example .env
# Edit .env — fill DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, JWT_SECRET

# Generate Prisma client
pnpx prisma generate

# Run migrations
pnpx prisma migrate dev

# Start all services in dev mode
pnpm dev
```

This starts:

- API on `:3000` (with hot reload)
- Worker (with hot reload)
- Web on `:5173` (Vite dev server, proxies `/api` → `:3000`)

---

## Environment Variables

| Variable              | Description                       | Required |
| --------------------- | --------------------------------- | -------- |
| `DATABASE_URL`        | PostgreSQL connection string      | ✅       |
| `REDIS_URL`           | Redis connection string           | ✅       |
| `ENCRYPTION_KEY`      | AES-256-GCM key (64 hex chars)    | ✅       |
| `JWT_SECRET`          | JWT signing secret                | ✅       |
| `JWT_EXPIRY`          | Access token TTL (default: `15m`) |          |
| `JWT_REFRESH_EXPIRY`  | Refresh token TTL (default: `7d`) |          |
| `POSTGRES_USER`       | Postgres user (Docker)            |          |
| `POSTGRES_PASSWORD`   | Postgres password (Docker)        | ✅       |
| `POSTGRES_DB`         | Postgres database name (Docker)   |          |
| `WORKER_SCRIPTS_PATH` | Path to PHP scripts dir           |          |
| `NODE_ENV`            | `production` or `development`     |          |

---

## Tech Stack

- **Backend**: NestJS 11, REST, Prisma 7, TypeScript 5
- **Queue**: BullMQ 5, Redis 7
- **Remote execution**: ssh2 (connection pool, no wp-cli)
- **Frontend**: React 19, Vite 5, Tailwind CSS 4, TanStack Query v5, Zustand,
  React Hook Form, Zod
- **Database**: PostgreSQL 16
- **Monorepo**: pnpm workspaces + Turborepo

---

## Project Structure

```
bedrock-forge/
├── apps/
│   ├── api/          # NestJS REST API
│   ├── worker/       # BullMQ processors
│   └── web/          # React 19 SPA
├── packages/
│   ├── shared/       # Queues, roles, Zod types
│   └── remote-executor/  # SSH pool + credential parser
├── prisma/
│   └── schema.prisma # 23-table schema
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
└── install.sh
```

---

## Security Notes

- SSH private keys and passphrases are **encrypted at rest** (AES-256-GCM)
- Credential extraction is regex-only — files are **never sourced or eval'd**
- JWT access tokens expire in 15 minutes; refresh tokens are stored as SHA-256
  hashes
- All sensitive env vars must be set before first run
