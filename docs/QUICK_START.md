# Quick Start Guide

Primary runtime is now Docker + Nest API + Dashboard.

## 1) Start the stack

```bash
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge
cp .env.local.example .env
docker compose up -d
```

## 2) Initialize database

```bash
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:push"
docker compose --profile seed run --rm --no-deps api sh -c "npm run prisma:seed"
```

## 3) Verify health

```bash
curl http://localhost:8000/api/v1/health
```

- Dashboard: http://localhost:3000
- API: http://localhost:8000

## Optional local backend development (without Docker runtime)

```bash
cd api
npm install
npm run start:dev
```

## Related docs

- [Docker Quick Start](DOCKER_QUICKSTART.md)
- [Testing](TESTING.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)

## Legacy note

Python CLI material is archived and no longer the default onboarding path.
