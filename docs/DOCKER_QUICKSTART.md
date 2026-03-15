# Docker Quick Start Guide

Get Bedrock Forge running with Docker in minutes. This guide covers both
development and production setups.

## Prerequisites

- **Docker** 20.10+ with Docker Compose v2
- **Git** for cloning the repository

```bash
# Verify Docker installation
docker --version
docker compose version
```

## 🚀 Development Setup (5 Minutes)

### 1. Clone and Navigate

```bash
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge
```

### 2. Start Services

```bash
# Select local Docker env
cp .env.local.example .env

# Start all services with hot-reload
docker compose up -d

# View logs
docker compose logs -f
```

### 3. Access the Application

| Service    | URL                               | Description                         |
| ---------- | --------------------------------- | ----------------------------------- |
| Dashboard  | http://localhost:3000             | React frontend                      |
| API        | http://localhost:8000             | NestJS backend                      |
| API Docs   | http://localhost:8000/api/v1/docs | Swagger UI (if enabled)             |
| PostgreSQL | localhost:5432                    | Database (user: forge, pass: forge) |
| Redis      | localhost:6379                    | Cache/broker                        |

### 4. Verify Setup

```bash
# Check all services are running
docker compose ps

# Test API health
curl http://localhost:8000/api/v1/health
```

## 🏭 Production Setup

### 1. Configure Environment

```bash
# Copy production template and edit values
cp .env.production.example .env
```

### 2. Configure Required Variables

Edit `.env` with your values:

```bash
POSTGRES_PASSWORD=<strong-password>
SECRET_KEY=<random-32-byte-hex>
CORS_ORIGINS=["https://yourdomain.com"]
```

### 3. Build and Start

```bash
docker compose build
docker compose up -d
```

### 4. Initialize Database

```bash
# Prisma schema sync
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:push"
```

### 5. Seed Database (Optional)

```bash
# Prisma seed
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:seed"

# Clean reset + seed
./reset-seed.sh

# Local smoke: build + up + migrate + seed + health checks
./scripts/local-docker-smoke.sh

# Server tarball deploy (preserves data by default)
./server-deploy --mode update

# Server tarball deploy + optional seed
./server-deploy --mode update --seed

# Server tarball deploy full reset (wipes volumes and re-seeds)
./server-deploy --mode reset

# End-to-end wrapper: creates local tar archive, uploads via SSH, runs remote deploy,
# streams output locally, and writes local logs under logs/deploy/
./forge-deploy update
./forge-deploy update --seed
./forge-deploy reset

# Optional SSH overrides
./forge-deploy reset --host 49.13.65.81 --user root --port 22
```

For tarball uploads, `server-deploy` removes the previous extracted project
directory, extracts a fresh copy, deletes the uploaded tar file, and preserves
`.env` if it existed. `forge-deploy` automates the local archive creation and
SSH upload before invoking `server-deploy` remotely.

Seeding is Prisma-only via the `api` tooling container.

## ✅ Local Docker Test Flow

Use this flow to validate deploy/seed paths locally before server rollout:

```bash
cp .env.local.example .env
./scripts/local-docker-smoke.sh
```

Migration parity mode is removed; smoke always runs Prisma migration + seed.

## 📋 Service Architecture

```
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │   Dashboard  │   │   Nest API   │   │   Seed Tool  │
   │  (React/Vite)│   │  (runtime)   │   │ (seed bridge)│
   │   port 3000  │   │   port 8000  │   │   port 8100  │
   └──────────────┘   └───────┬──────┘   └───────┬──────┘
               │                  │
             ┌─────────▼─────────┐        │
             │    PostgreSQL     │◄───────┘
             │     port 5432     │
             └─────────┬─────────┘
               │
              ┌────▼────┐
              │  Redis  │
              │  6379   │
              └─────────┘
```

## 🔧 Common Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f api

# Restart a service
docker compose restart api

# Execute command in container
docker compose exec api bash

# Database backup
docker compose exec postgres pg_dump -U forge forge > backup.sql

# Scale API replicas (production)
docker compose up -d --scale api=3
```

## ♻️ Reset Database

### Development (data loss OK)

```bash
# Stop and remove all containers and volumes
docker compose down -v

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d

# Optional: re-seed
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:seed"
```

### Production (backup required)

```bash
# 1) Backup first (stores backup.sql locally)
docker compose exec -T postgres pg_dump -U ${POSTGRES_USER:-forge} ${POSTGRES_DB:-forge} > backup.sql

# 2) Reset database
docker compose exec postgres psql -U ${POSTGRES_USER:-forge} -d postgres -c "DROP DATABASE ${POSTGRES_DB:-forge};"
docker compose exec postgres psql -U ${POSTGRES_USER:-forge} -d postgres -c "CREATE DATABASE ${POSTGRES_DB:-forge};"

# 3) Sync schema and re-seed
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:seed"
```

## 🐛 Troubleshooting

| Issue                      | Solution                                            |
| -------------------------- | --------------------------------------------------- |
| Services won't start       | Check `docker compose logs` for errors              |
| Database connection failed | Ensure postgres is healthy: `docker compose ps`     |
| API not responding         | Check API logs: `docker compose logs api`           |
| Port already in use        | Stop conflicting services or change ports in `.env` |
| Permission denied          | Ensure Docker socket permissions are correct        |

## 📚 Next Steps

- [Configuration Guide](CONFIGURATION.md) - Customize settings
- [Development Guide](DEVELOPMENT.md) - Contributing and development
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment strategies
- [API Reference](API.md) - API documentation
