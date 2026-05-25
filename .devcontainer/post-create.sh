#!/usr/bin/env bash
set -euo pipefail

cd /workspace

echo "==> Installing root (Angular) deps"
npm install --no-audit --no-fund

echo "==> Installing server deps"
(cd server && npm install --no-audit --no-fund)

echo "==> Ensuring server/data exists"
mkdir -p server/data

if [ ! -f server/.env ]; then
  echo "==> No server/.env found — copying from .env.example"
  cp server/.env.example server/.env
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  TEK=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" server/.env || true
  sed -i "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=${TEK}|" server/.env || true
  echo "    generated JWT_SECRET and TOKEN_ENCRYPTION_KEY"
fi

echo "==> Building backend"
(cd server && npm run build)

echo "==> Building frontend (production bundle)"
npx ng build --configuration development

echo "==> Copying Angular bundle into server/public"
mkdir -p server/public
rm -rf server/public/*
if [ -d dist/cosmisk/browser ]; then
  cp -r dist/cosmisk/browser/* server/public/
elif [ -d dist/cosmisk ]; then
  cp -r dist/cosmisk/* server/public/
fi

echo "==> Running one-off schema scripts"
(cd server && npx tsx scripts/add-audit-tables.ts || true)
(cd server && npx tsx scripts/add-shopify-tables.ts || true)

echo "==> Done. Use './dev up' / './dev rebuild' / './dev logs' from the host, or 'cd server && npm start' inside the container."
