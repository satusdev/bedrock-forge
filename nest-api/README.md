# Forge Nest API

NestJS + Prisma service for the migration where Nest becomes the sole DB owner.

## Quick start

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   - `npm install`
3. Pull current DB schema into Prisma:
   - `npm run prisma:pull`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Start dev server:
   - `npm run start:dev`

## Endpoints

- `GET /api/v1/health`
- `GET /api/v1/migration/status`
- `POST /api/v1/auth/login` (parity scaffold)
- `POST /api/v1/auth/refresh` (parity scaffold)
- `GET /api/v1/auth/me` (parity scaffold)
