# AI Layer — RAG Chatbot (`rnd/src/chat.py`)

> Design doc for `rnd/src/chat.py`. Status: **experiment (rnd)**. Future home: `apps/ai-layer` chat.
> Kept in sync with the code. Last updated: 2026-06-11.

## Purpose

A CLI chatbot that ingests a Meta Ads dataset and answers natural-language
questions about it ("which campaign should I cut?", "how did ROAS trend?"). This
is the AI-studio / consultative-query layer from the project plan.

## Key decision: context-injection, not embeddings RAG

"RAG" here means **context-injection**: the entire (single-account) dataset is
compressed into a factual text snapshot and placed in the model's **system
context every turn**. The model is instructed to answer **only** from the snapshot.

Why not vector RAG (embed + retrieve): one account's metrics easily fit in
context, so chunk-embed-retrieve adds moving parts and **retrieval-miss risk**
without benefit. Embeddings RAG becomes worth it only when the data is too large
to fit (many accounts, long history, documents). Revisit then.

## The snapshot (what gets injected)

Built by `build_context()`. **Always** (the pre-computed aggregates, so totals are
exact, not LLM-summed):
- account / currency / window header
- account totals (spend, revenue, blended ROAS, purchases)
- per-campaign totals (all campaigns; `MAX_CAMPAIGNS` can cap the list)
- daily account totals (date | spend | revenue | ROAS)

**Plus, when `FULL_DATA = True` (default): the COMPLETE per-(campaign × date) table**
— every row with all 18 contract fields (spend, impressions, reach, frequency,
clicks, link_clicks, link_ctr, cpc, cost_per_link_click, cpm, add_to_cart, checkout,
purchases, revenue, roas, cpa). So **nothing is truncated or summarized away**; the
model can drill into per-campaign daily detail. `--no-full` reverts to summary-only.

All derived from the L1 transform (`meta_transform`), so aggregates are correct.
`build_context(ds, full=...)` takes a typed `Dataset`, not raw JSON.

### Tradeoff of full data (measured)

For an 84-campaign month: summary ≈ 3.2K tokens; **full ≈ 46K tokens, sent every
turn**. That raises cost (input billed per turn) and latency (~30s/reply on
gpt-5-nano with reasoning, vs ~2.5s summary-only), and a small model is **less
reliable at pinpoint extraction** from a 1,176-row dump (it may hedge). So full
data removes the loss but isn't free. Better long-term answers for "use the full
data reliably":
- a **stronger large-context model** (e.g. gemini-2.5-flash) for extraction, or
- **tool/function-calling** so the model *queries* the data (pandas/SQL) instead of
  reading all rows, keeping input small and extraction exact, or
- a **router** that sends trend/extraction questions to the deterministic brain.

Default is now full (per "I need full data"); flip `FULL_DATA`/`--no-full` for the
fast, cheap summary path.

## Model config

- `MODEL = "google/gemini-2.5-flash"` — constant at top of file, **not** in env.
  Chosen for the **full-data default** (see A/B below). Swap freely.
- `TEMPERATURE = 0.2` (factual).
- `REASONING_EFFORT = None` — only applies to the gpt-5 family (minimal cuts their
  latency ~8x). Gemini flash needs none. Set `"minimal"` if you switch back to nano.
- `FULL_DATA = True` — inject the complete per-(campaign × date) table (no loss).
- `MAX_CAMPAIGNS = None` — per-campaign SUMMARY list cap (None = all).
- `STREAM = True` — stream tokens for instant-feeling replies.
- `complete(client, messages, stream)` is the single call helper (REPL + tests
  share it). Full benchmarks + A/B: **chat-latency-and-fixes.md**.
- API: OpenRouter, OpenAI-compatible. Reads `OPENROUTER_API_KEY` /
  `OPENROUTER_BASE_URL` from repo-root `.env`.

### Model A/B (full data, OpenRouter, 2026-06-11)

On the full 1,176-row context, pinpoint extraction question (ground truth known):

| Model | latency | full-data extraction | use for |
|---|---|---|---|
| **`google/gemini-2.5-flash` (current)** | ~6s | **values exact**, reliable | the full-data default |
| `google/gemini-2.5-flash-lite` | ~3s | **wrong rows** (read wrong section) | not on big dumps |
| `openai/gpt-5-nano` | 18-25s | inconsistent (wrong value / false "no spend") | SUMMARY path only (cheap, `reasoning=minimal`) |

For the small SUMMARY-only path, gpt-5-nano + `reasoning=minimal` is the cheapest/
fastest and grounds fine. Full benchmark, token-cost reality (full data ≈ 110-144K
tokens, not the `chars/4` estimate), and the **query-tool scaling path** are recorded
in chat-latency-and-fixes.md. Prices are approximate / version-sensitive.

## Persona & guardrails (analyst, not a lookup table)

The system prompt makes it a **senior Meta Ads strategist that discusses the data**,
not a strict extractor. Two-tier rule (this replaced an earlier strict-extraction
prompt that rejected anything needing judgment):

- **NUMBERS stay grounded** — a specific figure must come from the snapshot; it never
  invents one, and says so if a number isn't present. (Grounding tests still pass:
  refuses a fabricated TikTok number, won't invent campaigns.)
- **ANALYSIS is encouraged** — trends, account health, likely causes, risks, and
  concrete recommendations. It takes a position and does NOT refuse judgment/inference
  questions. Claims beyond the literal data are made but **flagged** (`(inference)`,
  "likely, though the data can't prove causation"); it surfaces key caveats
  (Meta over-counts vs Shopify; recent ~7 days under-reported) without letting them
  block a useful answer. `TEMPERATURE = 0.3` gives it room to discuss.
- Locked by a live test (`test_live_gives_inference_not_refusal`): an "is this account
  healthy / what should I focus on" question must return a substantive analytical
  answer, not a "cannot be determined" refusal.
- REPL keeps conversation history; survives API errors (prints + continues).

## Data source

Pulls **live Meta Ads data on session start** by default (via
`meta_live.fetch_dataset` -> typed `Dataset` -> snapshot). `--data <file>` is the
offline override (a saved pull or the mock) for repeatable/testing runs. The live
pull is a one-time per-session cost (~1,176 rows / 3 pages for Pratap sons); the
snapshot is then fixed for the whole chat. `meta_live.fetch_envelope` /
`fetch_dataset` are the shared live-fetch helpers (also used by `brain_real.py`).

**Account picker.** With no `--account`, `choose_account()` lists every ad account on
the token (numbered: name, currency, a flag for closed/inactive) and prompts you to
pick one before fetching. `--account act_<id>` skips the picker; non-interactive stdin
(piped/tests) falls back to the first account so nothing hangs on a prompt.

**Window vs account gotcha.** The default preset is `last_30d` (a rolling 30-day
window, not cumulative), but Meta only returns rows for days a campaign actually
delivered. A near-dormant account (e.g. Harshad Trading) may show only the few days it
ran ads, even though 30 days were requested — that's the account, not the preset. The
chatbot is **stateless** (re-pulls a rolling window each session, no persistence); a
cumulative store with trailing-window UPSERT is the production ingestion layer (not
built here — see `meta-live-probe.md`).

A **`Spinner`** animates during the fetch so the ~5-10s startup doesn't look dead.
It's a no-op when stdout is not a TTY (piped runs / tests), printing a single
static line instead, so logs stay clean. Meta API errors now surface as a clean
message (the fetch helpers raise `RuntimeError`; `chat.py` catches it after the
spinner clears) instead of a mid-spinner `sys.exit`.

## Run

```
python chat.py                                   # LIVE; prompts you to pick an account
python chat.py --account act_123 --preset last_14d   # skip the picker
python chat.py --data ../data/_real_sample.json  # offline from a saved pull
```

Needs `META_ACCESS_TOKEN` (live) + `OPENROUTER_API_KEY` in repo-root `.env`.
Costs OpenRouter tokens per turn (snapshot + history resent each call).

## Open questions / next

- **Query tool (function calling) — the recommended scaling path.** Stop stuffing
  the full table; give the model `query_campaigns` / `campaign_daily` / `aggregate`
  tools that run real pandas and return small exact results. Keeps input tiny + exact
  regardless of data size. Full design recorded in **chat-latency-and-fixes.md**.
- **Router** for pure-lookup turns ("what's my spend?") -> deterministic answer with
  no LLM call (cheaper, zero hallucination).
- Prompt caching for the static prefix to cut input cost on a caching-capable model.
- Web-search / "live LLM" (Gemini-live) — out of scope; would route through the
  gateway if adopted (Architecture Rule #1).

## Tests (`test_chat.py` + `test_transform.py`)

Two layers, run with the `cos` venv from `rnd/`:

- **Offline (always, free).** `test_transform.py` covers the L1 contract (typed
  frozen fact, exact contract columns, pixel-vs-omni disambiguation, missing/None/
  non-numeric fields, derived-vs-reported ROAS, normalize/load, aggregates).
  `test_chat.py` covers snapshot correctness (totals, single campaign, zero-spend
  no-div-by-zero, unicode/₹ names, messy actions pick pixel, large numbers,
  system-prompt embedding, real-sample smoke).
- **Live grounding (opt-in via `RUN_LIVE_LLM=1`, costs tokens) — 4 tests.** Real
  OpenRouter calls asserting the model: reports the correct blended ROAS; **refuses
  an unknown metric** ("TikTok spend"); names the worst-ROAS campaign; **does not
  invent** a campaign name.

Result (2026-06-11): **27 passed, 4 skipped** offline; **4 passed** live (on both
`gpt-5-nano` during the summary-path work and the current `gemini-2.5-flash`).
Anti-hallucination holds.

## gpt-5-nano evaluation (2026-06-11) — historical (summary path)

This eval was run on `gpt-5-nano` over the SUMMARY snapshot, before full-data mode
and the model switch. Kept as a logged experiment; the current default is
`gemini-2.5-flash` (see the A/B above). Findings then:

- **Real data (84 campaigns):** "blended ROAS + total spend" -> 3.69 / INR
  4,978,697 (matches the brain exactly). "Top 3 money-wasting campaigns" -> correct
  high-spend/low-ROAS picks. "Did performance improve or decline?" -> "start 4.30x
  -> end 2.39x, ~44% drop, peak 6.14x on 05-14", all grounded in the daily snapshot.
- **Mock:** "blended ROAS + which to cut" -> 3.19x, flagged Catalog DPA (1.82x,
  ₹823 CPA), grounded.
- **Limitation surfaced:** asked "which campaign is fatiguing", nano named the
  *lowest-ROAS* campaign, not the actually-fatiguing one — because the snapshot
  has no per-campaign daily series (see the snapshot note above). Not a model fault;
  a snapshot-design limit. Campaign-level fatigue stays the brain's job.

Verdict (at the time): gpt-5-nano was accurate + cheapest on the SUMMARY snapshot.
Superseded for the full-data default by gemini-2.5-flash (the A/B above); nano stays
the cheap option for the summary-only path.

## Integration / TS retirement

Prototype for the `apps/ai-layer` chat endpoint, eventually replacing the
Claude-based `/ai/chat` path. TS stays until this is validated and wired.
