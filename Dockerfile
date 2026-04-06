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
COPY prisma.config.js ./

RUN pnpm install --frozen-lockfile

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client (prisma.config.js handles missing DATABASE_URL gracefully)
RUN pnpm exec prisma generate

# Build @bedrock-forge/shared first — turbo's ^build dependency resolves this
# transitively, but an explicit pre-build step guarantees dist/index.d.ts is
# present before remote-executor and api/worker compile against it.
RUN pnpm --filter @bedrock-forge/shared build

RUN pnpm turbo build --filter=@bedrock-forge/api --filter=@bedrock-forge/worker --filter=@bedrock-forge/web

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

# Prune dev dependencies
RUN pnpm prune --prod

# ─── Stage 3: runtime (API + Worker) ────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install rclone for Google Drive backup uploads; whois for domain WHOIS lookups
RUN apk add --no-cache rclone whois && \
    mkdir -p /home/node/.config/rclone && \
    chown -R node:node /home/node/.config

WORKDIR /app

# Non-root user
USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.js ./prisma.config.js
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
