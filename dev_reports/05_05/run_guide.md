> **Status: 📖 REFERENCE (2026-05-31)** — local run/setup guide.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk — Local Run Guide

> Assumes an empty machine. SQLite-era guide (pre DB-2 retirement). Two processes:

| Process | Lives in | Port | Purpose |
|---|---|---|---|
| Backend (Fastify + SQLite) | `server/` | `3000` | API + DB + cron + LLM/Meta calls |
| Frontend (Angular 17) | `src/` (Angular root = repo root) | `4200` (HTTPS, self-signed) | UI; proxies `/api/*` → backend |

Angular dev proxy (`proxy.conf.json`) rewrites `/api/...` → `http://localhost:3000/...` (strips `/api`).

## Unique essence preserved

### 1. Prerequisites
- Node **22 LTS** (Dockerfile pins `node:22-alpine`, dev uses `tsx watch`); npm 10+. Install via `nvm install 22 && nvm use 22` (Linux/WSL), `brew install node@22` (macOS), nvm-windows.
- `better-sqlite3` compiled at install → needs C/C++ toolchain + Python 3. Debian/Ubuntu/WSL `sudo apt install -y build-essential python3`; Alpine `apk add --no-cache python3 make g++ libstdc++`; macOS `xcode-select --install`; Windows windows-build-tools or WSL. `gyp` errors on install = this missing.
- Chrome/Chromium recommended (Playwright uses Chromium). Dev server is HTTPS self-signed → one-time browser warning. Docker only needed for §8.

### 2–3. Get code & backend setup
- Clone → root has `server/`, `src/`, `package.json`, `angular.json`, `Dockerfile`, `docker-compose.yml`, `proxy.conf.json`.
- `cd server && npm install` (compiles better-sqlite3 first time).
- `cp .env.example .env`. Min env to boot:
```env
NODE_ENV=development
PORT=3000
JWT_SECRET=<openssl rand -hex 32>
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
DATABASE_PATH=./data/cosmisk.db
APP_URL=http://localhost:4200
```
- Env-impact table (placeholder/missing → effect):

| Variable | Impact |
|---|---|
| `ANTHROPIC_API_KEY` | LLM calls (audit, brain, director, creative, agent) error at request time |
| `GEMINI_API_KEY` | Gemini fallback unavailable; Anthropic-only |
| `META_APP_ID`,`META_APP_SECRET` | "Connect Meta" OAuth fails; dashboards empty |
| `STRIPE_*` | Billing routes 5xx; webhook sig check fails |
| `RAZORPAY_*` | INR billing disabled; webhook sig check fails |
| `NANO_BANANA_API_KEY` | Image-gen route errors |
| `N8N_VIDEO_WEBHOOK` | Video-gen kicks off but n8n call fails |
| `SLACK_*` | Agent→Slack notifications silently skipped |
| `RESEND_API_KEY` | Email alerts silently skipped |
| `GOOGLE_ADS_*`,`TIKTOK_*` | Those connectors disabled |

- **Prod boot guard:** in `NODE_ENV=production` server refuses to boot if `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` are dev defaults, or `ANTHROPIC_API_KEY`/`META_APP_SECRET` missing (`server/src/config.ts:68-101`). Dev tolerates defaults.
- `mkdir -p data` (DB file auto-created on first start; only dir needed).
- **Schema auto-applies:** boot → `getDb()` (`server/src/db/index.ts`) runs `createTables(db)` from `server/src/db/schema.ts` — idempotent `CREATE TABLE IF NOT EXISTS` ~35 tables + `ensureColumn()`; seeds Meta App Review account `reviewer@cosmisk.com` / `MetaReview2026!`. No migration command needed for in-tree schema.
- **Out-of-tree tables** (`brands`, `brand_context`, `audits`, `shopify_tokens`) live in standalone scripts, run once: `npx tsx scripts/add-audit-tables.ts` + `npx tsx scripts/add-shopify-tables.ts` (idempotent; seed demo brands `casorro`, `pratap-sons`, `salt-attire`). Skip → `no such table: brands`. Note: `scheduled_audits`, `waitlist_leads` are lazy-created at request time, no script needed.
- Start: `npm run dev` (= `tsx watch src/index.ts`) → `Cosmisk server running on port 3000`. Smoke: `curl -i http://localhost:3000/health` (200 JSON).

### 4. Frontend
- From repo root: `npm install` then `npm start` (= `ng serve`) → `https://localhost:4200` (HTTPS, `angular.json` `ssl:true`; accept cert once). Proxies `/api/*`→`:3000` stripping `/api` (e.g. `/api/auth/login`→`:3000/auth/login`). Login at `/app/login`. Every `/api` 502 = backend down/wrong port.

### 5. Verify (smoke after change)
`curl -sf :3000/health` → `POST /auth/signup` → `POST /auth/login` (capture token) → `GET /dashboard/summary` with `Authorization: Bearer $TOKEN`. Meta/Anthropic/billing need real keys.

### 6. Tests
- Backend Vitest: `cd server && npm test` / `npm run test:watch`. Uses `server/.env.test` (placeholders, DB `:memory:`, no real services).
- Frontend Karma/Jasmine: root `npm test`.
- Playwright e2e: `playwright.config.ts` has `webServer: undefined` (start servers manually), `https://localhost:4200`, `ignoreHTTPSErrors:true`, headed `slowMo:400`. `npx playwright install chromium` once. CI/headless = `playwright.ci.config.ts`.

### 7. CLI tools (from `server/`)
`npx tsx scripts/run-audit.ts --brand=casorro [--days=7 --format=json]` — needs `ANTHROPIC_API_KEY` + working Meta token in DB. Re-run schema scripts (§3.5) idempotent.

### 8. Docker (optional)
`docker compose up --build` from root — builds Angular into `public/`, backend serves both off 3000 (compose reads `${VAR}` from root `.env`). Health `:3000/health`. Prod deploy target = **frontend Vercel + backend Railway** (`vercel.json`, `railway.toml`); Docker not the prod target.

### 9. Daily loop & wipe
T1 `server/ npm run dev`, T2 root `npm start`, T3 shell. `tsx watch`+Angular auto-reload. Restart backend on `.env`/schema change or stuck cron; frontend on `angular.json`/`tailwind.config.js`/new deps. Wipe: `rm -f data/cosmisk.db data/cosmisk.db-shm data/cosmisk.db-wal` then next `npm run dev` recreates schema+reviewer seed; re-run §3.5 scripts for brands/audits/shopify.

### 10. Common issues
- better-sqlite3 gyp error → §1.2 toolchain.
- `FATAL: jwtSecret is set to the default value` → prod with example secrets; set real secrets or use dev.
- `NET::ERR_CERT_AUTHORITY_INVALID` → self-signed HTTPS; click through or `--ssl false`.
- `/api` 502/`ERR_CONNECTION_REFUSED` → backend not on `:3000`.
- `no such table: brands/audits/shopify_tokens` → §3.5 scripts not run.
- 401 after minutes → JWT expired (7-day window, shorter on test).
- CORS from non-`localhost:4200` → add to `FRONTEND_URL` or `corsOrigins` in `server/src/config.ts`.
- Dashboard all zeros → no Meta token / placeholder `META_APP_*`; need real Meta tester token (see `EMPLOYEE_TESTING_INSTRUCTIONS.md`).
- Anthropic features error → `ANTHROPIC_API_KEY` placeholder (or use Gemini fallback).
- `EADDRINUSE` 3000/4200 → `lsof -i :PORT` kill, or change `PORT`.
- No reload → `tsx watch` lost watcher (WSL on mounted Windows drive); restart / move repo into WSL fs.

### 11. Post-change smoke matrix
- `routes/<x>.ts` → curl endpoint w/ JWT, 2xx+shape.
- `db/schema.ts` → delete `data/cosmisk.db*`, restart, exercise feature.
- `services/<x>.ts` → closest spec `npm test` + UI.
- `plugins/auth.ts`/`usage-limiter.ts` → signup+login, authed route, exceed a limit.
- frontend `src/app/features/` → navigate route, check `/api` in DevTools.
- `proxy.conf.json`/`angular.json` → restart `npm start`, verify `/api/*` reaches backend.
- `.env` → restart backend, check `/health` + prod boot guard.
- cron (`services/agent.ts`, `audit-scheduler.ts`) → restart, watch next tick or set near-future cron.

### 12. URLs
Frontend `https://localhost:4200/`; backend health `http://localhost:3000/health`; seeded login `reviewer@cosmisk.com` / `MetaReview2026!`; local DB `server/data/cosmisk.db` (DB Browser for SQLite).

## Cited & kept (referenced elsewhere)
- Full setup/run steps retained above — cited by `19_05/run_guide.md` ("for durable setup steps") and `STATUS_INDEX.md`.

## Pointer
- DURABLE_REFERENCE → see: `19_05/run_guide.md`, `STATUS_INDEX.md`
