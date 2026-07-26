# Cosmisk api (Fastify/TS). BUILD CONTEXT = REPO ROOT (apps/api is copied by path).
#   docker build -t cosmisk-api .
# ---- Backend Build Stage ----
FROM node:22-alpine AS builder

# Native build tools for sharp (native image processing)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies
COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm ci

# Copy server source and build
COPY apps/api/ ./
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production

# libstdc++ is the only runtime lib sharp needs. The compiler toolchain is added and dropped
# INSIDE the npm ci layer (--virtual) so it never persists — an `apk del` in a later layer
# can't reclaim a toolchain installed in an earlier one (~313MB of dead weight otherwise).
RUN apk add --no-cache libstdc++

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

# Backend
COPY --from=builder /app/dist/ ./dist/

# Frontend is served by Vercel in the split deploy; no ./public/ is copied.
# The SPA-serving block in src/index.ts is guarded by existsSync() and no-ops.

# Data directory for SQLite; owned by the built-in non-root `node` user (uid 1000).
RUN mkdir -p ./data && chown -R node:node ./data

ENV NODE_ENV=production
ENV PORT=3000

USER node

EXPOSE 3000
# Use 127.0.0.1, not localhost: busybox wget resolves localhost to ::1 (IPv6) first, but the
# app listens on IPv4 (0.0.0.0) — localhost would fail "connection refused" and flap unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
