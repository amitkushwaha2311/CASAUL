# ============================================================
# CAUSAL Web — Production Dockerfile (multi-stage, Next.js standalone)
# ============================================================
# Stage 1: deps — installs node_modules
# Stage 2: builder — builds Next.js app with standalone output
# Stage 3: runtime — minimal image with standalone server
# ============================================================

# Stage 1: Dependency install
FROM node:22-alpine AS deps

WORKDIR /app

# Install workspace dependencies
COPY apps/web/package.json apps/web/package-lock.json* ./apps/web/
COPY packages/ packages/
WORKDIR /app/apps/web
RUN npm ci --ignore-scripts

# ── Stage 2: Builder ────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY packages/ packages/
COPY apps/web/ apps/web/
WORKDIR /app/apps/web

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Runtime ────────────────────────────────────────
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="CAUSAL Web"
LABEL org.opencontainers.image.description="CAUSAL Causal Resilience & Intervention Engine — Next.js frontend"
LABEL org.opencontainers.image.version="0.11.0"

WORKDIR /app

# Create unprivileged user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy standalone output + static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public

USER nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
