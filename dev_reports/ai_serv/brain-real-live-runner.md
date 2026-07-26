# AI Layer — Live Brain Runner (`rnd/src/brain_real.py`)

> Design doc for the one-shot live runner: fetch from Meta + run the brain + render
> charts. Status: **experiment (rnd)**. Future home: `apps/ai-layer`.
> Last updated: 2026-06-11.

## Purpose

A convenience entry point that does the whole loop in one command: pull a fresh
Insights export for one ad account, normalize it through the L1 transform, print
the deterministic brain's statements, CLEAR the plots dir, and render fresh EDA
charts. It glues together the three existing modules rather than duplicating them.

```
meta_live (fetch)  ->  meta_transform (normalize)  ->  brain (statements + plots)
```

## Why it exists

Before this, getting brain output on live data took two manual steps (`meta_live
--save ...` then `brain --data ...`), and stale charts from a previous run lingered
in `plots/`. `brain_real.py` collapses that into one call and guarantees the charts
match the current pull.

## Code structure (pure reuse)

It imports the other `src/` modules and calls their public functions — no logic is
copied:

| Borrowed from | What it uses |
|---|---|
| `meta_live` | `fetch_envelope()` (account discovery + paginated insights + fields/attribution, shared with chat.py), `GRAPH_API_VERSION` |
| `meta_transform` | `normalize(envelope) -> Dataset` (L1 typed contract) |
| `brain` | `statements(df, currency)`, `make_plots(df, outdir, currency)` |

Its only own code: `clear_dir()` and the `main()` orchestration (env load, arg
parse, optional `--save`). The fetch logic is no longer duplicated here — it lives
in `meta_live.fetch_envelope` and is shared with `chat.py`.

## Flow (what `main()` does)

1. **Load creds** — `META_ACCESS_TOKEN` from the repo-root `.env`.
2. **Fetch** — `meta_live.fetch_envelope()` does account discovery (`--account` or
   first), paginated insights with the correct `FIELDS` + attribution windows, and
   returns a `{meta, data}` envelope (date_range derived from the rows).
3. **(optional) `--save PATH`** — write the raw envelope (reuse with `brain.py`/`chat.py`).
4. **Normalize** — `mt.normalize(envelope).to_dataframe()`.
5. **Statements** — print `brain.statements(df, currency)`.
6. **Clear + render** — `clear_dir(outdir)` deletes existing files in `plots/`, then
   `brain.make_plots()` writes the 6 fresh charts (skipped with `--no-plots`).

## CLI

```
python brain_real.py                                   # first account, last_30d, + plots
python brain_real.py --account act_1738503939658460 --preset last_30d
python brain_real.py --level ad --preset last_14d
python brain_real.py --no-plots                        # statements only
python brain_real.py --save ../data/_real_sample.json  # also persist the pull
```

| Flag | Default | Meaning |
|---|---|---|
| `--account` | first on token | `act_<id>` to analyse |
| `--preset` | `last_30d` | Meta `date_preset` |
| `--level` | `campaign` | account / campaign / adset / ad |
| `--max-rows` | 5000 | pagination cap |
| `--no-plots` | off | skip chart rendering |
| `--outdir` | `rnd/plots` | chart output dir (cleared first) |
| `--save` | — | write the raw `{meta,data}` envelope JSON |

## Output shape

**1. stdout — statements.** `brain.statements()` returns `list[tuple[tag, sentence]]`,
printed one per line as `- [tag] sentence`. Tags (each may appear 0+ times):

`Overview` · `Trend` · `Best campaign` · `Worst campaign` · `Wasted spend` ·
`Budget concentration` · `WARN fatigue` (≤3) · `UP scaling` (≤3) · `Bad day`.

All deterministic (computed from numbers, no LLM), materiality-gated (see
brain-deterministic-statements.md).

**2. plots/ — 6 PNG charts** (overwritten each run, dir cleared first):

```
01_spend_vs_revenue.png   daily spend vs revenue (lines)
02_blended_roas.png       daily blended ROAS (line, 1.0 ref)
03_spend_by_campaign.png  spend by campaign (barh)
04_roas_by_campaign.png   ROAS by campaign (barh, red <2x)
05_spend_share.png        spend share (pie)
06_funnel.png             link clicks -> ATC -> checkout -> purchases (bar)
```

**3. The data contract.** Everything is computed from `meta_transform.Dataset` ->
`CampaignDayFact` rows (one per campaign × day): spend, impressions, reach,
frequency, clicks/ctr/cpc (all-clicks), **link_clicks/link_ctr/cost_per_link_click**
(headline), cpm, add_to_cart, checkout, purchases, revenue, **roas (derived)**, cpa.
Field rationale: meta-field-choices.md.

## Example run (Pratap sons, last_30d, 2026-06-11)

1,176 rows / 3 pages / 84 campaigns. Brain emitted: Overview (₹49.79L spend →
₹1.84Cr, 3.69x, 4,106 purchases), Trend (revenue −32.4%, ROAS 4.50x → 2.87x),
Best (`DSG_TOF_CATALOG_IND_CBO_5/15/26` 5.06x), Worst (`DSG_OPEN_REELS_NEW_IND_3/24/26`
2.34x), Budget concentration (that Reels campaign = 10% of spend), one UP scaling,
one Bad day (05-24). Cleared 6 old charts, wrote 6 fresh. Funnel: 665k link clicks →
43.8k ATC (6.6%) → 11.5k checkout → 4,106 purchases (~91% of ATC never buy).

## Caveats (carry into any analysis)

- **Live read-only** GET against Meta with the token; no writes. Spends no LLM tokens.
- **Attribution immaturity:** the last ~7 days' ROAS is understated (conversions
  still landing); a "decline" trend partly reflects this, not just real cooling.
- **Meta-attributed pixel revenue over-counts** vs Shopify actual (L2 / blended-ROAS
  reconciliation is separate).
- Output is for one account per run; the token here sees 47, so pass `--account`.

## Integration / TS retirement

A throwaway convenience for the rnd loop. When the pipeline moves to `apps/ai-layer`,
the same three stages (ingest → transform → analyze) become wired services; this
script is the manual stand-in until then. No TS is removed yet.
