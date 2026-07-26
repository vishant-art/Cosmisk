# Tech debt — converge creative sourcing onto the connectors facade (2026-07-21)

**Status:** 🔵 ACTIVE (deferred; out of demo scope). Logged from the env-split work.

## The debt

ai-layer has **two independent outbound stacks** to Meta/Shopify, built at different times and
never converged:

| Path | Client | Env names it reads | Consumers |
|---|---|---|---|
| **Analytics / chat** | `ai_layer/connector_source.py` → `from connectors import get_snapshot` | connectors' names: `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `META_AD_ACCOUNT_ID`, `GOOGLE_ADS_*` | `api.py` `/insights`, `/blended` |
| **Creative** | ai-layer's own `meta_live.py`, `shopify_products.py`, `meta_creatives.py` (+ fal providers) | ai-layer's direct names: `SHOPIFY_STORE`, `SHOPIFY_TOKEN`, `SHOPIFY_API_VERSION`, `META_AD_ACCOUNT` | `creative/service.py`, `pipeline.py`, `outcomes.py` |

The `connectors` package is the newer **unified data funnel** (Meta/Shopify/Google → blended facts),
but it is wired **only into the analytics/RAG path**. The creative pipeline predates it and still
calls Meta (winner teardown, cohort ROAS) and Shopify (product sourcing) **directly**.

## Why it matters

- **Duplicated credentials + name drift.** The same Shopify store/token and the same Meta ad-account
  id must be set under **two** names (`SHOPIFY_STORE`≡`SHOPIFY_SHOP_DOMAIN`,
  `META_AD_ACCOUNT`≡`META_AD_ACCOUNT_ID`). The env-split step works around this by copying the value
  under both names — a workaround, not a fix.
- **Two code paths to maintain** for the same outbound concern (auth refresh, rate limits, retries,
  API-version bumps) — e.g. `shopify_products.py` pins `2026-07` while connectors pins `2024-10`.

## The fix (when it's worth it)

Route the creative pipeline's Meta/Shopify sourcing **through the connectors facade**
(`get_snapshot` / the connectors clients) instead of ai-layer's direct clients. Result: one outbound
stack, one credential set, the drift gone, one place for API-version/retry policy. fal (generation)
stays direct — connectors doesn't cover it.

**Scope:** code change in `ai_layer/creative/*` + `meta_live.py`/`shopify_products.py` retirement;
needs a live run to validate parity of the creative grounding. **Not** a demo blocker — the
duplicate-name workaround keeps both paths working today.

## Related

- Env split: `apps/ai-layer/.env` is the single superset for the merged Railway-B service (ai-layer +
  connectors in one process). `apps/connectors/.env` was removed as redundant; `.env.example` kept as
  the package-boundary doc.
