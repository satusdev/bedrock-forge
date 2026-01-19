# Bedrock Forge Deployment Guide

## Prerequisites

- Docker & Docker Compose v2+
- Domain with DNS configured (for production)
- SSL certificates (optional, recommended)

## Quick Start

```bash
# Navigate to deploy directory
cd deploy

# Copy and configure environment
cp .env.production .env
nano .env  # Edit required values

# Build and start services
docker compose build
docker compose up -d

# Initialize database
docker compose exec api python -c "from forge.db import init_db; import asyncio; asyncio.run(init_db())"

# Check status
docker compose ps
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80/443 | Reverse proxy |
| api | 8000 | FastAPI backend |
| dashboard | - | React frontend |
| postgres | 5432 | Database |
| redis | 6379 | Cache/broker |
| celery-worker | - | Background tasks |
| celery-beat | - | Scheduler |

## Configuration

### Required Environment Variables

```bash
POSTGRES_PASSWORD=<strong-password>
SECRET_KEY=<random-32-byte-hex>
```

### Generate Secret Key

```bash
openssl rand -hex 32
```

## SSL Setup

1. Place certificates in `deploy/ssl/`:
   - `cert.pem` - Certificate
   - `key.pem` - Private key

2. Uncomment HTTPS server block in `nginx.conf`

3. Restart nginx: `docker compose restart nginx`

## Scaling

```bash
# Scale Celery workers
docker compose up -d --scale celery-worker=3
```

## Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
```

## Backup Database

```bash
docker compose exec postgres pg_dump -U forge forge > backup.sql
```

## Troubleshooting

### API not responding
```bash
docker compose logs api
docker compose restart api
```

### Database connection issues
```bash
docker compose exec postgres pg_isready -U forge
```
