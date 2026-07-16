# Creative Studio — Dev / Ops Handoff (Railway + Neon + code)

> For the dev/infra side: what still needs doing to confirm the Creative Studio works end to
> end. The AI side has integrated the UGC video pipeline into `apps/ai-layer` and has now
> **run it live once** (2026-07-16) through the HTTP API. This doc records what that run
> verified, what is still blocking, and the code fixes the run surfaced.
>
> Companion: `creative-studio-ugc-video-integration-plan.md`, `creative-api-live-run-prep.md`.
> Branch: `improve/creative`.

---

## TL;DR — what you actually need to do

| # | Action | Where | Status |
|---|---|---|---|
| 1 | **Fix the Neon credentials** — the current `DATABASE_URL` / `MIGRATION_DATABASE_URL` **fail auth** (`password authentication failed for user 'neondb_owner'`) | Railway → ai-layer → Variables; Neon console | **BLOCKING (new)** — all persistence silently no-ops |
| 2 | **Apply + verify Alembic migrations `0002` + `0003`** (`creative_variants`, `creative_teardowns`) | Neon prod branch (one-off / deploy hook) | **BLOCKING** — unverifiable right now because of #1 |
| 3 | Point `CREATIVE_OUTPUT_DIR` at a persistent volume | Railway → ai-layer | **BLOCKING** — assets lost on every redeploy otherwise |
| 4 | Fix the **caption QA critic** (judges 48px thumbnails → false "unreadable_caption") | code: `verifier_video.py` / `teardown.py` | **Code fix** — gate is unreliable, not the video |
| 5 | Fix **`cut_alignment`** (re-detects cuts on the UGC-edited clip → false fail) | code: `verifier_video.py` | **Code fix** — 22 detected vs 2 planned |
| 6 | Confirm `FAL_ADMIN_KEY` is set on Railway | Railway | Verify — working locally (guard + reconciliation proven) |
| 7 | Top up the fal.ai balance before a batch | fal.ai dashboard | Now **~$8.25** (was negative); ~1-2 runs left |
| 8 | Get the Meta API token reinstated | Meta | Grounding degrades until then (works, less grounded) |
| 9 | Add the `PG*` / `PG*_POOL` test-branch vars to CI | CI env | Yes, for the non-creative ai-layer suite |
| 10 | **Wire the UGC video track into the UI** (`direction`, `n_shots`, creator, seconds, VO/captions/SFX) — today it is backend-only, no front end | code: `apps/web` + `apps/api` (TS) | Gap — users cannot reach video generation or set the direction from the product |

Redeploy the ai-layer after 1-3 (and 4-5 once patched). `numpy` is in `pyproject.toml`, so the
image must rebuild (no Dockerfile change — see §Build).

---

## What the 2026-07-16 live run VERIFIED

Run via `tools/creative_api_liverun.py --confirm-spend` (in-process TestClient on
`ai_layer.api:app` — same app/routes/pipeline/spend as uvicorn; in-process only so prompts
could be captured). Both jobs reached `complete`. Verified working:

- **The full pipeline end to end at real cost:** brand kit → 3 static concepts × 3 formats →
  product cutout → 3 product seeds → 3 Seedance clips → voiceover → burned captions → SFX →
  `video_captioned.mp4` (12s, real 720×1280 + AAC). Direction `"tall blonde woman"` reached
  the storyboard verbatim; the real Shopify product was hero in all shots.
- **Shopify sourcing + brand derivation:** brief derived live from the store (Pratap Sons USA;
  bestseller "Pastel Green Floral Embroidered Anarkali"). Product images downloaded.
- **The fal balance guard + cost reconciliation (`FAL_ADMIN_KEY`):** pre-spend quote, the
  402 guard, and post-run `fal_actuals.json` all worked. Estimate tracked the invoice to −6.65%.
- **Actual cost: $4.78** (fal invoice; balance $13.03 → $8.25). Note: grounded clips render as
  **image-to-video at ~$1.42/clip**, not the $1.21 t2v figure. 3-clip grounded run ≈ $4.78;
  a 5-6 shot storyboard would be ~$7-9.

What the run did NOT verify (still open, below): Neon persistence (auth fails), Meta grounding
(no account + outdated token → ran ungrounded), and the two QA checks that failed.

---

## §1 (BLOCKING, new). Neon credentials fail auth

Connecting to Neon with the current env fails for **both** URLs:

```
DATABASE_URL           -> psycopg.OperationalError: password authentication failed for user 'neondb_owner'
MIGRATION_DATABASE_URL -> same
```

Every DB write in the creative path is **best-effort by design** (a failure is caught and
logged, never fails a run — the bytes are already on disk). So with broken creds:

- generation still works and assets still land on disk, but
- **`creative_jobs`, `creative_variants`, and `creative_teardowns` all silently fail to
  persist.** The 2026-07-16 live job is in the in-process mirror only; it is **not** in Neon.
  The learning loop never accumulates, and nothing is louder than a debug log.

Action: refresh/rotate the Neon role password and update `DATABASE_URL` (pooled) +
`MIGRATION_DATABASE_URL` (direct/unpooled) on the ai-layer service. Then do §2. If you can,
add an alert on creative DB write failures so this class of silent failure is visible.

## §2 (BLOCKING). Apply + verify migrations `0002` + `0003`

Migration files exist in the repo (`ai_layer/migrations/versions/`): `0001_initial`,
`0002_creative_variants`, `0003_creative_teardowns`. Whether they are applied to the Neon
prod branch **could not be verified from here** (auth failure, §1). Both are additive (no
existing table is touched).

- **`0002` `creative_variants`** — the performance feedback loop: one row per shipped variant,
  its `meta_ad_id` and the realized `thumb_stop_rate`/impressions harvested from Meta.
- **`0003` `creative_teardowns`** — the account's structural memory (winners AND losers). A
  teardown costs an ASR + a vision call and is immutable, so caching it means we never re-pay
  to analyse the same ad. Without it, the analysis dies with the run dir.

After §1, apply to head and verify:

```bash
python -m ai_layer.db.migrate            # applies 0001 -> 0002 -> 0003 (command.upgrade head); idempotent
```
```sql
select version_num from ai_layer.alembic_version;                 -- expect 0003
select count(*) from ai_layer.creative_variants;                  -- 0, not "relation does not exist"
select count(*) from ai_layer.creative_teardowns;                 -- 0, not "relation does not exist"
```

`brand_id` is a nullable FK to `brands` (brief-mode runs have no brand);
`creative_variants.meta_ad_id` is NULL until an operator publishes and stamps it (§Loop).

## §3 (BLOCKING). Asset storage — `CREATIVE_OUTPUT_DIR` needs a volume

Ads/videos are written to `CREATIVE_OUTPUT_DIR` and served from the ai-layer's static mount at
`GET /creative/assets/...`. **R2 was evaluated and dropped**, so there is no object storage: on
ephemeral disk, **every asset URL breaks on redeploy**. Attach a Railway persistent volume:

```
CREATIVE_OUTPUT_DIR=/data/creative_output      # mount the volume at /data
```

(Locally the tools default to `apps/ai-layer/live_runs/`, which is gitignored.) This is the
single highest-value ops item. If a volume isn't possible, flag it and we'll revisit durable
object storage.

---

## Code fixes the live run surfaced (QA gate)

The run's QA verdict was **fail**, on two checks that are **harness bugs, not video defects**.
Everything else passed (product_presence 0.54-0.66, continuity, audio_video_sync, caption
drift 0.05). Both need a small change on the AI/code side (flagged here so dev is aware; the
AI side can own the patch on `improve/creative`).

### §4. The caption critic is blind to captions

`vlm_critique` (`verifier_video.py:484`) sends the VLM a 3×3 **contact sheet** built by
`teardown._contact_sheet` (`teardown.py:219`), whose tiles are keyframes captured at
`config.TEARDOWN_GRID = 48` px (`config.py:112`) then upscaled to 256 (`teardown.py:231`). At
48px native, **no burned caption is legible**, so the critic returns `unreadable_caption` even
for a clearly-readable 1080p caption. Proof: the caption-fix pass produced a plainly legible
1080p caption (`video_captioned_v2.mp4` / `caption_fix_frame.png`) and the same critic still
"failed" it.

Fix: give the caption-legibility question a **full-resolution sample** (a crop around the
caption band from a real keyframe, or a higher-grid frame), separate from the 48px
diff-metric contact sheet. Until then, treat `unreadable_caption` as unreliable (false
negatives), and judge legibility from a full-res frame.

### §5. `cut_alignment` double-counts UGC editing as cuts

`check_cut_alignment` (`verifier_video.py:298`) re-runs `teardown.detect_shots` on the finished
clip and fails when `len(detected) != len(planned)` (`verifier_video.py:310`). The UGC editor's
micro-shake / punch-in / grain spike the frame-diff shot detector, so it counted **22 detected
cuts vs 2 planned**. The editor **places** the cuts, so the QA should compare against the known
edit-plan cut list rather than re-detecting on the effect-laden clip (or run detection on the
pre-effects concat, or raise the detector threshold/min-shot for finished clips).

---

## UI / proxy gap — the UGC video track is backend-only (no front end)

The `direction` operator guide, `n_shots`, the `creator` persona, `seconds`, and the entire
storyboard-driven UGC video track (`POST /creative/video/plan` + `/creative/video/generate`)
exist **only on the Python backend**. No customer-facing UI exposes any of them. Tracing all
three layers:

1. **Angular UI (`apps/web`).** `core/services/creative-studio.service.ts:84` sends only
   `{ brief, formats, meta_account_id }` to the proxy. The `features/creative-cockpit`
   component has no direction/video controls — its only `direction` symbol is an unrelated
   metric trend (`trend: { direction: 'up' }`).
2. **TS proxy (`apps/api`).** `services/creative-gen-client.ts` is the ONLY TS file that calls
   the ai-layer, and it wires just `/creative/generate` (fields: formats, images, withVideo,
   voiceover, ground, noLogo) + `/creative/jobs/{id}` polling. It **never** calls
   `/creative/video/plan` or `/creative/video/generate`, so `direction` / `n_shots` /
   `creator` / `seconds` have no path through it at all.
3. **Python backend (`apps/ai-layer`).** The only layer where `direction` exists
   (`creative/service.py` — `VideoPlanRequest.direction`, `VideoRenderRequest.direction`),
   added recently (commit `bea299f`, "operator direction guide + n_shots").

**Impact.** The storyboard UGC video generation — the multi-clip ads, the free-text direction
guide, shot count, creator persona, and per-clip voiceover/captions/SFX — has **no front end**.
Today `direction` is reachable only via a direct API call (what `tools/creative_api_liverun.py`
does) or the FastAPI auto-generated Swagger console at `/docs` (a developer tool, not the
product UI). The customer UI stops at static-ad generation.

**Wiring it up** (TypeScript, under the current production-hardening code freeze — maintainers
to own; the AI side won't touch `apps/`):

- `apps/api`: add `videoPlan()` / `videoGenerate()` to `creative-gen-client.ts` that POST
  `/creative/video/plan` and `/creative/video/generate`, forwarding
  `{ direction, n_shots, seconds, creator, voiceover, captions, sfx }`, plus the proxy route(s)
  in `routes/creative-studio.ts`.
- `apps/web`: a "direction" free-text input (+ optional n_shots / voiceover / captions toggles)
  on the creative studio screen, and a plan → quote → generate flow in `creative-studio.service.ts`
  and the cockpit component.
- **Recommended UX:** call `/creative/video/plan` first and show its returned `quote` (clips +
  `estimated_usd` + `affordable`) before the paid `/creative/video/generate`. The plan/generate
  split exists precisely so the user sees the cost before anything spends Seedance.

---

## Non-blocking / confirm

- **`FAL_ADMIN_KEY`** — present and working locally (the balance guard, the 402 refusal, and
  the per-run `fal_actuals.json` reconciliation all ran). Just confirm it is set on Railway,
  admin/billing-read scope, separate from `FAL_KEY` (render path never carries admin scope).
- **fal balance** — now **~$8.25** (was negative in the prior handoff). Enough for ~1-2 grounded
  runs; top up before a batch. `/creative/video/plan` is free and quotes exact cost first.
- **Meta API** — the token is present but **outdated**; with no `META_AD_ACCOUNT` set, grounding
  is skipped and the run proceeds **ungrounded** (`pickings.grounded=false`). Reinstate the
  token + set an account to ground on winners/teardowns.
- **CI `PG*` vars** — the non-creative ai-layer suite can't collect without Neon test-branch
  creds (`PGUSER … PGCHANNELBINDING` + `*_POOL`). The `tests/creative/` subtree is exempt (it
  shadows the DB fixture; mock-based, $0), which is the suite that passes anywhere today.

---

## Tooling (verification aids, committed to `apps/ai-layer/tools/`)

Repeatable ways to confirm the studio without hunting. Run from `apps/ai-layer/` with the venv:

| Tool | What it does | Cost |
|---|---|---|
| `creative_api_dryrun.py` | Full-surface $0 smoke: drives the real API + pipeline with paid seams mocked to real tiny media. Proves wiring + money-gating. | $0 |
| `creative_api_liverun.py` | Guarded live run. `--confirm-spend` required; preflight ($0) validates keys + reads balance + prints the estimate + derives the brief from Shopify. Captures every prompt to `prompts_and_calls.txt`. | ~$4-5 with `--confirm-spend`, else $0 |
| `creative_caption_fix.py` | Re-burn large 1080p captions on a finished run, reusing its clips + voiceover (no re-render). | ~$0.005 (one ASR) |
| `python -m ai_layer.creative.fal_billing balance` / `report --days 7` | fal balance + actual spend. | $0 |

See `apps/ai-layer/tools/README.md`.

---

## Build / deps

- `numpy` is in `apps/ai-layer/pyproject.toml` (temporal-QA frame correlation + teardown
  shot-diff). The image must rebuild.
- **No Dockerfile change.** The editor shells out to the ffmpeg binary bundled in the
  `imageio-ffmpeg` wheel (already a dep). Do **not** add a system `ffmpeg` apt package.
- Base image stays `python:3.12-slim`.

---

## The learning loop has one manual step (by design)

**Nothing in this codebase publishes an ad to Meta** (the Meta layer is GET-only). So:

1. We generate variants → they land in `creative_variants` with `meta_ad_id = NULL` (needs §1+§2).
2. **A human publishes the ad on Meta** and stamps the id back:
   `POST /creative/variants/{variant_id}/published {"meta_ad_id": "..."}`.
3. `POST /creative/learn {"account_id": "act_..."}` harvests realized metrics and rebuilds the prior.

Without step 2 the variants are unattributable and the loop never closes. Automating it is real
work (a write-scoped `ads_management` token + an `/advideos`→`/adcreatives`→`/ads` publisher);
flag it if you want it scoped.

---

## Verify once it's all set

```bash
# service up + routes mounted
curl -H "X-API-Key: $AI_LAYER_API_KEY" $AI_LAYER_URL/health

# fal billing visible (proves FAL_ADMIN_KEY)
python -m ai_layer.creative.fal_billing balance
python -m ai_layer.creative.fal_billing report --days 7

# $0 full-surface smoke (no spend, no network) — proves the wiring
python tools/creative_api_dryrun.py

# a static run (grounding + a smoke clip are ON by default; set with_video:false to skip the clip)
curl -X POST -H "X-API-Key: $AI_LAYER_API_KEY" -H "Content-Type: application/json" \
     -d '{"brief":{"brand_name":"Test","product_name":"Thing"},"images":1,"with_video":false}' \
     $AI_LAYER_URL/creative/generate            # -> {job_id}
curl -H "X-API-Key: $AI_LAYER_API_KEY" $AI_LAYER_URL/creative/jobs/<job_id>

# the job actually persisted (the point of §1+§2) — psql against Neon:
#   select job_id,status,cost_usd,created_at from ai_layer.creative_jobs order by created_at desc limit 5;

# video: FREE plan (quote) first, then the PAID render (402 if the balance can't cover it)
curl -X POST ... -d '{"job_id":"<job_id>","n_shots":3}' $AI_LAYER_URL/creative/video/plan
curl -X POST ... -d '{"job_id":"<job_id>"}'             $AI_LAYER_URL/creative/video/generate
```

Assets should be reachable at `$AI_LAYER_URL/creative/assets/<job_id>/<file>` **and survive a
redeploy** once §3 is done.

---

## Cost safety (what protects you)

- Every video render is **balance-guarded**: it refuses to start (`402`) when fal can't cover
  the planned clips — a half-rendered board is the worst outcome (rendered clips are already paid).
- `/creative/video/plan` is **$0** and returns clips, estimated USD, live balance, affordable y/n.
- Post-run, actual fal charges are reconciled to the estimate and written to `fal_actuals.json`
  (needs `FAL_ADMIN_KEY`). On the 2026-07-16 run the estimate tracked the invoice to −6.65%.
- The single-clip smoke on `/creative/generate` is **skipped, not fatal**, when the balance is short.

---

## What is NOT done / known limits

- **Neon persistence is currently broken** (§1) — fix creds + apply migrations to close the loop.
- **QA gate has two false-fail checks** (§4 caption critic, §5 cut_alignment) — patch before
  trusting the verdict; the produced media is fine.
- **The UGC video track has no UI** — `direction`, `n_shots`, creator, seconds, and the
  storyboard video generation are backend-only; the customer UI covers static ads only (see the
  UI / proxy gap section). Users can't set the direction or trigger video gen from the product.
- **No object storage** — assets live on the ai-layer disk; §3 is the mitigation, not a fix.
- **Live-verified only locally.** The 2026-07-16 run was a real paid render via the in-process
  API driver, not against the deployed Railway service. No run has yet gone through the deployed
  uvicorn (blocked on the ops items above).
- **`rnd/creative/` stays in the repo** as the source of truth until a deployed live smoke passes.
- **Job store is single-worker** — the in-process mirror assumes one uvicorn worker; Neon is the
  durable record. Multi-replica polling falls back to the Neon row (once §1+§2 are done).
