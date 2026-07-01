# Data Connectors — Decision Pack

Everything needed to decide how to build the Meta + Google Ads + Shopify data connector that
feeds the Python AI layer (data + media assets → blended ROAS / cross-platform analysis).
Self-contained; share this whole directory.

Branch: `feat/data-connectors` · Date: 2026-06-26

## Read in this order

1. **[data-connector-architecture-decision.md](./data-connector-architecture-decision.md)**
   — Ground truth (what exists today) + the **reuse-based** options (Native PY / Bridge /
   **Hybrid**). Recommends Hybrid, names the one case where full-Native wins. *Start here.*

2. **[data-connector-design.md](./data-connector-design.md)**
   — The **fan-in design**: three independent connector modules → single aggregator/funnel →
   common routes. Python-vs-TS tradeoff (real-life performance + security) and the
   **performance bottlenecks** of the fan-in shape, with mitigations.

3. **[data-connector-greenfield-analysis.md](./data-connector-greenfield-analysis.md)**
   — The **merit-only** counterweight: if we ignore sunk cost, what's optimal (Python
   end-to-end), what it costs (~1.5–2.5 months), and what really constrains it (Google
   token-approval calendar, attribution correctness).

4. **[RUN_AND_TEST.md](./RUN_AND_TEST.md)**
   — How to run the whole platform locally, test as a user/admin, exercise the connector, and
   run the `ai_analy` creative system (image/video/audio) with a **cost ladder to stay ≤ $2**.

Built connector usage doc: **[apps/connectors/README.md](../../../apps/connectors/README.md)**.

## Built implementation

The connector is implemented (native Python, isolated) at **`apps/connectors/`** — see its
[`README.md`](../../../apps/connectors/README.md) for the usage/design doc (facade, `.env` keys,
contract, deploy). 24 offline tests, $0. Plan: `.claude/plans/cosmic-humming-wave.md`.

## The decision in one line

- **Lowest risk / weeks:** Hybrid — TS keeps ingestion + credentials, Python owns
  merge/blend + asset download.
- **Cohesion / ~2 months:** Greenfield Python end-to-end, modular monolith.
- **Either way:** the fan-in design applies; only the connectors' language changes.

## Key verified facts (so the debate stays grounded)

- Today: Python has **Meta only**; TS `apps/api/src/audit/` has all three (Meta v21, Shopify
  2024-01, Google v18) with OAuth refresh.
- Credentials already centralized in **Neon Postgres** (`meta_tokens`/`google_tokens`/
  `shopify_tokens`, AES-256-GCM) → "secrets duplication" is not a real differentiator.
- TS persists **only analysis**, not raw per-day facts.
- The TS audit fans out the 3 platforms **serially** today; rate-limit handling is near-absent
  (only Shopify waits 1s).
- `meta_live`/`meta_transform` are **duplicated** in `rnd/src` and `apps/ai-layer` → de-dup
  first, regardless of option.
