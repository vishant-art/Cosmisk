# AI Layer — File 2: Live Meta Probe

> Design doc for `rnd/meta_live.py`. Status: **experiment (rnd)**. Future home: `apps/ai-layer` ingestion.
> Kept in sync with the code. Last updated: 2026-06-11.

## Purpose

Answer the planning question **"how / in what shape do we actually receive Meta
Ads data?"** by hitting the real Graph API with our token and printing what comes
back: the visible ad accounts, a real Insights pull, the raw JSON of one row, the
field + `action_type` inventory, and the flattened table the rest of the layer
will consume.

## What it does

1. Loads `META_ACCESS_TOKEN` from the repo-root `.env`.
2. `GET /me` — whose token this is.
3. `GET /me/adaccounts` — every ad account the token can see (id, name, currency,
   status). No account id needs to be hardcoded; it is discovered.
4. `GET /act_<id>/insights` — level=campaign, daily (`time_increment=1`), a
   representative field set, `date_preset=last_7d` by default.
5. Prints: raw first row, fields present, `action_types` seen in
   `actions`/`action_values`, then the flattened frame from `meta_common.py`.

## Established facts about Meta data (from research, baked into the design)

- **Format:** JSON over HTTPS via the Graph API. **No CSV/Excel, no stream.**
  Strictly request/response **polling**. No webhook exists for performance metrics.
- **Sync vs async:** small pulls are a synchronous GET; large pulls (big date
  ranges, many breakdowns) require the **asynchronous report_run job** (POST ->
  poll `report_run_id` -> fetch). This probe uses the sync path (small `limit`).
- **Shape gotcha:** revenue/conversions are **not flat fields** — they are nested
  arrays (`actions`, `action_values`, `purchase_roas`) keyed by `action_type`
  (e.g. `offsite_conversion.fb_pixel_purchase`). Must be exploded before use.
  This is exactly what `meta_common.explode_row` does.
- **Freshness:** data is **not final** on day 0; metrics restate for hours-to-days
  as attribution windows close. Real ingestion must re-pull a **trailing 7-28 day
  window** and UPSERT, never append-once.
- **Auth/limits:** needs `ads_read`; prefer a non-expiring **System User token**
  for unattended sync. Watch the `x-fb-ads-insights-throttle` header and back off.
- **2026 changes:** `7d_view`/`28d_view` attribution windows removed (Jan 2026);
  tiered retention (~37mo totals, 13mo unique/hourly, 6mo frequency).

## Config

- `GRAPH_API_VERSION = "v23.0"` (constant at top of file). Bump when Meta
  deprecates; v19 deprecates May 2026, v20 Sep 2026.
- Flags: `--account`, `--preset`, `--level {account,campaign,adset,ad}`, `--rows`.

## Run

```
python meta_live.py
python meta_live.py --preset last_30d --level ad
```

Read-only GET requests; safe to run. If the token is app-only / lacks `ads_read`,
expect a Meta error (printed with type/code/fbtrace_id) rather than a crash.

## Live run findings (2026-06-11)

First real run against the token in `.env` (read-only):

- **Token:** belongs to "Vishant Jain"; it is an **agency token with 47 ad
  accounts** visible (Smashed Agency book: Pratap sons, Adore By Priyanka, SkinQ,
  BNW, Salt Attire, etc., across INR/USD/AED/NZD). So account selection is real:
  the layer must let the operator pick which `act_<id>` to analyse.
- **Real `actions` arrays are far messier than the mock.** A single Pratap-sons
  campaign row returned **~50 action_types** in `actions` (and ~23 in
  `action_values`): `purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`,
  `onsite_web_purchase`, `web_in_store_purchase`, plus add_to_cart / view_content /
  initiate_checkout each in pixel + omni + onsite_web variants, messaging events,
  post engagement, etc. The same logical event appears under 3-4 keys.
- **The parser held up.** `meta_common`'s first-match-wins priority
  (`fb_pixel_purchase` -> `omni_purchase` -> `purchase`) correctly picked one
  purchase/revenue value per row without double-counting (e.g. a campaign flattened
  to spend ₹20,755 -> 18 purchases, ₹76,649 revenue, 3.69x ROAS). This validates
  the explode-arrays design against real data.
- **Field availability:** at `level=campaign`, `adset_name`/`ad_name` come back
  empty (expected); `ctr`/`cpc`/`cpm`/`purchase_roas` are present. Several
  campaigns had `spend=0` (no delivery in window) -> ROAS 0, handled gracefully.

Implication: the mock is intentionally simplified (4 clean action_types). It's
fine for brain/chat experiments, but the production normalizer must expect the
full messy action_type zoo and pick a single canonical purchase/revenue per the
priority list. Consider enriching the mock with a few extra noise action_types if
we want to test the disambiguation explicitly.

## Open questions / next

- Confirm the token type (user vs system-user) and `ads_read` scope; it currently
  works for reads across 47 accounts. Lock the production field list from a real row.
- Add the async report_run path for large historical backfills.
- Decide the production sync cadence + trailing-window size per the freshness note.
- Decide canonical purchase action_type policy (pixel vs omni vs onsite_web) with
  the team — they can disagree by 2-3x on the same campaign.

## Integration / TS retirement

Becomes the basis for the `apps/ai-layer` Meta ingestion. The existing
`meta-api.ts` stays until this path is validated and wired.
