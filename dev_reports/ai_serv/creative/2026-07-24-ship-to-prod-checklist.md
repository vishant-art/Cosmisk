# Ship to prod — `improve/creative` → `main` → Vercel + Railway A + Railway B

Branch `improve/creative` @ `537cebe`, **pushed — PR #10 open** (`improve/creative` → `main`).
Scope: `apps/*` only. `rnd_mine/` (`origin/new/creative_v2`) is explicitly **out of scope** — see
`[[creative-v2-parallel-branch]]`; zero overlapping files, so it neither conflicts nor blocks.

> **Deploy reality (2026-07-26):** the live Railway A + B are still on the stale
> **`ai-layer-adapter`** branch with a stale env set — that is why `/health` returns
> `db:error`. The fix is this ship: merge PR #10, wipe both env sets, **repoint both services to
> `main`**. Do not repoint to the stale branch.

---

## 1. Pre-flight — all green as of 2026-07-24

| Gate | Result |
|---|---|
| apps/api `tsc --noEmit` | baseline-only (`billing.ts:4` stripe, pre-existing) |
| apps/api `madge --circular` | 0 cycles |
| apps/api suite | 441 passed / 2 skipped (was 436; +5 review-response tests, commit `c2cf9ce`) |
| apps/web `ng build` | clean, 584.23 kB, 3 pre-existing NG8107 warnings |
| ai-layer full suite | **599 passed / 7 skipped** on both a used and a clean Neon branch |
| sim smoke | 3 healthchecks + api→ai-layer round-trip PASS |

**Running the ai-layer suite** needs `PG*`/`PG*_POOL`, which are absent from every `.env`. Derive
them from an existing test-branch URL rather than provisioning anything:
`PG*` ← a **direct** URL, `PG*_POOL` ← the **pooled** one, plus `PGSSLMODE=require`,
`PGCHANNELBINDING=require`. Without them the suite reports 108 collection errors that are pure
env, not code.

---

## 2. Dockerfile audit

### `Dockerfile` (repo root) — Railway A, apps/api

Build context is the **repo root**; `apps/api` is copied by path. Multi-stage `node:22-alpine`.

- Toolchain for `sharp` is installed `--virtual` and dropped **inside** the same `npm ci` layer.
  Correct — an `apk del` in a later layer cannot reclaim it (~313 MB otherwise). **Do not "tidy".**
- No `./public/` is copied: Vercel serves the SPA, and the SPA-serving block in `index.ts` is
  `existsSync()`-guarded and no-ops. Correct for the split deploy.
- `HEALTHCHECK` uses `127.0.0.1`, not `localhost` — deliberate: busybox `wget` resolves
  `localhost` to `::1` first and the app listens on IPv4. **Do not "simplify".**
- `ENV PORT=3000`: overridden by Railway's injected value at runtime; the app reads
  `process.env.PORT`. The Docker `HEALTHCHECK` hardcodes 3000 — **Railway uses its own
  `healthcheckPath` HTTP probe, not Docker's**, so this is cosmetic, not a blocker.
- `RUN mkdir -p ./data && chown -R node:node ./data` — **LOAD-BEARING, DO NOT REMOVE.** ElevenLabs
  is out of scope for this build, which makes this look like dead weight. It is not:
  `index.ts:232-235` *unconditionally* `mkdirSync`s the audio dir and registers static serving at
  boot, and the container runs as non-root `node`. Without the Dockerfile's mkdir+chown, boot
  fails EACCES creating it under root-owned `/app`.

**Action: none. Ship as-is.**

### `apps/ai-layer/Dockerfile` — Railway B

Build context is the **repo root** (it bundles `apps/connectors`).

- `ARG INSTALL_GOOGLE=0` — **DONE** (commit `a07cf38`). Drops the heavy `google-ads` gRPC dep;
  the Google connector is blocked on #39/#40/#41 and lazy-imports (degrades to `skipped`).
  Reversible by rebuild, no code change.
- `CMD ... uvicorn --host ::` — **DONE** (commit `79883e5`). Was `0.0.0.0` (IPv4-only); Railway's
  private network is **IPv6-only**, so `.railway.internal` is unreachable on a v4 bind. `::` is
  dual-stack on Linux, so the public proxy and the localhost HEALTHCHECK still resolve. Required for
  the A→B private-networking decision (§3.5).
- Non-root `appuser` (uid 10001); `CREATIVE_OUTPUT_DIR=/app/data/creative_output` because
  site-packages is root-owned and read-only for `appuser`. **Do not move.**
- `ENV AI_LAYER_STORE_PATH=/app/data/store.sqlite` is a **retired** var (SQLite gone in DB-2).
  Harmless, cosmetic. Leave for the ship; delete in a later cleanup.
- Stateless — **no volume**. Correct: facts + cost ledger + jobs are in Neon, deliverables in R2.
- `CMD` is exec-form + `exec` so `${PORT}` expands **and** uvicorn is PID 1 (SIGTERM reaches it).
  **Do not convert to plain exec-form.**
- Migrations are explicitly out-of-band — never on boot.

**Action: optionally `INSTALL_GOOGLE=0`. Otherwise ship as-is.**

### `apps/web/Dockerfile` — **sim only, NOT used in prod**

Vercel builds from source via `vercel.json`. This file only serves the local nginx sim, where
`API_BASE_URL` arrives as a build **ARG**. Prod uses a build-time **env var** instead — different
mechanism, same result. Do not assume a change here affects prod.

### `vercel.json`

- `buildCommand: npm run build -w @cosmisk/web -- --configuration production` → the workspace's
  **`prebuild` hook fires `scripts/apply-env.mjs`**, which bakes `API_BASE_URL` into the generated
  `env-config.ts`. Verified present in `apps/web/package.json`. **This is the only thing that
  makes the frontend talk to the right API — if Root Directory is not the repo root, the
  workspace flag fails and the wrong origin is baked in.**
- Sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. **No CSP and no CORP** —
  confirmed, and this is what makes last session's CORP fix deterministic at the app layer.
  Residual risk is infra-only (Railway/Cloudflare inserting a CORP header), unverifiable
  pre-deploy. First post-deploy check below.

---

## 3. Env matrix

`.env.example` coverage verified complete for every key the code requires (root 65 · api 46 ·
web 2 · ai-layer 22 · connectors 18).

### 🔴 Railway B — ai-layer. Two vars fail **silently**

| Var | Source of truth | If wrong |
|---|---|---|
| **`AI_LAYER_API_KEY`** | `api.py:48-51` | **SILENT.** `require_api_key` returns without checking when empty ⇒ the generation endpoint is publicly unauthenticated and anyone can spend your fal/OpenRouter credit. Must equal Service A's. |
| **`STORAGE_BUCKET`** | `storage.py:18` | **SILENT.** `enabled()` is `bool(STORAGE_BUCKET)` ⇒ `_publish_assets` no-ops, assets stay on ephemeral disk, next redeploy 404s every past run's images. |
| `STORAGE_ENDPOINT` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | `storage.py:30-33` (`os.environ[...]`) | Loud `KeyError` on first upload |
| `DATABASE_URL` (pooled) | job + cost persistence | Quiet degrade — `_save` is best-effort; runs work, nothing persists, `ledger_json` stays NULL |
| `MIGRATION_DATABASE_URL` (direct) | alembic | Migration fails |
| `OPENROUTER_API_KEY`, `FAL_KEY` | every LLM / render call | Loud |
| `STORAGE_REGION` | optional, default `auto` | — |
| **`META_ACCESS_TOKEN`** | **LEAVE UNSET — see §3.1** | Set ⇒ silently grounds on the wrong brand |

**Never set on B:** any `PG*` / `PG*_POOL`. Those are the test harness; in prod they would point
the suite at live data.

### 3.1 `META_ACCESS_TOKEN` — unset it on BOTH services

It is currently in every `.env`, which reads as "a shared service credential". It is not one: it
is a **dev/CLI convenience**. The production design is per-request — apps/api decrypts the *user's*
stored token (`getMetaTokenForUser`) and forwards it as the `X-Meta-Token` header.

| Service | What reads it | In prod |
|---|---|---|
| apps/api | `config.ts:74` → **only** `resolveMetaToken` (`boot/ai-layer-routes.ts:49`), the "continue without Meta login" demo path. Its own comment: *"dev only — empty in prod = demo OFF"*. Plus `agent-orchestrator.ts:297/400` fallback. | **unset** |
| ai-layer | `api.py:57`, `creative/service.py:348` + `:664`, `pipeline.py:68` — all `x_meta_token or META_ACCESS_TOKEN`. The rest (`meta_live.py:172`, `chat.py:339`, `brain_real.py:45`) are `__main__` CLI tools. | **unset** |

**Why it matters.** `service.py:348` is `token = x_meta_token or os.getenv("META_ACCESS_TOKEN")`.
apps/api guards campaign mode with a **400** when the user has no Meta token
(`creative-studio.ts:146-151`) exactly so a run never silently grounds on the wrong account. That
guard is on the *api* side only. Anything reaching the ai-layer without the header falls back to
the operator's token and generates creative from the **operator's** winners — wrong brand, no
error, no log. Unsetting it converts that silent corruption into a loud failure, which is the
designed behaviour.

Cost of unsetting: the ai-layer CLI entry points and "demo mode" stop working in prod. Both are
dev affordances; neither is part of the shipped product.

### Railway A — apps/api

Boot guard `config.ts:89-116` calls `process.exit(1)` on any of:

| Var | Rule |
|---|---|
| `JWT_SECRET` | must **not** be `dev-secret-change-me` |
| `TOKEN_ENCRYPTION_KEY` | must **not** be `dev-encryption-key-change-me-now!` |
| `ANTHROPIC_API_KEY` | must be **present** (current key is creditless — fine, Creative Studio uses the ai-layer's OpenRouter path; TS `llm-gateway` features fail at runtime) |
| `META_APP_SECRET` | must be present |

Plus: **`AI_LAYER_URL`** → Service B (unset ⇒ `/generate` returns **503** for everything; the TS
fallback was deleted), **`AI_LAYER_API_KEY`** (= B's), `DATABASE_URL`, `META_APP_ID`,
`NODE_ENV=production`, `PORT`.

**`AI_LAYER_URL` uses private networking (§3.5):** `http://<service-b>.railway.internal:8000` —
`http` (no internal TLS), the internal listening port, **not** B's public `:443`.

`FRONTEND_URL` is **probably unnecessary** — `config.ts:76-85` already whitelists `cosmisk.com`,
`www.cosmisk.com`, `app.cosmisk.ai`, `cosmisk.vercel.app`. Set it only if the Vercel origin is
none of those.

### Vercel — apps/web

| Setting | Value |
|---|---|
| `API_BASE_URL` | **Railway A's public URL** (no custom domain yet) — see §3.3 |
| `META_OAUTH_ENABLED` | `false` until §3.2 is done, then `true` |
| Root Directory | **repo root** (the workspace build command depends on it) |
| Production branch | `main` |

### 3.3 `API_BASE_URL` — point it at the Railway URL, not the default

The committed default is `https://api.cosmisk.com` (`env-config.default.ts:5`), the eventual custom
domain. That domain is **not live** — Railway A is only on its generated URL
(`https://<service>.up.railway.app`). `apply-env.mjs` overrides the default from
`process.env.API_BASE_URL` when set, so:

- **Set `API_BASE_URL` in Vercel = Railway A's generated public URL.** No code change — the build
  bakes whatever the env var holds. If the var is unset, the build falls back to the dead
  `api.cosmisk.com` and the whole frontend is pointed at nothing.
- **Do NOT change the committed default.** It is the stable custom-domain target; replacing it with
  a Railway hostname couples the repo to an infra-generated name. The Vercel env var is the lever.
- Railway's generated domain is **stable across redeploys** (unlike Vercel's per-deploy preview
  URLs), so this value does not churn. When the custom domain is set up later, delete the Vercel
  override and the default takes over.

### 3.4 `FRONTEND_URL` — genuinely not needed, and here is why it "keeps changing"

Vercel mints a **new preview URL every deployment** (`cosmisk-<hash>.vercel.app`) — that is the URL
that churns. But production traffic never comes from a preview URL: Vercel keeps a **stable
production alias** (`cosmisk.vercel.app`) that always points at the latest production deploy, plus
the custom domains. `config.ts:77-84` already whitelists `cosmisk.vercel.app`, `cosmisk.com`,
`www.cosmisk.com`, `app.cosmisk.ai`. So every origin a production user can load from is already
allowed — **omit `FRONTEND_URL` entirely.** Setting it to a per-deploy URL would be pointless
because that URL is dead by the next deploy; the stable alias is the right and already-covered
answer. (If you ever need preview deploys to call the prod API, that is a wildcard-origin change,
not this var — and not needed for the ship.)

### 3.2 Meta OAuth redirect URIs — MUST be whitelisted before shipping

The redirect URI is not configured anywhere; it is derived from the browser at runtime, in two
places that must produce the identical string:

```ts
// meta-oauth.service.ts:57   and   meta-callback.component.ts:70
const redirectUri = `${window.location.origin}/app/settings/meta-callback`;
```

So in prod it is `https://<origin>/app/settings/meta-callback`. **A whitelisted localhost does not
cover it** — Meta rejects with "URL blocked" at the dialog, and again at the exchange
(`auth.ts:136` passes the same string to `exchangeCodeForToken`; Meta requires an exact match).

Add to the Meta app's **Valid OAuth Redirect URIs** (app `675224542133938`), one entry per origin
a user can land on — `cosmisk.com` and `www.cosmisk.com` are different origins:

```
https://cosmisk.com/app/settings/meta-callback
https://www.cosmisk.com/app/settings/meta-callback        # if www resolves
https://<project>.vercel.app/app/settings/meta-callback   # if the Vercel domain is used
```

Keep the localhost entry for dev. Then flip Vercel's `META_OAUTH_ENABLED` to `true` — it is the
fail-safe that renders "Finalizing…" instead of a broken popup.

### 3.5 A→B over Railway private networking

Service A talks to Service B **internally**, not over B's public domain. In R2 Mode-2 the browser
302s straight to R2, so it never hits B — B only needs to be reachable by A server-to-server.

- **Set `AI_LAYER_URL = http://<service-b>.railway.internal:8000`** on Service A. `http`, internal
  port (set **`PORT=8000`** on B so the address is deterministic), not the public `:443`.
- **Requires the `--host ::` bind** (§2, commit `79883e5`) — Railway private net is IPv6-only.
- **Remove Service B's public domain** after health-checking it — nothing external needs it. Smaller
  attack surface, `$0` egress, lower latency.
- No SSRF obstacle: the A→B creative calls use plain `fetch` (`creative-gen-client.ts`), and
  `safeFetch` was only a timeout helper (and its dead import is now removed — §9).
- `AI_LAYER_API_KEY` still required on both — private networking is not a substitute for auth.

---

## 4. Migration

One statement, and it is a **hard prereq** — campaign mode is the only mode the redesigned UI can
produce, and it inserts a null brief:

```sql
ALTER TABLE studio_generations ALTER COLUMN brief_json DROP NOT NULL;
```

Apply it with **`psql` directly, not `drizzle-kit migrate`.** Prod's 70 tables were applied
manually during M1, so the drizzle journal may be empty and `drizzle-kit` could try to replay from
`0000`. The statement is backward-compatible: old code always writes a non-null `brief_json`, so
widening the constraint breaks nothing in the window between migration and deploy. Run it
**before** the code lands.

> **DONE (2026-07-26).** Applied against the DB in root `.env` via psycopg (psql on the box is a
> clientless `pg_wrapper`). Preflight `SELECT 1` passed; `brief_json is_nullable` was already `YES`
> (no-op — the column was already widened on this branch). `DROP NOT NULL` is idempotent, so this
> is safe to re-run against any other target (e.g. a fresh prod branch) before its first deploy.

---

## 5. Ship sequence

1. **Rotate the Neon password** (leaked to a transcript on 2026-07-24). Root `.env`
   `DATABASE_URL`/`MIGRATION_DATABASE_URL` **updated (2026-07-26)**. Still to propagate to Service A,
   Service B — and `apps/api/.env.test` (user is holding on `.env.test` for now; the ai-layer suite
   won't run until it's updated, but that only blocks local testing, not the ship).
2. **Apply the `ALTER`** (§4) — **DONE (2026-07-26)**, already-nullable no-op. Re-run against a
   fresh prod branch before its first deploy if the target changes.
3. **Whitelist the Meta OAuth redirect URIs** (§3.2). Independent of everything else — do it
   early, it needs no deploy. *(Only if demoing Meta connect.)*
4. **Merge PR #10** `improve/creative` → `main`. Pushed (`537cebe`); clean fast-forward.
5. **Set Railway B env** — repoint source `ai-layer-adapter` → `main`. `AI_LAYER_API_KEY` first,
   `META_ACCESS_TOKEN` **unset** (§3.1), **`PORT=8000`** (§3.5). Verify `GET /health` 200 and an
   unauthenticated `POST /creative/generate` returns **401**. Then **remove B's public domain**.
6. **Set Railway A env** — repoint source → `main`. `META_ACCESS_TOKEN` **unset**,
   `AI_LAYER_URL = http://<service-b>.railway.internal:8000` **last** (§3.5), so A never points at a
   half-configured B. Verify `/health` → `"status":"ok","db":"connected"` (this is what clears the
   current `db:error`).
7. **Repoint Vercel** production branch → `main`; `API_BASE_URL` = `https://api.cosmisk.com`
   (Service A's now-live public domain). Set `META_OAUTH_ENABLED=true` once step 3 is confirmed.
8. **Post-deploy verification** (§6).

### Environment optimisation (applied above, collected here)

| Change | Effect | Reversible |
|---|---|---|
| `META_ACCESS_TOKEN` unset on A **and** B | Removes the silent wrong-brand grounding path (§3.1). Loses dev "demo mode" + ai-layer CLI in prod — neither is shipped product. | yes, re-set the var |
| `INSTALL_GOOGLE=0` on the ai-layer image | Drops the heavy `google-ads` gRPC dep. The connector lazy-imports and stays `skipped`; it is blocked on #39/#40/#41 anyway. Smaller image, faster cold start. | yes, rebuild |
| `FRONTEND_URL` omitted | `config.ts:76-85` already whitelists the real origins. One less var to drift. | yes |
| **NOT** removing `mkdir ./data` | Looks like dead weight now ElevenLabs is out of scope, but `index.ts:232` mkdirs unconditionally at boot as non-root → EACCES without it. | — |
| `AI_LAYER_STORE_PATH` left in place | Retired var (SQLite gone in DB-2), harmless. Delete in a later cleanup, not during a ship. | — |

---

## 6. Post-deploy verification

```bash
# 1. CORP survives the edge — the one thing unverifiable pre-deploy.
curl -sSI https://api.cosmisk.com/creative-studio/asset/<job>/<file> | grep -i cross-origin
#    expect: cross-origin-resource-policy: cross-origin
curl -sSI https://api.cosmisk.com/health | grep -i cross-origin
#    expect: same-origin   (proves it is per-route, not global)
```

2. Open Creative Studio, load a historical run → **thumbnails render** (CORP + R2 path end to end).
3. One real campaign-mode run, then the check that has never yet been possible in prod:

```sql
SELECT job_id, cost_usd, ledger_json->'by_op'
FROM ai_layer.creative_jobs ORDER BY created_at DESC LIMIT 1;
```

`by_op` must sum to `cost_usd`. Every pre-`becc613` row has `ledger_json = NULL`.

---

## 7. Rollback

- **Code:** revert the Vercel/Railway deploys to the previous `main` commit. All three are
  independent, so a partial rollback is fine.
- **Migration:** *not* rolled back. `DROP NOT NULL` is backward-compatible — old code keeps
  working against the widened column. Re-adding `NOT NULL` would fail against any campaign-mode
  row already written.
- **Data:** nothing destructive ships. `ledger_json` is additive; the R2 layout is unchanged.

---

## 8. Known limitations shipping with this

1. **ElevenLabs is not part of this build** — out of scope. `data/audio` therefore never fills in
   prod. (The Dockerfile's `mkdir ./data` still must stay; see §2.)
2. `variant_axis`/`variant_values` — backend complete, **no UI and no apps/api passthrough**.
3. Meta `code=1 subcode=99` on dev-tier rate budget — clears on retry; chunked backfill deferred
   (chunking multiplies request count against the very budget that is the bottleneck).
4. `AI_LAYER_STORE_PATH` in the ai-layer Dockerfile is a retired var (cosmetic).
5. `processGeneration` was **deleted**, not commented — `/generate` has no TS fallback and hard
   503s without `AI_LAYER_URL`. This is intended; see `DISCONNECTED_TS_MODULES.md`.
6. **Multi-tenant authorization is single-tenant-scoped** — see §9 deferrals. Safe only while the
   demo runs one account and `META_ACCESS_TOKEN` is unset. Fix before onboarding a second tenant.
7. **`trustProxy` is not set** on Fastify. Behind Railway's LB, `request.ip` is the LB hop, so all
   per-IP rate limits key off one address and collapse into a shared bucket. Deploy-time config
   fix (`trustProxy: true` in the Fastify opts) — decide at deploy; not a code change in this PR.

---

## 9. Security review response (2026-07-26)

A security review of the branch (`improve/creative`, 507 files) came back **clean on the
injection classes** (command/ffmpeg-filtergraph/SQL/SSRF/secrets/token-logging — the pydantic-typed
`EditPlan` + PNG captions are why filtergraph injection isn't reachable). The exposure was all in
authorization. A ponytail fable agent re-verified each finding against current code; two were
already handled.

### Fixed — commit `537cebe`

| # | Finding | Fix |
|---|---|---|
| 1 | **Unauthenticated asset proxy presigned any bucket object.** `jobId` was a raw R2 key-prefix selector, unvalidated → anon `GET /asset/backups%2F.../…` could presign arbitrary objects. | Validate `jobId` against `^[0-9a-f]{32}$` (real ids are `uuid4().hex`) at **both** trust boundaries: `creative-studio.ts` route **and** ai-layer `creative_asset_url` (`api.py`), so the backend doesn't depend on its caller. |
| 2 | **`GET /video/job/:jobId` read cross-tenant** — `authenticate` proves *a* user, not *the* user; siblings `/video/plan`,`/video/generate` scope, this didn't. | Added `SELECT id FROM studio_generations WHERE ai_job_id = ? AND user_id = ?` ownership guard in the handler (not the shared `getCreativeJob`, which internal pollers also call). |
| 5 | **Dead `safeFetch` import** (+ `createMessage`, `extractText`, `scoreCreative`, `getAccuracyStats`, `resolveScorePredictions`) — sole uses live in disconnected comment blocks. | Deleted the four import lines. `internalError` stays (live). |

Gate after fix: apps/api **436 passed / 2 skipped**, `tsc` baseline-only, ai-layer parse + guard
regex verified.

### Corrected by re-verification (review overstated)

- **"Asset proxy has no rate limit"** → a **global** 100/min/IP limiter already covers every route
  (`index.ts:120-124`). A per-route tighten to 60/min is optional hardening, not a blocker. The
  real issue is `trustProxy` (§8.7).
- **"`/voice/preview` passes unbounded text to paid TTS"** → already capped at the provider:
  `video_providers.py:121` sends `text[:200]`. The preview button sends no user text. No change.

### Deferred — with the condition that unblocks each

| Item | Deferred because | Fix when |
|---|---|---|
| Unscoped `/learn`, `/prior/:acct`, `/graph/:acct`, `/variants/:id/published` (account-level cross-tenant) | Dormant under a single-account demo; no ownership helper exists, correct fix is real work. | A second tenant/account exists. |
| `arrayBuffer()` byte-proxy → streaming rewrite | Fallback only fires with `STORAGE_BUCKET` unset (dev/pre-deploy); prod is 302→R2. | The byte-proxy path ever serves prod traffic. |
| `trustProxy` for correct per-IP keying | Pre-existing, all routes; deploy-config decision. | At deploy (§8.7). |
| Python deps unpinned (`>=`, no lock) | Non-reproducible images, but not a demo blocker. | `pip freeze`/lock before the next deploy. |
| Optional pydantic `max_length=300` on the voice-preview field | Cost already capped at the provider. | Only if boundary rejection is wanted over truncation. |
| `chat_json` total-failure cost leak — `raise last` drops the summed cost of all attempts | 3 consecutive malformed JSONs is rare (`response_format=json_object` almost always parses), $ is negligible, and ledgering it threads cost onto the exception across 10 call sites. A `logging.warning` breadcrumb was added (`brain.py`, commit `c2cf9ce`) so the path is observable. | If preview/render volume makes the unledgered spend material — carry cost on the exception and ledger in the caller. |

### Follow-up correctness fixes — commit `c2cf9ce` (verified independently)

Three review-response items landed after the security fixes, each independently verified (correct,
gates green at 441/2):
- **`video-job-poller`** — the 90m hard ceiling was only checked after a *successful* poll, so an
  unreachable ai-layer polled every 15s forever, and `recoverVideoJobs()` re-spawned one such loop
  per stuck row each boot. Moved the ceiling check to the loop top. Accepted trade: a job that would
  have completed at 90:01 now detaches instead of getting that final poll — mitigated because the
  ai-layer persists the render to Neon, so it resurfaces via boot-recovery or a refresh.
- **`chat_json`** — retried (billed) attempts summed into the returned cost (was: only the last
  attempt's). Total-failure path deferred as above.
- **`/asset` jobId guard** — added the route tests that were missing for the §9-#1 security fix.
