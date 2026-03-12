# Command Reference

Current default operations are Docker + Nest API + Prisma.

## Core runtime

```bash
# Start stack safely (auto-detects active compose project)
npm run up

# Stop stack and clean stale named containers
npm run down

# Hard stop + remove named volumes
npm run down:hard

# Non-destructive backend+frontend update (no volume wipe)
npm run update

# View logs
docker compose logs -f
```

## Database

```bash
# Prisma schema sync
npm run migrate

# Prisma seed
npm run seed

# Prisma demo seed override
npm run seed:demo

# Reset containers only (preserve DB/Redis volumes, skip seed)
npm run reset:noseed

# Full reset + seed
npm run reset
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
