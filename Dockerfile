# ---- Backend Build Stage ----
FROM node:22-alpine AS builder

# Native build tools for better-sqlite3
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

# Native build tools for better-sqlite3 compilation + libstdc++ for runtime
RUN apk add --no-cache python3 make g++ libstdc++

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && apk del python3 make g++ && apk add --no-cache libstdc++

# Backend
COPY --from=builder /app/dist/ ./dist/

# Frontend is served by Vercel in the split deploy; no ./public/ is copied.
# The SPA-serving block in src/index.ts is guarded by existsSync() and no-ops.

# Data directory for SQLite
RUN mkdir -p ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
