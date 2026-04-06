# Task: Phase 1 — Foundation Scaffold

**Status:** IN PROGRESS **Date:** 2026-03-16

---

## Context

Greenfield monorepo for Bedrock Forge 2.0. Working tree contains only
`.agents/skills/`. All infrastructure must be created from scratch per the plan
approved in the planning session.

## Plan

Scaffold the complete monorepo foundation:

1. Root config: pnpm-workspace.yaml, package.json, .npmrc, turbo.json,
   tsconfig.base.json
2. PROJECT.md (architecture source of truth)
3. Prisma 7 schema — 23 tables
4. packages/shared — queue constants, job payloads, shared types, Zod schemas
5. packages/remote-executor — SSH pool, RemoteExecutorService,
   CredentialParserService
6. apps/api — NestJS 11, REST, Auth (JWT 3-role), BullMQ producers, WebSocket
   gateway, health endpoint
7. apps/worker — NestJS standalone, all BullMQ processors
8. apps/web — React 19 + Vite 5 + shadcn + TanStack Query v5
9. Docker: docker-compose.yml (3 services), Dockerfile (multi-stage),
   entrypoint.sh

## Tables (23)

users, roles, user_roles, refresh_tokens, clients, tags, client_tags,
hosting_packages, support_packages, servers, projects, environments,
cyberpanel_users, backups, plugin_scans, domains, monitors, monitor_results,
wp_db_credentials, execution_scripts, job_executions, app_settings, audit_logs

## Risks

- Prisma 7 schema syntax — using 7.5.0 confirmed available
- Monorepo build ordering must be correct in turbo.json
- SSH pool singleton behavior across API and Worker processes

## Verification

- [ ] pnpm install succeeds
- [ ] turbo run build compiles all packages/apps
- [ ] docker compose up starts 3 services, forge health passes
- [ ] prisma migrate deploy creates 23 tables
- [ ] POST /auth/register + /auth/login returns JWT pair
- [ ] CredentialParserService unit tests pass
- [ ] Web app loads on localhost:3000
