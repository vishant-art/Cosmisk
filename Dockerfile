# ---- Frontend Build Stage ----
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install frontend dependencies
COPY package.json package-lock.json* ./
RUN npm ci --no-audit

# Copy frontend source and build
COPY src/ ./src/
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY tailwind.config.js postcss.config.js ./
RUN npx ng build --configuration production

# ---- Backend Build Stage ----
FROM node:20-alpine AS builder

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./
RUN npm ci

# Copy server source and build
COPY server/ ./
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

# Native modules need these at runtime
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && apk del python3 make g++

# Backend
COPY --from=builder /app/dist/ ./dist/

# Frontend (served by Fastify in production)
COPY --from=frontend-builder /app/dist/cosmisk/browser/ ./public/

# Data directory for SQLite
RUN mkdir -p ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
