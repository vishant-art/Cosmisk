# AI Layer — File 3: RAG Chatbot

> Design doc for `rnd/chat.py`. Status: **experiment (rnd)**. Future home: `apps/ai-layer` chat.
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

All derived deterministically from `meta_common.py`, so the model reasons over
**pre-computed, correct** numbers and mostly just does arithmetic + phrasing.

## Model config

- `MODEL = "google/gemini-3.1-flash-lite"` — constant at top of file, **not** in
  env (per instruction). Swap freely; any OpenRouter slug works.
- `TEMPERATURE = 0.2` (factual).
- API: OpenRouter, OpenAI-compatible. Reads `OPENROUTER_API_KEY` /
  `OPENROUTER_BASE_URL` from repo-root `.env`.

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
  RAG; `meta_common` rows are already a clean chunk unit.

## Validation (2026-06-11)

Ran against `mock_meta_ads.json` via `google/gemini-3.1-flash-lite` on OpenRouter.
Asked "what's my blended ROAS, and which one campaign should I cut and why?" ->
answered 3.19x (matches the deterministic brain) and flagged "Catalog -- DPA
Broad" citing real snapshot figures (1.82x ROAS, ₹823 CPA, 0.81% CTR, 3.18 avg
frequency). Grounded, no invented numbers. Same UTF-8 stdout fix applied.

## Integration / TS retirement

Prototype for the `apps/ai-layer` chat endpoint, eventually replacing the
Claude-based `/ai/chat` path. TS stays until this is validated and wired.
