# Backend Service Boundaries

This document defines high-level service boundaries for the backend.

## Routing Layer

- API routes should validate input and enforce authorization.
- Routes should delegate to service modules for business logic.

## Service Layer

- Each domain owns a service module:
  - Backups → `api/src/schedules` + `api/src/sync`
  - Monitoring/Status → `api/src/status`
  - Notifications/WebSocket → `api/src/websocket`
  - WordPress operations → `api/src/wp`
  - Billing/Subscriptions → `api/src/subscriptions` + `api/src/ssl`
  - Identity/RBAC → `api/src/users` + `api/src/rbac`

## Data Access

- Use Prisma + PostgreSQL for persistence.
- Avoid raw SQL except for migrations or performance-critical queries.

## Tasks

- Long-running operations should use API-managed task status via
  `api/src/task-status`.
- Task state may be cached/transient, with Redis used where appropriate.

## Logging

- Use NestJS `Logger`-based structured logs from the `api` runtime.
- Record security-sensitive actions to audit logs.
