# Deployment Guide

Default deployment path is Docker + Nest API runtime and Prisma
migrations/seeding.

## Local preflight

```bash
./scripts/local-docker-smoke.sh
```

## Server deploy modes

```bash
# Update code and keep volumes
./server-deploy --mode update

# Update + seed
./server-deploy --mode update --seed

# Full reset (wipes volumes, migrates, re-seeds)
./server-deploy --mode reset
```

## SSH wrapper

```bash
./forge-deploy update
./forge-deploy update --seed
./forge-deploy reset
```

Optional SSH overrides:

```bash
./forge-deploy reset --host <host> --user <user> --port <port>
```

## Post-deploy checks

```bash
docker compose ps
curl http://localhost:8000/api/v1/health
```

## Related docs

- [Docker Quick Start](DOCKER_QUICKSTART.md)
- [Troubleshooting](TROUBLESHOOTING.md)

## Legacy note

Legacy Python CLI deployment content is archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)
