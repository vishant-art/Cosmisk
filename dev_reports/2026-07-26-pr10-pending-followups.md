> **Status: 🔵 ACTIVE (2026-07-26)** — pending-items list from the PR #10 review pass
> (`improve/creative`, base `main` @ `fb9b926`). **§1 and §2 are now ✅ RESOLVED in `e3b02a3`**
> (see each section); everything remaining is **deliberately not done** and none of it blocks merge.
> **Fold into [`ON_HOLD.md`](./ON_HOLD.md)** (the canonical deferred-items ledger) once each item
> gets a Phase + Owner assignment — this doc is PR-scoped and should not outlive that merge.

# PR #10 — pending follow-ups

**Source:** code review + security review of PR #10 ("Creative Studio: pre-ship hardening"),
509 files, +147,955 / −25,801. Three review findings were already fixed and landed in `c2cf9ce`
(reachable poller ceiling · summed retry cost · jobId guard tests) and are **not** listed here.

**Gate state at `9c2df6b`:** `tsc` baseline-only (`billing.ts:4` stripe) · `madge` 0 cycles ·
apps/api `npm test` 441 passed / 2 skipped · ai-layer `pytest tests/creative` 493 passed (12m07s)
· **Web CI `Unit Tests (Angular)` FAILING — see §1.**

---

## 1. ✅ RESOLVED (`e3b02a3`) — Angular unit tests red (introduced by this PR)

> Fixed by adding the `pretest` hook. Verified from a simulated clean checkout (generated
> `env-config.ts` deleted first): the hook regenerates it and the suite runs for the first
> time on this branch — **455/455 SUCCESS**, zero failing specs behind the load error.
> Kept below for the record.

| | |
|---|---|
| **Effort** | ~2 min |
| **Introduced by** | `3ab4d4a` "build(web): externalize API_BASE_URL via generated env-config" |
| **Risk if merged as-is** | Merges a red `web-ci` gate onto `main`; every subsequent PR inherits the failure and the signal goes dead |

**Root cause.** `apps/web/src/environments/environment.ts:1` imports from `./env-config`, which is
**generated** by `apps/web/scripts/apply-env.mjs` and **gitignored** (`apps/web/.gitignore:2`,
header says `DO NOT COMMIT`). `apps/web/package.json` wires the generator to `prestart` and
`prebuild` — but there is **no `pretest` hook**. So:

- `npm run build -w @cosmisk/web` → `prebuild` generates the file → **Build (Angular) passes**
- `npm run test -w @cosmisk/web` → nothing generates it → **TS2307 → Karma "Found 1 load error" → fails**

It passes locally only because a previous `build`/`start` left `env-config.ts` on disk.

```
./src/environments/environment.ts:1:0-63 - Error: Module not found: Can't resolve './env-config'
error TS2307: Cannot find module './env-config' or its corresponding type declarations.
```

**Fix.** Add the missing hook in `apps/web/package.json`:

```json
"pretest": "node scripts/apply-env.mjs",
```

Verify with `npm run test -w @cosmisk/web -- --watch=false --browsers=ChromeHeadless` after
deleting `apps/web/src/environments/env-config.ts` to reproduce CI's clean-checkout state.

---

## 2. ✅ RESOLVED (`e3b02a3`) — recommended-before-ship items

| # | Item | Outcome |
|---|---|---|
| 2.1 | `AI_LAYER_API_KEY` fail-closed | Boot guard in `ai_layer/api.py`, keyed off Railway's injected `RAILWAY_ENVIRONMENT_NAME`. **Deploy consequence: Service B will now refuse to start if the key is missing** — that is the intent (loud, pre-traffic, previous release stays up), but do not mistake it for a regression. `/health` deliberately left ungated so the Dockerfile HEALTHCHECK cannot flap. Verified in all three states: no-key+Railway → `RuntimeError`; key+Railway → boots; no-key+no-Railway (local/tests) → open, unchanged. |
| 2.2 | `rnd/` in `.dockerignore` | Added. Confirmed no `COPY` in either Dockerfile and no shipped import reaches `rnd/`; `docker build -f apps/ai-layer/Dockerfile .` still exits 0. |

---

## 3. Post-merge queue

| # | Item | Effort | Location | Notes |
|---|---|---|---|---|
| 3.1 | Stream the asset byte-proxy instead of `arrayBuffer()` | ~1 h | `routes/creative-studio.ts` fallback path | Buffers a whole video in memory before responding, on an unauthenticated route. Pattern already exists: `Readable.fromWeb` in `boot/ai-layer-routes.ts:220`. |
| 3.2 | Gate the `/creative/assets` StaticFiles mount behind the API key | ~1–2 h | `ai_layer/api.py:287-289` | Starlette mounts don't inherit router `dependencies`, so this needs a custom route or middleware — not a one-liner. `StaticFiles` is traversal-safe, so this is *exposure*, not traversal: anyone who can reach Service B reads any job's assets. Safe only while Service B has **no public Railway domain** — an unenforced deploy-time invariant. |
| 3.3 | Ledger the `chat_json` total-failure cost | ~2–3 h | `ai_layer/creative/brain.py:55` | `raise last` discards the accumulated `cost`, so 3 consecutive malformed responses leak all 3 attempts' spend. Already annotated with a `ponytail:` comment and a `logging.warning`, so it is observable rather than silent. Full fix = carry cost on the exception, update **10 call sites** (`story_brain.py` ×7, `brand_brain.py` ×3) plus their `pipeline.py` consumers. |
| 3.4 | Pin Python dependencies / add a lockfile | ~1–2 h | `apps/ai-layer/pyproject.toml` | All 14 deps are `>=`, zero `==`, no lock. Non-reproducible images and open supply-chain drift on `boto3` / `fal-client` / `psycopg`. |
| 3.5 | Delete the commented-out `DISCONNECTED` route blocks | ~15 min | `routes/creative-studio.ts` | ~200 lines of block comment inside a live handler file. Git history + `DISCONNECTED_TS_MODULES.md` already record this better. |
| 3.6 | `brain.py` logging convention | ~5 min | `ai_layer/creative/brain.py:59` | Uses inline `logging.getLogger(__name__)`; sibling `service.py:41` sets a module-level `log = logging.getLogger(...)`. Cosmetic. |
| 3.7 | `/video/job` ownership query inside the handler's `try` | ~5 min | `routes/creative-studio.ts:385` | A DB error surfaces as a bare 500 instead of the `{success:false}` shape neighbours use. Fails closed, so harmless. |

### 3.8 + 3.9 — the ai-layer DB layer has no working verification

**Treat these two as ONE unit of work.** Doing 3.8 alone actively makes things worse: it converts
108 loud errors into 108 quiet skips, so a genuinely broken DB layer would look healthy. The skip
is only correct alongside a CI job that fails when the suite cannot run.

**Measured state** (`pytest tests/`, 11m55s): `493 passed, 6 skipped, 1 warning, 108 errors`.
All 108 share ONE root cause — `grep -oE "KeyError: '[A-Z_]+'" | sort -u` returns exactly
`KeyError: 'PGUSER_POOL'`. The 493 that pass are `tests/creative/`, which escape only because
`tests/creative/conftest.py:12` deliberately shadows the DB fixture with a no-op `yield`
("Creative tests are mock-based and never touch Postgres"). So the generation pipeline is
covered; the **Postgres data layer — repository, engine, migrations, cost ledger, store — has
zero automated verification anywhere.**

| # | Item | Effort | Needs creds? |
|---|---|---|---|
| 3.8a | Restore `PG*` / `PG*_POOL` for Neon test branch `ep-plain-breeze-akrkpqmf` | ~15 min | **Yes — user only.** Neon console. Entangled with the outstanding *rotate leaked test-branch password* action, which is the likely reason they were pulled from the repo-root `.env` and never restored. |
| 3.8b | `tests/conftest.py`: `pytest.skip(..., allow_module_level=True)` when `PG*` is absent | ~20 min | No |
| 3.8c | Document the `PG*` / `PG*_POOL` names in `apps/ai-layer/.env.example` | ~15 min | No — names only, never values |
| 3.9 | **Add a Python CI job** so the ai-layer suite actually gates | ~1–2 h | No |

**Root cause detail.** `tests/conftest.py:22-31` builds the Neon test-branch URL from discrete
component vars (`PGUSER{,_POOL}`, `PGPASSWORD{,_POOL}`, `PGHOST{,_POOL}`, `PGDATABASE{,_POOL}`)
read from the repo-root `.env`. It is a session-scoped `autouse=True` fixture, so one missing key
errors every test that does not shadow it. Those keys are absent from `.env`, `apps/ai-layer/.env`
and `apps/api/.env` (which carry `DATABASE_URL`/`MIGRATION_DATABASE_URL`, both **prod**). They
appear in **no `.env.example` anywhere** — the only description is
[`docs/superpowers/plans/2026-07-06-ai-layer-neon-data-layer.md:28`](../docs/superpowers/plans/2026-07-06-ai-layer-neon-data-layer.md),
a plan doc rather than a setup contract, so a fresh clone cannot discover what is required.

**3.9 detail.** No workflow runs pytest at all — `api.yml` gates on `tsc --noEmit`, vitest,
`npm audit` and `docker build`; `web.yml` gates the Angular side. **This is why the 108 errors
were never a merge blocker, and equally why nothing would have caught them.** Any Python CI job
must fail (not skip) when `PG*` is unset in CI, or 3.8b silently reintroduces the blind spot.

---

## 4. Decision-gated — needs a call before work starts

| # | Item | Effort | Trigger / open question |
|---|---|---|---|
| 4.1 | Scope the four account-level routes to the caller | ~4–6 h | `POST /learn`, `GET /prior/:acct`, `GET /graph/:acct`, `POST /variants/:variantId/published` take a tenant identifier with `app.authenticate` but **no ownership check** — `authenticate` proves *a* user, not *the* user. Dormant under a single-account demo. No ownership helper exists, so this is build-a-helper + wire four routes + tests. **Trigger: a second tenant or account exists.** ⚠️ `/variants/:variantId/published` is a cross-tenant **write** into the learning loop (it stamps which Meta ad a variant became, feeding the prior) — recommend gating that one in code rather than trusting the trigger to be remembered. |
| 4.2 | Delete the duplicate `rnd/` tree and dedupe the mock fixture | ~1 h work, decision first | ~48k of the PR's 147k additions are duplicates. 31 of 32 files in `rnd/creative/src/` pair with `apps/ai-layer/ai_layer/creative/` (two byte-identical: `saliency.py`, `taxonomy.py`; most differ by <25 lines). `mock_meta_ads.json` is committed **three times**, byte-identical (md5 `fbed7fa6247b42b751925caa20e54381`): `rnd/data/`, `apps/ai-layer/data/`, `apps/ai-layer/ai_layer/data/` — only the in-package copy ships. `pyproject.toml` calls ai-layer "Phase 1 packaging of `rnd/`" and nothing shipped imports `rnd`. **Open question: should `rnd/` survive as R&D provenance, or be deleted now that ai-layer supersedes it?** Two copies of one pipeline drift silently. |
| 4.3 | Speed up the 12-minute creative pytest suite | ~2–3 h, optional | `pytest tests/creative` passes (493 tests) but takes 12m07s. Fine as a pre-merge or nightly gate; too slow for an edit-test loop. Profile only if it starts costing dev time; `-k` subsets or markers are the cheap first move. |

---

## 5. Reviewed and refuted — no action needed

Recorded so they don't get re-raised:

- **"Asset proxy has no rate limit"** — a global 100/min/IP limiter already covers every route
  (`apps/api/src/index.ts:119-124`).
- **"`voice/preview` text is unbounded"** — already capped at the provider,
  `ai_layer/creative/video_providers.py:121` (`text[:200]`).
- **Injection classes are clean** — command injection (all 7 `subprocess.run` calls take argv
  lists, no `shell=True`), ffmpeg filtergraph injection (no `drawtext`; captions render to PNG via
  PIL and enter as a separate `-i` input through `overlay`; every filter f-string interpolates
  pydantic-constrained numerics and `SfxCue.kind` is a `Literal` indexing a fixed dict), SQL
  injection (parameterized throughout; Python is SQLAlchemy ORM), SSRF (no request-supplied URL
  reaches a server-side fetch — hosts come from env or trusted provider responses; disconnecting
  `/analyze-url` **removed** the one user-URL fetch path), committed secrets (only `.env.example`
  placeholders), and Meta-token log leakage.
