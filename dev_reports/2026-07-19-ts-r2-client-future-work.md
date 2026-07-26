# Future work — wire the TS (apps/api) S3 client to R2, if ever needed (2026-07-19)

**Status:** 🔵 ACTIVE (deferred item, not on the demo path). Companion to
[`docs/superpowers/plans/2026-07-18-r2-asset-storage.md`](../docs/superpowers/plans/2026-07-18-r2-asset-storage.md).

## Why apps/api holds no R2 client today

The active R2 plan is **decoupled**: the **ai-layer (Python) is the sole R2 owner** (uploads +
presigns); **apps/api is R2-agnostic** — no `@aws-sdk`, no `STORAGE_*` env, no creds. Its `/asset`
proxy just asks the ai-layer for a presigned URL and 302s the browser straight to R2 (Mode 2, $0
egress). Rationale: the TS server is slated for a heavy refactor, so we keep R2 coupling out of it —
one less thing to migrate, one less place creds live. This is deliberate, and it is enough for the
single-tenant demo.

## When you'd actually wire TS → R2 (triggers — none met yet)

Add an S3 client to apps/api **only** when one of these becomes real:

1. **apps/api itself produces a durable artifact** that must survive a Railway redeploy — the
   concrete case is **ElevenLabs voiceover MP3** (`apps/api/src/services/api-providers.ts:502`,
   written to local `./data` and lost on redeploy). This is legacy task **#48** and is out of the
   demo path today.
2. **apps/api must presign or upload on its own** without a round-trip to the ai-layer (e.g. the
   ai-layer stops owning a surface, or a TS-only feature needs object storage).
3. **User uploads / inbound files** land on the TS side and need durable storage.

If none of these hold, do **not** add the client — the ai-layer round-trip + 302 covers reads, and
that is the whole demo surface.

## How to reactivate (blueprint already written)

The **original** R2 design doc already specified this exact TS-owns-S3 architecture before we
decoupled — reuse it rather than re-designing:

> [`dev_reports/ai_serv/2026-07-18-asset-storage-r2-migration-plan.md`](./ai_serv/2026-07-18-asset-storage-r2-migration-plan.md)
> — §"apps/api (ours): ElevenLabs MP3 → R2; drop the `/audio` static mount". It carries the
> `aws-sdk-v3` checksum caveat and the audio end-to-end verify. **Superseded on the TS side** by the
> decoupled plan, but accurate as the reactivation spec.

Concrete steps when a trigger fires (do this at the TS refactor, not before):

- Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` to `apps/api`.
- **Two aws-sdk-v3 gotchas** the Python side doesn't have (from the Fable review):
  `forcePathStyle: true` (R2 has no virtual-hosted buckets) and the request-checksum flag set to
  `WHEN_REQUIRED` (v3 default `aws-chunked`/CRC32 → `SignatureDoesNotMatch` on R2).
- Add the five `STORAGE_*` vars to apps/api's env + `.env.example` (they were intentionally removed
  in Task 5 of the active plan — re-add the block from the root `.env.example`).
- Cleanest split if the ai-layer stays the reader: apps/api **uploads** its own artifacts (audio)
  and calls the ai-layer's existing `/creative/asset-url/…` endpoint for reads — so there is still
  one presign owner. Only take on TS presigning if apps/api must serve objects with no ai-layer up.

Nothing here changes the demo. It is a note so the next person doesn't re-derive the decision.

## Plan lineage (all plans that built the TS server + the R2 connection)

**R2 / object storage:**

| Plan | Role |
|---|---|
| `docs/superpowers/plans/2026-07-18-r2-asset-storage.md` | 🔵 **ACTIVE** — decoupled + Mode 2 (ai-layer sole R2 owner; apps/api R2-agnostic). The plan we execute now. |
| `dev_reports/ai_serv/2026-07-18-asset-storage-r2-migration-plan.md` | ♻️ Design/decision record — the **original** TS-owns-S3 architecture (audio→R2, TS presigns). Superseded on the TS side; **reactivation blueprint** for this doc. |

**TS (apps/api) server + its ai-layer wiring:**

| Plan | Role |
|---|---|
| `docs/superpowers/plans/2026-07-10-split-deploy-config-externalization.md` | Split Vercel FE + Railway API/ai-layer; externalized `API_BASE_URL`; the `AI_LAYER_URL`/`AI_LAYER_API_KEY` TS→ai-layer wiring the R2 proxy rides on. |
| `docs/superpowers/plans/2026-07-02-ai-layer-connector-adapter.md` | TS adapter that fronts the ai-layer. |
| `docs/superpowers/plans/2026-07-03-blended-roas-route.md` | TS blended-ROAS route. |
| `docs/superpowers/plans/2026-07-17-ugc-video-ui-async.md` | Video UI + async poller + the `apps/api` `/asset/:jobId/*` proxy route that the active R2 plan (Task 4) rewrites for Mode 2. |
| `docs/superpowers/plans/2026-07-17-chat-formatting-and-ai-studio-retirement.md` | Chat CSS/prompt + AI-Studio retirement. |
| `docs/superpowers/plans/2026-07-17-feedback-ai-feedback.md` | `ai_feedback` capture (TS route + thumbs). |
