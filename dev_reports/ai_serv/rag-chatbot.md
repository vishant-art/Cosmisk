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

Built by `build_context()`:
- account / currency / window header
- account totals (spend, revenue, blended ROAS, purchases)
- per-campaign totals (spend, revenue, ROAS, purchases, CPA, avg frequency, CTR)
- daily account totals (date | spend | revenue | ROAS)

All derived deterministically from the L1 transform (`meta_transform`), so the
model reasons over **pre-computed, correct** numbers and mostly just does
arithmetic + phrasing. `build_context(ds)` takes a typed `Dataset`, not raw JSON.

**Snapshot is lossy by design (important limitation):** it carries per-campaign
*totals* + account-level *daily* series, but NOT per-campaign *daily* series. So
the LLM cannot truly answer campaign-level TREND questions (fatigue, "which
campaign is declining") — it approximates with totals (e.g. lowest-ROAS). True
fatigue is a temporal pattern and stays the deterministic brain's job. Fix later:
either enrich the snapshot with per-campaign daily series, or route trend
questions to the brain.

## Model config

- `MODEL = "openai/gpt-5-nano"` — constant at top of file, **not** in env (per
  instruction). Swap freely; any OpenRouter slug works.
- `TEMPERATURE = 0.2` (factual).
- API: OpenRouter, OpenAI-compatible. Reads `OPENROUTER_API_KEY` /
  `OPENROUTER_BASE_URL` from repo-root `.env`.

### Model cost research (OpenRouter, 2026)

Workload = tiny injected context (few KB) at high volume, short outputs, so
**input price dominates**. $/M in / out:

| Model | slug | in | out | note |
|---|---|---|---|---|
| **GPT-5 Nano (current)** | `openai/gpt-5-nano` | 0.05 | 0.40 | **cheapest reliable** for grounded numeric Q&A |
| Gemini 2.5 Flash-Lite | `google/gemini-2.5-flash-lite` | 0.10 | 0.40 | cheap GA alternative |
| Gemini 3.1 Flash-Lite | `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | prior pick; ~5x Nano on input |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | 1.00 | 5.00 | best "never invent a number", pricey |

**Chosen: `gpt-5-nano`** — cheapest input (the dominant cost here) and it passed
every grounding/anti-hallucination test plus the qualitative eval (below). Free
tiers (`llama-3.3-70b:free`) avoided: rate-limited + possible prompt logging of
client data. Prices are approximate / version-sensitive.

## Guardrails

- System prompt: answer ONLY from the snapshot; if not derivable, say so; cite
  figures with currency; no invented numbers.
- REPL keeps conversation history; survives API errors (prints + continues).

## Run

```
python chat.py                 # mock_meta_ads.json
python chat.py --data x.json
```

Costs OpenRouter tokens per turn (snapshot + history resent each call).

## Open questions / next

- Add a **router** that short-circuits pure-lookup questions ("what's my spend?")
  to a deterministic answer with no LLM call — cheaper, zero hallucination. This
  was a planning idea and is the natural next iteration.
- Prompt caching for the static snapshot to cut token cost once on a caching-
  capable model.
- Web-search / "live LLM" was discussed (Gemini-live). Out of scope for this
  experiment; would route through the gateway if adopted (Architecture Rule #1).
- When data outgrows the context window (multi-account), switch to real vector
  RAG; the `meta_transform` facts are already a clean chunk unit.

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

Result (2026-06-11): **23 passed, 4 skipped** offline; **4 passed** live on
`gpt-5-nano`. Anti-hallucination holds.

## gpt-5-nano evaluation (2026-06-11)

Qualitative eval beyond pass/fail:

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

Verdict: gpt-5-nano is accurate, grounded, refuses to invent, and is the cheapest
option. Adopted as the default.

## Integration / TS retirement

Prototype for the `apps/ai-layer` chat endpoint, eventually replacing the
Claude-based `/ai/chat` path. TS stays until this is validated and wired.
