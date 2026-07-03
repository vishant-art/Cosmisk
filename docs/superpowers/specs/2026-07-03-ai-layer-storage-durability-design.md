# AI-layer Storage Durability (#29) — Design

**Date:** 2026-07-03 · **Branch:** `feat/ai-layer-adapter` · **Status:** awaiting user review

## Goal

Make everything the ai-layer writes survive a redeploy: the facts store (`store.sqlite`),
the LLM cost ledger (`cost_ledger.jsonl`), and generated creative bytes
(`creative_output/`). This clears deploy-gate **I3**.

## Findings that shaped the design (verified in code this session)

1. **The TS side is already durable.** `studio_outputs.asset_url` persists an
   `/api/creative-studio/asset/<job>/<file>` **proxy** path (creative-studio.ts rewrites the
   ai-layer path; creative-gen-client.ts streams the bytes). Neon rows never reference the
   ephemeral mount directly → **no TS changes in #29**. Rot happens only when the ai-layer's
   local files vanish.
2. **Latent container bug — the data paths don't converge.**
   - `ai_layer/config.py`: `DATA_DIR = APP_DIR / "data"` where `APP_DIR` derives from
     `__file__` → in the pip-installed image this is **site-packages**, not `/app/data`.
   - `cost_ledger.py`: `LEDGER_PATH = DATA_DIR / "cost_ledger.jsonl"` — **no env override
     at all**.
   - `creative/config.py`: computes its **own** `DATA_DIR = AILAYER_DIR / "data"` (inside
     the package dir — different from core's even locally); only `CREATIVE_OUTPUT_DIR`
     is overridable.
   - Only `AI_LAYER_STORE_PATH` (store) is fully env-controllable today.
   A volume mounted at `/app/data` would currently capture **only** the store (if that env
   is set) and silently miss the ledger and default creative output.
3. **Single-instance is already forced** by the in-memory `_JOBS` and chat context cache —
   so a per-service volume matches the real architecture; multi-replica object storage is
   not load-bearing today.

## Decisions

1. **Mechanism: Railway volume now; object storage designed but deferred** (hybrid). One
   volume at `/app/data` durably captures all three artifacts with near-zero code risk.
2. **Facts store stays SQLite (on the volume).** `store.py` remains the single choke point;
   the Neon swap stays a one-module change for when a second reader actually exists.
3. **Brand-config record: deferred** — a new product design (per-client shape, who edits
   it), not a deploy blocker, and naturally the AI engineer's territory.
4. **No retention/pruning of `creative_output/` in #29.** Persisted `asset_url` rows may
   reference any old job, so deletion policy is a product decision; the real fix is the
   deferred bucket migration. The spec instead mandates volume-usage visibility (below).

## 1. Code: one data root, env-driven (`AI_LAYER_DATA_DIR`)

Small, additive config unification — no interface or behavior change when the env is unset:

- `ai_layer/config.py`:
  `DATA_DIR = Path(os.getenv("AI_LAYER_DATA_DIR", str(APP_DIR / "data")))`.
  `STORE_DB_PATH` default (`DATA_DIR / "store.sqlite"`) is unchanged and still
  independently overridable via `AI_LAYER_STORE_PATH`.
- `ai_layer/cost_ledger.py`: no change — `LEDGER_PATH` already derives from
  `config.DATA_DIR`, which now honors the env.
- `ai_layer/creative/config.py`: drop the private `DATA_DIR` computation; import
  `DATA_DIR from ai_layer.config` so `OUTPUT_DIR` defaults to
  `DATA_DIR / "creative_output"`. `CREATIVE_OUTPUT_DIR` remains an independent override.
  (`DEFAULT_DATA = mock_meta_ads.json` is sample data, not working state — it keeps its
  CURRENT resolution (`AILAYER_DIR / "data" / "mock_meta_ads.json"`, a copy exists there)
  via an explicit package-relative constant, so it is untouched by the data-root change.
  Pre-existing caveat, out of scope: that copy is not installed into the image at all —
  setuptools packages only `ai_layer`/`ai_layer.creative` — so mock-demo mode already
  doesn't work in a container today.)
- Directory creation: each writer already `mkdir -p`s its parent (`cost_ledger`, `store`,
  creative service); no startup hook needed.

Result: setting **one** production env var `AI_LAYER_DATA_DIR=/app/data` puts the store,
ledger, and creative bytes under the single mount point the Dockerfile already creates.

## 2. Infra (executed in #32, specified here — satisfies I3)

- Railway volume attached to the ai-layer service, mount path `/app/data` (volumes cannot
  be declared in `railway.toml`; created via MCP/UI when the service is created).
- Service env: `AI_LAYER_DATA_DIR=/app/data`.
- Visibility: volume usage is checked via Railway metrics; the spec's demo checklist (#31)
  includes a restart-survival test (generate → restart container → assets still served).

## 3. Deferred-but-designed: object storage migration (bucket)

Trigger: multi-replica, volume-size pressure, or asset sharing beyond the service.
Shape (recorded so #29's choices don't foreclose it):

- Creative bytes → S3-compatible bucket (Railway bucket), keyed `(job_id, filename)` —
  upload at job finalize in `creative/service.py` (the `_url()`/winners seam), serve via
  the existing TS proxy fetching the bucket (or signed URLs; the static mount retires).
- Connector-downloaded winner assets → keyed `(platform, durable_ref)` per CONTRACT §4
  (`image_hash`/`video_id`, never `local_path`).
- Facts + ledger → Neon tables when a cross-service reader appears (store.py one-module
  swap; ledger append becomes an insert).

## 4. Testing

- Unit: with `AI_LAYER_DATA_DIR` monkeypatched (env + module reload seam), assert
  `config.DATA_DIR`, `cost_ledger.LEDGER_PATH`, `creative config OUTPUT_DIR`, and
  `STORE_DB_PATH` all resolve under the override; unset → current defaults (regression).
- Existing suites stay green unmodified: ai-layer **180 passed / 7 skipped**, connectors
  **47 passed** (tests already point stores at tmp paths via `AI_LAYER_STORE_PATH` /
  `STORE_DB_PATH` monkeypatching — unaffected).
- Container proof (part of #29 verification, Docker locally): run the image with
  `-e AI_LAYER_DATA_DIR=/app/data -v <named-volume>:/app/data`, write a fact + a ledger
  line, `docker rm` + re-run, confirm both survive; confirm nothing was written to
  site-packages (`find /usr/local/lib/python3.12/site-packages -name '*.jsonl' -o -name
  '*.sqlite'` is empty).

## 5. Coordination note (AI engineer)

`creative/config.py` gets a 2-line change (import core `DATA_DIR`, default `OUTPUT_DIR`
under it). Behavior with `CREATIVE_OUTPUT_DIR` set is identical. Flagged in
`temp_docs/ai-eng-adapter-notes.md` (§B.2/B.3 get updated: "ephemeral in prod" → "durable
via volume once #32 lands; set `AI_LAYER_DATA_DIR`").

## 6. Out of scope

Object-storage implementation · Neon migration of facts/ledger · brand-config record ·
retention/pruning policy · TS api changes · multi-worker uvicorn · Railway service creation
itself (#32) · `_JOBS`/idempotency hardening (AI engineer's queue, already in his notes).
