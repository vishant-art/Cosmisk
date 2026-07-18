# R2 Asset Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Write all code under `ponytail` (lazy/minimal): smallest diff that works, fallbacks preserved, one runnable self-check per module — no speculative abstraction.**

**Goal:** Persist the ai-layer's finished creative media (PNGs/MP4s) to Cloudflare R2 so URLs survive a Railway redeploy, and serve it to the browser **directly from R2** ($0 egress) — while the apps/api (TS) server holds **no R2 client and no R2 credentials**.

**Architecture:** The **ai-layer (Python) is the sole R2 owner** — it uploads finished deliverables on job completion and mints presigned GET URLs. The browser reads via **Mode 2**: apps/api's existing `/asset` proxy asks the ai-layer for a presigned URL (tiny JSON call) and **302-redirects the browser straight to R2**, so the megabytes flow browser↔R2 and never transit Railway. ffmpeg scratch stays on ephemeral local disk. **When `STORAGE_BUCKET` is unset, everything falls back to today's local-disk StaticFiles + byte-proxy, unchanged** — so tests and the pre-deploy branch keep working. **apps/api gets no `@aws-sdk`, no `STORAGE_*` env, no R2 creds.**

**Tech Stack:** Cloudflare R2 (S3-compatible), `boto3` (ai-layer only), FastAPI, Fastify 5.

## Global Constraints

- **Env (vendor-neutral) — ai-layer + root ONLY:** `STORAGE_ENDPOINT=https://<acct>.r2.cloudflarestorage.com`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION=auto`, optional `STORAGE_PREFIX=""`. **apps/api does NOT get these** (it never touches R2).
- **Checksum flags REQUIRED (boto3):** `Config(request_checksum_calculation="when_required", response_checksum_validation="when_required")`. R2 rejects the boto3≥1.36 default `aws-chunked` checksums (`SignatureDoesNotMatch`). *(No aws-sdk-v3 equivalent needed — there is no TS S3 client.)*
- **Plain `PutObject` only, never multipart** — every asset is < ~100 MB, so one upload = one Class A op.
- **Presign on READ, never store a presigned URL** (no expiry-in-DB). Read presign expiry = 3600 s.
- **Shared key convention:** creative asset → `{STORAGE_PREFIX}{job_id}/{relpath}`. Single-tenant now; real `tenant_id/` prefix is deferred to task #34.
- **Graceful degradation:** `STORAGE_BUCKET` unset ⇒ existing local StaticFiles mount + apps/api byte-proxy, untouched.
- **apps/api stays R2-agnostic:** no S3 SDK, no creds. Its `/asset` proxy either 302s to a URL the **ai-layer** minted, or byte-proxies local bytes — it never signs anything. Rationale: the TS server is slated for a heavy refactor; keep R2 coupling out of it.
- **⚠️ Ownership:** `apps/ai-layer/ai_layer/creative/service.py` is **dryayeet's subtree** — Task 2 edits it (consent given 2026-07-19, incl. storing variants). `ai_layer/storage.py` and `ai_layer/api.py` are ai-layer top-level (ours).
- **ai-layer test harness:** `tests/conftest.py` has an autouse session fixture requiring `PG*` vars. To avoid it for pure-storage logic, the Python checks are `python -m …` **`__main__` self-checks**, not pytest files. Do **not** weaken the conftest guardrail.
- **No new test deps** (no `moto`): monkeypatch/fake the client; key builders + presign are deterministic offline.

---

### Task 1: Python storage module (`ai_layer/storage.py`)

**Files:**
- Create: `apps/ai-layer/ai_layer/storage.py`
- Modify: `apps/ai-layer/pyproject.toml:6-23` (add `boto3` dependency)

**Interfaces:**
- Consumes: `STORAGE_*` env.
- Produces:
  - `enabled() -> bool`
  - `asset_key(job_id: str, relpath: str) -> str`
  - `put_file(key: str, local_path: str | Path, content_type: str) -> None`
  - `presign_get(key: str, expires: int = 3600) -> str`

- [ ] **Step 1: Write the failing self-check**

Append to the bottom of the new file `apps/ai-layer/ai_layer/storage.py` (module body written in Step 3):

```python
if __name__ == "__main__":  # ponytail: assert-based self-check, no pytest harness / no DB
    import os
    os.environ.update(
        STORAGE_ENDPOINT="https://acct.r2.cloudflarestorage.com",
        STORAGE_ACCESS_KEY_ID="AKIA_TEST", STORAGE_SECRET_ACCESS_KEY="secret_test",
        STORAGE_BUCKET="cosmisk-media", STORAGE_REGION="auto", STORAGE_PREFIX="",
    )
    _client.cache_clear()
    assert enabled() is True
    assert asset_key("job123", "winners/w_06.png") == "job123/winners/w_06.png"
    url = presign_get("job123/a.png", expires=60)
    assert url.startswith("https://acct.r2.cloudflarestorage.com/cosmisk-media/job123/a.png")
    assert "X-Amz-Signature=" in url and "X-Amz-Expires=60" in url
    os.environ["STORAGE_PREFIX"] = "tenantA/"
    assert asset_key("j", "a.png") == "tenantA/j/a.png"
    del os.environ["STORAGE_BUCKET"]
    assert enabled() is False
    print("ai_layer.storage self-check OK")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m ai_layer.storage`
Expected: FAIL — `NameError: name 'enabled' is not defined`.

- [ ] **Step 3: Write the module**

Write `apps/ai-layer/ai_layer/storage.py` (keep the `__main__` block from Step 1 at the very bottom):

```python
"""Vendor-neutral S3 object store for FINISHED creative deliverables (R2 in prod).

ffmpeg scratch stays on local disk; only delivered files land here. When STORAGE_BUCKET
is unset every caller falls back to local disk — enabled() gates that.

Key convention: {PREFIX}{job_id}/{relpath}. PREFIX defaults empty (single-tenant); a real
tenant_id/ prefix is deferred to the per-brand identity work.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def enabled() -> bool:
    return bool(os.getenv("STORAGE_BUCKET"))


def asset_key(job_id: str, relpath: str) -> str:
    return f"{os.getenv('STORAGE_PREFIX', '')}{job_id}/{relpath}"


@lru_cache(maxsize=1)
def _client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=os.environ["STORAGE_ENDPOINT"],
        aws_access_key_id=os.environ["STORAGE_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["STORAGE_SECRET_ACCESS_KEY"],
        region_name=os.getenv("STORAGE_REGION", "auto"),
        # R2 rejects the boto3>=1.36 default aws-chunked checksums.
        config=Config(request_checksum_calculation="when_required",
                      response_checksum_validation="when_required"),
    )


def put_file(key: str, local_path: str | Path, content_type: str) -> None:
    """Plain PutObject (never multipart) — one Class A op per delivered file."""
    with open(local_path, "rb") as fh:
        _client().put_object(Bucket=os.environ["STORAGE_BUCKET"], Key=key,
                             Body=fh, ContentType=content_type)


def presign_get(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["STORAGE_BUCKET"], "Key": key},
        ExpiresIn=expires)
```

Add to `apps/ai-layer/pyproject.toml` dependencies (alongside `psycopg[binary]>=3.2`):

```toml
    "boto3>=1.36",          # vendor-neutral S3 client for R2 object storage
```

- [ ] **Step 4: Install the dep and run the self-check**

Run: `cd apps/ai-layer && ../../.venv/bin/pip install "boto3>=1.36" && ../../.venv/bin/python -m ai_layer.storage`
Expected: `ai_layer.storage self-check OK`

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/storage.py apps/ai-layer/pyproject.toml
git commit -m "feat(ai-layer): vendor-neutral S3 storage module for R2 deliverables"
```

---

### Task 2: ai-layer uploads finished assets + surfaces variants ⚠️ dryayeet subtree

**Files:**
- Modify: `apps/ai-layer/ai_layer/creative/service.py` (add `_publish_assets` + call it in `_run_job`/`_run_video_job`; surface variant URLs)
- Create: `apps/ai-layer/ai_layer/creative/_publish_check.py` (standalone self-check)

**Interfaces:**
- Consumes: `ai_layer.storage.enabled/asset_key/put_file` (Task 1).
- Produces: `_publish_assets(job_id: str, run_dir: Path) -> None`. Job shape unchanged EXCEPT each `job["variants"]["variants"][i]` gains a `url`, and `job["variants"]["record"]` becomes an `_asset_url`. `_asset_url()` itself is unchanged.

**Delivered-file set (verified against `pipeline.py`/`sequencer.py`):** served files are top-level `ad_*.png` (never `concept_*_bg.png`/`logo.png`/`product_cutout.png` — those are scratch), top-level `video*.mp4`/`timeline*.mp4`, `winners/*.png`, and (now) `variants/*.mp4` + `variants/*.script.json` + top-level `variants_*.json`. Each file's relpath equals the URL path apps/api presigns.

- [ ] **Step 1: Write the failing self-check**

Create `apps/ai-layer/ai_layer/creative/_publish_check.py`:

```python
"""Run: ../../.venv/bin/python -m ai_layer.creative._publish_check"""
from pathlib import Path
import tempfile
from ai_layer.creative import service


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        run = Path(d)
        (run / "ad_00_1x1.png").write_bytes(b"png")
        (run / "timeline_final.mp4").write_bytes(b"mp4")
        (run / "winners").mkdir()
        (run / "winners" / "w_01.png").write_bytes(b"png")
        (run / "variants").mkdir()
        (run / "variants" / "v1.mp4").write_bytes(b"mp4")
        (run / "variants_aesthetic.json").write_text("{}")
        (run / "concept_00_bg.png").write_bytes(b"png")  # scratch — must be SKIPPED
        (run / "logo.png").write_bytes(b"png")           # scratch — must be SKIPPED
        (run / "ledger.jsonl").write_text("{}")          # scratch — must be SKIPPED

        uploaded: list[tuple[str, str]] = []
        service.storage.enabled = lambda: True
        service.storage.put_file = lambda key, path, content_type: uploaded.append((key, content_type))

        service._publish_assets("job9", run)

        keys = {k for k, _ in uploaded}
        assert keys == {"job9/ad_00_1x1.png", "job9/timeline_final.mp4",
                        "job9/winners/w_01.png", "job9/variants/v1.mp4",
                        "job9/variants_aesthetic.json"}, keys
        types = dict(uploaded)
        assert types["job9/ad_00_1x1.png"] == "image/png"
        assert types["job9/timeline_final.mp4"] == "video/mp4"
        assert types["job9/variants_aesthetic.json"] == "application/json"
        print("_publish_assets self-check OK")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m ai_layer.creative._publish_check`
Expected: FAIL — `AttributeError: module '...service' has no attribute 'storage'`.

- [ ] **Step 3: Implement the upload hook + variant surface**

In `apps/ai-layer/ai_layer/creative/service.py`, add the import after the other `ai_layer` imports (~line 38):

```python
from ai_layer import storage
```

Add the helper after `_asset_url` (~line 163):

```python
_CT = {".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4",
       ".mp3": "audio/mpeg", ".json": "application/json"}


def _publish_assets(job_id: str, run_dir: Path) -> None:
    """Mirror the run's delivered files to R2 under {job_id}/{relpath}. No-op when storage
    is off (local disk stays the source of truth). Best-effort: an upload failure must never
    fail a job whose bytes already exist on disk.

    ponytail: glob the delivered set only — top-level ad_*.png (NOT concept/logo/cutout
    scratch), *.mp4, winners/*.png, and the variant tree — so scratch never leaves disk.
    """
    if not storage.enabled():
        return
    delivered = [*run_dir.glob("ad_*.png"), *run_dir.glob("*.mp4"),
                 *run_dir.glob("winners/*.png"), *run_dir.glob("variants/*.mp4"),
                 *run_dir.glob("variants/*.script.json"), *run_dir.glob("variants_*.json")]
    for f in delivered:
        try:
            rel = f.relative_to(run_dir).as_posix()
            storage.put_file(storage.asset_key(job_id, rel), f, _CT.get(f.suffix, "application/octet-stream"))
        except Exception:  # noqa: BLE001 -- bytes are on disk; a failed mirror is not a failed job
            log.warning("asset upload skipped for %s", f, exc_info=True)
```

Call it in `_run_job` immediately before `stage("Done")` (~line 257):

```python
        _publish_assets(job_id, run_dir)
        stage("Done")
```

Call it in `_run_video_job` immediately before `stage("Done")` (~line 380; `run_dir` is defined at ~line 345):

```python
        _publish_assets(job_id, run_dir)
        stage("Done")
```

Surface variant URLs so the frontend can fetch them. Replace the `job["variants"]` assignment in `_run_video_job` (~lines 371-372) with:

```python
            job["variants"] = {
                "axis": req.variant_axis,
                "record": _asset_url(job_id, record),
                # edit-axis variants are {id}.mp4; structural (hook) are {id}.script.json.
                "variants": [{**v.model_dump(),
                              "url": f"/creative/assets/{job_id}/variants/{v.variant_id}."
                                     + ("mp4" if v.kind == "edit" else "script.json")}
                             for v in vset.variants],
            }
```

- [ ] **Step 4: Run the self-check**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m ai_layer.creative._publish_check`
Expected: `_publish_assets self-check OK`

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/creative/service.py apps/ai-layer/ai_layer/creative/_publish_check.py
git commit -m "feat(ai-layer): mirror finished creative assets + variants to object store on completion"
```

---

### Task 3: ai-layer presigned-URL endpoint (`api.py`)

**Files:**
- Modify: `apps/ai-layer/ai_layer/api.py:280-288` (add a gated `/creative/asset-url/...` endpoint; keep the StaticFiles mount as the storage-off byte source)

**Interfaces:**
- Consumes: `ai_layer.storage.enabled/asset_key/presign_get` (Task 1); the existing `require_api_key` dependency.
- Produces: `GET /creative/asset-url/{job_id}/{path}` → `{"url": "<presigned R2 GET>"}` when storage on; **404** when off (signals the caller to byte-proxy). Node-safe (200 JSON — no reliance on undici manual-redirect semantics).

- [ ] **Step 1: Add the endpoint**

In `apps/ai-layer/ai_layer/api.py`, near the creative block (after the `_creative_router` import, ~line 281), add the storage import:

```python
from ai_layer import storage as _storage  # noqa: E402
```

After the existing `app.mount("/creative/assets", ...)` block (keep the mount — it serves local bytes when storage is off), add:

```python
@app.get("/creative/asset-url/{job_id}/{path:path}",
         dependencies=[Depends(require_api_key)])
def creative_asset_url(job_id: str, path: str):
    """A presigned R2 GET URL for a finished asset. apps/api calls this and 302s the browser
    to the returned URL, so the bytes flow browser<->R2 directly ($0 egress) and apps/api
    never holds R2 creds. 404 when storage is off -> the caller byte-proxies the local copy."""
    if ".." in path:
        raise HTTPException(status_code=400, detail="bad path")
    if not _storage.enabled():
        raise HTTPException(status_code=404, detail="storage disabled")
    return {"url": _storage.presign_get(_storage.asset_key(job_id, path))}
```

- [ ] **Step 2: Smoke-check the route wiring (storage off → 404, on → JSON)**

Run:
```bash
cd apps/ai-layer && ../../.venv/bin/python -c "
from fastapi.testclient import TestClient
import os
os.environ.pop('STORAGE_BUCKET', None)
from ai_layer.api import app
c = TestClient(app)
k = os.environ.get('AI_LAYER_API_KEY', '')
r = c.get('/creative/asset-url/job1/ad_00.png', headers={'X-API-Key': k})
print('storage-off status:', r.status_code)
assert r.status_code in (401, 404), r.status_code   # 401 if key gate rejects, 404 if storage off
print('asset-url route wired OK')
"
```
Expected: `asset-url route wired OK` (this only proves the route exists + gates; the real presign is covered by Task 1's self-check and the end-to-end verify).

- [ ] **Step 3: Commit**

```bash
git add apps/ai-layer/ai_layer/api.py
git commit -m "feat(ai-layer): presigned-URL endpoint for finished creative assets"
```

---

### Task 4: apps/api Mode-2 proxy — 302 the browser straight to R2

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts` (add `fetchCreativeAssetUrl`)
- Modify: `apps/api/src/routes/creative-studio.ts:262-283` (rewrite the `/asset/:jobId/*` handler)

**Interfaces:**
- Consumes: the ai-layer `/creative/asset-url/...` endpoint (Task 3); the existing `fetchCreativeAsset` byte-proxy as the storage-off fallback.
- Produces: `fetchCreativeAssetUrl(jobId: string, path: string): Promise<string | null>` (null ⇒ storage off). Same route contract; **no S3 client, no R2 creds, no `STORAGE_*` on apps/api.**

- [ ] **Step 1: Add the client function**

In `apps/api/src/services/creative-gen-client.ts`, next to `fetchCreativeAsset` (~line 125), add:

```typescript
/** GET /creative/asset-url/{jobId}/{path} -> presigned R2 URL, or null when storage is
 *  off (404) so the caller byte-proxies the ai-layer's local copy instead. */
export async function fetchCreativeAssetUrl(jobId: string, path: string): Promise<string | null> {
  const safe = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const url = `${base()}/creative/asset-url/${encodeURIComponent(jobId)}/${safe}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': config.aiLayerApiKey },
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });
  if (res.status === 404) return null;               // storage off -> fall back to byte-proxy
  if (!res.ok) throw new AiLayerError(`asset-url ${res.status}`, res.status);
  const body = (await res.json()) as { url: string };
  return body.url;
}
```

- [ ] **Step 2: Rewrite the `/asset` handler**

In `apps/api/src/routes/creative-studio.ts`, add `fetchCreativeAssetUrl` to the existing import from `../services/creative-gen-client.js`. Then replace the body of `app.get('/asset/:jobId/*', ...)` (lines 265-282):

```typescript
  app.get('/asset/:jobId/*', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const file = (request.params as Record<string, string>)['*'];  // may include a subdir
    if (file.includes('..')) return reply.status(400).send({ success: false, error: 'bad path' });
    // Storage on: 302 the browser straight to a presigned R2 URL the ai-layer minted
    // (bytes flow browser<->R2, $0 Railway egress; apps/api holds no R2 creds).
    try {
      const signed = await fetchCreativeAssetUrl(jobId, file);
      if (signed) return reply.redirect(signed, 302);
    } catch (err: any) {
      logger.warn({ err: err.message, jobId, file }, 'asset-url lookup failed; falling back to proxy');
    }
    // Storage off (dev / pre-deploy): byte-proxy from the ai-layer's ephemeral local disk.
    try {
      const upstream = await fetchCreativeAsset(jobId, file);
      if (!upstream.ok) {
        return reply.status(upstream.status || 404).send({ success: false, error: 'asset not found' });
      }
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      const buf = Buffer.from(await upstream.arrayBuffer());
      reply.header('Content-Type', ct);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(buf);
    } catch (err: any) {
      logger.warn({ err: err.message, jobId, file }, 'creative-studio asset proxy failed');
      return reply.status(502).send({ success: false, error: 'asset proxy failed' });
    }
  });
```

- [ ] **Step 3: Typecheck + default suite**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: tsc baseline-only (`billing.ts:4` stripe); default suite green (**400/9**, unchanged — no new TS test).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts
git commit -m "feat(api): 302 creative assets straight to R2 via ai-layer presign (no R2 creds on TS)"
```

---

### Task 5: Env docs, Dockerfile comment, and full-invariant gate

**Files:**
- Modify: `.env.example`, `apps/ai-layer/.env.example` (keep the `STORAGE_*` block)
- Modify: `apps/api/.env.example` (**remove** the `STORAGE_*` block — apps/api never uses R2)
- Modify: `Dockerfile:4` (stale `better-sqlite3` comment → sharp; keep `mkdir -p ./data`)

- [ ] **Step 1: Fix the env docs**

Ensure `.env.example` (root) and `apps/ai-layer/.env.example` contain the `STORAGE_*` block (added earlier this session — leave as-is). **Remove** the `STORAGE_*` block from `apps/api/.env.example` (the apps/api service does not talk to R2). Add a one-line note where it was:

```bash
# (No STORAGE_* here — apps/api never talks to R2; the ai-layer owns object storage.)
```

- [ ] **Step 2: Fix the stale Dockerfile comment**

In `Dockerfile`, update the line-4 comment (keep `mkdir -p ./data` at line 35 — the local-audio fallback still uses it):

```dockerfile
# Native build tools for sharp (native image processing)
```

- [ ] **Step 3: Run the TS test invariant**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit && npx madge --circular --extensions ts src/`
Expected: default suite **400/9**, tsc baseline-only, madge **0 cycles**.

- [ ] **Step 4: Run the ai-layer self-checks**

Run:
```bash
cd apps/ai-layer && ../../.venv/bin/python -m ai_layer.storage && ../../.venv/bin/python -m ai_layer.creative._publish_check
```
Expected: `ai_layer.storage self-check OK` and `_publish_assets self-check OK`.

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/api/.env.example apps/ai-layer/.env.example Dockerfile
git commit -m "docs(storage): STORAGE_* on ai-layer only + Dockerfile comment fix"
```

---

## Post-implementation (operator / out of band)

- **R2 setup (user):** create the bucket + S3 API token, set the five `STORAGE_*` vars on the **ai-layer (Railway Service B) only**. apps/api needs nothing.
- **End-to-end verify:** generate a creative → confirm the object lands in R2 under `{job_id}/…` → load the app: `<img>`/`<video>` play via apps/api's 302→R2 (check the Network tab shows a redirect to `*.r2.cloudflarestorage.com`) → **redeploy the ai-layer** → the same asset still loads (proves durability). Confirm video **scrubbing/seeking** works (Range served natively by R2). Repeat for a variant clip.
- **Known limitation (accepted):** the output-gallery `<a download>` link is cross-origin under Mode 2, so browsers **open the asset in a new tab instead of downloading**. Upgrade path: have the ai-layer presign with `ResponseContentDisposition=attachment` behind a `?download=1` flag threaded through the proxy — deferred (minor).
- **Audio (ElevenLabs voiceover, TS legacy #48):** intentionally **NOT** migrated — it stays on apps/api local disk and 404s after a redeploy. It is out of the demo path; wire it up (or move audio generation into the ai-layer) at the TS refactor.
- **Gates the `main` merge** (creative assets 404 in prod without this). Task 2 touches dryayeet's `creative/` subtree (consent given).

## Self-Review

- **Spec coverage:** R2 object store for finished deliverables (T1/T2) · presign-on-read, no stored URLs (T3) · direct browser↔R2 delivery, $0 egress (T4 Mode 2) · variants stored + served (T2) · vendor-neutral `STORAGE_*` + checksum flags (T1, Global Constraints) · ffmpeg scratch untouched (by omission) · plain PutObject + key layout (T1/T2) · Dockerfile cleanup (T5). ✅
- **TS-decoupling honored:** apps/api gains no `@aws-sdk`, no `STORAGE_*`, no creds — only a JSON call + a 302 (T4). The Fable review's fixes #1 (forcePathStyle) and #3 (dep floor) are **moot** — there is no TS S3 client. Fixes #2 (`variants/*.mp4`) and #5 (`ad_*.png`) land in T2; #4 (path guard) lands in T3 + T4.
- **Node-safety:** Mode 2 rides a 200-JSON asset-url endpoint, NOT undici's opaque `redirect:'manual'` (which hides `Location` on Node 20). ✅
- **Deferred by design (noted, not gaps):** real `tenant_id/` prefix → #34; audio → R2 → TS refactor; `<a download>` disposition → minor follow-up; custom-domain public CDN → Phase 2.
