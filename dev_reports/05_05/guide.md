> **Status: 📖 REFERENCE (2026-05-31)** — durable codebase/infra orientation guide.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk — Codebase & Infra Guide

> Generated 2026-04-19. Branch `main` @ `69b4352`. 290 files, 3,632 graph nodes, 33,757 edges.

## Unique essence preserved

### 1. What is Cosmisk
AI-driven ad-ops platform for DTC/agency marketers. Pulls Meta/Google/TikTok ad data, runs Claude+Gemini analysis, generates UGC + static creatives, schedules audits, drives an autopilot "agent" layer with memory + decision logs. Billing USD (Stripe) + INR (Razorpay).

### 2. Stack at a glance

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

Repo top-level: `src/` (Angular), `server/` (Fastify), `mcp-servers/` (per-brand Shopify/Frame.io MCP), `e2e/` (Playwright), `scripts/` (brand maintenance), `Dockerfile` (multi-stage), `docker-compose.yml` (server+nginx local-only), `railway.toml`, `vercel.json`, `nginx.conf`.

### 3. Architecture
- **Request flow (prod):** Browser → Vercel static Angular @ cosmisk.com → XHR/fetch → `https://api.cosmisk.com` (Railway: Fastify + SQLite on volume) → Meta Graph/Google Ads/TikTok / Anthropic+Gemini / Stripe+Razorpay / n8n (webhooks: waitlist, video gen, briefing) / Puppeteer. Dev: `ng serve` :4200, proxy `/api`→`http://localhost:3000` (`proxy.conf.json`).
- **Frontend:** entry `src/main.ts`→`app.component.ts`; routes `app.routes.ts` (PublicLayout, AuthLayout, AppLayout); `authGuard`+`onboardingGuard` gate `/app/**`; 35 lazy feature modules under `src/app/features/` — dashboard, creative-cockpit, director-lab, ugc-studio, creative-engine, brain, analytics, ai-studio, reports, campaigns, audit, automations, autopilot, agent, content-bank, competitor-spy, agency, swipe-file, lighthouse, attribution, etc.; envs `environment.ts`/`environment.prod.ts` hardcode `META_APP_ID=675224542133938`, prod `API_BASE_URL=https://api.cosmisk.com`.
- **Backend (`server/src/`):** `index.ts` (~1,290 lines) = Fastify bootstrap, CORS/helmet/rate-limit, all plugin+route registration, plus inline `/leads/capture`, `/waitlist/join`, creatives/dashboard/onboarding/settings/brand-switch/ugc/avatars endpoints. `routes/` = 28 modules mounted under prefixes (`index.ts` lines 214–242): /auth /ad-accounts /dashboard /analytics /brain /director /ai /reports /ugc /brands /assets /automations /campaigns /media /billing /autopilot /competitor-spy /google-ads /tiktok-ads /creative-engine /content /score /agent /swipe-file /team /creative-studio /audits /schedules. `plugins/` = `auth.ts` (JWT decorator), `usage-limiter.ts` (plan rate decorators). `services/` = 28 (Meta/Google Ads shims, agent-memory/report-agent/sales-agent/content-agent, job queue, audit scheduler, autopilot, creative pipelines, Slack, email). `audit/` = 10 files (ingestion per platform, QA validator, PDF export, output formatting). `db/index.ts` = `getDb()` opens SQLite once with WAL+FK, runs `createTables()`+`seedReviewerAccount()` on first access. `db/schema.ts` = 35+ `CREATE TABLE IF NOT EXISTS` + 17 `ensureColumn()` safe-migrations. `validation/schemas.ts` = Zod schemas.
- **Data model:** FK-cascade on `users.id`: users, meta/google/tiktok_tokens; reports, campaigns, automations, autopilot_alerts; ugc_projects◂ugc_concepts◂ugc_scripts; creative_sprints◂creative_jobs◂creative_assets + cost_ledger, studio_generations/outputs, score_predictions; content_bank, swipe_file, dna_cache, url_analysis_cache; agent_runs◂agent_decisions + agent_core_memory/episodes/entities; subscriptions, user_usage, activity_log, password_reset_tokens; team_members◂team_invitations; leads, waitlist_leads (public, no FK). Timestamps = ISO strings from `datetime('now')`; booleans = INTEGER 0/1.

### 4. Deployment

| Artifact | Host | Config | Domain |
|---|---|---|---|
| Angular frontend | **Vercel** | `vercel.json` — `ng build --configuration production`, output `dist/cosmisk/browser`, SPA rewrites to `/index.html` | `cosmisk.com`+`www.cosmisk.com`; also listed cosmisk.ai, app.cosmisk.ai, cosmisk.vercel.app |
| Fastify backend | **Railway** | `railway.toml` → Docker build, start `node dist/index.js`, health `/health` | `api.cosmisk.com` |
| Self-host fallback | Docker Compose | `docker-compose.yml`+`nginx.conf` — server+nginx ports 80/443 (certs not wired) | `cosmisk.ai`/`www.cosmisk.ai` hardcoded in nginx |

- **Dockerfile (multi-stage):** (1) `frontend-builder` Node22 Alpine, root deps, `ng build --configuration production`; (2) `builder` Node22 Alpine + python3/make/g++ (better-sqlite3 native), `server/` deps, `tsc`; (3) `production` Node22 Alpine, prod-only deps + removes build tools, copies backend `dist/` + frontend `public/`, `mkdir ./data`, `CMD node dist/index.js`. Prod image serves API + static Angular via `@fastify/static` (`index.ts:264`) — contradicts Vercel path; in Railway frontend is hot-standby, live frontend is Vercel.
- **CI/CD** (`.github/workflows/ci.yml`, push to main + PRs): (1) frontend `ng build`; (2) frontend-unit-tests `ng test` headless chrome; (3) smoke-test Playwright (needs frontend); (4) backend `tsc --noEmit` + `vitest run` + coverage (`continue-on-error`); (5) security-scan `npm audit --audit-level=high` (`continue-on-error`); (6) docker build (needs backend). No deploy step — Railway+Vercel git-triggered.
- **Secrets:** `server/.env.example` (34 vars). Prod-required via `config.ts` lines 68–100: `JWT_SECRET` (≠ `dev-secret-change-me`), `TOKEN_ENCRYPTION_KEY` (≠ dev default), `ANTHROPIC_API_KEY`, `META_APP_SECRET`; `STRIPE_*` optional+warn. `META_APP_ID=675224542133938` committed in `config.ts` AND `environment.ts/prod.ts`.

### 5. Database
- Engine SQLite via `better-sqlite3` (sync, in-process). Location `config.databasePath`→`DATABASE_PATH`→default `./data/cosmisk.db` (cwd `/app` in prod → `/app/data/cosmisk.db`). Pragmas `journal_mode=WAL`, `foreign_keys=ON` (`db/index.ts:55`).
- Bootstrapping: every boot runs `createTables(db)` = `CREATE TABLE IF NOT EXISTS` + `ensureColumn()` per added column. No numbered migrations, no registry.
- Seeding: `seedReviewerAccount()` inserts `reviewer@cosmisk.com` w/ hardcoded `MetaReview2026!` and copies an admin's encrypted Meta token into reviewer row (`db/index.ts:15–49`); prod-facing, idempotent.
- Backups: none. No WAL checkpoint automation. `DATABASE_URL` exists in `config.ts` ("PostgreSQL connection string") but is never read — only SQLite wired; Postgres migration stubbed not started.

### 6. Security posture (already good)
`@fastify/helmet` CSP + HSTS (1yr+preload) + frameguard sameorigin + XSS filter; `@fastify/rate-limit` global 100 req/min/IP (`index.ts:99`); `@fastify/cors` explicit origin list; tokens encrypted (`token-crypto.ts` aes-256-gcm); JWT 7-day + `/auth/refresh`; `config.ts` refuses prod boot with default/missing secrets; global error handler strips stack traces in prod (`index.ts:109–119`); slow-request logger `onResponse` hook (`index.ts:1255`, warns >2s).

### 7. Infrastructure & reliability flaws (by severity)

**Critical:**
- **C1** docker-compose volume path mismatch: `docker-compose.yml:21` mounts `db-data:/app/server/data` but DB writes `/app/data/cosmisk.db` → volume empty, SQLite on ephemeral overlay → all data lost on restart/redeploy. Fix: mount `/app/data` or set `DATABASE_PATH=/app/server/data/cosmisk.db`.
- **C2** SQLite on Railway = scaling cliff: single-file/in-process/sync, one container, no shard/replica, every `bcrypt.hashSync`/`SELECT` blocks event loop. Plan Postgres migration before meaningful traffic.
- **C3** Reviewer account auto-seeded w/ committed password + admin's real Meta token (`db/index.ts:9–49`): (1) anyone with password can log into prod; (2) account holds cross-user Meta token, bypasses per-user consent, risks Meta policy. Gate behind `SEED_REVIEWER=true` + runtime password out-of-band.
- **C4** DDL in request handler: `POST /waitlist/join` (`index.ts:160–176`) runs `CREATE TABLE IF NOT EXISTS waitlist_leads` every call — public unauthenticated, races on boot. Move to `schema.ts`.
- **C5** Hardcoded IP fallback for n8n over HTTP: `index.ts:203` `fetch(http://${N8N_HOST||'187.127.132.91'}:5678/webhook/waitlist/join)` — cleartext, no auth, public IP fallback. Require `N8N_HOST` or remove fallback.

**High:**
- **H1** Sync bcrypt blocks event loop: `routes/auth.ts` uses `hashSync`/`compareSync` (rounds 10 ≈ 50–100ms), logins serialize. Switch to Promise API.
- **H2** Schema-drift from `ensureColumn`: `schema.ts` adds 17 cols via `PRAGMA table_info`+`ALTER TABLE`; no drop/rename, no backfill, no `schema_migrations` versioning, no rollback. Adopt drizzle-kit/knex/numbered SQL before next non-additive change.
- **H3** Account deletion leaks data: `DELETE /settings/account` (`index.ts:1086–1107`) hardcodes 23 tables; new user-scoped tables silently missed → orphan PII. Drive from `PRAGMA foreign_key_list` or metaprogrammed cleanup.
- **H4** `unsafe-inline` in script-src CSP (`index.ts:71`) neutralizes XSS protection on lead/profile surfaces. Use Angular nonce-based CSP.
- **H5** `request.ip` unreliable behind Railway/Vercel edge: no `trustProxy:true` (`index.ts:50`); rate-limit allowlist `['127.0.0.1']` + `ip` columns see proxy IP. Set `trustProxy` to known hop count + verify.
- **H6** `token-crypto.ts` `getKey()` zero-pads raw bytes into 32-byte buffer (not a KDF); short `TOKEN_ENCRYPTION_KEY` → half key material zeros, weak AES-256-GCM. Use scrypt/HKDF or require 32-byte hex.

**Medium:**
- **M1** No JWT token revocation: 7-day JWT, no server blacklist; leaked token only killable by rotating `JWT_SECRET` (logs out all). No CSRF on cookie-free JWT routes is fine; but there is no token revocation. Consider short access + refresh-token-in-DB.
- **M2** helmet CSP allows `https:` in imgSrc — tighten to specific CDNs.
- **M3** `try{}catch{/* table may not exist */}` swallows errors (e.g. `index.ts:1037,1101`). Replace with specific logged catches.
- **M4** No observability beyond pino — no metrics/tracing/Sentry; incidents rely on grep over Railway logs.
- **M5** Fire-and-forget fetches drop data silently: n8n call (`index.ts:202`) logged not retried. Consider outbox/retry queue.
- **M6** `nginx.conf` hardcodes `cosmisk.ai` but prod is `cosmisk.com` — self-hosted compose path 404s/broken as shipped (harmless; primary is Railway+Vercel).
- **M7** `recoverInterruptedSprints()` on boot unbounded (`index.ts:1283`): crash loop could thrash in-flight paid API calls (Claude/Gemini/Flux/Kling/HeyGen). Add per-sprint retry/circuit breaker.
- **M8** Rate limit per-IP: corporate NAT starves others. Consider per-user-ID limits on authed routes (JWT has `user.id`).
- **M9** Coverage + security scan `continue-on-error` in CI = advisory; remove flag if meant to gate.

**Low/nits:** `.env.example` leaks real Meta App ID; `index.ts` ~1,290 lines houses routes belonging in `routes/`; `seedReviewerAccount` runs once per process boot (getDb memoises) but SELECT executes on first cold-start access; `api-providers.ts` vs per-platform services side-by-side (document which wins); mixed `/*.js` import extensions (ESM node16) inconsistent in tests.

### 8. Tooling notes (this session)
`code-review-graph` MCP installed via pipx, auto-configured (`.mcp.json`, `.claude/settings.json` hook). Initial graph: 290 files, 3,632 nodes, 33,757 edges, 20 community wiki pages at `.code-review-graph/wiki/`. MCP tools available after restarting Claude Code (e.g. `detect_changes`, `get_impact_radius`, `query_graph`, `semantic_search_nodes`); until then CLI `code-review-graph status|visualize|wiki|detect-changes`. The repo's CLAUDE.md already tells Claude to query the graph first — that now has a real backend.

### 9. Suggested next steps (priority-ordered)
1. Fix docker-compose volume path (C1). 2. Gate `seedReviewerAccount` behind env flag + rotate shared Meta token (C3). 3. Move `CREATE TABLE waitlist_leads` DDL out of handler (C4). 4. Require `N8N_HOST` / HTTPS+auth for webhooks (C5). 5. Async bcrypt (H1). 6. Plan Postgres migration, adopt migration tool first (C2/H2). 7. Set `trustProxy` + audit `request.ip` (H5). 8. Harden CSP with Angular nonce (H4).

## Cited & kept (referenced elsewhere)
- Durable codebase/infra orientation (§2 stack, §3 architecture, §4 deployment, §5 DB, §7 flaws C1-C5/H1-H6/M1-M9) — cited by `19_05/guide.md` ("for durable orientation") and `STATUS_INDEX.md`. Retained in full with all tables, numbers, and file:line refs.

## Pointer
- DURABLE_REFERENCE -> see: `dev_reports/23_05/state_of_codebase.md` (refreshed orientation)
