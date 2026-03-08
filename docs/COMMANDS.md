# Command Reference

Current default operations are Docker + Nest API + Prisma.

## Core runtime

```bash
# Start stack
cp .env.local.example .env
docker compose up -d

# Stop stack
docker compose down

# View logs
docker compose logs -f
```

## Database

```bash
# Prisma schema sync
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:push"

# Prisma seed
docker compose --profile seed run --rm --no-deps nest-api sh -c "npm run prisma:seed"

# Full reset + seed
./reset-seed.sh
```

## Testing

```bash
# Run Nest tests
cd nest-api
npm test

# Coverage
npm run test:cov

# Targeted suites
npm test -- projects.service.spec.ts import-projects.service.spec.ts backups.service.spec.ts
```

## Build and deploy helpers

```bash
# Local smoke test
./scripts/local-docker-smoke.sh

# Server deploy update/reset
./server-deploy --mode update
./server-deploy --mode reset

# SSH wrapper deploy
./forge-deploy update
./forge-deploy reset
```

## Legacy note

Legacy Python CLI command reference has been archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)
