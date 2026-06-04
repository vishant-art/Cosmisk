# ---- Frontend Build Stage ----
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Install frontend workspace dependencies
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN npm install --no-audit --no-fund

# Copy frontend source and build
COPY apps/web/ ./apps/web/
COPY packages/types/ ./packages/types/
RUN npm run build -w @cosmisk/web -- --configuration production

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

# Frontend (served by Fastify in production)
COPY --from=frontend-builder /app/apps/web/dist/cosmisk/browser/ ./public/

# Data directory for SQLite
RUN mkdir -p ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
