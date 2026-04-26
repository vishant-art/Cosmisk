# Cosmisk — Codebase & Infra Guide

> Generated 2026-04-19. Branch `main` @ `69b4352`. 290 files, 3,632 graph nodes, 33,757 edges.

## 1. What is Cosmisk?

An AI-driven ad-ops platform for DTC / agency marketers. Pulls data from Meta / Google / TikTok ad accounts, runs Claude- and Gemini-powered analysis, generates UGC and static creatives, schedules audits, and drives an autopilot "agent" layer with memory + decision logs. Billing in both USD (Stripe) and INR (Razorpay).

---

## 2. Stack at a glance

| Layer | Tech |
|---|---|
| Frontend | Angular 17 (standalone, lazy routes), SCSS, Tailwind 3, lucide-angular, chart.js, html2canvas + jspdf |
| Backend | Fastify 5 on Node 22 (TypeScript, ESM) |
| DB | `better-sqlite3` (SQLite, synchronous, WAL mode) |
| Auth | `@fastify/jwt` HS256, 7-day JWT; bcryptjs hashing |
| AI | Anthropic SDK (primary), Google Generative AI (Gemini, secondary) |
| Payments | Stripe (USD) + Razorpay (INR), dual gateway |
| Ad platforms | Meta Graph v22, Google Ads, TikTok Ads |
| Browser automation | Puppeteer (PDF generation, URL analysis) |
| Orchestration | In-process job queue, cron (`node-cron`) audit scheduler |
| External automation | n8n webhooks for waitlist sync + video generation |
| CI | GitHub Actions (frontend build + Karma tests, backend tsc+vitest, Playwright smoke, Docker build, `npm audit`) |
| E2E | Playwright |

**Repo layout** (top-level):
```
src/                # Angular app (frontend)
server/             # Fastify API (backend)
mcp-servers/        # Per-brand Shopify/Frame.io/etc MCP servers
e2e/                # Playwright specs
scripts/            # Brand-specific maintenance scripts (oudh, shopify, etc.)
Dockerfile          # Multi-stage: frontend build → backend build → production
docker-compose.yml  # server + nginx, local-only
railway.toml        # Railway deploy config (backend)
vercel.json         # Vercel deploy config (frontend)
nginx.conf          # Reverse proxy config (self-hosted path)
```

---

## 3. Architecture

### 3.1 Request flow (production)

```
Browser ─▶ Vercel (static Angular @ cosmisk.com)
         │
         └── XHR/fetch ─▶ https://api.cosmisk.com (Railway: Fastify + SQLite on volume)
                                │
                                ├── Meta Graph / Google Ads / TikTok Ads
                                ├── Anthropic + Gemini
                                ├── Stripe / Razorpay (checkout + webhooks)
                                ├── n8n webhooks (waitlist, video gen, briefing)
                                └── Puppeteer (PDF, URL scrape)
```

Dev: Angular `ng serve` on :4200, proxy `/api` → `http://localhost:3000`. See `proxy.conf.json`.

### 3.2 Frontend structure

- Entry: `src/main.ts` → `src/app/app.component.ts`
- Routes: `src/app/app.routes.ts` — three layouts: `PublicLayout`, `AuthLayout`, `AppLayout`
- Guards: `authGuard` + `onboardingGuard` gate `/app/**` routes
- Feature modules (lazy): 35 features under `src/app/features/` — dashboard, creative-cockpit, director-lab, ugc-studio, creative-engine, brain, analytics, ai-studio, reports, campaigns, audit, automations, autopilot, agent, content-bank, competitor-spy, agency, swipe-file, lighthouse, attribution, etc.
- Environments: `src/environments/environment.ts` (dev) + `environment.prod.ts` (prod). Both hardcode `META_APP_ID=675224542133938` and route constants. Prod points `API_BASE_URL` to `https://api.cosmisk.com`.

### 3.3 Backend structure (`server/src/`)

- `index.ts` (~1,290 lines) — Fastify bootstrap, CORS/helmet/rate-limit, all plugin + route registration, plus inline `/leads/capture`, `/waitlist/join`, creatives/dashboard endpoints, onboarding endpoints, settings endpoints, brand switch, ugc/avatars
- `routes/` — 28 route modules, each mounted under a prefix (see `index.ts` lines 214–242): `/auth`, `/ad-accounts`, `/dashboard`, `/analytics`, `/brain`, `/director`, `/ai`, `/reports`, `/ugc`, `/brands`, `/assets`, `/automations`, `/campaigns`, `/media`, `/billing`, `/autopilot`, `/competitor-spy`, `/google-ads`, `/tiktok-ads`, `/creative-engine`, `/content`, `/score`, `/agent`, `/swipe-file`, `/team`, `/creative-studio`, `/audits`, `/schedules`
- `plugins/` — `auth.ts` (JWT verify decorator), `usage-limiter.ts` (plan-based rate decorators)
- `services/` — 28 services covering API provider shims (Meta, Google Ads), AI orchestration (agent-memory, report-agent, sales-agent, content-agent), job queue, audit scheduler, autopilot engine, creative pipelines, Slack, email
- `audit/` — 10 files: ingestion per platform, QA validator, PDF export, output formatting
- `db/index.ts` — `getDb()` opens SQLite once with WAL + foreign_keys, runs `createTables()` + `seedReviewerAccount()` on first access
- `db/schema.ts` — 35+ `CREATE TABLE IF NOT EXISTS` + 17 `ensureColumn()` safe-migrations at the bottom
- `validation/schemas.ts` — Zod schemas (profile update, password change, etc.)

### 3.4 Data model (high-level)

Primary user-scoped tables (FK cascade on `users.id`):
- `users`, `meta_tokens`, `google_tokens`, `tiktok_tokens`
- `reports`, `campaigns`, `automations`, `autopilot_alerts`
- `ugc_projects` ◂ `ugc_concepts` ◂ `ugc_scripts`
- `creative_sprints` ◂ `creative_jobs` ◂ `creative_assets`, plus `cost_ledger`, `studio_generations`/`studio_outputs`, `score_predictions`
- `content_bank`, `swipe_file`, `dna_cache`, `url_analysis_cache`
- `agent_runs` ◂ `agent_decisions`; `agent_core_memory`, `agent_episodes`, `agent_entities`
- `subscriptions`, `user_usage`, `activity_log`, `password_reset_tokens`
- `team_members` ◂ `team_invitations`
- `leads`, `waitlist_leads` (public, no FK)

All timestamps are ISO strings from `datetime('now')`, not epoch integers. Booleans stored as `INTEGER 0/1`.

---

## 4. Deployment

| Artifact | Host | Config | Domain |
|---|---|---|---|
| Angular frontend | **Vercel** | `vercel.json` — builds with `ng build --configuration production`, output `dist/cosmisk/browser`, SPA rewrites to `/index.html` | `cosmisk.com` + `www.cosmisk.com` (per prod env + helmet CSP). Also listed: `cosmisk.ai`, `app.cosmisk.ai`, `cosmisk.vercel.app` |
| Fastify backend | **Railway** | `railway.toml` → Docker build, start `node dist/index.js`, health `/health` | `api.cosmisk.com` (per `environment.prod.ts`) |
| Self-host fallback | Docker Compose | `docker-compose.yml` + `nginx.conf` — server + nginx on ports 80/443 (certs not wired in nginx.conf) | `cosmisk.ai` / `www.cosmisk.ai` hardcoded in nginx |

### 4.1 Dockerfile (multi-stage)

1. `frontend-builder` — Node 22 Alpine, installs root deps, runs `ng build --configuration production`
2. `builder` — Node 22 Alpine + python3/make/g++ (for better-sqlite3 native build), installs `server/` deps, `tsc` build
3. `production` — Node 22 Alpine, re-installs prod-only deps + removes build tools, copies backend `dist/` and frontend `public/`, `mkdir ./data`, `CMD node dist/index.js`

The production image serves both the API *and* the static Angular bundle via `@fastify/static` (`index.ts` line 264). This contradicts the Vercel path — in Railway, the frontend is essentially a hot-standby; the live frontend is on Vercel.

### 4.2 CI/CD (GitHub Actions — `.github/workflows/ci.yml`)

Jobs on push to `main` and PRs:
1. `frontend` — `ng build --configuration production`
2. `frontend-unit-tests` — `ng test` headless chrome
3. `smoke-test` — Playwright against prod build (needs `frontend`)
4. `backend` — `tsc --noEmit` + `vitest run` + coverage (coverage is `continue-on-error`)
5. `security-scan` — `npm audit --audit-level=high` (`continue-on-error`)
6. `docker` — `docker build -t cosmisk-server .` (needs `backend`)

No deploy step in CI — deploys are handled by Railway (git-triggered) and Vercel (git-triggered) separately.

### 4.3 Secrets / env vars

Defined in `server/.env.example` (34 vars). Minimum required in production (enforced by `config.ts` lines 68–100):
- `JWT_SECRET` — must not equal `dev-secret-change-me`
- `TOKEN_ENCRYPTION_KEY` — must not equal the dev default
- `ANTHROPIC_API_KEY`, `META_APP_SECRET` — required
- `STRIPE_*` — optional with warning

Warning: `META_APP_ID=675224542133938` is committed in `config.ts` **and** in `environment.ts/environment.prod.ts` — not a secret but tightly coupled to a specific Meta app.

---

## 5. Database

- **Engine:** SQLite via `better-sqlite3` (synchronous, in-process).
- **Location:** `config.databasePath` → `DATABASE_PATH` env → default `./data/cosmisk.db` (relative to the backend `cwd`, which is `/app` in the prod container → `/app/data/cosmisk.db`).
- **Pragmas:** `journal_mode=WAL`, `foreign_keys=ON` (`db/index.ts` line 55).
- **Schema bootstrapping:** every process boot runs `createTables(db)` which is `CREATE TABLE IF NOT EXISTS …` for every table plus `ensureColumn()` for each added column. No numbered migration files, no migration registry.
- **Seeding:** `seedReviewerAccount()` inserts `reviewer@cosmisk.com` with hardcoded password `MetaReview2026!` and **copies an admin user's encrypted Meta token** into that reviewer's row (`db/index.ts` lines 15–49). Production-facing, idempotent.
- **Backups:** none configured. No WAL checkpoint automation documented.

The `DATABASE_URL` env var exists in `config.ts` (for "PostgreSQL connection string (production)") but is never read anywhere — only SQLite is wired up. Migration to Postgres is stubbed but not started.

---

## 6. Security posture (what's already good)

- `@fastify/helmet` with CSP, HSTS (1 year + preload), frameguard sameorigin, XSS filter
- `@fastify/rate-limit` global 100 req/min/IP (`index.ts` line 99)
- `@fastify/cors` with an explicit origin list
- Tokens stored encrypted (`token-crypto.ts` uses `aes-256-gcm`)
- JWT 7-day expiry; `/auth/refresh` endpoint for rolling
- `config.ts` refuses to boot in production with default/missing critical secrets
- Global error handler strips stack traces in production (`index.ts` lines 109–119)
- Slow-request logger (`onResponse` hook at line 1255 — warns >2s)

---

## 7. Infrastructure & reliability flaws

Ordered by severity.

### 7.1 Critical

**[C1] docker-compose volume path does not match where the DB is written.**
`docker-compose.yml` line 21 mounts `db-data:/app/server/data`, but the DB writes to `./data/cosmisk.db` with `cwd=/app`, i.e. `/app/data/cosmisk.db`. Result: the volume is empty and the SQLite file lives on the container's ephemeral overlay. On container restart/redeploy, **all data is lost**. Fix: either change the mount to `/app/data` or set `DATABASE_PATH=/app/server/data/cosmisk.db`.

**[C2] SQLite on Railway is a scaling cliff.**
SQLite is single-file, in-process, synchronous. On Railway you get one container; writes can't be sharded, reads can't be replicated, and every `bcrypt.hashSync` / `SELECT` blocks the Node event loop. Railway volumes help with persistence but not concurrency. Plan the Postgres migration that `config.ts` hints at before hitting meaningful traffic.

**[C3] Reviewer account is auto-seeded with a committed password + admin's real Meta token.**
`db/index.ts` lines 9–49: every boot ensures `reviewer@cosmisk.com` exists with `MetaReview2026!` and, if missing, inserts a copy of the encrypted Meta token from *any admin* row. Two risks:
1. Anyone with the password (hardcoded in a public-ish repo) can log in to production.
2. That account now holds a cross-user Meta access token, which bypasses per-user consent and risks Meta platform policy violations.
Remove or gate this behind a `SEED_REVIEWER=true` env var and set a runtime-generated password communicated out-of-band.

**[C4] DDL inside a request handler.**
`POST /waitlist/join` in `index.ts` lines 160–176 runs `CREATE TABLE IF NOT EXISTS waitlist_leads ...` on every call. Moves schema into a public, unauthenticated endpoint and races with concurrent requests on boot. Move to `schema.ts`.

**[C5] Hardcoded IP fallback for n8n webhook, over HTTP.**
`index.ts` line 203: `fetch(\`http://${process.env['N8N_HOST'] || '187.127.132.91'}:5678/webhook/waitlist/join\`, ...)`. Cleartext, no auth, public IP fallback. Leaks lead data on the wire and creates a hard dependency on a specific host. Require `N8N_HOST` or remove the fallback.

### 7.2 High

**[H1] Sync bcrypt blocks the event loop.**
`routes/auth.ts` uses `bcrypt.hashSync` on signup and `compareSync` on login (salt rounds 10 ≈ 50–100 ms). Every concurrent login serializes. Switch to `bcrypt.hash` / `bcrypt.compare` (Promise API) — trivial change, meaningful throughput gain under load.

**[H2] Schema-drift risk from the `ensureColumn` pattern.**
`schema.ts` adds 17 columns post-hoc via `PRAGMA table_info` + `ALTER TABLE`. This is fine for additive changes, but there is no mechanism for:
- dropping/renaming columns
- backfilling data during migration
- versioning schema (e.g. a `schema_migrations` table)
- rollback
Adopt a real migration tool (`drizzle-kit`, `knex`, or raw numbered SQL files with a `schema_migrations` table) before the next non-additive change.

**[H3] Account deletion leaks data.**
`DELETE /settings/account` (`index.ts` lines 1086–1107) hardcodes a list of 23 tables to delete from. Any new user-scoped table added later is silently missed and orphans PII. Drive this from `PRAGMA foreign_key_list` or add a `user_id` convention + metaprogrammed cleanup.

**[H4] `unsafe-inline` in script-src CSP.**
`index.ts` line 71 allows `'unsafe-inline'` for `scriptSrc`. This neutralizes CSP's XSS protection on a surface with user-influenced data (lead captures, profile fields). Angular supports nonce-based CSP; use it.

**[H5] `request.ip` is unreliable behind the Railway/Vercel edge.**
No `trustProxy: true` is set on Fastify (`index.ts` line 50). Rate-limit allowlist `['127.0.0.1']` and `ip` columns in `leads`/`activity_log` will see the proxy's IP, not the client's. Set `trustProxy` to the known proxy hop count and verify with a test.

**[H6] `token-crypto.ts` uses a naïve 32-byte pad, not a KDF.**
`getKey()` copies raw key bytes into a 32-byte buffer and zero-pads. If `TOKEN_ENCRYPTION_KEY` is short (e.g. 16 chars), half the key material is zeros — measurably weaker than intended for AES-256-GCM. Run the key through `scrypt` or HKDF, or require and validate a 32-byte hex string.

### 7.3 Medium

**[M1] No CSRF on cookie-free JWT routes is fine; but there is no token revocation.**
7-day JWT with no server-side blacklist. If a token leaks, there's no way to kill it short of rotating `JWT_SECRET` (which logs out every user). Consider a short access token + refresh-token-in-DB model.

**[M2] `helmet` CSP allows `https:` in imgSrc.**
Broad but often acceptable for user-uploaded/CDN-hosted creatives. Tighten to specific CDNs once known.

**[M3] Error handling `try { ... } catch { /* table may not exist */ }` in many places.**
E.g. `index.ts` line 1037, 1101. Swallowing errors hides real bugs. Replace with specific, logged catches.

**[M4] No observability beyond pino logs.**
No metrics (Prometheus/OpenTelemetry), no tracing, no structured error aggregation (Sentry/etc.). Incidents rely on grep over Railway log output.

**[M5] `fire-and-forget` fetches can drop data silently.**
n8n webhook call in `/waitlist/join` (line 202) and elsewhere — errors are logged but not retried. Consider an outbox pattern or a retry queue for webhook delivery guarantees.

**[M6] nginx.conf hardcodes `cosmisk.ai`, but prod domain is `cosmisk.com`.**
If anyone runs the self-hosted docker-compose path, nginx will 404 unless the hostname matches. Harmless for now (primary deploy is Railway + Vercel), but the self-hosted path is broken as shipped.

**[M7] `recoverInterruptedSprints()` on boot is unbounded.**
`index.ts` line 1283 — on every startup, all interrupted sprints are re-picked up. Fine normally, but a crash loop could thrash through in-flight paid API calls (Claude, Gemini, Flux, Kling, HeyGen). Add a per-sprint retry count / circuit breaker.

**[M8] Rate limit is per IP; one noisy customer behind a corporate NAT starves others.**
Consider per-user-ID rate limits on authenticated routes (easy, since JWT has `user.id` pre-verified).

**[M9] Coverage + security scan are `continue-on-error` in CI.**
Effectively advisory. If these are meant to gate merges, remove the flag.

### 7.4 Low / nits

- `.env.example` leaks a real Meta App ID. Not a secret but worth standardising how this is set.
- `index.ts` is ~1,290 lines and houses routes that belong in `routes/`. Splitting reduces merge conflicts and testing scope.
- `seedReviewerAccount` runs on *every* `getDb()` call? No — it runs once per process boot because `getDb()` memoises. OK, but the `SELECT` still executes on first access of each cold start.
- `api-providers.ts` and per-platform services live side-by-side — worth documenting which wins when a call could go either way.
- Mixed `/*.js` import extensions in TS files (ESM `node16` module resolution requirement) — inconsistent in tests.

---

## 8. Tooling notes (this session)

- `code-review-graph` MCP installed via `pipx` and auto-configured (`.mcp.json`, `.claude/settings.json` hook). Initial graph built: 290 files, 3,632 nodes, 33,757 edges. 20 community wiki pages at `.code-review-graph/wiki/`.
- MCP tools (`detect_changes`, `get_impact_radius`, `query_graph`, `semantic_search_nodes`, etc.) will be available **after restarting Claude Code** so the MCP server is loaded by the harness. Until then, use the CLI: `code-review-graph status | visualize | wiki | detect-changes`.
- The repo's CLAUDE.md already tells Claude to query the graph first — that now has a real backend.

---

## 9. Suggested next steps (priority-ordered)

1. Fix the docker-compose volume path (C1). One-line change, eliminates data loss on `docker compose down`/redeploy.
2. Remove or gate `seedReviewerAccount` behind an env flag (C3). Rotate the Meta token shared with it.
3. Move the `CREATE TABLE waitlist_leads` DDL out of the request handler (C4).
4. Require `N8N_HOST` / switch to HTTPS + auth for webhook forwards (C5).
5. Switch bcrypt to the async API (H1).
6. Plan the Postgres migration (C2/H2) — adopt a migration tool as the first step, even before swapping engines.
7. Set `trustProxy` on Fastify (H5) and audit all uses of `request.ip`.
8. Harden CSP (H4) with Angular nonce support.