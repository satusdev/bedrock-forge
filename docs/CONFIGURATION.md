# Configuration Guide

Configuration is environment-driven for Docker, Nest API, Dashboard, PostgreSQL,
and Redis.

## Primary configuration files

- `.env.local.example` → local baseline
- `.env.production.example` → production baseline
- `docker-compose.yml` → service wiring and profiles
- `nest-api/prisma/schema.prisma` → database schema

## Local configuration flow

```bash
cp .env.local.example .env
docker compose up -d
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:seed"
```

## Production configuration flow

```bash
cp .env.production.example .env
docker compose build
docker compose up -d
```

Then run Prisma push/seed if needed using the same `--profile seed` commands.

## Related references

- [Environment Variables](ENVIRONMENT_VARIABLES.md)
- [Docker Quick Start](DOCKER_QUICKSTART.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)

## Legacy note

Legacy Python CLI config docs are archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)
