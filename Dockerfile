# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./
RUN npm ci

# Copy server source and build
COPY server/ ./
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

# Data directory for SQLite
RUN mkdir -p ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
