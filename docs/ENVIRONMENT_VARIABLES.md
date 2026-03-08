# Environment Variables (Docker)

This project now uses environment templates for Docker-first workflows:

- Local testing: [../.env.local.example](../.env.local.example)
- Production deploy: [../.env.production.example](../.env.production.example)

Copy one of them to `.env` before running Docker.

## Quick Start

```bash
# Local
cp .env.local.example .env

# Production
cp .env.production.example .env
```

## Required for Production

- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `CORS_ORIGINS`
- `VITE_API_BASE_URL`

## Common Docker Variables

| Variable                     | Used By                  | Notes                                                                  |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`       | Compose                  | Isolates container/network names                                       |
| `POSTGRES_USER`              | `postgres`, app services | DB username                                                            |
| `POSTGRES_PASSWORD`          | `postgres`, app services | DB password                                                            |
| `POSTGRES_DB`                | `postgres`, app services | DB name                                                                |
| `SECRET_KEY`                 | API                      | App auth/signing secret                                                |
| `ENCRYPTION_KEY`             | API                      | Optional, recommended in production                                    |
| `DEBUG`                      | API                      | `true` local, `false` production                                       |
| `CORS_ORIGINS`               | API                      | Allowed dashboard origins                                              |
| `VITE_API_BASE_URL`          | Dashboard build          | API endpoint for UI                                                    |
| `VITE_WS_URL`                | Dashboard build          | Optional websocket endpoint                                            |
| `FORGE_BACKUP_GDRIVE_REMOTE` | API                      | Rclone remote name for Google Drive backup uploads (default: `gdrive`) |
| `SEED_DEMO_MODE`             | Prisma seed              | `true` local demo; `false` production                                  |
| `SEED_ADMIN_EMAIL`           | Prisma seed              | Required when `SEED_DEMO_MODE=false`                                   |
| `SEED_ADMIN_PASSWORD`        | Prisma seed              | Required when `SEED_DEMO_MODE=false`                                   |

## Optional Integrations

## `CORS_ORIGINS` format

The API accepts either format:

- JSON array (recommended):
  `CORS_ORIGINS=["http://localhost:3000","https://app.example.com"]`
- Comma-separated string:
  `CORS_ORIGINS=http://localhost:3000,https://app.example.com`

Keep empty unless used:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_DRIVE_CREDENTIALS_FILE`
- `GOOGLE_DRIVE_TOKEN_FILE`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `CLOUDFLARE_API_TOKEN`
- `RCLONE_CONFIG` (optional path to `rclone.conf` file; if empty, default is
  `~/.config/rclone/rclone.conf`)

For Google Drive backup uploads, ensure the configured rclone remote exists in
the API runtime (`FORGE_BACKUP_GDRIVE_REMOTE` / `RCLONE_CONFIG`).

## Related Docs

- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md)
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
