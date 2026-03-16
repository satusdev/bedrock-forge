# ─── Stage 1: dependencies ──────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace manifests first for layer-cache efficiency
COPY pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/remote-executor/package.json ./packages/remote-executor/
COPY prisma/schema.prisma ./prisma/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client and build all apps
RUN pnpx prisma generate
RUN pnpm turbo build --filter=api --filter=worker --filter=web

# Prune dev dependencies
RUN pnpm prune --prod

# ─── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Non-root user
USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/apps/worker/scripts ./apps/worker/scripts

COPY --chown=node:node entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]
