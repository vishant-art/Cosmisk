# Chat Intelligence Integration — Design

**Date:** 2026-07-30 · **Branch:** `new/creative_v2` · **Status:** approved (lemon, 2026-07-30)

Integrate the `rnd_mine/cli/chat` Meta Ads intelligence system into `apps/ai-layer` as the production chat: deterministic analysis brain, chunked+cached Meta fetching, 37-month historic tier, competitor pipeline, and the ad-level tool loop. The rnd system was validated across 4 capability-test iterations against the live Pratap sons account (`test_results_1..4.md`); this integration makes that system the one behind `POST /chat` and `python -m ai_layer.chat`.

---

## 0. Non-negotiable: port fidelity

**The integrated behavior must be exactly what is in `rnd_mine/cli/chat/`.** That code is the tested artifact. Every ported region must be diffable against its rnd original with only the sanctioned seams differing:

1. **Storage seam** — disk JSON/JSONL stores (`cache/`, `history/`, `competitors/`, `chat_ledger.jsonl`) become Neon tables via `ai_layer.db.repository`. The *logic* around them (what is cached, when it refetches, what a month rollup contains) is unchanged.
2. **Config seam** — the rnd `.env` walk-up dict loader (`find_root_env`/`load_env`) is replaced by `ai_layer.config` + direct env reads (creative-subpackage pattern). Same variable names.
3. **LLM transport seam** — rnd's raw-httpx SSE calls become the existing OpenAI-SDK-on-OpenRouter client (`OpenAI(api_key=..., base_url=...)`), with identical request parameters (model, temperature, reasoning effort, max_tokens, `stream_options={"include_usage": True}`, tools, tool_choice).
4. **Shell seam** — rnd's interactive no-flags CLI prompts are not ported; the existing `argparse` CLI in `ai_layer/chat.py` is kept and wired to the new context assembly + tool loop.
5. **Module paths** — imports change to `ai_layer.*` locations per the module map below.

Everything else — prompts, thresholds, window math, flag logic, dedupe keys, caps, error classification, pagination, chunk halving, staleness rules — is carried over **verbatim**. Where this spec deviates from rnd behavior, the deviation is listed in §9 and nowhere else.

**Verification of fidelity is a deliverable:** the implementation plan must include a step that diffs each ported logic region against its rnd source and confirms only sanctioned-seam differences remain.

## 1. Decisions already made

| Decision | Choice |
|---|---|
| Scope | Everything in one pass, competitor pipeline included (it already degrades gracefully without `APIFY_TOKEN`) |
| Persistent state | All Neon (`ai_layer` schema); no disk stores (Railway disk is ephemeral) |
| Layout | Upgrade the ancestor modules in place; new modules top-level; only competitor gets a subpackage |
| Fidelity | Exact rnd logic; seams only (§0) |

## 2. Model & config

- `ai_layer/chat.py` constants become the rnd-validated set: `MODEL = "openai/gpt-5.4-mini"`, `TEMPERATURE = 0.5`, `REASONING_EFFORT = "minimal"`, `MAX_TOKENS = 6000`, `MAX_CAMPAIGNS = None`, `FULL_DATA = True`, `STREAM = True`. (Replaces gemini-2.5-flash @ 1.5 / 1500 / no effort.)
- `cost_ledger.PRICING` gains the `openai/gpt-5.4-mini` entry, values copied verbatim from rnd `chat.py`'s `PRICING`. Estimate-fallback only; OpenRouter's authoritative `usage.cost` stays preferred.
- `ai_layer/config.py` gains `APIFY_TOKEN`. `.env.example` (ai-layer + root) documents it.
- Competitor modules read `SHOPIFY_STORE` / `SHOPIFY_TOKEN` / `SHOPIFY_API_VERSION` from env directly, matching the `creative/config.py` pattern.

## 3. Module map

| rnd source (`rnd_mine/cli/chat/`) | Target in `ai_layer/` | Mode |
|---|---|---|
| `chat.py` Meta-pull region (`MetaError`, classifiers, `meta_get`, `get_insights_paged`, `_insights_params`, `_date_windows`, `_fetch_window_adaptive`, `fetch_envelope`, `fetch_month_rows`, `FIELDS`, `GRAPH_API_VERSION`) | `meta_live.py` | merge-upgrade in place |
| `chat.py` transform region (`row_to_fact` video/ad extraction, action-type constants) | `meta_transform.py` | extend in place |
| `chat.py` chat core (`SYSTEM`, `build_context`, model constants, `run_tool_loop`, `_ensure_ad_level`, `_placement_breakdown`, `build_history_block`) | `chat.py` | merge-upgrade in place |
| `chat.py` cost region (`PRICING` entry) | `cost_ledger.py` | pricing entry only (ledger already Neon) |
| `brain.py` | `brain.py` | replace engine; keep chart helpers; keep `statements()` as adapter |
| `ad_tools.py` | `ad_tools.py` | new, verbatim |
| `cache.py` | `fetch_cache.py` | new, verbatim logic, Neon storage |
| `history.py` | `history.py` | new, verbatim logic, Neon storage |
| `discover.py` | `competitor/discover.py` | new, verbatim, config+transport seams |
| `apify_ads.py` | `competitor/apify_ads.py` | new, verbatim, storage seam |
| `competitor.py` | `competitor/pipeline.py` | new, verbatim, storage seam |
| `test_suite.py` | `tools/chat_capability_run.py` | adapted live driver (creative-tools pattern) |

`rnd_mine/cli/chat/` itself is untouched in this pass (sandbox stays as reference).

## 4. Module changes in detail

### meta_live.py (upgrade in place)
Gains from rnd, verbatim: structured `MetaError(status, code, subcode, message)`; `is_too_much_data` / `is_beyond_retention` classifiers; the **cursor-fix `get_insights_paged`** (advance `paging.cursors.after` against our own v23.0 base + original params; never follow Meta's minted `paging.next`, which mints a newer API version and 403s); extended `FIELDS` (`adset_id`, `adset_name`, `ad_id`, `ad_name`, `video_thruplay_watched_actions`, `video_play_actions` added); `CHUNK_DAYS = 14`; `_date_windows` (14-day chunking); `_fetch_window_adaptive` (recursive halving on too-much-data down to 1 day, one retry then skip; beyond-retention → recorded skip; other errors re-raise); `fetch_envelope(token, account, since, until, level, progress)` returning `{meta, data}` with `meta.skipped`; `fetch_month_rows` (monthly aggregate pull, no `time_increment`). Existing `fetch_dataset(preset)` and `list_accounts` stay for `/ingest`, `/insights source=live`, `/accounts` compatibility. rnd's dead `RETENTION_DAYS = 1125` constant is dropped (§9).

### meta_transform.py (extend in place)
`CampaignDayFact` gains optional fields with safe defaults: `adset_id`, `adset_name`, `ad_id`, `ad_name` (default `""`), `video_3s`, `thruplay`, `hook_rate` (default `0.0`), `is_video` (default `False`). `row_to_fact` gains rnd's extraction verbatim: `video_3s` = `actions.video_view` (the 3-sec view), `thruplay` = `video_thruplay_watched_actions.video_view`, `video_plays` = `video_play_actions.video_view` (used only for `is_video`), `hook_rate = video_3s / impressions * 100`, `is_video = bool(thruplay or video_3s or video_plays)`. `FACT_FIELDS` is **unchanged**, so `to_dataframe()`, `repository.upsert_dataset` (which must keep writing only the existing 20 facts columns), and all old consumers are unaffected. New-field access for the new modules goes through `dataclasses.asdict`.

### brain.py (replace engine, preserve surfaces)
The first-third-vs-last-third `campaign_windows` engine is deleted, replaced by rnd `brain.py` verbatim: `analyze(facts, currency)` (calendar WoW at ≥14d span, MoM at ≥60d; per-campaign signals with FATIGUE / SCALING / CTR-DECLINE / CPM-SPIKE flags and deterministic candidate causes; worst-day anomaly vs trailing 7-day mean) and `render_analysis_block(result, currency)`. Thresholds verbatim: `NOISE_PCT = 10.0`, `MATERIAL_SPEND_PCT = 0.01`, `MIN_WINDOW_PURCHASES = 5`, `FATIGUE_ROAS_DROP = 25.0`, `FATIGUE_FREQ_RISE = 10.0`, `SCALING_ROAS_RISE = 25.0`, `CTR_DROP = 20.0`, `CPM_SPIKE = 30.0`, `ANOMALY_DEV = 20.0`, `MAX_CAMPAIGN_FINDINGS = 8`. Preserved surfaces: `statements(df, currency)` survives as a thin adapter over `analyze()` returning the same `(tag, text)` pairs shape so `GET /insights` (statements + `_cards`) keeps its exact response schema; existing matplotlib chart/EDA helpers stay untouched.

### chat.py (upgrade in place)
- `SYSTEM` replaced by rnd v2 verbatim (strategist persona + trust-the-block instructions for the `CODE-COMPUTED ANALYSIS`, `HISTORIC FACTS`, and `COMPETITOR INTEL` sections).
- `build_context(ds, max_campaigns, full)` replaced by the rnd pandas-free implementation (consumes fact dicts; same output format the suite validated). Same signature.
- `complete` / `stream_answer` / `raw_complete` keep their OpenAI-SDK shapes and `_record_cost` flow (transport seam). `REASONING_EFFORT` rides `extra_body` as today.
- New: `run_tool_loop(client, messages, account, token) -> (answer, total_cost)` — rnd loop verbatim: `tools=ad_tools.TOOL_SCHEMAS`, `tool_choice="auto"`, max `TOOL_MAX_ROUNDS = 6` rounds then one forced tools-off answer; per round append assistant tool-call message, dispatch each call (`placement_breakdown` → `_placement_breakdown` live fetch; all others → `ad_tools.execute(name, args, facts, window)` over ad-level facts), append `role:"tool"` JSON results; cost summed across rounds via `_record_cost`.
- New: `_ensure_ad_level(token, account, days)` — cache-backed `level=ad` fetch, days clamped `max(1, min(days, AD_TOOL_MAX_DAYS = 60))`, memoized per day-count within the loop; `_placement_breakdown(token, account, days)` — live `publisher_platform`/`platform_position` breakdown pull.
- New glue: `build_full_context(ds, token, account, brand_id) -> str` assembling: `build_context` + `"=== CODE-COMPUTED ANALYSIS … ==="` + `brain.render_analysis_block` + `"=== HISTORIC FACTS … ==="` + `build_history_block` + (when stored intel exists) `"=== COMPETITOR INTEL … ==="` + competitor block — exact rnd section headers and order (as in rnd `test_suite.build_context` / `main`).
- `build_history_block(token, account, level, raw_since, until, currency)` ported verbatim (drives `history.ensure` with the `fetch_month_rows` callback).
- `RAW_RETENTION_DAYS = 183` lives here (as in rnd) and is applied exactly as in rnd: the raw window is floored at `today - 183d` (older periods served from `monthly_facts`), and `fetch_cache.prune_older_than(today - 183d)` runs on the chat path.
- CLI `main()`: keeps argparse; fetch path switches to cache-backed `fetch_envelope`, context via `build_full_context`, answers via `run_tool_loop`; competitor refresh allowed inline at session start (interactive user is waiting — matches rnd). Ledger total printed on exit as today.

### ad_tools.py (new, verbatim)
Pure module, zero I/O: `TOOL_SCHEMAS` (6 OpenAI-style function schemas: `top_ads`, `ad_trends`, `video_hook_rates`, `audience_breakdown`, `placement_breakdown`, `ad_fatigue_scan`), `execute` dispatch (handles 5; `placement_breakdown` intentionally routed by the loop to `chat._placement_breakdown`), grouping by **`ad_id`** (names repeat across adsets), `_MIN_SPEND = 500.0`, `_MIN_PURCHASES = 3`, `_NOISE = 10.0`, fatigue verdict = first-half vs second-half comparison.

### fetch_cache.py (new; rnd cache.py logic verbatim, Neon storage)
Same public API: `fetch_cached(account, level, since, until, fetch_range, today=None) -> (rows, stats)`, `cached_rows`, `prune_older_than`. Same semantics, verbatim: `FINAL_LAG_DAYS = 7` (settled dates `< today-7d` never refetched; trailing 7 days always refetched because Meta revises attribution); missing dates collapsed via `_contiguous_runs` so settled middles are never re-pulled; each fetched span **upserts by span** (drop old rows in span by date, insert fresh); dedupe key exactly rnd's `_key = (campaign_id, adset_name, ad_name, date_start)`; `stats = {cached_days, fetched_days, from_cache}`. Storage: `insight_rows` + `insight_fetch_log` tables (§5) via new repository methods mirroring `_load_rows` / `_save_rows` / `_load_fetched` / `_save_fetched`. Raw-row pruning boundary stays `RAW_RETENTION_DAYS = 183` applied from the chat path as in rnd.

### history.py (new; rnd logic verbatim, Neon storage)
Same public API: `month_bounds`, `months_range` (excludes partial current month), `rollup` (ratios recomputed from summed bases; best/worst campaign gated by `MATERIAL_SPEND_PCT = 0.01` / `MIN_PURCHASES = 5`), `attach_deltas` (MoM on roas/spend/revenue), `ensure(account, level, facts_for_month, today, months_back=37, progress)` (builds missing months via callback, refreshes last `REBUILD_RECENT_MONTHS = 2`, skips beyond-retention months gracefully), `render_history_block(months, currency, tail=24)`. `RETENTION_MONTHS = 37`. Storage: `monthly_facts` table (§5); `load`/`save` via repository. Incremental by design — only the first call per account pays the ~37-fetch build.

### competitor/ (new subpackage; rnd logic verbatim, seams only)
- `discover.py`: `DISCOVERY_MODEL = "openai/gpt-5.4-mini"`, temp 0.4, `response_format=json_object`, 2 attempts on bad JSON, `DEFAULT_N = 12`; discovery prompt verbatim; cost recorded to the Neon ledger (`op="discover"`); `ensure` = cached-or-discover against the stored record.
- `apify_ads.py`: `ACTOR = "apify~facebook-ads-scraper"` via run-sync-get-dataset-items; page-URL-first, keyword fallback filtered to brand by name similarity (`difflib`, `NAME_MATCH = 0.6`, `_dominant_page`, `MIN_PAGE_ADS = 3`); caps `MAX_COMPETITORS = 6`, `ADS_PER_COMPETITOR = 15` (~90 ads ≈ $0.5/scrape); `normalize_ad` with `_run_days` (totalActiveTime, else start/end epochs); `resolution_modes` + `skipped` recorded.
- `pipeline.py` (rnd `competitor.py`): `auto_context` (account name + Shopify products + campaign-name geo hints), `_country_code` geo map, code aggregates (`aggregate`: CTA mix, format mix, offer%/price% regexes, per-competitor rollups, longest-running "proven" creatives deduped, `{{…}}` templates skipped), `render_block`, `build(env-equivalent, account, ds, refresh, progress)` with `STALE_DAYS = 7`. Storage: `competitor_intel` table (§5).

### cost_ledger.py
Pricing entry only. `record`/`total_usd` already Neon-backed; the rnd jsonl ledger is **not** ported (superseded — sanctioned, §9).

## 5. Data model — Alembic migration `0004` (`ai_layer` schema)

All tables `brand_id`-keyed with the existing `_brand(brand_id) -> account_id` single-tenant default.

| Table | Primary key | Columns beyond PK |
|---|---|---|
| `insight_rows` | `(brand_id, account_id, level, date, row_key)` | `raw JSONB` (one raw Meta row, full actions arrays), `updated_at` |
| `insight_fetch_log` | `(brand_id, account_id, level, date)` | `fetched_at` |
| `monthly_facts` | `(brand_id, account_id, level, month)` (`month` = `'YYYY-MM'` text) | `rollup JSONB` (exact rnd month shape incl. `mom`), `updated_at` |
| `competitor_intel` | `(brand_id, account_id)` | `discovery_json JSONB`, `discovered_at`, `ads_json JSONB`, `scraped_at`, `updated_at` |

- `row_key` is the string form of rnd's `_key` minus the date component (`campaign_id|adset_name|ad_name`) — same collision behavior as rnd, proven on live data.
- Index: `(brand_id, account_id, level, date)` on `insight_rows` for range reads.
- Raw rows stay raw JSONB on purpose: re-normalization is free when fact logic evolves (that is exactly how the video fields were added in rnd without refetching).
- The 20-col `facts` table is untouched and remains the normalized campaign-grain store; ad-level rows exist only in `insight_rows` (the facts PK cannot hold them).

Repository additions (names finalized in the plan): load/upsert/prune for `insight_rows`, fetched-dates read/mark for `insight_fetch_log`, load/save for `monthly_facts`, load/save with independent `discovered_at`/`scraped_at` for `competitor_intel`. All follow existing repository style (`pg_insert … on_conflict_do_update`, `_brand` default, sessions via `engine.get_session`).

## 6. API surface

- `POST /chat`: context assembled via `build_full_context` (cache-backed fetch, campaign level), answer via `run_tool_loop`. `ChatRequest` gains optional `days: int` (default 30, the rnd-validated window; any timeline works via the chunked fetcher, floored at `RAW_RETENTION_DAYS`). `source` semantics: the default path becomes the cache-backed live fetch; an explicit `source="store"` (offline tests / seeded facts) or `source="connectors"` keeps today's behavior. Same `ChatResponse` schema + additive `tools_used: list[str]` field. `context_cache` sessions unchanged. **Never scrapes competitors inline** — renders stored intel only (§9 deviation).
- `POST /chat/stream`: behavior unchanged (streams, no tools) — documented limitation for this pass (§9).
- `GET /insights/{account_id}`: response schema unchanged; engine underneath is now real calendar WoW/MoM via the `statements()` adapter.
- `POST /ingest/{account_id}`: unchanged; gains optional `warm` query param: `warm=cache` runs `fetch_cached` over the request's window into `insight_rows`; `warm=history` runs `history.ensure` (both incremental, safe to repeat).
- New `GET /competitors/{account_id}`: stored intel block + meta (`discovered`, `scraped_ads`, `scraped_at`, staleness).
- New `POST /competitors/{account_id}/refresh`: discovery + scrape in FastAPI `BackgroundTasks`; caller re-polls the GET. Requires Meta-adjacent env only when scraping (`APIFY_TOKEN` gate as in rnd).
- Unchanged: `/health`, `/accounts`, `/complete`, `/cost`, `/blended`, all `/creative/*`.

## 7. Chat request flow

`POST /chat` → session-cached context or assemble: `fetch_cache.fetch_cached(campaign, last 30d)` (only missing + trailing-7 days hit Meta) → `normalize` → `build_full_context` (raw snapshot + `brain.analyze`/render + `history.ensure`/render (0-fetch after first build) + stored competitor block) → `SYSTEM` v2 → `run_tool_loop` (model may call the 6 tools; ad-level facts via `fetch_cached(level=ad, ≤60d)`; placement via live breakdown pull) → answer + per-round summed cost to the Neon ledger → `ChatResponse`.

## 8. Error handling & degradation

- Meta: beyond-retention → recorded skip in `meta.skipped`, never fatal; too-much-data → adaptive halving to 1 day, retry once, then skip; other `MetaError` → surfaces through the existing HTTP error path.
- Tool loop: a failing tool returns `{"error": …}` to the model (it recovers or answers without); round cap forces a final tools-off answer; a tool failure never 500s the request.
- Competitor: fully best-effort (rnd behavior): no `APIFY_TOKEN` → discovery-only block; nothing stored → block omitted; scrape failure → stale block stays.
- New stores: DB writes best-effort (creative precedent — log, never fail the request); if the cache read path errors, `fetch_cached` degrades to a direct fetch.

## 9. Sanctioned deviations from rnd (complete list)

1. Storage: Neon tables replace disk stores; jsonl cost ledger superseded by the existing Neon `cost_ledger` table.
2. Config: `ai_layer.config` + env replaces the `.env` dict walker.
3. Transport: OpenAI SDK replaces raw httpx for LLM calls (identical request parameters).
4. CLI: argparse shell kept; rnd interactive prompts not ported.
5. `POST /chat` never scrapes competitors inline (HTTP can't absorb a 60-90s Apify run); refresh moves to the new endpoint + CLI session start.
6. `POST /chat/stream` stays toolless this pass.
7. rnd's dead `RETENTION_DAYS = 1125` constant is dropped (unused in rnd; the effective raw boundary is `RAW_RETENTION_DAYS = 183`).
8. `test_suite.py` becomes a `tools/` driver targeting the HTTP path instead of importing modules directly.

Anything else that differs from rnd behavior is a bug.

## 10. Testing & verification

- New pytest modules: `test_brain` (calendar WoW/MoM math, flags, gating), `test_fetch_cache` (settled/trailing rule, contiguous runs, span upsert — Neon test branch via the existing `db_session` fixture), `test_history` (rollup math, `ensure` with fake callback, retention skip, tail rendering), `test_ad_tools` (pure functions, `ad_id` grouping, fatigue verdicts), `test_competitor` (aggregates, staleness, `auto_context` with mocked httpx, name resolution), extended `test_meta_live` (cursor pagination against scripted pages, adaptive halving against scripted errors), updated `test_chat` / `test_api` (SYSTEM v2 + config constants, `run_tool_loop` with a scripted fake client, `/competitors` endpoints, `tools_used`).
- Migration `0004` covered by the existing migration test pattern.
- Fidelity check (per §0): diff each ported region against its rnd source; only sanctioned seams may differ.
- Live validation: `tools/chat_capability_run.py` replays the 26-question capability suite through the in-process app against Pratap sons (~$0.33/run) and writes a markdown report for manual diff against `rnd_mine/cli/chat/test_results_4.md`.
- Gate: `python -m pytest` green in `apps/ai-layer` before commit. Commits only, **no pushes**.

## 11. Out of scope

WhatsApp delivery; new-vs-returning ROAS (needs Shopify order joins — separate project); competitor page-ID resolution improvements; streaming tool answers; TS client (`apps/api`) changes beyond none-required (all existing HTTP paths keep their shapes); deleting `rnd_mine/cli/chat/`; multi-worker session cache (Redis).
