# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci

# Copy server source and build
COPY server/ ./server/
RUN cd server && npm run build

# Install frontend dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy frontend source and build
COPY . .
RUN npm run build -- --configuration production

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Server runtime
COPY --from=builder /app/server/package.json /app/server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

COPY --from=builder /app/server/dist/ ./server/dist/

# Frontend static files (served by nginx or Fastify)
COPY --from=builder /app/dist/cosmisk/browser/ ./public/

# Data directory for SQLite (local dev)
RUN mkdir -p ./server/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/server

CMD ["node", "dist/index.js"]
