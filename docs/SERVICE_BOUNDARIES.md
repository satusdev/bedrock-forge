# Backend Service Boundaries

This document defines high-level service boundaries for the backend.

## Routing Layer

- API routes should validate input and enforce authorization.
- Routes should delegate to service modules for business logic.

## Service Layer

- Each domain owns a service module:
  - Backups → forge/services/backup
  - Monitoring → forge/services/monitor_service.py
  - Notifications → forge/services/notification_service.py
  - WordPress operations → forge/tasks/wp_tasks.py and services/wordpress.py
  - Billing → forge/api/routes/admin/subscriptions.py and packages.py

## Data Access

- Use SQLAlchemy models for persistence.
- Avoid raw SQL except for migrations or performance-critical queries.

## Tasks

- Long-running operations should be Celery tasks in forge/tasks.
- Task status should be tracked via Redis.

## Logging

- Use structured logging via forge/utils/logging.py.
- Record security-sensitive actions to audit logs.
