<div align="center">
  <h1>Bedrock Forge</h1>
  <p>Self-hosted WordPress operations dashboard for teams managing Bedrock and standard WordPress sites over SSH.</p>
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

## What It Is

Bedrock Forge is a single-tenant, self-hosted management platform for WordPress
infrastructure. It is built for operators who manage multiple client sites,
staging/production environments, backups, plugin updates, security checks,
performance audits, and recurring maintenance from one dashboard.

It connects to managed servers over SSH. No permanent agent is installed on the
remote server. Worker jobs push small helper scripts when needed, run the
operation, stream progress back to the UI, and clean up after themselves.

The app is especially useful for CyberPanel-hosted Bedrock projects, but it also
supports standard WordPress layouts for many operations.

## What It Can Do Today

| Area                 | Current capability                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Servers              | Store encrypted SSH credentials, test connectivity, inspect server health, use CyberPanel helpers where configured.                                                                                          |
| Clients and projects | Track clients, projects, environments, domains, tags, packages, invoices, and activity.                                                                                                                      |
| Environments         | Manage production/staging/dev environments, root paths, backup paths, protected DB tables, and WP DB credential discovery.                                                                                   |
| Backups              | Create full, database-only, and files-only backups; schedule backups; upload to Google Drive via rclone; restore to the same environment.                                                                    |
| Sync and restore     | Clone/push database and files between environments with safety backups, URL replacement, cache cleanup, and protected table support.                                                                         |
| Plugins              | Scan installed plugins, view Composer/manual/GitHub source, activate/deactivate, install, update, remove, change Composer constraints, schedule Composer updates, and manage a custom GitHub plugin catalog. |
| Themes               | Scan, install, update, activate, and delete themes through WP-CLI worker jobs.                                                                                                                               |
| WordPress core       | Check current core version and run core updates through WP-CLI worker jobs.                                                                                                                                  |
| Tools                | Run cleanup, maintenance mode, debug toggles, WP cron inspection, log fetches, cache fixes, and other environment operations.                                                                                |
| Files & Config       | Edit remote `.env` safely, compare environment variables, browse safe remote roots, quick-edit text files, tail logs, download small files, archive uploads, and keep project notes.                         |
| Security             | Run server and WordPress environment scans, schedule scans, review findings, acknowledge findings, apply hardening actions, and configure SSH/file-change alerts.                                            |
| Monitoring           | HTTP uptime checks, SSL expiry checks, DNS checks, keyword/content checks, response history, incident logs, and notifications.                                                                               |
| Lighthouse           | Queue and review local Lighthouse or PageSpeed performance audits, including mobile/desktop history and trend charts.                                                                                        |
| Domains              | Track domain WHOIS expiry and SSL expiry.                                                                                                                                                                    |
| Billing              | Define hosting/support packages, generate invoices, track invoice status, and configure display currency/locale.                                                                                             |
| Notifications        | Slack delivery, in-app notification records, notification logs, and weekly reports.                                                                                                                          |
| Integrations         | Google Drive backup storage, Cloudflare DNS/cache controls, and encrypted integration credentials.                                                                                                           |
| Platform ops         | Audit logs, job execution logs, system backups, command palette, dark mode, RBAC, and a cross-project problems feed.                                                                                         |

## What It Does Not Do Yet

These are current boundaries, not bugs:

- No multi-tenant workspace isolation. One Forge install is for one team.
- No payment processing. Billing tracks invoices only; it does not charge cards
  or integrate with Stripe/PayPal.
- No invoice PDF export.
- No 2FA/MFA or SSO.
- No email, Discord, Telegram, or generic webhook notification delivery.
- No incremental backups. Backups are full snapshots by selected scope.
- No cross-server restore from an existing backup record. Restores target the
  originating environment.
- Google Drive is the only remote backup target wired into the backup UI.
- The remote file browser is intentionally limited to safe roots such as site
  root, uploads, logs, downloads, and backup paths.
- Direct file download is intended for small files; large uploads are packaged
  into a remote Downloads archive.
- CyberPanel automation is CyberPanel-specific. cPanel, Plesk, DirectAdmin,
  CloudPanel, and RunCloud are not integrated.
- WordPress Multisite is not documented or tested.
- SSH host key trust/known-host verification is not implemented yet.
- External vulnerability-feed sync such as WPScan/CVE ingestion is not wired
  as a production feed.
- Lighthouse runs locally with Chromium in the Docker image by default.
  Google PageSpeed API fallback is optional and quota-bound.

## How It Works

Bedrock Forge runs as a Docker Compose stack:

- `web`: nginx serving the React/Vite dashboard and proxying `/api` and `/ws`
- `forge`: NestJS API plus BullMQ worker runtime
- `postgres`: application database
- `redis`: queues, pub/sub, rate limiting, and realtime job updates

Long-running operations are queued. The API validates and enqueues jobs; the
worker executes remote SSH work and writes step-by-step job logs. The frontend
subscribes to WebSocket updates and polls job execution logs where needed.

Remote server access is SSH-native:

- Credentials are encrypted at rest with AES-256-GCM.
- WordPress DB credentials are parsed from `wp-config.php` or Bedrock `.env`
  using regex-based parsing, not shell sourcing.
- Helper PHP scripts are pushed on demand for backup, scan, Composer, custom
  plugin, WP users, and WP action workflows.
- WP-CLI is used for actions where WordPress itself provides the safest API,
  such as theme management, core updates, cache cleanup, and selected plugin
  operations.

## Quick Start

Prerequisites:

- Docker Engine 24+
- Docker Compose v2+
- `curl`
- `openssl`

```bash
git clone https://github.com/satusdev/bedrock-forge.git
cd bedrock-forge
./install.sh
```

Production Docker ports:

| URL                            | Purpose          |
| ------------------------------ | ---------------- |
| `http://localhost:3002`        | Web dashboard    |
| `http://localhost:3001/health` | API health check |

Default seeded admin:

| Field    | Value                      |
| -------- | -------------------------- |
| Email    | `admin@bedrockforge.local` |
| Password | `admin123`                 |

Change the admin password immediately after first login.

## Common Workflows

1. Add a server in **Servers** with SSH host, user, port, and private key.
2. Add a client and project in **Clients** or **Projects**.
3. Add one or more environments under the project with URL, root path, backup
   path, and server.
4. Run a backup from **Project -> Backups**.
5. Run a plugin scan from **Project -> Plugins**.
6. Use **Project -> Files & Config** for `.env`, downloads, logs, and notes.
7. Configure monitoring from **Monitors** and security schedules from
   **Security**.
8. Use **Activity** or the project execution log panel when a queued job needs
   inspection.

See [docs/guides/USAGE.md](docs/guides/USAGE.md) for a fuller operator guide.

## Documentation

| Document                                             | Purpose                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [Quick Start](docs/getting-started/QUICK_START.md)   | First local install and first site workflow.                         |
| [Installation](docs/getting-started/INSTALLATION.md) | Docker setup, environment variables, ports, and reverse proxy notes. |
| [Usage Guide](docs/guides/USAGE.md)                  | How to use the app day to day and what each area is for.             |
| [Deployment](docs/guides/DEPLOYMENT.md)              | Remote deployment, updates, SSL, backup strategy, and rollback.      |
| [Development](docs/guides/DEVELOPMENT.md)            | Local development, module patterns, worker patterns, and tests.      |
| [Architecture](docs/reference/ARCHITECTURE.md)       | System design, services, queues, schema, security model.             |
| [Project Reference](docs/reference/PROJECT.md)       | Extended engineering reference and implementation notes.             |

## Development

```bash
pnpm install
./dev.sh
```

Manual development flow:

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the dev dashboard at `http://localhost:5173`.

Useful checks:

```bash
pnpm --filter @bedrock-forge/api lint
pnpm --filter @bedrock-forge/api test
pnpm --filter @bedrock-forge/web lint
pnpm --filter @bedrock-forge/web build
pnpm --filter @bedrock-forge/worker build
pnpm --filter @bedrock-forge/worker test
```

## Production Operations

```bash
./update.sh          # rebuild/restart Forge and apply migrations
./deploy.sh --cleanup-only # safe Docker image/build-cache cleanup on remote
./reset.sh           # destructive reset: wipes volumes and regenerates secrets
docker compose ps
docker compose logs -f forge
```

Deploy/update cleanup prunes unused images and old Docker builder cache after a
healthy deploy. It does not prune volumes. Set `DEPLOY_SKIP_DOCKER_CLEANUP=true`
to skip cleanup, or `DEPLOY_DOCKER_BUILDER_PRUNE_UNTIL=168h` to tune cache age.

Back up both:

- PostgreSQL data, because it stores all records and encrypted credentials.
- `.env`, because `ENCRYPTION_KEY` is required to decrypt stored credentials.

## License

MIT - see [LICENSE](LICENSE) for details.
