# Task: Fix Docker Health Check and Startup

**Status: PASSED** **Date:** 2026-03-17

---

## Problem

The forge container never becomes "healthy" — `install.sh`, `update.sh`, and
`reset.sh` all time out waiting for `http://localhost:3000/health` with
`curl -sf`.

**Root cause:** `main.ts` calls `app.setGlobalPrefix('api')`, which mounts the
health controller at `/api/health`. All scripts poll `/health` (no prefix),
which returns 404. With `curl -sf`, a 404 = failure, so every retry fails and
the scripts exit with `"Forge did not become healthy in time."`.

**Secondary issues:**

- No Docker `healthcheck:` block on the forge service — `docker compose ps`
  never shows `(healthy)`.
- `HealthController.check()` returns HTTP 200 even when the DB is unreachable
  (`status: 'degraded'`) — a degraded container would pass curl's `-f` check,
  masking real failures.
- `docker-compose.dev.yml` is missing `ports`, `env_file`, and `depends_on` —
  dev mode doesn't expose port 3000, has no env vars, and starts before
  postgres/redis are healthy.

---

## Changes

| File                                               | Change                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/api/src/main.ts`                             | Exclude `/health` from the global prefix                              |
| `apps/api/src/modules/health/health.controller.ts` | Return HTTP 503 on degraded state                                     |
| `docker-compose.yml`                               | Add `healthcheck` block to forge service                              |
| `docker-compose.dev.yml`                           | Add `ports`, `env_file`, `depends_on`, extend dev compose inheritance |

---

## Verification

- [ ] `curl -sf http://localhost:3000/health` returns 200 with
      `{ status: 'ok' }`
- [ ] `curl http://localhost:3000/api/health` returns 404 (route excluded from
      prefix)
- [ ] `docker compose ps` shows `forge` as `(healthy)` after startup
- [ ] `./install.sh` completes without "did not become healthy" error
- [ ] `./update.sh` completes without timeout
