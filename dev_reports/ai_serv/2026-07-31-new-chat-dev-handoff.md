# New Chat Dev Handoff — 31/7

> **Status:** 🔵 ACTIVE (2026-07-31). The rnd Meta Ads intelligence chat is now the production chat inside `apps/ai-layer`.
> Branch `new/creative_v2`, commits `d6cfa0f..1308a80` (~29), **never pushed**. Spec: `docs/superpowers/specs/2026-07-30-chat-intelligence-integration-design.md` · Plan: `docs/superpowers/plans/2026-07-30-chat-intelligence-integration.md` · Task ledger: `.superpowers/sdd/progress.md`.

Audience: the dev engineer picking this up. Everything below is either **done and verified** or an **explicit TODO** with file pointers.

---

## 1. What shipped (all Python, `apps/ai-layer`)

`POST /chat` (and `python -m ai_layer.chat`) now runs the full intelligence pipeline:

| Piece | Module | What it does |
|---|---|---|
| Chunked Meta fetch | `meta_live.py` | since/until range pulls in 14-day windows, auto-halving on Meta's size cap; cursor-fix pagination (never follows Meta's minted `paging.next`); extended FIELDS (ad/adset ids, video metrics) |
| Fetch cache | `fetch_cache.py` + `insight_rows`/`insight_fetch_log` tables | settled days (>7d old) never refetched; trailing 7 always refetched (Meta revises attribution); degrades to direct fetch on any DB error |
| Deterministic brain | `brain.py` | calendar WoW/MoM deltas, fatigue/scaling/CTR/CPM flags with candidate causes, worst-day anomaly; `statements()` adapter keeps `GET /insights` schema identical |
| 37-month history | `history.py` + `monthly_facts` table | monthly rollups back to Meta's retention limit, stored forever (outlives Meta's own data); incremental after first build |
| Competitor intel | `ai_layer/competitor/` + `competitor_intel` table | LLM discovery (OpenRouter) → Apify Ad-Library scrape (page-URL-first, name-similarity fallback) → code aggregates (CTA/format/offer mix, proven creatives) |
| Ad-level agent loop | `ad_tools.py` + `chat.run_tool_loop` | model pulls ad-level data on demand via 6 tools (`top_ads`, `ad_trends`, `ad_fatigue_scan`, `video_hook_rates`, `audience_breakdown`, `placement_breakdown`); groups by `ad_id` (names repeat across adsets) |
| Model config | `chat.py` | `openai/gpt-5.4-mini` @ temp 0.5, reasoning=minimal, max_tokens 6000; SYSTEM v2 with trust-the-block instructions |

Storage is **all Neon** (`ai_layer` schema, migration `0004`); zero disk state (Railway-safe). Engine now sets TCP keepalives (mid-query Neon drops used to hang forever). Legacy `/ingest` + `/insights` live-fetch now route through the chunked fetcher too (big accounts no longer 500 at `last_30d`).

**Verified:** 624 pytest passing (+2 known `test_cost_ledger` baseline fails on the shared demo DB; `test_connector_source` needs the optional connectors package). Live-validated end-to-end: CLI smoke (658 rows, 37-month backfill, 12 competitors/73 ads scraped, tool answers with real numbers), 26/26-question capability replay via HTTP ($0.39), and a real-server API battery (all endpoints, auth, 404s, streaming). Chat cost ≈ **$0.01/call** with prompt caching.

## 2. Boot (2 terminals)

```powershell
# terminal 1 — BOTH backends (apps/api/dev.mjs supervises them; Ctrl+C kills both)
cd apps\api
npm run dev        # ai-layer (cos venv uvicorn) -> :8077  +  Fastify api -> :3000

# terminal 2 — dashboard
cd apps\web
npm start          # ng serve -> http://localhost:4200
```

Root `.env` already has `AI_LAYER_URL=http://127.0.0.1:8077` so the proxy is live. `npm run dev:api` = api alone (ai-layer routes degrade). Python-alone: `.\start-ai-layer.ps1`.

## 3. Dev wiring REQUIRED in apps/web / apps/api: **none**

- Proxy routes (`/ai-layer/chat`, `/chat/stream`, `/insights`, `/refresh`) and `ai-layer-client.ts` work unchanged — the API deltas are additive only: `ChatResponse.tools_used: string[]`, optional `ChatRequest.days: int = 30`, `ChatRequest.source` default is now `"cache"` (the new pipeline). Explicit `source: "store"` keeps the old cheap behavior.
- The new default path needs a Meta token per request; `apps/api` already sends `X-Meta-Token` via `resolveMetaToken` (env fallback in local dev). Nothing to add.
- `GET /insights` silently upgraded (same schema, real WoW/MoM engine behind it).

## 4. Dev TODO — optional UI work to surface the new capabilities

1. **`tools_used` badge on chat answers** (small): every `/chat` response now carries e.g. `["top_ads"]`. Render as a "pulled ad-level data" chip. Files: `apps/web` chat component; `apps/api/src/boot/ai-layer-routes.ts` already passes the body through.
2. **Timeframe picker** (small): send `days` in the chat request (server accepts any window; raw floor ~183 days, older periods come from the monthly history automatically). Currently everything defaults to 30.
3. **Competitor intel panel** (the only genuinely new unwired surface):
   - Python endpoints exist and are live-tested: `GET /competitors/{account_id}` (stored intel: discovered count, scraped_ads, scraped_at, stale flag, rendered block; 404 until first refresh) and `POST /competitors/{account_id}/refresh` (background discovery + scrape; poll the GET).
   - Needed: two proxy routes in `apps/api/src/boot/ai-layer-routes.ts` + client methods in `apps/api/src/services/ai-layer-client.ts` (copy the `/ai-layer/insights` pattern), then a dashboard card in `apps/web`.
   - ⚠️ Refresh costs real money (~$0.50 Apify per scrape, caps: 6 competitors × 15 ads) — put it behind a deliberate button, not an auto-load.

## 5. Post-merge follow-ups (triaged non-blocking by the final whole-branch review)

Full list with context in `.superpowers/sdd/progress.md` (FOLLOW-UPS entry). Highlights, in priority order:
1. **`/ingest` brand_id threading** — do FIRST when multi-tenant (#34) starts; it's the only new-surface endpoint that drops `X-Brand-Id`.
2. Convert the 2 `test_cost_ledger` absolute-sum tests to delta assertions (shared-DB pollution) → suite truly green.
3. Synthetic test for the Meta 429/502 classification in `chat_endpoint`'s tool-loop wrapper.
4. `/competitors/refresh` endpoint test (404 + scheduling); promote `pipeline._is_stale` to public; drop the double DB read in `GET /competitors`.
5. Cosmetics: dead `Spinner` class in chat.py; stale disk-era docstrings in `competitor/discover.py`/`apify_ads.py`; capability-driver markdown header lacks Model line; `build_full_context` double-asdict.
6. `graphify update .` (new subpackage + 3 new modules changed the repo map).

## 6. Env & ops notes

| Var | State |
|---|---|
| `OPENROUTER_API_KEY` | **Rotated 2026-07-31** (old key was dead — "User not found"). New key: $3/week limit. gpt-5.4-mini pricing entry added to `cost_ledger.PRICING` |
| `APIFY_TOKEN` | In `.env` + both `.env.example`s; competitor scrape gates on it (absent → discovery-only block, no crash) |
| `DATABASE_URL` / `MIGRATION_DATABASE_URL` | Main branch `ep-little-rain` (runtime). **Passwords are per-branch in Neon** — this bit us; don't mix hosts/passwords |
| `PGUSER…PGDATABASE_POOL` | Test harness → demo branch `ep-flat-fire` (pytest never touches main) |
| Meta | Token works. App-level rate limit (`code=4`) is real: repeated full pulls in one hour → 429s, handled gracefully (`/chat` returns 429/502, tools degrade). First-ever request per account pays a ~37-fetch history backfill (one-time, then incremental) |
| Migrations | `0004_intelligence_stores` applied to both branches. Apply manually via `python -m ai_layer.db.migrate` — never on boot |

Test invariant (also in CLAUDE.md): ai-layer pytest **624/7** + the 2 known cost_ledger baseline fails, `--ignore=tests/test_connector_source.py`.

## 7. Capability harness (regression baseline)

`python tools/chat_capability_run.py --yes` replays the 26-question suite through the real HTTP path (~$0.35-0.40, requires META + OpenRouter keys; refuses without `--yes`). Latest results: `apps/ai-layer/tools/chat_capability_results.md` (gitignored). rnd baseline for comparison: `rnd_mine/cli/chat/test_results_4.md`. The rnd sandbox at `rnd_mine/cli/chat/` is kept as the fidelity reference — **don't edit it**; the integration's byte-fidelity is diffed against it.
