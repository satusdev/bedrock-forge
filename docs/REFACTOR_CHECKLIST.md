# Refactor Checklist

Use this checklist when adding or changing features.

## UI

- [ ] Check for repeated UI patterns and extract shared components.
- [ ] Prefer shared hooks for polling or async status (e.g.,
      useTaskStatusPolling).
- [ ] Keep state shape consistent across pages.
- [ ] Ensure empty/loading/error states are handled.

## API / Services

- [ ] Add service methods in dashboard/src/services for new endpoints.
- [ ] Add typed interfaces for new payloads and responses.
- [ ] Centralize repeated request logic.

## Backend

- [ ] Keep routes thin; put logic in service modules.
- [ ] Add audit logging for sensitive changes.
- [ ] Keep migrations idempotent and safe.

## Docs

- [ ] Update CHANGELOG.md and missing.md.
- [ ] Add or update relevant docs under docs/.
