# Backend Service Boundaries

This document defines high-level service boundaries for the backend.

## Routing Layer

- API routes should validate input and enforce authorization.
- Routes should delegate to service modules for business logic.

## Service Layer

- Each domain owns a service module:
  - Backups → `nest-api/src/schedules` + `nest-api/src/sync`
  - Monitoring/Status → `nest-api/src/status`
  - Notifications/WebSocket → `nest-api/src/websocket`
  - WordPress operations → `nest-api/src/wp`
  - Billing/Subscriptions → `nest-api/src/subscriptions` + `nest-api/src/ssl`
  - Identity/RBAC → `nest-api/src/users` + `nest-api/src/rbac`

## Data Access

- Use Prisma + PostgreSQL for persistence.
- Avoid raw SQL except for migrations or performance-critical queries.

## Tasks

- Long-running operations should use API-managed task status via
  `nest-api/src/task-status`.
- Task state may be cached/transient, with Redis used where appropriate.

## Logging

- Use NestJS `Logger`-based structured logs from the `nest-api` runtime.
- Record security-sensitive actions to audit logs.
