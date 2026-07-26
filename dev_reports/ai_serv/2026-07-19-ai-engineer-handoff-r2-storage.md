# Handoff → ai-engineer (2026-07-19) — R2 object storage is live

**Status:** 🔵 ACTIVE · **Latest handoff** (supersedes the [2026-07-18 one](./2026-07-18-ai-engineer-handoff.md)
as the newest, does not invalidate it). From the R2 asset-storage session on `feat/ai-layer-adapter`.
**Your Google-Ads surface is untouched** — no edits to its consumption, routes, or ingestion.

## TL;DR for you

- The **ai-layer now owns a vendor-neutral S3 object store** (`ai_layer/storage.py`), pointed at
  Cloudflare R2 in prod. Finished creative deliverables (PNGs/MP4s + variants) are mirrored there on
  job completion, so their URLs **survive a Railway redeploy**. Before this, they lived on ephemeral
  container disk and 404'd after every deploy.
- **You get a reusable module** — if any Google-Ads path ever needs to persist a durable artifact,
  use `ai_layer.storage`; don't hand-roll another S3 client. Contract below.
- **apps/api holds NO R2 client and NO creds** by design (it 302s the browser straight to R2). The
  ai-layer is the sole R2 owner. If you ever need the TS side to own storage, see the deferred note:
  [`../2026-07-19-ts-r2-client-future-work.md`](../2026-07-19-ts-r2-client-future-work.md).
- **Nothing breaks when storage is off.** `STORAGE_BUCKET` unset ⇒ the old local-disk StaticFiles +
  byte-proxy path, unchanged. Tests and local dev keep working with zero R2 config.

## The module — `ai_layer/storage.py`

```python
from ai_layer import storage

storage.enabled() -> bool                              # True iff STORAGE_BUCKET is set
storage.asset_key(job_id, relpath) -> str              # "{PREFIX}{job_id}/{relpath}"
storage.put_file(key, local_path, content_type) -> None  # plain PutObject, one Class A op
storage.presign_get(key, expires=3600) -> str          # presigned GET URL (max 7 days)
```

- **Key convention:** `{STORAGE_PREFIX}{job_id}/{relpath}`. `STORAGE_PREFIX` is empty today
  (single-tenant demo); the real `tenant_id/` prefix is deferred to **#34** (per-brand identity).
- **Presign on read, never store a presigned URL** — no expiry rots in the DB. Presigning is a free
  local HMAC (no R2 round-trip); read expiry defaults to 3600 s.
- **boto3 gotcha already handled:** the client sets `request/response_checksum_calculation =
  when_required`. R2 rejects the boto3 ≥1.36 default `aws-chunked` checksums with
  `SignatureDoesNotMatch` — if you spin up your own boto3 S3 client elsewhere, copy that flag.
- **Cost shape:** writes = Class A ($4.50/M, 1M free), reads = Class B ($0.36/M, 10M free),
  **egress $0**. Plain `PutObject` only (every asset < ~100 MB); never multipart.

## How finished assets get published (creative track)

`ai_layer/creative/service.py` → `_publish_assets(job_id, run_dir)` runs right before `stage("Done")`
in both `_run_job` and `_run_video_job`. It globs **only the delivered set** and best-effort uploads:

```
ad_*.png · *.mp4 · winners/*.png · variants/*.mp4 · variants/*.script.json · variants_*.json
```

Scratch (`concept_*`, `logo.png`, `product_cutout.png`, `*.jsonl`, ffmpeg temp) **never leaves disk**.
An upload failure logs and continues — the bytes are already on local disk, so a failed mirror never
fails a job. `job["variants"]` now carries a per-variant `url` (edit→`.mp4`, structural→`.script.json`).

## Reading assets (the browser path — Mode 2)

```
browser → GET /api/creative-studio/asset/:jobId/*
        → apps/api asks ai-layer:  GET /creative/asset-url/{job_id}/{path}   (X-API-Key gated)
              storage ON  → 200 {"url": "<presigned R2 GET>"}  → apps/api 302s the browser to R2
              storage OFF → 404                                → apps/api byte-proxies local bytes
```

Bytes flow **browser ↔ R2 directly** ($0 Railway egress, native video Range/scrubbing). The endpoint
404s when storage is off and 400s on a `..` path. If you ever serve your own durable artifacts to the
UI, the cleanest reuse is: `put_file` on write, and either call this endpoint for reads or expose an
analogous gated presign route — keep one presign owner.

## Env (ai-layer / Railway Service B + root `.env` only — NOT apps/api)

```
STORAGE_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=...   STORAGE_SECRET_ACCESS_KEY=...
STORAGE_BUCKET=...          STORAGE_REGION=auto          STORAGE_PREFIX=   (empty)
```

## Verify / self-checks (no pytest — conftest PG guardrail intact)

```bash
cd apps/ai-layer
../../.venv/bin/python -m ai_layer.storage                    # ai_layer.storage self-check OK
../../.venv/bin/python -m ai_layer.creative._publish_check    # _publish_assets self-check OK
```

Live-proven this session: the presign endpoint returned a real GET URL against bucket
`cosmisk-mvp-v1`. TS invariant held (tsc baseline-only, madge 0 cycles, suite green).

## Commits (branch `feat/ai-layer-adapter`)

`6cdedbd` storage module · `1df809d` publish + variants · `fd3002d` presign endpoint ·
`b527fdb` apps/api 302 proxy · `6126369` env/Dockerfile. Plan + lineage:
[`docs/superpowers/plans/2026-07-18-r2-asset-storage.md`](../../docs/superpowers/plans/2026-07-18-r2-asset-storage.md).

## Deferred (not gaps — noted so you don't re-derive)

- Real `tenant_id/` prefix → **#34**. Audio (ElevenLabs voiceover, apps/api local disk) → R2 at the
  TS refactor (**#48**); it 404s after a redeploy today, out of the demo path.
- `<a download>` opens cross-origin asset in a new tab instead of downloading (minor; upgrade path =
  presign with `ResponseContentDisposition=attachment` behind a `?download=1` flag).
