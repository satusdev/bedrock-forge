# Bedrock Forge Project Guide

Bedrock Forge is a self-hosted WordPress operations platform. It is built for a
trusted internal team that manages client WordPress/Bedrock sites over SSH.

## Primary Docs

| Document                                                                     | Use it for                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [README.md](README.md)                                                       | Product overview, feature status, boundaries, quick start.          |
| [docs/guides/USAGE.md](docs/guides/USAGE.md)                                 | Day-to-day operator workflows and current limits.                   |
| [docs/getting-started/INSTALLATION.md](docs/getting-started/INSTALLATION.md) | Docker install, ports, environment variables, reverse proxy setup.  |
| [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)                       | Remote deployment, updates, SSL, rollback, platform backup.         |
| [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)                     | Local development and contribution patterns.                        |
| [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md)             | Services, queues, database model, security model, remote execution. |
| [docs/reference/PROJECT.md](docs/reference/PROJECT.md)                       | Extended engineering notes and implementation reference.            |

## Current Product Shape

The application manages:

- servers, clients, projects, environments, domains, and packages
- backups, restores, environment sync, config drift, and operational tools
- plugin, theme, and WordPress core actions
- security scans, findings, schedules, and hardening actions
- uptime monitoring, SSL/DNS/content checks, and Lighthouse audits
- invoices, billing currency display, Slack notifications, reports, audit logs,
  and job execution logs

It does not currently provide multi-tenant workspace isolation, payment
processing, 2FA/MFA, email notification delivery, cross-server restore,
incremental backups, or non-Google-Drive backup target UI.

## Local Commands

```bash
./install.sh
./update.sh
./reset.sh
./dev.sh

pnpm --filter @bedrock-forge/api lint
pnpm --filter @bedrock-forge/api test
pnpm --filter @bedrock-forge/web lint
pnpm --filter @bedrock-forge/web build
pnpm --filter @bedrock-forge/worker build
pnpm --filter @bedrock-forge/worker test
```
