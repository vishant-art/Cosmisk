# syntax=docker/dockerfile:1
# Cosmisk web (Angular 17). BUILD CONTEXT = REPO ROOT — apps/web is an npm workspace
# member that depends on @cosmisk/types (packages/types) and has no standalone lockfile,
# so `npm ci` must run at the workspace root against the root package-lock.json.
#   docker build -f apps/web/Dockerfile --build-arg API_BASE_URL=https://api.cosmisk.com -t cosmisk-web .
# The effective .dockerignore for a root-context build is the repo-root /.dockerignore
# (it already drops node_modules/.angular/dist/.env*). apps/web/.dockerignore covers the
# rarer `docker build apps/web` case.

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Workspace manifests first so `npm ci` layer caches across source-only changes.
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# Sources (the workspace dep + the app).
COPY packages/types ./packages/types
COPY apps/web ./apps/web

# API_BASE_URL / META_OAUTH_ENABLED are baked at BUILD time: the web `prebuild` hook runs
# scripts/apply-env.mjs, which reads these from the env and writes src/environments/env-config.ts.
# Defaults mirror the app's committed env-config.default.ts (oauth on); API base defaults local.
ARG API_BASE_URL=http://localhost:3000
ARG META_OAUTH_ENABLED=true
ENV API_BASE_URL=$API_BASE_URL \
    META_OAUTH_ENABLED=$META_OAUTH_ENABLED
# `npm run build` (NOT bare `ng build`) so the prebuild env-config hook fires. Angular's
# default configuration is `production`; output lands in apps/web/dist/cosmisk/browser.
RUN npm run build -w @cosmisk/web

# ---- Runtime stage (static nginx, non-root) ----
FROM nginx:alpine
# ponytail: base image digests not pinned — no registry access in this build env to resolve
# them reliably; pin with `nginx:alpine@sha256:...` once you can `docker manifest inspect`.

# SPA fallback: unknown routes serve index.html so Angular's router handles them client-side.
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri /index.html;
    }
}
EOF

COPY --from=build /app/apps/web/dist/cosmisk/browser /usr/share/nginx/html

# Run as the image's built-in unprivileged `nginx` user. Docker's default caps include
# NET_BIND_SERVICE, so it can still listen on :80. Give it write on the runtime paths.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx

EXPOSE 80
# 127.0.0.1, not localhost: busybox wget resolves localhost to ::1 (IPv6) first, but nginx
# listens on IPv4 — localhost would fail "connection refused" and flap unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/ || exit 1
# CMD inherited from nginx:alpine (`nginx -g 'daemon off;'`).
