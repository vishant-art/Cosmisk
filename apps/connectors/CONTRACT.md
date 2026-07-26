# Connector Technical Contract — for the AI layer

> **Audience:** the AI engineer wiring `apps/ai-layer` to real cross-platform data.
> This is the binding interface. Everything behind it is swappable; nothing here will
> change without a version note at the bottom. Live-validated 2026-07-02 against real
> Meta ('Pratap sons', 141 campaigns), Shopify (pratapsons-usa, INR), and Google Ads
> accounts. Usage examples: `README.md`. Design rationale:
> `docs/superpowers/specs/2026-07-02-connector-fact-shape-redesign-FINAL.md`.

## 1. The only imports

```python
from connectors import (
    get_snapshot, get_assets,                     # the entire API
    BrandRef, DateWindow,                         # inputs
    UnifiedSnapshot, UnifiedFact, Blended,        # outputs
    AssetRecord, ConnectorStatus,
    META_METRICS, GOOGLE_METRICS, SHOPIFY_METRICS, CAPABILITIES, measures,
)
```

Never import `connectors.meta` / `.shopify` / `.google` / `.funnel` — internals may change
without notice. Install: `pip install -e apps/connectors` (add `".[google]"` for Google Ads).

```python
def get_snapshot(brand: BrandRef, window: DateWindow,
                 platforms: list[str] | None = None, *,
                 rate_provider=None, target_currency: str | None = None) -> UnifiedSnapshot
def get_assets(brand: BrandRef, top_n: int = 5,
               platforms: list[str] | None = None) -> list[AssetRecord]
```

Both are **synchronous** (they wrap the async funnel) and **never raise for platform
failures** — a broken/missing/slow platform becomes a `ConnectorStatus`, and the snapshot
carries whatever succeeded. They DO raise on programmer error (bad arguments).

## 2. `UnifiedFact` — one platform × entity × day row

Field names are **exactly** the ai-layer `CampaignDayFact` metric titles. Every numeric is a
**non-null float** — a default-constructed fact survives `int(f.reach)` / `f"{f.cpc:.2f}"`
formatting (the brain is not None-safe; this is guaranteed by test).

| group | fields |
|---|---|
| identity | `platform` (`"meta"｜"shopify"｜"google"`), `account_id`, `entity_id`, `entity_name`, `date` (ISO) |
| delivery | `spend`, `impressions`, `reach`, `frequency` |
| all-clicks | `clicks`, `ctr`, `cpc` |
| link-clicks | `link_clicks`, `link_ctr`, `cost_per_link_click` |
| efficiency | `cpm` |
| funnel | `add_to_cart`, `checkout`, `conversions`, `revenue` |
| derived (stored) | `roas`, `cpa` |
| residue | `platform_extra: dict` — currency transport + platform-unique keys only. Do not build logic on it except `platform_extra.get("currency")`. |

**The 0.0 rule.** `0.0` means *either* "measured zero" *or* "this platform doesn't measure
this metric". Disambiguate with the capability sets — never by guessing:

```python
if measures(f.platform, "reach"):   # False for shopify/google → render N/A, not 0
    ...
```

| set | contents |
|---|---|
| `META_METRICS` | all 17 metric fields |
| `GOOGLE_METRICS` | 13 — everything except `reach`, `frequency`, `add_to_cart`, `checkout` |
| `SHOPIFY_METRICS` | `{"revenue", "conversions"}` (conversions = orders) |

Sets are **semantic**: a derived metric (e.g. Google `ctr` computed from clicks/impressions)
counts as measured. For Google, `link_clicks ≈ clicks` (no separate link-click concept).

**Adapter mapping → `CampaignDayFact`** (the #27 seam; all metric titles already match):

| UnifiedFact | CampaignDayFact |
|---|---|
| `entity_id` | `campaign_id` |
| `entity_name` | `campaign_name` |
| `conversions` | `purchases` |
| everything else | same name, already `float` |

## 3. `UnifiedSnapshot`, `Blended`, `ConnectorStatus`

```
UnifiedSnapshot  brand_id, since, until, currency, facts[], blended, assets[], statuses[]
                 .ok_platforms → list[str]   .status_for("meta") → ConnectorStatus | None
Blended          spend (Meta+Google), revenue_meta_pixel, revenue_shopify (truth side),
                 blended_roas (truth revenue / ad spend), revenue_gap_pct,
                 currency, currency_mismatch
ConnectorStatus  platform, state("ok"|"degraded"|"skipped"|"failed"), detail,
                 fact_count, asset_count, elapsed_ms, currency
```

**Partial by design — always check `statuses` before interpreting numbers.** A `skipped`
(no creds) or `failed` Google means `blended.spend` under-counts and `blended_roas` is
inflated; surface that, don't present the number as complete. `degraded` = hard timeout hit;
partial-to-zero facts.

**Currency rules (live-validated):**
- Facts stay in their **native account currency** (`platform_extra["currency"]`, also on
  `ConnectorStatus.currency`). Nothing silently assumes USD.
- All contributing platforms agree → `blended.currency` = that currency,
  `snapshot.currency` same, `currency_mismatch=False`.
- They disagree and no FX is provided → figures are summed raw, `currency="MIXED"`,
  **`currency_mismatch=True` — do not show a MIXED blended ROAS to a founder.**
- FX seam: pass `rate_provider` (any object with `.rate(base, quote) -> float`; see
  `connectors.fx.RateProvider`) + `target_currency` to `get_snapshot` — conversion applies
  to the blended aggregate only; per-platform facts keep native currency. The planned
  provider (daily fetch → 24h Neon cache) lives caller-side in ai-layer; `CONNECTOR_FX_*`
  env knobs exist but are inert until then.

## 4. Assets & the storage seam

`AssetRecord`: `platform`, `entity_id`, `entity_name`, `kind("image"|"video")`,
`local_path`, `durable_ref`, `source_url`, `roas`, `stats: UnifiedFact | None`.

- **`local_path` is ephemeral** — a file under `CONNECTOR_ASSET_DIR` on the local disk of
  whatever ran the connector. Fine for the local demo; **gone on redeploy**. Do not persist
  `local_path` in Neon as if durable.
- **`durable_ref` is the stable identity** — Meta `image_hash` / `video_id`, Shopify product
  image URL. Persist THIS; re-resolve/download when needed (video `source_url` is
  time-limited — re-resolve via `/{video_id}?fields=source`).
- Durable object storage is the **ai-layer's concern** (Phase-1 deploy gate): copy
  `local_path` files into object storage keyed by `(platform, durable_ref)` and keep your own
  pointer. The connector will not grow a storage backend.
- Platform coverage today: Meta = winning ad creatives (image + video), Shopify = top-product
  images (recent-window scan, hard page cap), **Google = `[]`** (documented follow-up).

## 5. Brand identity

`BrandRef` is the connector-side identity — `brand_id` + per-platform account ids
(`meta_account_id`, `shopify_domain`, `google_customer_id`); any id left `None` falls back to
the single-tenant `.env` value. The ai-layer owns the richer brand config (JSON in Neon) and
maps it down to a `BrandRef` at the call site.

Per-brand override support (live-validated):

| platform | `BrandRef` override | notes |
|---|---|---|
| Meta | ✅ retargets the query | one token can read many `act_...` ids |
| Google | ✅ retargets the query | one refresh token can read every account the OAuth user accesses directly |
| Shopify | ⚠️ **credential-bound** | the token IS per-store; `shopify_domain` alone cannot retarget. Multi-store needs the per-brand CredentialProvider (planned, I10) |

## 6. Operational guarantees & live-validated caveats

- **Fault isolation:** connectors run concurrently, each with its own rate limiter
  (Shopify 2 req/s leaky-bucket-matched, Meta 5 req/s, backoff on 429/5xx), a hard
  per-connector deadline, and exception capture. No platform is load-bearing.
- **Deadline is 120s** (`CONNECTOR_TIMEOUT_S`) — sized to reality: a 141-campaign Meta
  account takes ~77s for 30d daily insights. Call `get_snapshot` off your request path or
  with a generous HTTP timeout; treat it as an ingest job, not a live query.
- **Read-only by construction:** Google path calls only `GoogleAdsService.search_stream`
  (SELECT GAQL); Meta/Shopify are GET-only. Nothing can mutate a campaign.
- **Google auth model:** direct user access; leave `GOOGLE_ADS_LOGIN_CUSTOMER_ID` unset
  unless genuinely routing through a manager that owns the account. A consent screen in
  *Testing* status expires refresh tokens in 7 days.
- **Meta token:** use a Business-Manager **System User** token (`ads_read`) — personal user
  tokens get invalidated by Facebook security events (observed live).
- Env vars: see `.env.example`. Missing platform vars → `skipped`, and adding them
  auto-activates with zero code change. Prod = Railway service variables.

## 7. Verify your wiring

```bash
cd apps/connectors && python -m pytest tests -q     # 47 tests, no network, $0
```

`funnel.run(..., _connectors=[...])` accepts injected fakes (see `tests/conftest.py`) — use
that pattern to test your adapter/route without credentials.

---
*v1.0 — 2026-07-02, branch tip `571ee62`. Changes to §1–§5 require a version bump here.*
