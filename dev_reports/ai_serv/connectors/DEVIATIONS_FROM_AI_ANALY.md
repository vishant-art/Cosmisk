# Deviations from the ai_analy plan — Connector ↔ AI-layer handover

**For:** the AI engineer who owns `apps/ai-layer` (brain/chat/store).
**From:** connector redesign (fact-shape), 2026-07-01.
**Why this doc:** the connectors (`apps/connectors`, branch `feat/data-connectors`) were built
*after* the ai_analy AI layer and deviate from what the ai_analy code/plan assumes. This is the
running list of those deviations so you can adapt the brain side. **It stays until each item is
resolved.** Design rationale: `docs/superpowers/specs/2026-07-01-connector-fact-shape-redesign-design.md`.

---

## A. The headline deviation: `UnifiedFact` ≠ `CampaignDayFact`

The ai_analy layer's L1 contract is `CampaignDayFact` (20 fields, all consumed by brain/chat/api).
The connector emits `UnifiedFact`. The **original** connector `UnifiedFact` dropped 4 of your
fields and demoted 8 to an untyped `platform_extra` dict — this would degrade brain/chat.

**Redesign (Approach A, approved):** `UnifiedFact` becomes a flat superset that **preserves your
`CampaignDayFact` titles** for all Meta-origin fields and adds the cross-platform equivalents.
After this change, a Meta `UnifiedFact` carries the same 20 named fields you already read.

### Field-by-field status (Meta path)

| Field | ai_analy `CampaignDayFact` | original connector | after redesign |
|---|---|---|---|
| spend, impressions, clicks, revenue | top-level | top-level | top-level ✓ |
| conversions/purchases | `purchases` | `conversions` | `conversions` (see OQ2) |
| reach, frequency, link_clicks, cpm, add_to_cart, checkout, roas, cpa | top-level | **platform_extra** | **top-level ✓** |
| ctr, cpc, link_ctr, cost_per_link_click | top-level | **DROPPED** | **top-level ✓** |

### What you must know to consume it
- **Non-null contract preserved:** every numeric field defaults to `0.0`/`0`, never `None`
  (your `chat.build_context` formatting at `chat.py:214-216` would `TypeError` on `None`). Honored.
- **`platform_extra` now holds only true residue** (platform-unique metrics with no cross-platform
  meaning), not your standard metrics.
- **Naming:** `conversions` is the cross-platform field (Meta purchases / Shopify orders / Google
  conversions). Your brain reads `purchases` — you will need a one-line alias (see OQ2).

## B. Cross-platform semantics you should expect

- Fields a platform does not measure are **`0.0`, not absent** (e.g. `reach`/`frequency` for
  Google/Shopify; all ad metrics for Shopify). Do **not** treat these `0.0`s as real zeros in
  cross-platform aggregates — consult the applicability flag (OQ1).
- `revenue` from Shopify is the **truth** side of blended ROAS; `revenue` from Meta is pixel-
  attributed. `Blended` already reconciles these (`revenue_gap_pct`).
- Google starts `skipped` (needs developer-token approval) and auto-activates when creds land —
  its rows simply won't be present until then.

## C. Integration shape (not a replacement)

The connector feeds an **additive** cross-channel surface; it does **not** replace your
`CampaignDayFact` / `store` Meta path. Keep your existing Meta brain path. Consume `UnifiedSnapshot`
(`get_snapshot`) and `get_assets` for the new blended-ROAS + cross-channel + winning-creative
features. The two Meta paths run in parallel for now (duplication tracked in OPEN_ISSUES).

---

## Open Questions (each: 2 options · trade-offs · suggestion)

> Standing convention: every open question is presented as two options with trade-offs and a
> recommended choice with reasoning.

### OQ1 — Applicability flag (how to mark "0.0 = not measured") — **DECIDE WITH AI ENGINEER**
Because values must stay numeric (B above), `0.0` is ambiguous. Two ways to flag N/A:

- **Option 1 — Static per-platform capability sets.** Module-level constants
  (`META_METRICS`, `GOOGLE_METRICS`, `SHOPIFY_METRICS`) listing which fields each platform actually
  measures; consumers check membership before cross-platform aggregation.
  - *Pro:* declarative, zero per-row cost, one place to maintain, platform-static (which is the
    reality). *Con:* the flag lives beside the data, not on the row; a consumer must import the map.
- **Option 2 — Per-fact `na_fields: list[str]`.** Each `UnifiedFact` carries the fields that are
  N/A for it.
  - *Pro:* self-contained per row, travels with serialized snapshots. *Con:* bloats every row with
    static, platform-derivable data; easy to drift from reality per-row.

- **Suggestion: Option 1 (static capability sets).** Reasoning: applicability is a property of the
  *platform*, not the *row*, so encoding it per-row is redundant and bloats payloads; a single
  declarative map is cheaper and harder to get inconsistent. **Confirm before implementation.**

### OQ2 — `conversions` vs `purchases` field name
Your brain reads `purchases`; the connector core calls it `conversions`.

- **Option 1 — Keep `conversions`; you add a one-line alias** (`purchases = fact.conversions`) in
  the adapter that feeds the brain.
  - *Pro:* cross-platform-correct name (Google conversions / Shopify orders aren't "purchases").
    *Con:* one adapter line on your side.
- **Option 2 — Rename the field to `purchases`** in `UnifiedFact`.
  - *Pro:* zero brain change. *Con:* misleading on Google/Shopify rows; leaks a Meta-ism into the
    cross-platform contract.

- **Suggestion: Option 1.** Reasoning: the unified contract should be semantically honest across
  platforms; the alias is trivial and lives at the seam where the mapping belongs.

### OQ3 — Derived fields: stored vs computed-on-read
`ctr, cpc, link_ctr, cost_per_link_click, cpm, roas, cpa` are derivable from raw fields.

- **Option 1 — Store them** (as `CampaignDayFact` does).
  - *Pro:* brain/chat read them directly, no recompute, exact parity with your current contract,
    preserves source-provided values (Meta's `cpc`/`ctr` can differ subtly from naive division).
    *Con:* denormalized; must keep derivation consistent in the normalizer.
- **Option 2 — Compute on read** (store only raw, derive in a helper/property).
  - *Pro:* single source of truth, smaller payload. *Con:* every consumer must call the helper;
    diverges from `CampaignDayFact`; loses platform-reported nuances.

- **Suggestion: Option 1 (store).** Reasoning: parity with `CampaignDayFact` keeps the brain
  unchanged and preserves platform-reported metrics; the redesign's whole point is first-class
  titles, and derived metrics are titles the brain already reads.

### OQ4 — Dedup `CampaignDayFact` (×2 identical: `apps/ai-layer` + `rnd/src`, +1 connector variant)
- **Option 1 — Defer** (log only; do it in Approach C when `UnifiedFact` could become canonical).
  - *Pro:* zero risk/scope-creep now; copies are byte-identical so nothing is broken. *Con:* a
    future Meta-field change touches multiple files.
- **Option 2 — Dedup now** into a shared importable module.
  - *Pro:* single source of truth. *Con:* must bridge `sys.path` scripts vs installed package,
    couples rnd-experimental ↔ ai-layer-prod, touches the creative pipeline import path
    (`rnd/creative/src/campaign_select.py`); wide blast radius for no demo benefit.

- **Suggestion: Option 1 (defer).** Reasoning: orthogonal to the fact-shape work and high-blast for
  zero immediate value; the right moment is Approach C, where the unified type subsumes both.
  Tracked in OPEN_ISSUES.
