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
cd bedrock-forge/deploy
```

### 2. Start Services

```bash
# Start all services with hot-reload
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

### 3. Access the Application

| Service    | URL                        | Description                         |
| ---------- | -------------------------- | ----------------------------------- |
| Dashboard  | http://localhost:3000      | React frontend                      |
| API        | http://localhost:8000      | FastAPI backend                     |
| API Docs   | http://localhost:8000/docs | Swagger UI                          |
| PostgreSQL | localhost:5432             | Database (user: forge, pass: forge) |
| Redis      | localhost:6379             | Cache/broker                        |

### 4. Verify Setup

```bash
# Check all services are running
docker compose -f docker-compose.dev.yml ps

# Test API health
curl http://localhost:8000/health
```

## 🏭 Production Setup

### 1. Configure Environment

```bash
cd deploy

# Copy and edit environment file
cp .env.production .env

# Generate secrets
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
```

### 2. Configure Required Variables

Edit `.env` with your values:

```bash
POSTGRES_PASSWORD=<strong-password>
SECRET_KEY=<random-32-byte-hex>
CORS_ORIGINS=https://yourdomain.com
```

### 3. Build and Start

```bash
docker compose build
docker compose up -d
```

### 4. Initialize Database

```bash
# Migrations run automatically on API startup, but you can run manually
docker compose exec api alembic -c forge/db/alembic.ini upgrade head
```

### 5. Seed Database (Optional)

```bash
# Demo data (default)
docker compose exec api python -m forge.commands.seed --demo

# Production-style seed (requires SEED_DEMO_MODE=false and SEED_ADMIN_* env vars)
docker compose exec api python -m forge.commands.seed
```

## 📋 Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                      nginx                          │
│                   (port 80/443)                     │
└──────────────┬───────────────────┬──────────────────┘
               │                   │
       ┌───────▼──────┐   ┌────────▼────────┐
       │   Dashboard  │   │       API       │
       │  (React/Vite)│   │    (FastAPI)    │
       │   port 3000  │   │    port 8000    │
       └──────────────┘   └────────┬────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
             │  PostgreSQL │ │   Redis   │ │   Celery    │
             │  port 5432  │ │ port 6379 │ │   Worker    │
             └─────────────┘ └───────────┘ └─────────────┘
```

## 🔧 Common Commands

```bash
# Start services
docker compose -f docker-compose.dev.yml up -d

# Stop services
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs -f api

# Restart a service
docker compose -f docker-compose.dev.yml restart api

# Execute command in container
docker compose -f docker-compose.dev.yml exec api bash

# Database backup
docker compose exec postgres pg_dump -U forge forge > backup.sql

# Scale Celery workers (production)
docker compose up -d --scale celery-worker=3
```

## ♻️ Reset Database

### Development (data loss OK)

```bash
# Stop and remove all containers and volumes
docker compose -f docker-compose.dev.yml down -v

# Rebuild from scratch
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up -d

# Optional: re-seed
docker compose -f docker-compose.dev.yml exec api python -m forge.commands.seed --demo
```

### Production (backup required)

```bash
# 1) Backup first (stores backup.sql locally)
docker compose exec -T postgres pg_dump -U ${POSTGRES_USER:-forge} ${POSTGRES_DB:-forge} > backup.sql

# 2) Reset database
docker compose exec postgres psql -U ${POSTGRES_USER:-forge} -d postgres -c "DROP DATABASE ${POSTGRES_DB:-forge};"
docker compose exec postgres psql -U ${POSTGRES_USER:-forge} -d postgres -c "CREATE DATABASE ${POSTGRES_DB:-forge};"

# 3) Migrate and re-seed
docker compose exec api alembic -c forge/db/alembic.ini upgrade head
docker compose exec api python -m forge.commands.seed
```

## 🔐 SSL Setup (Production)

1. Place certificates in `deploy/ssl/`:

   - `cert.pem` - Certificate
   - `key.pem` - Private key

2. Uncomment HTTPS block in `nginx.conf`

3. Restart nginx:
   ```bash
   docker compose restart nginx
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
