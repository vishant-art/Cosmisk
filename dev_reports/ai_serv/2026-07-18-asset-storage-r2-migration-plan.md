# Asset storage → cloud (vendor-neutral S3: Railway Buckets now, R2 later) — plan (2026-07-18)

**Status:** 🔵 ACTIVE (decision + plan; implementation pending). Web-verified pricing 2026-07-18.

## Context / why

Generated user-facing media — UGC **videos**, static-ad **PNGs** (ai-layer), and voiceover **MP3s**
(apps/api) — is written to **container-local disk** and served statically. On Railway with **no
volume declared**, every redeploy/restart **wipes these and the URLs 404**. The new async-video
feature makes this acute (a render survives ~15 min then must be served later), and we are going
**multi-tenant soon** with **egress-heavy** playback. Durable, scalable, cheap-egress storage is now
required — and gates the `main` merge (assets would 404 in prod without it).

## Decision: **vendor-neutral S3 layer → Railway Buckets now, Cloudflare R2 later**

Both R2 and Railway Buckets speak the **S3 API**, so the storage layer is built vendor-neutral
(endpoint + creds from env) and **switching vendors is an env change, not a rewrite.** That makes the
"which cloud" call low-stakes and reversible.

- **Now (demo → the ~19-day Railway-credit window, expires ~2026-08-06):** **Railway Buckets.** ~zero
  setup (services already on Railway → creds auto-injected, no new vendor), **burns the $4 remaining
  credit**, S3-compatible (same boto3/AWS-SDK code), presigned URLs for tenant isolation. Only cost:
  service→bucket *upload* bills $0.05/GB service egress — cents at 10–15 videos. Limits: no public
  buckets, no CDN, young product (fine for the demo; we use presigned URLs anyway).
- **Later (CDN latency matters / real multi-tenant scale / want public image URLs):** **Cloudflare R2** —
  flip four env vars. Mature, custom-domain CDN, bigger free tier, $0 delivery egress.

Priced against our egress-dominated workload (all options, 2026 web-verified; full log in the research
subagent output). At ~5 TB egress/mo: **R2 ~$7 · Railway Buckets ~$7.50** · AWS S3 ~$450 · Supabase
~$180–250 · Railway **Volume** ~$325 · Neon bytea = anti-pattern (store the KEY, never the bytes). Both
zero-egress S3 stores win by ~60× over S3/Supabase at scale. Note: R2 has a *standing* free tier (10 GB
+ free egress) that also covers the MVP at $0 — the credit's real advantage is lower friction, not $.

## Architecture (verified sound)

**Object store holds FINISHED deliverables; ffmpeg scratch stays on ephemeral local disk; presigned
URLs (tenant-prefixed keys) for isolation.**

- ffmpeg needs a real POSIX FS for its seek-heavy intermediates (`renders/`, `.work/`, `seeds/`) — it
  **cannot** read/write R2. Scratch does NOT need to persist (a mid-render restart re-renders), so it's
  plain **ephemeral container disk — no volume at all**.
- On job completion, `PutObject` the delivered files → serve via **presigned GETs** (max 7-day expiry).
  Key layout `tenant_id/job_id/asset.ext`.
- Final MP4s written with `-movflags +faststart` (front-load the moov atom for progressive playback).
  Serve as plain **Range GETs** — NOT a streaming service (HLS/Mux is a 50–70× premium unneeded at our
  clip sizes; R2 supports Range so `<video>` seeking works).

## Scope — what changes (implementation)

1. **Shared storage layer** (both producers): an S3 client pointed at R2
   (`endpoint=https://<acct>.r2.cloudflarestorage.com`, `region="auto"`, checksum flags
   `when_required` — REQUIRED, boto3≥1.36 / aws-sdk-v3 default checksums break non-AWS S3).
2. **ai-layer** (⚠️ dryayeet's `creative/` subtree — coordinate): after render, upload delivered assets
   (`timeline.mp4`, static-ad PNGs, served `winners/`); replace the `/creative/assets` StaticFiles mount
   (`api.py:286`) + `_asset_url()` (`service.py:161`) with R2 presigned URLs. Scratch stays ephemeral.
   **Bonus:** this makes the ai-layer genuinely stateless again — the Dockerfile's "no volume required"
   comment becomes TRUE.
3. **apps/api** (ours): ElevenLabs MP3 (`api-providers.ts:502`) → R2; drop the `/audio` static
   (`index.ts:227`); the `/creative-studio/asset/:jobId/*` proxy (`creative-studio.ts:265`) → 302 to a
   presigned R2 URL (or the client consumes R2 URLs directly).
4. **Env** (both services, **vendor-neutral names** so the vendor swap is env-only):
   `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`,
   `STORAGE_REGION=auto`. Railway Buckets → `storage.railway.app` endpoint (creds auto-injected for
   Railway services); R2 → `https://<acct>.r2.cloudflarestorage.com`. Same S3 client either way.

## Coupled cleanup (folded in per user)

- ✅ **Done 2026-07-18:** deleted stale dead `store.sqlite` + `cost_ledger.jsonl` (pre-Neon leftovers).
- With audio → R2: drop `apps/api` Dockerfile `mkdir -p ./data` (line 35). **KEEP** its `python3/make/g++`
  build tools — `sharp` (native) still needs them; only fix the stale "better-sqlite3" comment → sharp.
- `AI_LAYER_STORE_PATH`/`STORE_DB_PATH` config line — LEAVE (harmless one-liner, a test monkeypatches it;
  removing is churn+risk for no gain).

## Rollout

- **Phase 1 (MVP → early multi-tenant):** presigned GETs. Ships everything, tenant-isolated.
- **Phase 2 (scale/CDN):** hot public assets (images) on a **custom-domain public bucket** + Cache
  Everything (presigned URLs are never CDN-cached; `r2.dev` is dev-only, never ship it).

## Gotchas (from research)

checksum `when_required` flags · `r2.dev` rate-limited/dev-only → custom domain for public · presigned ≠
CDN-cached · multipart bills each part as Class A → plain `PutObject` under ~100 MB · `+faststart`.

## Verification (end-to-end)

Generate a creative → confirm asset lands in the R2 bucket under `tenant/job/…` → browser plays via the
presigned URL → **redeploy the ai-layer** → the same URL still plays (proves durability). Repeat for an
audio MP3.

## Ownership / follow-up

`creative/` subtree = **dryayeet** (coordinate before merging storage changes there); `apps/api` = ours.
Write a `docs/superpowers` plan when implementing. This must land (+ prod env) **before** the `main` merge.
