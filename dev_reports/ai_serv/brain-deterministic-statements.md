# AI Layer — Deterministic Brain (`rnd/src/brain.py`)

> Design doc for `rnd/src/brain.py`. Status: **experiment (rnd)**. Future home: `apps/ai-layer`.
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
  Loaded through the L1 transform (`meta_transform.load` -> typed `Dataset`),
  which explodes the nested arrays and picks the canonical purchase/revenue.
- **Output (stdout):** tagged statements — Overview, Trend, Best/Worst campaign,
  Budget concentration, per-campaign Fatigue/Scaling flags, Bad day.
- **Output (`--plots`):** six EDA charts written to `rnd/plots/`.

## Statement logic (all deterministic)

| Tag | How it's computed |
|---|---|
| Overview | sum spend, sum revenue, blended ROAS = rev/spend, sum purchases |
| Trend | first-third vs last-third of daily totals; % change + ROAS shift |
| Best/Worst campaign | argmax/argmin ROAS among **material + reliable** campaigns (see gates below) |
| Wasted spend | material campaigns with ZERO attributed purchases |
| Budget concentration | top campaign's spend share of total |
| Fatigue | material campaign, ROAS down >=25% (first vs last third), frequency up >=10%, volume in first window |
| Scaling | material campaign, ROAS up >=25%, volume in BOTH windows |
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

## Materiality / reliability gates (added after the real-data run)

Real accounts have a long tail of tiny, paused, and engagement-objective
campaigns. Without gates the brain "discovers" pure noise. Constants (top of
`brain.py`):

- `MATERIAL_SPEND_PCT = 0.01` — a campaign must be >=1% of total spend to be
  considered for best/worst/fatigue/scaling.
- `MIN_PURCHASES_FOR_ROAS = 10` — ROAS is statistical noise below this (one sale
  on ₹100 reads as 50x), so best/worst only consider campaigns at this volume.
- `MIN_WINDOW_PURCHASES = 5` — per-window floor for trend, kills 1-sale "scaling".
- `FATIGUE_DROP = 0.25`, `SCALING_RISE = 0.25`, `FREQ_RISE = 1.10` — fatigue needs
  a real ROAS fall AND a real frequency climb; scaling needs volume in both windows.
- `MAX_FLAGS = 3` — cap fatigue/scaling lines so output stays scannable.
- New **"Wasted spend"** statement: material campaigns with ZERO attributed
  purchases (the literal money-leak / "Gap" signal).

`campaign_windows(df)` computes per-campaign first-third vs last-third stats once.

## Validation (2026-06-11)

**Mock:** all statement types correct; flagged fatigue on "Prospecting" (3.86x ->
2.25x, freq 2.0 -> 4.0) and scaling on "UGC" (3.38x -> 4.83x); 6 charts rendered.
**Real data** (`data/_real_sample.json`, 84 campaigns, 1,176 rows): before gates it
emitted garbage (best "16.71x" on ₹23K; scaling "+5233.9% -> 199.44x" from a
1-sale campaign; "-100%" fatigue on flat frequency). After gates: best = 5.06x on
220 purchases, one legitimate scaling flag, no noise; account-level Overview/Trend
("revenue -32.4%, ROAS 4.50x -> 2.87x") were solid throughout. Mock regression
re-checked and unchanged. Fix applied earlier: UTF-8 stdout for the `₹` glyph.

## Integration / TS retirement

Replaces the LLM-based `morning-briefing.ts` number-narration once validated.
Do **not** remove the TS yet — only after this is wired into `apps/ai-layer`.
