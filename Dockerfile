# ─── Stage 1: dependencies ──────────────────────────────────────────────────
# Pin the exact pnpm version so corepack doesn't hit the network every build.
FROM node:22-alpine AS deps
ENV PNPM_HOME=/pnpm \
    PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace manifests first for layer-cache efficiency.
COPY pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./
COPY apps/api/package.json    ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json    ./apps/web/
COPY packages/shared/package.json          ./packages/shared/
COPY packages/remote-executor/package.json ./packages/remote-executor/
COPY prisma/schema.prisma ./prisma/
COPY prisma.config.js ./

RUN pnpm install --frozen-lockfile

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client (prisma.config.js handles missing DATABASE_URL gracefully)
# Separate RUN layers = better Docker cache:
#   prisma schema change → only invalidates from generate onward
#   src change           → only invalidates from turbo build onward
RUN pnpm exec prisma generate

# Build shared package first — guarantees dist/index.d.ts exists for downstream
RUN pnpm --filter @bedrock-forge/shared build

# Build API, Worker, and Web bundles
RUN pnpm turbo build \
      --filter=@bedrock-forge/api \
      --filter=@bedrock-forge/worker \
      --filter=@bedrock-forge/web

# Compile seed script for runtime use (outputs prisma/seed.js)
RUN node_modules/.bin/tsc \
      --module commonjs \
      --target ES2022 \
      --esModuleInterop true \
      --resolveJsonModule true \
      --skipLibCheck true \
      --rootDir prisma \
      --outDir prisma \
      prisma/seed.ts

# Prune dev dependencies — drops ~300 MB before we copy to runtime stage
RUN pnpm prune --prod

# ─── Stage 3: runtime (API + Worker) ────────────────────────────────────────
# Do NOT install corepack/pnpm here — the runtime only needs Node.js + the
# compiled dist files and the pruned node_modules from the builder stage.
FROM node:22-alpine AS runtime

# rclone  — Google Drive backup uploads
# whois   — domain WHOIS lookups
# postgresql-client — pg_dump for Forge self-backup
# chromium — local Lighthouse audits (no PageSpeed API quota)
RUN apk add --no-cache rclone whois postgresql-client chromium && \
    mkdir -p /home/node/.config/rclone && \
    chown -R node:node /home/node/.config && \
    mkdir -p /tmp/forge-backups /tmp/forge-system-backups && \
    chown node:node /tmp/forge-backups /tmp/forge-system-backups

WORKDIR /app
USER node

# Root node_modules (shared tooling: prisma CLI, etc.)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Compiled application bundles
COPY --from=builder --chown=node:node /app/apps/api/dist    ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/worker/dist ./apps/worker/dist

# Per-app node_modules (only what survived pnpm prune --prod)
COPY --from=builder --chown=node:node /app/apps/api/node_modules    ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules

# Shared packages — only dist + package.json (no src, no tests)
COPY --from=builder --chown=node:node /app/packages/shared/dist           ./packages/shared/dist
COPY --from=builder --chown=node:node /app/packages/shared/package.json   ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/remote-executor/dist  ./packages/remote-executor/dist
COPY --from=builder --chown=node:node /app/packages/remote-executor/package.json ./packages/remote-executor/package.json
COPY --from=builder --chown=node:node /app/packages/remote-executor/node_modules ./packages/remote-executor/node_modules

# Prisma — schema + compiled seed + generated client (already in node_modules)
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.js ./prisma.config.js

# Worker shell scripts
COPY --from=builder --chown=node:node /app/apps/worker/scripts ./apps/worker/scripts

COPY --chown=node:node entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]

# ─── Stage 4: web (nginx serving React SPA) ──────────────────────────────────
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
