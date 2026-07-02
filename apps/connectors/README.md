# cosmisk-connectors

One abstract entry point that pulls **Meta Ads + Shopify + Google Ads** (data + winning-creative
media assets) into a single typed `UnifiedSnapshot` for the AI layer. Each platform is an isolated,
fault-tolerant connector; no single one can stall or sink a run.

> **For the AI engineer:** you only need §1–§3. The internals (§5) are swappable behind the facade.

## 1. Install

```bash
pip install -e apps/connectors            # add -e ".[google]" to enable Google Ads
```
The package is `connectors`; it depends on nothing from `apps/ai-layer` (one-way only).

## 2. Plug in keys (`.env` at repo root, or Railway service variables)

Copy `apps/connectors/.env.example`. A platform whose vars are missing is **`skipped`**, never an
error. Google is fully optional and **auto-activates** once all its vars are set.

```
META_ACCESS_TOKEN= ; META_AD_ACCOUNT_ID=act_...
SHOPIFY_SHOP_DOMAIN=...myshopify.com ; SHOPIFY_ADMIN_TOKEN=...
GOOGLE_ADS_DEVELOPER_TOKEN= ; GOOGLE_ADS_CLIENT_ID= ; GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN= ; GOOGLE_ADS_CUSTOMER_ID=
```

## 3. Use it (the entire API)

```python
from connectors import get_snapshot, get_assets, BrandRef, DateWindow

snap = get_snapshot(BrandRef(brand_id="acme"), DateWindow.last_n_days(30))

snap.blended.blended_roas       # Meta+Google spend vs Shopify revenue (the headline number)
snap.blended.revenue_gap_pct    # (Shopify − Meta-pixel) / Shopify × 100
snap.facts                      # list[UnifiedFact] — per platform × entity × day
snap.statuses                   # per-connector: ok | degraded | skipped | failed (+ detail)
snap.ok_platforms               # which platforms contributed

assets = get_assets(BrandRef(brand_id="acme"), top_n=5)   # downloaded winning creatives + stats
```

`get_snapshot` is **synchronous** (it wraps the async funnel) — call it directly from the AI layer.
Pass `platforms=["meta","shopify"]` to restrict. Per-brand account ids can be set on `BrandRef`
(`meta_account_id`, `shopify_domain`, `google_customer_id`); omitted → falls back to `.env`.

## 4. The contract (what you receive — and the only thing to import)

> **Binding, field-by-field version with adapter mapping, currency rules, capability sets,
> and the storage seam: [`CONTRACT.md`](CONTRACT.md).** This section is the short form.

```
UnifiedFact     platform, account_id, entity_id, entity_name, date,
                spend, impressions, clicks, conversions, revenue, platform_extra: dict
Blended         spend, revenue_meta_pixel, revenue_shopify, blended_roas, revenue_gap_pct
ConnectorStatus platform, state("ok"|"degraded"|"skipped"|"failed"), detail, fact_count, elapsed_ms
AssetRecord     platform, entity_id, entity_name, kind, local_path, durable_ref, source_url, roas, stats
UnifiedSnapshot brand_id, since, until, currency, facts[], blended, assets[], statuses[]
```

**Assets — image vs video.** For an image creative, `kind="image"`, `local_path` is the
downloaded still and `durable_ref` is the Meta `image_hash`. For a video creative (detected by a
`video_id` anywhere in the creative spec — `video_data` / `template_data` / `link_data` /
`child_attachments`), `kind="video"`, `durable_ref` is the **video_id** (stable), `source_url` is
the resolved mp4/permalink (**time-limited** — re-resolve from `video_id` via
`/{video_id}?fields=source`), and `local_path` is a downloaded still frame (full-size when its URL
is fetchable, else the 64×64 thumbnail). A winner whose creative call fails is skipped, never
sinking the batch.

**Fault tolerance (guaranteed):** every connector runs concurrently with its own rate limiter,
a hard timeout, and exception capture. A failing platform → a `failed`/`degraded`/`skipped`
status; the snapshot still returns everyone else. Meta and Shopify get the same treatment as
Google — nothing is load-bearing.

## 5. Internals (swappable)

`contract.py` (types) · `config.py` (.env → creds) · `base.py` (async HTTP + token-bucket
rate-limit + backoff + SSRF-allowlisted asset download) · `funnel.py` (concurrent fan-out, merge,
blended math) · `meta|shopify|google/` (per-platform `client.py` + `normalize.py`). Network is an
injectable seam, so the suite runs at $0:

```bash
cd apps/connectors && python -m pytest tests       # 47 tests, no network
```

## 6. Deploy (Railway)

The connector is a **library inside the ai-layer service**, not a separate service. Because the
`apps/ai-layer` image build context is `apps/ai-layer`, bundling this sibling requires building
that service from the **repo root** and installing both:

```dockerfile
COPY apps/connectors apps/connectors
COPY apps/ai-layer  apps/ai-layer
RUN pip install ./apps/connectors ./apps/ai-layer
```
Prod credentials come from **Railway service variables** (no `.env` file) — `config.py` reads
`os.environ` either way. `google-ads` is an optional extra to keep Meta+Shopify images lean.
