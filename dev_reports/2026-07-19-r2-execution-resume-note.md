# Resume note — execute the R2 asset-storage plan (2026-07-19)

**Status:** 🔵 ACTIVE. Compact-survival note. **Next action: execute the plan below.**

## Do this next

Invoke **`superpowers:executing-plans`** on:

> `docs/superpowers/plans/2026-07-18-r2-asset-storage.md`

5 tasks, TDD, **commit per task, NO push** (wait for explicit per-instance push permission).
Write all code under **ponytail** (minimal diff, fallbacks preserved, self-check per module).
**No AI attribution** on commits.

## Why / architecture (the plan is authoritative; this is the 30-second version)

Persist the ai-layer's finished creative media (PNGs/MP4s + variants) to **Cloudflare R2** so URLs
survive a Railway redeploy. **Decoupled + Mode 2:**
- **ai-layer = sole R2 owner** — uploads finished deliverables on job completion (`_publish_assets`),
  mints presigned GET URLs via a gated `/creative/asset-url/{job}/{path}` endpoint.
- **apps/api = R2-agnostic** — no `@aws-sdk`, no `STORAGE_*`, no creds. Its `/asset` proxy asks the
  ai-layer for a presigned URL and **302s the browser straight to R2** (browser↔R2 direct, $0 Railway
  egress, native video scrubbing). Byte-proxy fallback when storage off.
- **Node-safe:** presign is returned as **200 JSON**, NOT undici `redirect:'manual'` (opaque on Node 20).
- **Graceful degradation:** `STORAGE_BUCKET` unset ⇒ today's local StaticFiles + byte-proxy, unchanged.

## Gate state (all green — nothing blocking execution)

- **R2 creds:** user provisioned Cloudflare acct + bucket + S3 API token. `STORAGE_*` values go on the
  **ai-layer (Railway Service B) ONLY**; apps/api needs nothing. The standalone R2 "Token value"
  (Bearer) is NOT used — only Access Key ID + Secret.
- **dryayeet consent:** GIVEN for the `creative/service.py` edit (Task 2), **incl. storing all variants**.
- `.env.example`: `STORAGE_*` on root + ai-layer; **removed** from apps/api (never uses R2).

## Constraints during execution

- Ponytail; no AI attribution; no push without permission.
- Do **not** weaken the ai-layer `tests/conftest.py` PG* guardrail — the Python checks are `python -m …`
  `__main__` self-checks by design (no pytest harness).
- Touch dryayeet's `creative/` subtree ONLY as Task 2 specifies.
- Do NOT make a real fal render (costly — user's manual demo click only).

## Invariant to hold

- TS default suite **400/9 unchanged** (no new TS test), `tsc --noEmit` baseline-only (`billing.ts:4`
  stripe), `madge --circular` **0 cycles**.
- ai-layer: `ai_layer.storage` self-check OK + `_publish_assets` self-check OK.

## After execution (operator, out of band)

- Set `STORAGE_*` on Railway Service B; end-to-end verify (asset lands in R2 → `<img>`/`<video>` load via
  302→R2 → redeploy ai-layer → still loads → video scrubs). Then **this gates the `main` merge (#33)**.
- Known limits (accepted): `<a download>` opens-in-tab cross-origin (upgrade path in plan); ElevenLabs
  audio stays local (legacy #48, out of demo path).

## Superseded

The design doc `ai_serv/2026-07-18-asset-storage-r2-migration-plan.md` still describes the OLD
TS-uploads-audio / TS-presigns architecture — **superseded on the TS side** by this plan (decoupled +
Mode 2). Left as the historical decision record.
