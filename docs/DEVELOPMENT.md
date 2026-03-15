# Development Guide

Current development path is Nest API + Dashboard with Docker orchestration.

## Local setup

```bash
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge
cp .env.local.example .env
docker compose up -d
```

## Backend development

```bash
cd api
npm install
npm run start:dev
```

## Frontend development

```bash
cd dashboard
npm install
npm run dev
```

## Quality checks

```bash
cd api
npm test
npm run test:cov
```

## Notes

- Keep Prisma schema and service-layer SQL in sync.
- Prefer enum casts in raw SQL writes to avoid Postgres enum mismatches.

## Legacy note

Legacy Python CLI development workflow is archived:

- [Legacy Python CLI Archive](archive/LEGACY_PYTHON_CLI.md)
