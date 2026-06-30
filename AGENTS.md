# Bedrock Forge — AI Agent Instructions

This file tells AI agents **how to contribute** to this repository.
For *what the project is*, read `README.md` and `docs/`.

---

## 1. Before Writing Any Code

Always do this first:

1. **Search** for an existing implementation — service, hook, DTO, processor, queue name, enum.
2. **Extend** an existing module rather than creating a parallel one.
3. **Reuse** DTOs, repository methods, shared types, hooks, and utilities.
4. **Match** the naming convention and folder structure of the nearest sibling file.
5. **State** any architectural trade-off before introducing a new pattern.

Never create a second implementation of something that already exists.

---

## 2. Monorepo Layout (where new code belongs)

```
apps/api/src/modules/<feature>/   → NestJS REST module (controller/service/repository/dto)
apps/api/src/common/              → Guards, decorators, filters, interceptors, pagination
apps/worker/src/processors/<job>/ → BullMQ processor modules
apps/worker/src/services/         → Worker-side shared services (rclone, SSH key, etc.)
apps/worker/src/scripts/          → PHP/bash helper scripts pushed to remote servers
apps/web/src/pages/<Feature>/     → Route page + colocated api.ts / hooks.ts / types.ts
apps/web/src/components/          → Shared UI components (ui/, layout/)
apps/web/src/hooks/               → Shared React hooks
apps/web/src/lib/                 → API client, WebSocket client, utilities
apps/web/src/store/               → Zustand stores (UI-only state)
packages/shared/src/              → Queue names, job types, roles, WS events, Zod schemas
packages/remote-executor/src/     → SSH pool, remote executor, credential parser
prisma/                           → Schema, migrations, seed
```

---

## 3. Architecture Rules (non-negotiable)

### API layer

- **Controller → Service → Repository** — never skip or invert this.
- Controllers: validate HTTP input, enforce roles, call one service method, return its result. No business logic.
- Services: orchestrate business logic, call repository methods. Never import `PrismaService` or `PrismaClient` directly.
- Repositories: Prisma access only. No `if` business logic, no HTTP calls, no queue interactions.
- Every controller input must use a typed DTO decorated with `class-validator`.
- Throw `HttpException` subclasses (`NotFoundException`, `BadRequestException`, etc.) from services; let the global filter format the response.

### Worker layer

- All queue names and job type constants live in `packages/shared/src/queues.ts`.
- All job payload schemas live in `packages/shared/src/types.ts` (Zod).
- Never hardcode a queue name as a string literal — always use `QUEUES.<NAME>`.
- Never hardcode a job type string — always use `JOB_TYPES.<NAME>`.
- Processors validate job data with the shared Zod schema at the top of `process()`.

### Frontend layer

- Server state lives in TanStack Query — never put API response data in Zustand.
- Zustand stores (`auth.store.ts`, `ui.store.ts`) hold UI-only state: sidebar collapse, active modal, theme.
- Pages are thin — move business logic into colocated `hooks.ts` files.
- Shared components must not import from `pages/`; move reusable code to `components/` or `hooks/`.
- After mutations, invalidate the appropriate TanStack Query cache key.

### Shared package

- Adding a queue, job type, role, WS event, or cross-app type? It goes in `packages/shared`, not in an app.
- Duplicate enums, duplicate queue constants, and duplicate type definitions are forbidden.

---

## 4. TypeScript Standards

- Strict mode is on. `any`, `as any`, and `@ts-ignore` without a comment are forbidden.
- Explicit return types on all service and repository methods.
- Prefer `unknown` over `any` for truly generic cases; narrow with type guards.
- Use `class-validator` DTOs for all inputs — never `@Body() body: any`.
- Zod schemas are authoritative for job payloads and shared cross-app contracts.
- Do not duplicate a type defined in `packages/shared` — import it.

---

## 5. Security Rules

- **Never expose secrets**, tokens, private keys, or encrypted credential fields in logs, responses, or comments.
- **Never serialize or return** the `encrypted_*` fields on `Server` or `Integration` entities without explicit decryption intent documented in code.
- SSH inputs (host, user, path, command arguments) must be validated or parameterised. No shell injection via unescaped string interpolation.
- Remote path operations (file browser, log fetch, env edit) must be validated against allowed roots — never allow arbitrary path traversal.
- All database access for a tenant's resources must be scoped to that resource's owner chain. Never bypass the project/environment ownership check.
- Always apply `@Roles(ROLES.ADMIN)` or `@Roles(ROLES.MANAGER)` guards. Never leave a mutating route unguarded.
- Do not disable authentication or RBAC, even temporarily or for development convenience.

---

## 6. What a Complete Feature Looks Like

A backend feature is done when it has:

- [ ] Prisma schema + migration (if new model)
- [ ] Repository (Prisma access only)
- [ ] Service (business logic, calls repository)
- [ ] Controller (thin HTTP handlers, role guards, DTO validation)
- [ ] DTOs in `dto/` with `class-validator` decorators
- [ ] Module file registered in `app.module.ts`
- [ ] Unit tests (`*.service.spec.ts`)

If the feature involves long-running work, it also needs:

- [ ] Queue and job type constants in `packages/shared/src/queues.ts`
- [ ] Zod payload schema in `packages/shared/src/types.ts`
- [ ] BullMQ processor in `apps/worker/src/processors/<job>/`
- [ ] Processor registered in `apps/worker/src/worker.module.ts`

A frontend feature is done when it has:

- [ ] Page or tab component in `apps/web/src/pages/`
- [ ] API functions in colocated `api.ts`
- [ ] TanStack Query hooks in colocated `hooks.ts`
- [ ] Route registered in `apps/web/src/App.tsx` with `React.lazy()`
- [ ] Sidebar entry in `Sidebar.tsx` (if applicable, with role check)

---

## 7. What Not to Do

**Never:**

- Duplicate a queue name, job type, DTO, enum, hook, or repository method that already exists.
- Call `PrismaService` from a controller or service.
- Call a repository from a controller.
- Put server-fetched data into Zustand.
- Use `useEffect` for data fetching — use TanStack Query.
- Hardcode URLs, paths, or credentials.
- Use raw SQL unless Prisma cannot express the query — document the reason.
- Bypass `RolesGuard` or `AuthGuard`.
- Skip `class-validator` decorators on a DTO.
- Log or return credential fields (`encrypted_private_key`, `encrypted_credentials`, etc.).
- Add prop drilling beyond two levels — extract a context or hook instead.
- Create a new utility function if one already exists in `lib/` or `utils/`.

---

## 8. Commands to Run Before Submitting

```bash
# Lint
pnpm --filter @bedrock-forge/api lint
pnpm --filter @bedrock-forge/web lint
pnpm --filter @bedrock-forge/worker lint

# Tests
pnpm --filter @bedrock-forge/api test
pnpm --filter @bedrock-forge/worker test

# Type check / build
pnpm --filter @bedrock-forge/web build
pnpm --filter @bedrock-forge/api build
pnpm --filter @bedrock-forge/worker build

# Prisma client (after schema changes)
pnpm db:generate
```

All checks must pass. Do not mark a task done with failing tests or type errors.

---

## 9. Commit Conventions

Follow Conventional Commits:

```
feat(backups): add scheduled restore option
fix(monitors): handle null SSL expiry gracefully
refactor(worker): extract SSH key loading to service
chore(shared): add LIGHTHOUSE_SCHEDULED job type
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`.
Scope = the affected module or app layer (`api`, `worker`, `web`, `shared`, `prisma`, `auth`, etc.).

---

## 10. Coding Philosophy

- **Correctness** over cleverness.
- **Clarity** over brevity.
- **Existing patterns** over new abstractions.
- **Evidence** (read the code first) over assumption.
- Comments explain *why*, not *what*. Omit them when the code is self-explanatory.
- Small, focused commits. Never mix architectural refactors with feature work.

---

## 11. Key Reference Docs

| Document                                    | Read it for                                    |
|---------------------------------------------|------------------------------------------------|
| `README.md`                                 | Feature inventory, stack, repo layout          |
| `docs/guides/DEVELOPMENT.md`                | Step-by-step module, worker, and page patterns |
| `docs/reference/ARCHITECTURE.md`            | System design, queues, security model          |
| `docs/reference/PROJECT.md`                 | Extended engineering notes                     |
| `packages/shared/src/queues.ts`             | All queue names and job types                  |
| `packages/shared/src/types.ts`              | All shared TypeScript types and Zod schemas    |
| `prisma/schema.prisma`                      | Database schema                                |
