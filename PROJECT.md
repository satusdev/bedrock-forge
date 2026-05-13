# Bedrock Forge

Self-hosted WordPress management dashboard. Replaces ManageWP/MainWP.

For the full architecture reference, see
[docs/reference/PROJECT.md](docs/reference/PROJECT.md).

## Quick Start

```bash
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

See [docs/getting-started/INSTALLATION.md](docs/getting-started/INSTALLATION.md)
for a complete setup guide.

## Development

```bash
pnpm install
pnpm dev
```

See [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md) for the development
workflow.

## Deployment

See [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) for production
deployment.

## Architecture

- **Stack**: NestJS 11 API, NestJS Worker (BullMQ), React 19 + Vite 5,
  PostgreSQL 16, Redis 7
- **4 Docker services**: `postgres`, `redis`, `forge` (API on host port 3001 +
  Worker health on internal port 3001), `web` (Nginx on port 3002)
- **Auth**: JWT access token (4h default) + hashed refresh token (30d default)
  rotation
- **Encryption**: AES-256-GCM for all credentials at rest
- **Background jobs**: BullMQ with Redis (11 queues, exponential backoff,
  dead-letter)
- **Remote execution**: SSH connection pool via `ssh2`, no shell injection
  (shellQuote everywhere)

Full documentation: [docs/reference/PROJECT.md](docs/reference/PROJECT.md)
