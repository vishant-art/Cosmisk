# Cosmisk — Local Run Guide

This guide assumes a **completely empty machine** (no Node, no SDKs, no DB) and walks you all the way to a running stack you can poke at while making code changes. Read top-to-bottom the first time; once you're set up, the **Daily loop** section near the bottom is what you'll actually use day-to-day.

The repo currently consists of two app processes:

| Process | Lives in | Port | Purpose |
|---|---|---|---|
| Backend (Fastify + SQLite) | `server/` | `3000` | API + DB + cron + LLM/Meta calls |
| Frontend (Angular 17) | `src/` (Angular root at repo root) | `4200` (HTTPS, self-signed) | UI; proxies `/api/*` → backend |

Frontend talks to backend through Angular's dev proxy (`proxy.conf.json`): everything the UI calls under `/api/...` is rewritten to `http://localhost:3000/...` (the `/api` prefix is stripped).

---

## 1. System prerequisites

### 1.1 Node + npm

Node **22 LTS** is required (the Dockerfile pins `node:22-alpine` and `tsx watch` is used in dev).

- **Linux/WSL:** install `nvm` then `nvm install 22 && nvm use 22`
- **macOS:** `brew install node@22` (or use `nvm`)
- **Windows:** install via [nvm-windows](https://github.com/coreybutler/nvm-windows) or the official Node 22 installer

Verify:
```bash
node --version   # v22.x
npm --version    # 10.x or newer
```

### 1.2 Native build toolchain (for `better-sqlite3`)

`better-sqlite3` is the SQLite driver and is compiled at install time, so the host needs a C/C++ toolchain plus Python 3.

| OS | Install |
|---|---|
| Debian/Ubuntu/WSL | `sudo apt install -y build-essential python3` |
| Alpine | `apk add --no-cache python3 make g++ libstdc++` |
| macOS | `xcode-select --install` |
| Windows | install **windows-build-tools** or use WSL |

If `npm install` later fails on `better-sqlite3` with `gyp` errors, this step is what's missing.

### 1.3 Git

```bash
git --version
```

### 1.4 Browser for the frontend

Chrome/Chromium recommended (Playwright e2e uses Chromium). Any modern browser works for manual testing, but the dev server uses **HTTPS with a self-signed cert** (see §4) so you'll get a one-time browser warning.

### 1.5 (Optional) Docker

Only needed if you want the all-in-one Docker path in §8. For day-to-day development you don't need it.

---

## 2. Get the code

```bash
git clone <repo-url> Cosmisk
cd Cosmisk
```

You should see `server/`, `src/`, `package.json`, `angular.json`, `Dockerfile`, `docker-compose.yml`, `proxy.conf.json` at the root. Confirm you're on the right branch:

```bash
git status
git branch
```

---

## 3. Backend (`server/`) setup

### 3.1 Install dependencies

```bash
cd server
npm install
```

If this is your first install on the machine, it will compile `better-sqlite3`. Watch for errors — if it fails, revisit §1.2.

### 3.2 Configure environment

```bash
cp .env.example .env
```

Then edit `server/.env`. The minimum to get the server **booting** in dev is:

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=<32+ random chars — `openssl rand -hex 32`>
TOKEN_ENCRYPTION_KEY=<32+ random chars — `openssl rand -hex 32`>
DATABASE_PATH=./data/cosmisk.db
APP_URL=http://localhost:4200
```

Everything else can stay as the placeholder values from `.env.example`. The server will boot, but features depending on each integration will be disabled or fail when exercised:

| Variable | If missing/placeholder | Impact |
|---|---|---|
| `ANTHROPIC_API_KEY` | empty/placeholder | LLM calls (audit, brain, director, creative, agent) error at request time |
| `GEMINI_API_KEY` | empty | Gemini fallback unavailable; Anthropic-only |
| `META_APP_ID`, `META_APP_SECRET` | placeholder | "Connect Meta" OAuth fails; dashboards show no data |
| `STRIPE_*` | placeholder | Billing routes return 5xx; webhook signature check fails |
| `RAZORPAY_*` | placeholder | INR billing disabled; webhook signature check fails |
| `NANO_BANANA_API_KEY` | placeholder | Image-gen route errors |
| `N8N_VIDEO_WEBHOOK` | placeholder | Video-gen kicks off but n8n call fails |
| `SLACK_*` | empty | Agent → Slack notifications silently skipped |
| `RESEND_API_KEY` | empty | Email alerts silently skipped |
| `GOOGLE_ADS_*`, `TIKTOK_*` | empty | Those connectors disabled |

**Important:** in `NODE_ENV=production` the server **refuses to boot** if `JWT_SECRET` or `TOKEN_ENCRYPTION_KEY` are at their dev defaults, or if `ANTHROPIC_API_KEY`/`META_APP_SECRET` are missing (`server/src/config.ts:68-101`). Dev mode tolerates defaults but you should still set both secrets to real random values.

### 3.3 Create the data directory

```bash
mkdir -p data
```

The DB file at `./data/cosmisk.db` is created automatically on first server start. You don't need to pre-create the file, only the directory.

### 3.4 Initial schema is applied automatically

When the server boots, `getDb()` (`server/src/db/index.ts`) runs `createTables(db)` from `server/src/db/schema.ts`, which idempotently `CREATE TABLE IF NOT EXISTS`'s ~35 tables and adds known columns via `ensureColumn()`. It also seeds a Meta App Review test account (`reviewer@cosmisk.com` / `MetaReview2026!`).

**You do NOT need to run any migration command for the in-tree schema.** Just start the server (next step) and the DB self-initializes.

### 3.5 Out-of-tree tables (one-time scripts)

A handful of tables (`brands`, `brand_context`, `audits`, `shopify_tokens`) live in standalone scripts, **not** in `db/schema.ts`. Run them once after the DB exists:

```bash
# from server/
npx tsx scripts/add-audit-tables.ts
npx tsx scripts/add-shopify-tables.ts
```

Both are idempotent (`CREATE TABLE IF NOT EXISTS` + `try/catch` on `ALTER TABLE`). They also seed three demo brands (`casorro`, `pratap-sons`, `salt-attire`) which the audit code references.

If you skip these, anything touching the audit feature or Shopify will fail with `no such table: brands` or similar.

> Note: a few other tables (e.g. `scheduled_audits`, `waitlist_leads`) are lazy-created the first time their request handler runs, so no script is needed for those.

### 3.6 Start the backend in dev mode

```bash
# from server/
npm run dev
```

This runs `tsx watch src/index.ts` — full TypeScript hot-reload on file change. You should see:

```
Cosmisk server running on port 3000
```

Smoke-test from another terminal:

```bash
curl -i http://localhost:3000/health
# expect: HTTP/1.1 200, JSON body
```

Leave this terminal running.

---

## 4. Frontend (Angular) setup

### 4.1 Install dependencies

From the **repo root** (not `server/`):

```bash
cd ..   # back to Cosmisk/
npm install
```

This pulls Angular 17, Tailwind, Playwright, etc. First install can take a few minutes.

### 4.2 Start the dev server

```bash
npm start
# equivalent to: npx ng serve
```

This serves on **`https://localhost:4200`** (note the **HTTPS** — `angular.json` sets `ssl: true` for the dev server). On first load, the browser will warn about the self-signed cert; accept it once for `localhost`.

The dev server proxies `/api/*` to `http://localhost:3000` and strips the `/api` prefix (see `proxy.conf.json`). So a UI call to `/api/auth/login` actually hits the backend at `http://localhost:3000/auth/login`. Keep that in mind when reading network requests in DevTools.

### 4.3 Sanity check

1. Open `https://localhost:4200/` in the browser → landing page loads.
2. Open DevTools → Network. Trigger any logged-in flow; you should see requests under `/api/...` returning from the backend.
3. Hit `https://localhost:4200/app/login` → log in with the seeded reviewer account if you want a populated user (`reviewer@cosmisk.com` / `MetaReview2026!`), or sign up a new user.

If the UI loads but every `/api` call 502s, the backend isn't running or is on the wrong port.

---

## 5. Verifying things actually work

A quick "is it alive" pass after a code change:

```bash
# 1. Backend up
curl -sf http://localhost:3000/health

# 2. Open browser
open https://localhost:4200/   # macOS
# or just paste in the address bar

# 3. Sign up a fresh user
curl -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"local@test.dev","password":"testpass123","name":"Local Dev"}'

# 4. Log in
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"local@test.dev","password":"testpass123"}'
# capture the token from the response

# 5. Hit an authenticated route
TOKEN='<paste from step 4>'
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/dashboard/summary
```

If any of those four returns something sensible, the stack is wired correctly. Anything specific to Meta, Anthropic, billing etc. will additionally need real keys (see §3.2 table).

---

## 6. Tests

### 6.1 Backend unit tests (Vitest)

```bash
cd server
npm test          # one-shot
npm run test:watch
```

Tests use `server/.env.test`, which provides placeholder values for everything and points the DB at `:memory:`. No real services are called.

### 6.2 Frontend unit tests (Karma/Jasmine)

```bash
# from repo root
npm test          # opens Karma in a browser
```

### 6.3 End-to-end (Playwright)

The Playwright config (`playwright.config.ts`) expects you to **start the servers manually** (`webServer: undefined`) and uses `https://localhost:4200` with `ignoreHTTPSErrors: true`. Headed mode, `slowMo: 400`, so you can watch.

```bash
# install Playwright browsers once
npx playwright install chromium

# in two separate terminals, start backend + frontend (sections 3.6, 4.2)

# then in a third terminal:
npx playwright test
```

CI/headless variant lives at `playwright.ci.config.ts`.

---

## 7. CLI tools you'll occasionally want

From `server/`:

```bash
# Run an ad-hoc audit against one of the seeded demo brands
npx tsx scripts/run-audit.ts --brand=casorro
npx tsx scripts/run-audit.ts --brand=casorro --days=7 --format=json

# (Re-run the schema migration scripts — idempotent)
npx tsx scripts/add-audit-tables.ts
npx tsx scripts/add-shopify-tables.ts
```

`run-audit.ts` requires `ANTHROPIC_API_KEY` and a working Meta token in the DB to actually produce output; without those it will fail at the first API call.

---

## 8. Docker path (optional)

For an all-in-one container that builds frontend + backend and serves both off port 3000:

```bash
# from repo root
docker compose up --build
```

This requires the same env vars as §3.2; pass them via a root-level `.env` (compose reads `${VAR}` substitutions). The Dockerfile builds the Angular app into `public/` and the backend serves it directly — no separate Vercel/Angular dev server in this path. Health: `http://localhost:3000/health`.

In production we currently deploy the **frontend on Vercel** and the **backend on Railway** (`vercel.json`, `railway.toml`); the Docker path is not the production deploy target, just a convenience for "run the whole stack in one command."

---

## 9. Daily loop (after first-time setup)

Once you've done §1–§4 once, the day-to-day cycle is:

```bash
# Terminal 1 — backend
cd ~/workspace/Cosmisk/server
npm run dev

# Terminal 2 — frontend
cd ~/workspace/Cosmisk
npm start

# Terminal 3 — your shell for git, curl, tests
cd ~/workspace/Cosmisk
```

`tsx watch` and Angular live-reload both pick up file changes automatically. You usually only restart processes when:

- **Backend:** you change `.env`, schema, or hit a state where in-process cron is stuck.
- **Frontend:** you change `angular.json`, `tailwind.config.js`, or install new deps.

To wipe local state and start clean:

```bash
# from server/
rm -f data/cosmisk.db data/cosmisk.db-shm data/cosmisk.db-wal
# then on next `npm run dev` the schema + reviewer seed are recreated
# you'll also need to re-run the §3.5 scripts to recreate brands/audits/shopify tables
```

---

## 10. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails on `better-sqlite3` with `gyp` errors | Native toolchain missing | §1.2 |
| Server boots then exits with `FATAL: jwtSecret is set to the default value` | You're in `NODE_ENV=production` with the example secrets | Set real `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`, or use `NODE_ENV=development` |
| Browser shows `NET::ERR_CERT_AUTHORITY_INVALID` on `https://localhost:4200` | Angular dev server uses self-signed HTTPS | Click through the warning once; or run with `--ssl false` if you want plain HTTP |
| Frontend loads but every `/api` call returns 502 / `ERR_CONNECTION_REFUSED` | Backend not running / wrong port | Start backend (§3.6), confirm it's on `:3000` |
| Backend logs `no such table: brands` / `audits` / `shopify_tokens` | One-time scripts §3.5 not run | `npx tsx scripts/add-audit-tables.ts && npx tsx scripts/add-shopify-tables.ts` |
| 401s after a few minutes | JWT expired (7-day window normally; can be shorter on test env) | Log out and back in |
| CORS error from a non-`localhost:4200` origin | Origin not in `corsOrigins` allowlist | Add it to `FRONTEND_URL` env or to `corsOrigins` in `server/src/config.ts` |
| Dashboard renders but shows zeros everywhere | No Meta token in DB / Meta returning empty / placeholder `META_APP_*` | You need a real Meta tester account + valid token to see real data; see `EMPLOYEE_TESTING_INSTRUCTIONS.md` |
| Anthropic-powered features (audit, brain, director, creative-engine) error at request time | `ANTHROPIC_API_KEY` placeholder | Put a real key in `.env` (or use `GEMINI_API_KEY` if the path supports the Gemini fallback) |
| `EADDRINUSE` on 3000 or 4200 | Stale process from a previous run | `lsof -i :3000` / `lsof -i :4200` then kill, or change `PORT` in `.env` |
| File changes don't trigger reload | `tsx watch` lost the watcher (common in WSL with mounted Windows drives) | Restart `npm run dev`; consider moving the repo into the WSL filesystem |

---

## 11. What to test after a change (cheatsheet)

| You touched… | Minimum manual smoke |
|---|---|
| `server/src/routes/<x>.ts` | `curl` the endpoint with a valid JWT; confirm 2xx and shape |
| `server/src/db/schema.ts` | Delete `data/cosmisk.db*`, restart server, confirm boot, exercise affected feature |
| `server/src/services/<x>.ts` | Run `npm test` for the closest spec; manually exercise the feature in the UI |
| `server/src/plugins/auth.ts` or `usage-limiter.ts` | Sign up + log in flow; hit an authed route; deliberately exceed a limit |
| Frontend component under `src/app/features/` | Navigate to its route in the browser; check the relevant `/api` calls in DevTools |
| `proxy.conf.json` / `angular.json` | Restart `npm start`; verify `/api/*` calls reach the backend |
| `.env` | Restart backend; check `/health`; check the prod boot guard logs if you set `NODE_ENV=production` |
| Anything cron-driven (`server/src/services/agent.ts`, `audit-scheduler.ts`) | Restart backend and watch logs for the next scheduled tick, or set the cron to a near-future time temporarily |

---

## 12. Useful URLs once running

- Frontend: `https://localhost:4200/`
- Backend health: `http://localhost:3000/health`
- Seeded test login: `reviewer@cosmisk.com` / `MetaReview2026!`
- Local SQLite file: `server/data/cosmisk.db` (open with [DB Browser for SQLite](https://sqlitebrowser.org) for inspection)

---

## 13. One-paragraph summary

Install Node 22 + a C toolchain + Python 3. `cd server && npm install && cp .env.example .env && mkdir -p data`, fill in `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`, `npm run dev`. From repo root: `npm install && npm start`. Run the two one-time scripts in `server/scripts/` to create the audit + Shopify tables. Open `https://localhost:4200`, accept the self-signed cert, sign up or use the seeded reviewer account. Anything depending on Meta/Anthropic/Stripe/Razorpay needs the corresponding API keys in `server/.env`; without them the server still boots and the rest of the app still works.
