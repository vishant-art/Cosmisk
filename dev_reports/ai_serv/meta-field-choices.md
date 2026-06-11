# Meta Ads Insights — which fields we take, and why

> The authoritative field-interpretation doc for the AI layer. Researched against
> official Meta docs + the consensus of production connectors (Fivetran/dbt,
> Supermetrics, Funnel.io, Windsor.ai, Triple Whale). Implemented in
> `rnd/src/meta_transform.py`. Last updated: 2026-06-11.

## Why this doc exists

The Insights API returns ~70 scalar fields plus two nested arrays (`actions`,
`action_values`) with 60+ `action_type` keys. Several fields are easy to take
WRONG, and the same sale appears under many keys. Picking the wrong field silently
corrupts every downstream number. This pins the choices.

## The two bugs we found and fixed

1. **All-clicks instead of link-clicks.** We were reading `clicks` / `ctr` / `cpc`,
   which count ALL clicks (likes, comments, shares, page-clicks, media expands),
   not clicks to the site. On real Pratap-sons data that overstated clicks by
   ~4.5% (695,630 vs 665,562) and CTR 6.88% vs 6.58% — and it is much worse on
   high-engagement creative. **Fix:** take `inline_link_clicks` /
   `inline_link_click_ctr` / `cost_per_inline_link_click` as the headline traffic
   metrics; keep `clicks`/`ctr`/`cpc` only as labeled "all-clicks" secondary stats.
2. **Trusting the reported ROAS field.** `purchase_roas` now keys on `omni_purchase`
   (all channels) and `website_purchase_roas` is being deprecated. **Fix:** DERIVE
   ROAS = revenue / spend from our canonical revenue, so count, value, and ROAS
   always reconcile.

## Canonical field map (implemented)

| Concept | Field / action_type we take | Why (not the alternative) |
|---|---|---|
| Spend | `spend` | whole-currency units, in `account_currency` |
| Currency | `account_currency` | label/convert money |
| Impressions | `impressions` | exposure count |
| Reach | `reach` | unique people (NOT additive across days) |
| Frequency | `frequency` (= impressions/reach) | fatigue signal |
| **Link clicks** | **`inline_link_clicks`** | clicks to the destination, not all clicks. Fallback: `link_click` action |
| **Link CTR** | **`inline_link_click_ctr`** | Meta UI's default CTR; `ctr` is all-clicks/impressions (inflated) |
| **Cost / link click** | **`cost_per_inline_link_click`** | `cpc` divides by all clicks → understates |
| All clicks / CTR / CPC | `clicks` / `ctr` / `cpc` | kept, but secondary, clearly labeled "all" |
| CPM | `cpm` | cost per 1,000 impressions |
| **Purchases** | **`actions[offsite_conversion.fb_pixel_purchase]`** | "Website purchases" in Ads Manager. Fallback: `onsite_conversion.purchase` |
| **Revenue** | **`action_values[offsite_conversion.fb_pixel_purchase]`** | website purchase value, same basis as the count |
| **ROAS** | **DERIVED revenue / spend** | reported `purchase_roas` keys on omni; `website_purchase_roas` deprecating |
| Add to cart | `actions[offsite_conversion.fb_pixel_add_to_cart]` | pixel tier, consistent with purchase basis |
| Checkout | `actions[offsite_conversion.fb_pixel_initiate_checkout]` | pixel tier |
| CPA | DERIVED spend / purchases | consistent basis |

## The load-bearing choice: omni vs website pixel

The same purchase appears as `offsite_conversion.fb_pixel_purchase` (web pixel),
`onsite_conversion.purchase` (on-Meta shop), `omni_purchase`/`purchase` (the
all-channels rollup), `web_in_store_purchase` (offline), etc.

- **We use the website pixel purchase.** It audit-matches the Ads Manager
  "Website purchases" column and isolates exactly the channel a website D2C brand
  runs. For a web-only brand `omni_purchase` is *equal* in value (omni is a sum of
  disjoint channels, so it does NOT double-count), but it silently absorbs any
  stray on-Meta/app/offline sale and is not auditable — wrong abstraction.
- We **exclude** `omni_purchase`/`purchase` entirely; fall back only to
  `onsite_conversion.purchase`.
- This matches the connector consensus: Supermetrics/Funnel/Windsor surface the
  *website* purchase by default; Fivetran's vetted set is pixel + onsite (and it
  explicitly refuses omni for double-count safety).

**This is a business decision the team must ratify.** A multi-channel brand
(app + Shop + offline) would want the omni view; the policy lives in one place
(`PURCHASE_ACTION_TYPES` in `meta_transform.py`) so it is changed once.

## Attribution windows (2026-sensitive)

- Request `action_attribution_windows = ["1d_view","7d_click"]` (the default).
- **Never request `7d_view` / `28d_view`** — removed Jan 12 2026; they return
  EMPTY, not an error, silently dropping view-through conversions.
- `attribution_setting` (read-only in the response) reports the account default.
- Historical retention is capped (13 months for unique/hourly breakdowns), so
  bound any backfill.

## Known measurement caveat (out of scope for L1)

Meta-attributed pixel revenue OVER-counts vs Shopify actual (view-through +
cross-device + window crediting). The in-platform pixel field is correct for
*in-platform* optimization; true blended ROAS = Shopify revenue ÷ total spend is
an L2 concern (see transformation-layer-discussion.md).

## Sources

Official: [Ads Insights API](https://developers.facebook.com/docs/marketing-api/insights/),
[Ads Action Stats reference](https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/),
[Website purchase ROAS](https://www.facebook.com/business/help/1283504535023899),
[Link clicks vs inline vs outbound](https://developers.facebook.com/ads/blog/post/v2/2016/03/16/link-clicks-updates/),
[Currency / minor units](https://developers.facebook.com/docs/graph-api/reference/currency/).
Consensus: [Fivetran dbt_facebook_ads](https://github.com/fivetran/dbt_facebook_ads/blob/main/README.md),
[Funnel.io metrics](https://help.funnel.io/en/articles/1981284-facebook-ads-dimensions-and-metrics),
[Windsor.ai fields](https://windsor.ai/data-field/facebook/),
[Supermetrics fields](https://docs.supermetrics.com/docs/facebook-ads-fields),
[Triple Whale blended ROAS](https://triplewhale.readme.io/docs/blended-roas).
2026 changes: [attribution/retention restrictions](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/),
[7d_view/28d_view removal](https://www.dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026).

Prices/fields are version-sensitive; this reflects Graph API v23/v25 (2026).
