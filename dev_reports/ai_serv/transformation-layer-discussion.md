# Discussion: do we need a transformation layer on Meta Ads data?

> Discussion only, no code. Prompted 2026-06-11 after running the experiments on
> real data. Status: decision needed from the team.

## Short answer

**Yes — and the real-data run proves it.** We already had the seed of one and
have since **formalized L1** as `meta_transform` (typed contract; see
transformation-module-contract.md). It is the single source of truth all consumers
(brain, chat, EDA charts, and the eventual `apps/ai-layer` that replaces the TS)
read from. Nobody downstream touches raw Meta JSON.

## The evidence (from the live pull, not theory)

One 30-day Pratap-sons pull surfaced every reason a transformation layer exists:

1. **The same sale under 5+ keys with different values.** `actions` had **67
   action_types**; a purchase appears as `offsite_conversion.fb_pixel_purchase`,
   `omni_purchase`, `onsite_web_purchase`, `onsite_conversion.purchase`,
   `web_in_store_purchase`, `purchase`, etc. Revenue in `action_values` likewise.
   Pick the wrong key (or sum them) and ROAS is off by 2-3x. This *demands* a
   single, documented canonical-selection rule, computed in one place.
2. **Everything is a string, some are missing/null.** `spend:"0"`, empty strings,
   absent fields. Needs uniform coercion or every consumer re-handles it.
3. **Conversions/revenue are nested arrays**, not columns. Must be exploded into a
   flat, typed shape before any chart, statement, or LLM snapshot can use them.
4. **Multi-currency, multi-account.** The token sees **47 accounts** across INR /
   USD / AED / NZD. Any cross-account or blended number needs currency
   normalization to a base unit. (Google adds `cost_micros`; Shopify adds its own.)
5. **A long tail of junk for analysis.** 84 campaigns, many `spend=0` / paused /
   engagement-objective with zero purchase intent. Raw, they poison aggregates and
   "best/worst" logic (we saw 199x noise). Needs materiality / quality flags.
6. **Metrics restate after the fact.** Day-0 numbers aren't final; attribution
   windows close over ~7 days. Ingestion must re-pull a trailing window and
   **upsert on (date, object_id)** — a transformation/ingestion concern, not a
   consumer concern.

## Two distinct layers (don't conflate them)

**L1 — Single-source cleaning / normalization (REQUIRED now, partly built).**
Flatten rows, coerce types, **disambiguate the canonical purchase/revenue/ROAS**
via a documented priority, normalize currency, conform to a tidy grain
(`date × account × campaign [× adset × ad]`). `meta_transform` already does ~70% of
this for Meta. The job is to formalize it: a pure, deterministic, well-tested
module with a **typed output contract** (the "clean fact row") that brain, chat,
and EDA all import. We already have parser tests guarding it.

**L2 — Cross-source unification (NEEDED when Google + Shopify join).** Map Meta /
Google / Shopify into ONE conformed schema and compute the cross-platform truth
metric. Critical rule established earlier: **spend is additive across channels;
platform-reported revenue is NOT** (each platform claims the same order). Blended
ROAS / MER = Shopify actual revenue ÷ total spend. This is the "normalization
engine" from the project plan and is bigger than L1.

## Recommendation

1. [DONE] Promote into a named transformation module `meta_transform` (the L1 layer) with an
   **explicit, ratified canonical-action policy** and a typed contract. Everything
   downstream consumes the contract, never raw JSON. This prevents per-consumer
   drift and double-counting — the single highest-risk failure mode here.
2. Keep it **pure and deterministic** (no LLM), sitting between ingestion
   (`meta_live` / async report jobs) and consumers. Already unit-tested; keep it so.
3. Design L2 (the cross-source star schema + MER) when Google/Shopify ingestion is
   actually in scope; don't build it speculatively, but design the L1 contract so
   L2 can sit on top.

## The one decision the team must make (not an engineering call)

**Which purchase/revenue is "the" number?** pixel vs omni vs onsite_web vs (later)
Shopify-actual. They legitimately disagree by 2-3x on the same campaign. The
transformation layer *encodes* the choice, but the business must *ratify* it,
because it silently sets every ROAS in the product. Current experiment default:
`fb_pixel_purchase -> omni_purchase -> purchase` (first match wins).

## Bottom line

We don't just "need" a transformation layer — we already started one and the real
data shows it's load-bearing. Formalize L1 now (centralize + contract + ratified
canonical policy); design L2 when multi-source lands.
