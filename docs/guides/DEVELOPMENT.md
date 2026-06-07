# Development Guide

---

## Prerequisites

| Tool    | Version          | Install                                               |
| ------- | ---------------- | ----------------------------------------------------- |
| Node.js | 22+              | [nodejs.org](https://nodejs.org/) or `nvm install 22` |
| pnpm    | 9+               | `npm install -g pnpm`                                 |
| Docker  | 24+ + Compose v2 | [docker.com](https://www.docker.com/)                 |
| Git     | any              |                                                       |

---

## Local Development Setup

```bash
# Clone the repository
git clone https://github.com/satusdev/bedrock-forge.git
cd bedrock-forge

# Start only the infrastructure (postgres + redis) in Docker
docker compose -f docker-compose.dev.yml up -d postgres redis

# Install all workspace dependencies
pnpm install

# Set up the environment file
cp .env.example .env
```

Edit `.env` — the minimum required values for development:

```env
DATABASE_URL=postgresql://forge:forge@localhost:5432/forge
REDIS_PASSWORD=devpassword
REDIS_URL=redis://:devpassword@localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-jwt-refresh-secret-change-in-production
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001

POSTGRES_DB=forge
POSTGRES_USER=forge
POSTGRES_PASSWORD=forge
```

```bash
# Generate the Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed the database
pnpm db:seed

# Start all apps with hot reload
pnpm dev
```

This starts three processes concurrently (via Turborepo):

| App           | Port    | Notes                                                |
| ------------- | ------- | ---------------------------------------------------- |
| `apps/api`    | `:3000` | NestJS with ts-node-dev hot reload                   |
| `apps/worker` | —       | NestJS standalone, BullMQ consumers                  |
| `apps/web`    | `:5173` | Vite dev server, proxies `/api` and `/ws` to `:3000` |

Open **http://localhost:5173** for the dashboard.

---

## Project Structure

```
bedrock-forge/
├── apps/
│   ├── api/src/
│   │   ├── modules/          # 22 feature modules
│   │   ├── gateways/         # WebSocket gateway
│   │   ├── common/           # Guards, filters, interceptors, decorators
│   │   ├── prisma/           # PrismaService + PrismaModule
│   │   └── main.ts
│   ├── worker/src/
│   │   ├── processors/       # 8 BullMQ processor modules
│   │   └── utils/            # Shared worker utilities
│   └── web/src/
│       ├── features/         # Feature-scoped code
│       ├── components/       # Shared components (ui/, layout/)
│       ├── hooks/            # Shared hooks
│       ├── lib/              # API client, WebSocket, utilities
│       └── store/            # Zustand stores (UI state only)
├── packages/
│   ├── shared/src/           # Queue names, role constants, Zod job schemas
│   └── remote-executor/src/  # SSH pool, remote executor, credential parser
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts / seed.js
├── docs/                     # Documentation (this directory)
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Refactor Roadmaps

Use these plans when cleaning up existing code or splitting large features. They
define the current priorities, phase order, verification gates, and the main
frontend/backend files that need attention.

- [Overall codebase improvement plan](../roadmaps/CODEBASE_IMPROVEMENT_PLAN.md)
- [Frontend refactor plan](../roadmaps/FRONTEND_REFACTOR_PLAN.md)
- [Backend and worker refactor plan](../roadmaps/BACKEND_REFACTOR_PLAN.md)

---

## Adding a New Backend Module

Follow this exact structure for every new feature:

```
apps/api/src/modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.repository.ts
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts
│   └── query-<feature>.dto.ts
├── models/
│   └── <feature>.model.ts
└── tests/
    └── <feature>.service.spec.ts
```

### Step-by-step

**1. Create the Prisma model** in `prisma/schema.prisma`, then run:

```bash
pnpm db:migrate -- --name add-<feature>
```

**2. Create the module file:**

```typescript
// <feature>.module.ts
@Module({
	imports: [PrismaModule],
	controllers: [FeatureController],
	providers: [FeatureService, FeatureRepository],
	exports: [FeatureService],
})
export class FeatureModule {}
```

**3. Create the repository** (Prisma access only, no business logic):

```typescript
// <feature>.repository.ts
@Injectable()
export class FeatureRepository {
	constructor(private prisma: PrismaService) {}

	findMany(params: { skip: number; take: number }): Promise<Feature[]> {
		return this.prisma.feature.findMany({ ...params });
	}
}
```

**4. Create the service** (business logic, calls repository):

```typescript
// <feature>.service.ts
@Injectable()
export class FeatureService {
	constructor(private repo: FeatureRepository) {}

	findAll(query: QueryFeatureDto): Promise<Feature[]> {
		return this.repo.findMany({ skip: query.skip, take: query.limit });
	}
}
```

**5. Create the controller** (HTTP handlers, no business logic):

```typescript
// <feature>.controller.ts
@Controller('features')
@UseGuards(AuthGuard, RolesGuard)
export class FeatureController {
	constructor(private service: FeatureService) {}

	@Get()
	findAll(@Query() query: QueryFeatureDto) {
		return this.service.findAll(query);
	}
}
```

**6. Register the module** in `apps/api/src/app.module.ts`.

### Hard Rules

- Controllers never import or call `PrismaService` or `FeatureRepository`
  directly
- Services never import `PrismaService` or `PrismaClient`
- Repositories contain only Prisma calls — no `if` business logic, no HTTP calls
- Every controller input uses a typed DTO with `class-validator` decorators
- Admin-only routes use `@Roles('admin')` + `RolesGuard`

---

## Adding a New Worker Processor

**1. Create the processor module:**

```
apps/worker/src/processors/<name>/
├── <name>.processor.module.ts
└── <name>.processor.ts
```

**2. Register the queue name** in `packages/shared/src/queues.ts`:

```typescript
export const QUEUES = {
	// ...existing queues
	MY_QUEUE: 'my-queue',
} as const;
```

**3. Add job type constants and Zod payload schema** in
`packages/shared/src/types.ts`.

**4. Create the processor:**

```typescript
// <name>.processor.ts
@Processor(QUEUES.MY_QUEUE)
export class MyQueueProcessor extends WorkerHost {
	async process(job: Job<MyJobPayload>): Promise<void> {
		const payload = MyJobPayloadSchema.parse(job.data);
		// ... implementation
	}
}
```

**5. Register the module** in `apps/worker/src/worker.module.ts`.

**6. Add the queue to the API** — inject `@InjectQueue(QUEUES.MY_QUEUE)` where
needed to enqueue jobs.

---

## Adding a New Frontend Page

**1. Create the feature directory:**

```
apps/web/src/features/<feature>/
├── components/           # Feature-specific UI components
├── hooks/                # Feature-specific React hooks
│   └── use-<feature>.ts  # TanStack Query wrapper
├── pages/
│   └── <Feature>Page.tsx
└── index.ts              # Re-exports
```

**2. Add the TanStack Query hook:**

```typescript
// hooks/use-features.ts
export function useFeatures(params: QueryParams) {
	return useQuery({
		queryKey: ['features', params],
		queryFn: () => apiClient.get('/features', { params }),
	});
}
```

**3. Create the page component** using existing shadcn/ui primitives from
`src/components/ui/`.

**4. Register the route** in `apps/web/src/App.tsx` with `React.lazy()`:

```tsx
const MyFeaturePage = lazy(
	() => import('./features/<feature>/pages/<Feature>Page'),
);

// inside the router:
<Route
	path='/my-feature'
	element={
		<Suspense fallback={<PageSkeleton />}>
			<MyFeaturePage />
		</Suspense>
	}
/>;
```

**5. Add the nav item** to `apps/web/src/components/layout/Sidebar.tsx` if it
needs a sidebar entry, with the appropriate `requiredRole` check.

### State Rules

- **Never** put server data in Zustand — use TanStack Query cache only
- Zustand stores (`auth.store.ts`, `ui.store.ts`) are for UI-only state: sidebar
  collapsed, active modal, current theme
- Invalidate the correct query key after mutations:
  `queryClient.invalidateQueries({ queryKey: ['features'] })`

---

## Running Tests

```bash
# All packages
pnpm test

# Specific app
pnpm --filter api test
pnpm --filter worker test
pnpm --filter @bedrock-forge/remote-executor test

# Watch mode
pnpm --filter api test:watch

# Coverage
pnpm --filter api test:coverage
```

Tests use Jest. Test files live in `tests/` subdirectory inside each module.

---

## Linting & Type Checking

```bash
# Lint all packages
pnpm lint

# Lint specific app
pnpm --filter api lint
pnpm --filter web lint

# Type check all
pnpm build
```

ESLint config is inherited from the root. Prettier is enforced via ESLint's
`prettier` plugin.

---

## Database Operations

```bash
# Create a new migration (dev only — generates SQL from schema diff)
pnpm db:migrate -- --name <migration-name>

# Apply pending migrations (used in CI and production)
pnpm db:deploy

# Generate Prisma client after schema changes
pnpm db:generate

# Open Prisma Studio (GUI database browser)
pnpx prisma studio

# Re-seed the database
pnpm db:seed
```

---

## Build

```bash
# Build all packages in dependency order (via Turborepo)
pnpm build

# Build specific app
pnpm --filter api build
pnpm --filter web build
pnpm --filter worker build
```

Turborepo caches build outputs. Force a clean rebuild:

```bash
pnpm build --force
```

---

## Code Conventions

- **TypeScript strict mode** — no `any`, no `as any`, no `@ts-ignore` without
  comment
- **Explicit return types** on all service and repository methods
- **`class-validator` DTOs** for all controller inputs — never
  `@Body() body: any`
- **Module boundaries** — do not import from `features/` in shared components
- **No business logic in controllers** — controllers validate input and call
  service methods only
- **No Prisma in services** — services call repository methods only
- **Error handling** — throw typed NestJS `HttpException` subclasses from
  services; let the global `HttpExceptionFilter` format the response
- **Commit scope** — small, focused commits. Never squash architecture changes
  with feature work.
