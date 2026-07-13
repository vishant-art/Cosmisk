# Creative Studio — Ops Handoff (Railway + Neon)

> For the dev/infra side. The AI side (lemon) has finished integrating the UGC video
> pipeline into `apps/ai-layer`; what's left needs the Railway panel and the Neon console,
> which the AI side can't touch. **Nothing here changes application code.**
>
> Status: code is merged on `improve/creative`, 400 tests pass, nothing is live-verified yet.
> Companion: `creative-studio-ugc-video-integration-plan.md`.

---

## TL;DR — what you actually need to do

| # | Action | Where | Blocking? |
|---|---|---|---|
| 1 | Add `FAL_ADMIN_KEY` to the ai-layer service | Railway → ai-layer → Variables | Not blocking, but the cost guard is OFF without it |
| 2 | Point `CREATIVE_OUTPUT_DIR` at a persistent volume | Railway → ai-layer | **Yes** — assets are lost on every redeploy otherwise |
| 3 | Confirm Alembic is at head on the ai-layer service | Railway (deploy log / one-off) | **Yes** — job persistence silently no-ops otherwise |
| 4 | Add the `PG*` / `PG*_POOL` test-branch vars to CI | CI env | Yes, for CI — the ai-layer suite can't collect without them |
| 5 | Top up the fal.ai balance | fal.ai dashboard | **Yes** — balance is negative; all video renders refuse |
| 6 | Get the Meta API reinstated | Meta | Yes, for grounding |

Redeploy the ai-layer after 1-3. `numpy` was added to `pyproject.toml`, so the image must
rebuild (no Dockerfile change needed — see §5).

---

## 1. Environment variables (Railway → `ai-layer` service)

**New, added by this work:**

| Var | Value | What breaks without it |
|---|---|---|
| `FAL_ADMIN_KEY` | a fal **admin-scoped, billing-read-only** key (NOT the render key) | The pre-spend balance guard and the actual-cost reconciliation silently disable themselves. Renders can then start against an empty balance and die halfway, having already paid for the clips they did render. |

Create it at fal.ai → dashboard → keys, with **admin/billing read** scope. It is deliberately
**separate from `FAL_KEY`**: `FAL_KEY` renders, `FAL_ADMIN_KEY` only reads billing. The render
path never carries admin scope. Everything degrades gracefully (guard disabled) if it's unset,
so this is safe to add at any time.

**Existing, must be present** (the service reads all of these):

```
OPENROUTER_API_KEY          # the brain + VLM critic
FAL_KEY                     # all image/video generation
META_ACCESS_TOKEN           # Meta cohort grounding  (currently SUSPENDED, see §6)
META_AD_ACCOUNT             # act_<id>
SHOPIFY_STORE               # product sourcing
SHOPIFY_TOKEN
SHOPIFY_API_VERSION         # optional, defaults to 2026-07
DATABASE_URL                # Neon (pooled)
MIGRATION_DATABASE_URL      # Neon (direct/unpooled) — Alembic uses this
AI_LAYER_API_KEY            # the X-API-Key gate on every route
CREATIVE_OUTPUT_DIR         # see §2 — IMPORTANT
```

All grounding sources (Meta, Shopify, teardown) are now **ON by default** and each degrades
gracefully **and loudly** when its credentials are missing: the run still produces ads, and the
logs say `GROUNDING UNAVAILABLE ... proceeding UNGROUNDED`. So a missing Shopify token is not an
outage, it's a quality regression you'll only see in the logs. Worth an alert.

---

## 2. Asset storage — `CREATIVE_OUTPUT_DIR` (needs a volume)

Generated ads and videos are written to `CREATIVE_OUTPUT_DIR` and served from the ai-layer's own
static mount at `GET /creative/assets/...`. **Cloudflare R2 was evaluated and dropped**, so there
is no object storage: if that directory is on the container's ephemeral filesystem, **every asset
URL breaks on redeploy**, including ones already stored on Neon rows.

Please attach a **Railway persistent volume** and set:

```
CREATIVE_OUTPUT_DIR=/data/creative_output
```

(mount the volume at `/data`). This is the single highest-value ops item here. If a volume isn't
possible, tell the AI side and we'll revisit durable object storage.

---

## 3. Neon / Postgres — no migration needed, just confirm head

Creative jobs are now persisted to the **existing** `creative_jobs` table via
`ai_layer/db/repository.py` (`save_job` / `load_job`). **No new tables and no new migration were
added** — `creative_jobs` is already in `0001_initial_ai_layer_schema.py`.

What to confirm: the ai-layer service is at Alembic head against the Neon prod branch.

```bash
python -m ai_layer.db.migrate            # applies head; idempotent
```

Why it matters: job persistence is **best-effort by design** — a DB write failure is caught and
logged, never fails a run (the generation already happened, the bytes are on disk). That means if
the table is missing or the URL is wrong, **jobs will silently stop persisting** and simply vanish
on restart, with only a debug-level log line. Please verify once, and ideally alert on it.

Schema note: `creative_jobs.brand_id` is a nullable FK to `brands` (brief-mode runs have no
brand), and the job payload lands in JSONB columns (`assets_json`, `video_json`, `brand_kit_json`,
`winners_json`, `rejected_json`, `progress_json`, `ledger_json`). Nothing to change.

---

## 4. CI — the `PG*` test-branch variables

The ai-layer test suite currently **cannot collect** without Neon test-branch credentials. The root
`apps/ai-layer/tests/conftest.py` has a session-scoped autouse fixture that builds a **Neon TEST
BRANCH** URL from `PG*` / `PG*_POOL` vars, applies migrations, and runs every test in a rolled-back
transaction. Without them you get `KeyError: 'PGUSER'` at collection.

Needed in CI (from the Neon **test branch**, not prod):

```
PGUSER  PGPASSWORD  PGHOST  PGDATABASE  PGSSLMODE  PGCHANNELBINDING
PGUSER_POOL  PGPASSWORD_POOL  PGHOST_POOL  PGDATABASE_POOL  ...   # pooled endpoint
```

The **creative** subtree is exempt: `tests/creative/` shadows that fixture (its tests are
mock-based and never touch Postgres), so `pytest tests/creative` runs anywhere with no DB. That's
the 400 tests that pass today. The other ai-layer tests still need the vars above.

---

## 5. Build / deps

- `numpy` was added to `apps/ai-layer/pyproject.toml` (temporal-QA frame correlation + the
  teardown's shot-diff). The image must rebuild.
- **No Dockerfile change is needed.** The video editor shells out to ffmpeg, but it uses the
  binary bundled in the `imageio-ffmpeg` pip wheel, which is already a dependency. Do **not** add
  a system `ffmpeg` apt package; it isn't used.
- Base image stays `python:3.12-slim`.

---

## 6. Currently blocked externally (not code problems)

Two things stop us from live-verifying any of this. Both are on your side of the fence:

1. **fal.ai balance is negative** (last read: **-$0.33**). Every video render now refuses up front
   with `402` rather than starting, so nothing will generate until it's topped up. Budget note:
   one Seedance clip is **~$1.22**, and a typical storyboard is 5-6 shots, so **~$6-8 per video**.
   The `/creative/video/plan` endpoint is free and returns an exact quote before anything spends.
2. **The Meta API is suspended.** Cohort grounding and the winner teardown degrade to UNGROUNDED
   until it's reinstated. Static and video generation still work, just less well-grounded.

---

## 7. How to verify once it's all set

```bash
# 1. service is up and the routes are mounted
curl -H "X-API-Key: $AI_LAYER_API_KEY" $AI_LAYER_URL/health

# 2. the balance guard can see fal (proves FAL_ADMIN_KEY works)
#    from the repo:
python -m ai_layer.creative.fal_billing balance
python -m ai_layer.creative.fal_billing report --days 7

# 3. a static run (grounding + a video clip are ON by default)
curl -X POST -H "X-API-Key: $AI_LAYER_API_KEY" -H "Content-Type: application/json" \
     -d '{"brief":{"brand_name":"Test","product_name":"Thing"},"images":1}' \
     $AI_LAYER_URL/creative/generate            # -> {job_id}
curl -H "X-API-Key: $AI_LAYER_API_KEY" $AI_LAYER_URL/creative/jobs/<job_id>

# 4. the job actually persisted (the point of §3)
#    psql against Neon:
select job_id, status, cost_usd, created_at from ai_layer.creative_jobs order by created_at desc limit 5;

# 5. video: FREE plan first — returns the shot list AND the cost quote
curl -X POST ... -d '{"job_id":"<job_id>"}' $AI_LAYER_URL/creative/video/plan
#    then the PAID render (402 if the balance can't cover it)
curl -X POST ... -d '{"job_id":"<job_id>"}' $AI_LAYER_URL/creative/video/generate
```

Assets should be reachable at `$AI_LAYER_URL/creative/assets/<job_id>/<file>` **and survive a
redeploy** once §2 is done.

---

## 8. Cost safety, so you know what protects you

- Every video render is **balance-guarded**: it refuses to start (`402`) when fal can't cover the
  planned clips, because a half-rendered board is the worst outcome — the clips it did render are
  already paid for.
- `/creative/video/plan` is **$0** (one LLM call) and returns clips, estimated USD, live balance,
  and affordable yes/no. Nothing pays Seedance blind.
- After each run, actual fal charges are reconciled against our estimate and written to
  `fal_actuals.json` in the run dir (needs `FAL_ADMIN_KEY`). Estimates have tracked actuals to
  within ~1%.
- The single-clip smoke on `/creative/generate` is **skipped, not fatal**, when the balance is
  short: the static ads still ship.

---

## 9. What is NOT done (so you're not surprised)

- **No object storage.** R2 was investigated and dropped; assets live on the ai-layer's disk. §2 is
  the mitigation, and it's a mitigation, not a fix.
- **Nothing is live-verified.** The 400 passing tests are all mock-based ($0, no network). No real
  Seedance render or real Meta grounding has run through the deployed service yet, because of §6.
- **`rnd/creative/` is still in the repo** as the source of truth. It will be retired only after a
  live smoke passes. Don't delete it.
- **Job store is single-worker.** The in-process mirror assumes one uvicorn worker; Neon is the
  durable record. If you scale the ai-layer to multiple workers/replicas, polling may hit a worker
  that doesn't hold the job in memory — it will fall back to the Neon row, so this works, but it's
  worth knowing before you scale.
