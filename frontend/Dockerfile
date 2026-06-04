# ─────────────────────────────────────────────────────────────────────
# Frontend — Next.js 16 admin dashboard
# Multi-stage: install deps → build (standalone) → minimal runtime.
#
# NOTE: NEXT_PUBLIC_* vars are inlined into the browser bundle at BUILD
# time and are read by the user's browser, so they must point at host-
# reachable URLs (http://localhost:<port>), NOT docker service names.
# They are passed as build args from docker-compose.
# ─────────────────────────────────────────────────────────────────────

# ---- Stage 1: dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_USER_SERVICE_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_AI_SERVICE_URL
ENV NEXT_PUBLIC_USER_SERVICE_URL=$NEXT_PUBLIC_USER_SERVICE_URL \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_AI_SERVICE_URL=$NEXT_PUBLIC_AI_SERVICE_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as non-root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output bundles a minimal node_modules + server.js.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
