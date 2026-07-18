# Split Deploy + Config Externalization — Design Spec

**Date:** 2026-07-10
**Branch:** `feat/ai-layer-adapter`
**Status:** Approved (pending final user review of this doc)

**Goal:** Split the current Railway monolith into an independently-deployed frontend
(Vercel) and backend (Railway), externalize the one browser-baked config value
(`API_BASE_URL`) to a Vercel env var, and produce the config + Dockerfile + `.env.example`
changes needed to bring the split deploy up on `feat/ai-layer-adapter` for a demo.

**Non-goals:** No feature work, no LLM-path changes, no merge to main. See "Out of Scope".

---

## 1. Architecture

Three independently-deployed tiers (was: one Railway monolith serving both API + SPA,
plus a stale Vercel copy on `main`):

| Tier | App | Host | Config model |
|---|---|---|---|
| Frontend | `apps/web` (Angular static) | **Vercel** (free CDN, no Dockerfile) | build-time bake |
| Backend | `apps/api` (Fastify) | **Railway Service A** | runtime env vars |
| AI layer | `apps/ai-layer` (FastAPI) | **Railway Service B** | runtime env vars |

Consequence of separate origins: the frontend calls the API cross-origin, so
`API_BASE_URL` must be the absolute Service A URL, CORS must allow the Vercel origin,
and the Meta OAuth redirect URI must name the Vercel origin.

### Why this split (recorded rationale)
- The backend has an always-on process (6h Watchdog cron, streaming endpoints, native
  deps) — unfit for Vercel serverless; it belongs on Railway.
- The frontend is static — Vercel's CDN is the right, free host.
- The monolith `Dockerfile` was only a packaging convenience (it built the SPA into the
  API's `public/`); nothing architectural requires them shipped together.

---

## 2. Configuration model — the definitive classification

**Rule:** *browser reads it → build-time; server reads it → runtime.* A static frontend
has no secrets (a bundle is world-readable), so "runtime is safer" does not apply to it —
its two config values are public. Backend secrets are already runtime env vars (never
baked into an image layer), so nothing server-side changes.

### Build-time (baked into the frontend bundle at Vercel build)
| Value | Source | Notes |
|---|---|---|
| `API_BASE_URL` | **Vercel env var** → prebuild script | the ONE value that migrates from constant → env var |
| `META_APP_ID` | committed **constant** | public OAuth `client_id`, never changes — not a Vercel var |
| `META_OAUTH_ENABLED` | committed **constant** default `true`, **overridable by an optional Vercel env var** | demo fail-safe gate (§5); set `false` for the demo, flip back after whitelisting — no code commit needed |
| ~130 endpoint path strings | committed constants | stable route names, not env-specific |

→ **Frontend Vercel env vars: one required (`API_BASE_URL`) + one optional
(`META_OAUTH_ENABLED`).** No runtime vars.

### Runtime (read by a server at boot — unchanged, already env-driven in `config.ts`)
- **Service A (TS):** `ANTHROPIC_API_KEY`, `META_APP_SECRET`, `JWT_SECRET`,
  `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, `AI_LAYER_URL`, `AI_LAYER_API_KEY`,
  `META_APP_ID`, `META_ACCESS_TOKEN`, `FRONTEND_URL`, `PORT`, `NODE_ENV`, plus optional
  feature secrets (Stripe`*`, Razorpay`*`, `GOOGLE_ADS_*`, `TIKTOK_*`, `SHOPIFY_*`,
  `GEMINI_API_KEY`, `FLUX_API_KEY`, `HEYGEN/KLING/ELEVENLABS`, `WHATSAPP_*`, `SLACK_*`,
  `RESEND_API_KEY`, `N8N_*`, `APP_URL`, `DEMO_ACCOUNT_ID`).
- **Service B (ai-layer):** `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `AI_LAYER_API_KEY`
  (required); `OPENROUTER_API_KEY`, `FAL_KEY`, `OPENROUTER_BASE_URL` (manual at demo);
  connector creds `META_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`,
  `GOOGLE_ADS_*`; tuning `CONNECTOR_CACHE_TTL_S`, `META_AD_ACCOUNT_ID`.

**Only `API_BASE_URL` changes category** (constant → Vercel-env-sourced build-time value).
Everything else was already in its final home.

---

## 3. Component changes

### 3.1 Frontend config externalization
- **New:** `apps/web/src/environments/env-config.default.ts` — committed source of truth
  for the three build-time config constants: `API_BASE_URL` (current default),
  `META_APP_ID`, `META_OAUTH_ENABLED`.
- **New:** `apps/web/scripts/apply-env.mjs` — a Node prebuild script that regenerates
  `apps/web/src/environments/env-config.ts`. It re-exports all three constants from
  `env-config.default.ts`, overriding `API_BASE_URL` with `process.env.API_BASE_URL` and
  `META_OAUTH_ENABLED` with `process.env.META_OAUTH_ENABLED` **when those env vars are
  set** (otherwise it emits an exact copy of the defaults, so local builds never break).
  `META_APP_ID` is always the committed constant.
- **Single import source:** `environment.prod.ts` and `environment.ts` import all three
  values from the generated `env-config.ts` (never from `.default` directly). Keep the
  ~130 endpoint path-string constants inline in the `environment.*` files.
- **Tracking (Approach B — gitignored + generated):** `env-config.ts` is **`.gitignore`d
  (untracked)**; `env-config.default.ts` is the committed source of defaults. Because the
  per-environment file is never tracked, a baked `API_BASE_URL` **cannot** be committed —
  the leak risk is structurally eliminated (no `skip-worktree` discipline required). On a
  fresh checkout it is regenerated before any compile by the npm hooks below; the only
  failure mode is a loud, local, self-healing "cannot find module" error if someone
  compiles before running an npm script.
- **Modify:** `apps/web/package.json` — add BOTH
  `"prebuild": "node scripts/apply-env.mjs"` (runs before `npm run build`, incl. the Vercel
  `-w @cosmisk/web` build, §6.1) and `"prestart": "node scripts/apply-env.mjs"` (runs
  before `npm start`/`ng serve`). Both invoke the same script, so the generated file exists
  for every build and serve path.

**Interface:** downstream services already `import { environment }`; they keep working
because `environment.API_BASE_URL` / `.META_APP_ID` still resolve — only the *source* of
those two fields changes (now `env-config.ts`). No consumer edits required.

### 3.2 Dockerfile
- **Modify root `Dockerfile` (Service A):** remove the `frontend-builder` stage and the
  `COPY --from=frontend-builder … ./public/` line. The SPA-serving block in
  `apps/api/src/index.ts:239-253` stays as-is — it is already guarded by
  `existsSync(frontendDir)`, so with no `public/` present it simply no-ops. Result: a
  leaner backend-only image; the local monolith still works if `public/` is ever restored.
- **`apps/ai-layer/Dockerfile` (Service B):** no change — already `$PORT`-correct and
  stateless. Verify only.

### 3.3a Pre-existing infra — reuse, do NOT recreate
- **CORS is already wired:** `config.ts:76-85` `corsOrigins` whitelists
  `https://cosmisk.vercel.app` + `env['FRONTEND_URL']`; registered at `index.ts:79`
  (`@fastify/cors`, `origin: config.corsOrigins`). The split needs **no CORS code change** —
  only set `FRONTEND_URL` on Service A **if** the demo's Vercel origin differs from the
  already-listed `cosmisk.vercel.app`.
- **`vercel.json` already exists at repo root** with: `framework: angular`,
  `buildCommand: npm run build -w @cosmisk/web -- --configuration production`,
  `outputDirectory: apps/web/dist/cosmisk/browser`, the SPA rewrite
  `/(.*) → /index.html` (deep links / refresh / the OAuth callback path resolve), and
  security + asset-cache headers. **No new Vercel config file is needed.** Because the
  build command and output path are repo-root-relative and use the `-w @cosmisk/web`
  workspace flag, the Vercel **Root Directory must be the repo root** (default), NOT
  `apps/web`.

### 3.3 `.env.example` files (committed, no values)
- `apps/api/.env.example` — every var from `config.ts`, grouped (core / auth-secrets /
  payments / connectors / ai-layer), each marked required-in-prod vs optional.
- `apps/ai-layer/.env.example` — Neon (`DATABASE_URL`, `MIGRATION_DATABASE_URL`),
  `AI_LAYER_API_KEY`, OpenRouter, FAL, connector creds, tuning.
- `apps/web/.env.example` — `API_BASE_URL` (the one build-time Vercel var) with a note
  that it is consumed by the `apply-env.mjs` prebuild script; `META_APP_ID` /
  `META_OAUTH_ENABLED` documented as code constants, not env vars.

---

## 4. Data flow (request path after the split)

```
Browser ──GET──▶ Vercel CDN (static Angular bundle, API_BASE_URL baked in)
Browser ──API──▶ Railway Service A (Fastify)  [cross-origin; CORS allows Vercel origin]
Service A ──▶ Railway Service B (ai-layer)     [AI_LAYER_URL, AI_LAYER_API_KEY]
Service A ──▶ Neon Postgres (public/drizzle schemas)
Service B ──▶ Neon Postgres (ai_layer schema)
```

---

## 5. Meta OAuth fail-safe (demo requirement)

**Problem:** the Vercel origin is not yet in the Facebook App's Valid OAuth Redirect URIs,
so `openOAuthPopup()` (`meta-oauth.service.ts:50`) would open a popup that Facebook
rejects with a raw "URL blocked" error.

**Already safe:** onboarding completes without Meta —
`onboarding.component.ts:400-406` `completeOnboarding()` sets the flag and only loads ad
accounts `if (metaOAuth.isConnected())`. The demo signup→dashboard path is not blocked.

**Add:** a build-time flag `META_OAUTH_ENABLED` — committed constant default `true`,
overridable by the optional Vercel env var (via `apply-env.mjs`, §3.1). Set `false` for
the demo. When `false`:
- `connectMeta()` / the Meta connect buttons in `onboarding.component.ts` and
  `settings.component.ts` do **not** open the popup; they show a clear, non-blocking
  message (e.g. "Meta connection is being finalized — you can explore the rest of the
  app") and leave `connectionStatus` as `disconnected`.
- No unhandled errors; the rest of the app is unaffected.

Reversible with no code change: once the redirect URI is whitelisted, set the Vercel
`META_OAUTH_ENABLED` env var to `true` (or remove it) and redeploy. Onboarding behavior is
unchanged either way.

---

## 6. Deploy runbook (user-executed; no code)

1. **Vercel** — **Root Directory = repo root** (default; NOT `apps/web` — the committed
   root `vercel.json` supplies `buildCommand`, `outputDirectory`, `framework`, and the SPA
   rewrite). Production branch `feat/ai-layer-adapter`. Env vars: `API_BASE_URL` = Service
   A public URL (required); `META_OAUTH_ENABLED=false` for the demo (optional, until the
   redirect URI is whitelisted). npm-workspace install runs at repo root automatically.
2. **Railway Service A** — runtime env: rotated `ANTHROPIC_API_KEY`, `META_APP_SECRET`,
   `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, `AI_LAYER_URL` = Service B URL,
   `AI_LAYER_API_KEY`, `FRONTEND_URL` = Vercel origin, `META_APP_ID`, `META_ACCESS_TOKEN`.
3. **Railway Service B** — runtime env: `DATABASE_URL`, `MIGRATION_DATABASE_URL`,
   `AI_LAYER_API_KEY` (match A); OpenRouter/FAL added manually at demo.
4. **Meta OAuth** — (deferred by user) add `https://<vercel-origin>/app/settings/meta-callback`
   to the Facebook App's Valid OAuth Redirect URIs; until then `META_OAUTH_ENABLED=false`.

---

## 7. Testing (Docker skill, pre-deploy)

- Build the Service A image (no frontend stage) and Service B image locally.
- Boot both; hit Service A `/health` (or a public route) and Service B `/health`.
- Confirm a CORS'd request from the Vercel origin succeeds against Service A.
- `apps/web`: run `npm run build` with and without `API_BASE_URL` set, and confirm the
  generated `env-config.ts` reflects the env var / falls back to the default.
- Restore `PG*` / `PG*_POOL` test-branch vars and run `pytest` for `apps/ai-layer` green
  before redeploying Service B.

---

## 8. Security items (folded in)
1. Rotate leaked **`ANTHROPIC_API_KEY`** (revoke → reissue → set in Railway A + `.env`).
2. Rotate leaked **Neon test-branch DB password**.

---

## 9. Out of scope (tracked separately)
- **Deferred (this plan):** `JWT_SECRET` / `TOKEN_ENCRYPTION_KEY` prod boot-guard fail-fast.
- **Adjacent tasks:** #34 Shopify auth-code grant / per-brand `X-Brand-Id`; #48 dispose
  duplicate TS ai-layer modules; frontend↔ai-layer feature gaps #1 `/blended`, #3
  creative_jobs durability, #4 brand_config, #6 `/cost` FE, #7 delivery; user-actions #39
  Google OAuth consent, #40 clear `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, #41 identify Google
  account owner, #46 `FAL_KEY`.
- **Gated:** #33 merge to main — after the split is validated.
