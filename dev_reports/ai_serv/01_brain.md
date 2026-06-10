# AI Layer — File 1: Deterministic Brain

> Design doc for `rnd/brain.py`. Status: **experiment (rnd)**. Future home: `apps/ai-layer`.
> Kept in sync with the code. Last updated: 2026-06-11.

## Purpose

Turn a Meta Ads Insights pull into **declarative, plain-English statements** about
what the numbers say ("Revenue fell -18% from the first 10 days to the last 10
days; blended ROAS moved 3.1x -> 2.4x"). This is the "brain" layer from the
project plan: the natural-language interpretation of the data, distinct from the
EDA/charts view.

## Key decision: deterministic, not LLM

Every sentence is **computed from the numbers and filled into a template**. There
is no model call, so the brain **cannot hallucinate a figure**. This matches the
reliability requirement raised in planning (the "FinBERT instinct"): for stating
financial numbers, deterministic beats a generative model.

Note on FinBERT specifically: it is a sentiment *classifier* for financial text,
not a number-to-narrative generator, so it does not fit this job. Templating over
computed deltas is the right tool — more reliable, zero inference cost.

## Inputs / outputs

- **Input:** a Meta insights JSON file (mock or live-exported), via `--data`.
  Parsed by `meta_common.py` (explodes the nested `actions`/`action_values`
  arrays into flat columns).
- **Output (stdout):** tagged statements — Overview, Trend, Best/Worst campaign,
  Budget concentration, per-campaign Fatigue/Scaling flags, Bad day.
- **Output (`--plots`):** six EDA charts written to `rnd/plots/`.

## Statement logic (all deterministic)

| Tag | How it's computed |
|---|---|
| Overview | sum spend, sum revenue, blended ROAS = rev/spend, sum purchases |
| Trend | first-third vs last-third of daily totals; % change + ROAS shift |
| Best/Worst campaign | argmax/argmin ROAS in campaign summary |
| Budget concentration | top campaign's spend share of total |
| Fatigue | campaign ROAS down >20% (first vs last third) AND frequency rising |
| Scaling | campaign ROAS up >20% (first vs last third) |
| Bad day | largest negative deviation of daily ROAS from its trailing 7-day mean |

## Charts (`--plots`)

1. daily spend vs revenue, 2. daily blended ROAS, 3. spend by campaign,
4. ROAS by campaign (red < 2x), 5. spend share pie, 6. conversion funnel
(link clicks -> ATC -> checkout -> purchases). Rendered headless (matplotlib Agg).

This is the "EDA in a wide variety of plot types" deliverable, run as static PNGs
for the experiment. In the product these become the locked-UI chart payloads.

## Run

```
python brain.py                 # mock_meta_ads.json
python brain.py --plots         # also write charts to ./plots
python brain.py --data x.json
```

## Open questions / next

- Thresholds (20% fatigue/scaling, 7-day window) are hardcoded constants; should
  become config once we see real-data distributions.
- Add margin-aware ROAS and OOS/leakage flags once Shopify data is in scope.
- Integration target: emit the statements as a structured JSON contract (matching
  `@cosmisk/types` `AiInsight`) rather than printing prose, so the locked UI can
  render them.

## Validation (2026-06-11)

Runs on `mock_meta_ads.json`. Correctly produced all statement types and, from
the seeded narratives, flagged fatigue on "Prospecting -- Summer Sale" (ROAS
3.86x -> 2.25x as frequency climbed 2.0 -> 4.0) and scaling on "UGC -- Reels
Push" (3.38x -> 4.83x). `--plots` rendered all 6 charts to `rnd/plots/`. One fix
applied: force UTF-8 stdout (Windows cp1252 console choked on `₹`).

## Integration / TS retirement

Replaces the LLM-based `morning-briefing.ts` number-narration once validated.
Do **not** remove the TS yet — only after this is wired into `apps/ai-layer`.
