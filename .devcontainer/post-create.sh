#!/usr/bin/env bash
# First-time (and idempotent) bootstrap for the full-stack dev container.
# Installs Node + Python deps, creates the cos venv, and seeds apps/api/.env.
# Does NOT start services (use ./dev start) and does NOT migrate Neon.
set -euo pipefail

cd /workspace

echo "==> Installing root deps (Angular workspace + packages/*)"
npm install --no-audit --no-fund

echo "==> Installing API deps (apps/api is not an npm workspace)"
(cd apps/api && npm install --no-audit --no-fund)

# Python venv at /workspace/cos — the exact path apps/api/dev.mjs looks for
# (cos/bin/python). It lives in a named Docker volume, so it's fast and never
# shows up in the host tree.
if [ ! -x cos/bin/python ]; then
  echo "==> Creating Python venv at /workspace/cos"
  python3 -m venv cos
fi
echo "==> Installing ai-layer into the venv"
cos/bin/pip install --upgrade pip >/dev/null
cos/bin/pip install -e apps/ai-layer

# connectors is optional: present (installable) on feat/data-connectors, absent
# on feat/ai_analy. Guard on the manifest, not the dir — a branch switch can
# leave behind an apps/connectors/ with only __pycache__/egg-info cruft and no
# pyproject.toml, which would make `pip install -e` fail.
if [ -f apps/connectors/pyproject.toml ]; then
  echo "==> Installing connectors into the venv"
  cos/bin/pip install -e apps/connectors
else
  echo "==> apps/connectors not installable on this branch — skipping (ok)"
fi

# API env — never clobber an existing .env.
if [ ! -f apps/api/.env ]; then
  echo "==> No apps/api/.env — copying from apps/api/.env.example"
  cp apps/api/.env.example apps/api/.env
  # Repair the known `.env.example` typo on the first line (`R PORT=` -> `PORT=`).
  sed -i "s|^R PORT=|PORT=|" apps/api/.env || true
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  TEK=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" apps/api/.env || true
  sed -i "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=${TEK}|" apps/api/.env || true
  echo "    generated JWT_SECRET and TOKEN_ENCRYPTION_KEY"
fi

# Neon is required — the API will not connect without DATABASE_URL.
if ! grep -qE '^DATABASE_URL=.+' apps/api/.env; then
  cat <<'WARN'

!! ============================================================
!! apps/api/.env has NO DATABASE_URL set.
!! The app is Postgres-only (Neon). The API will fail to serve
!! data until you add your Neon connection strings to apps/api/.env:
!!     DATABASE_URL=<neon pooled connection>
!!     MIGRATION_DATABASE_URL=<neon direct connection>
!! Then run:   ./dev migrate && ./dev restart
!! ============================================================

WARN
fi

echo "==> Bootstrap done. Start the whole system with:  ./dev up"
