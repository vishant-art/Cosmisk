# AI Layer — Chat Latency: diagnosis & fixes

> Why `chat.py` felt slow, what actually caused it, and the fixes applied.
> Harness: `rnd/tests/bench_chat.py`. Last updated: 2026-06-11.

## The harness

`bench_chat.py` replays a scripted **multi-turn** conversation (5 turns: lookups +
reasoning + synthesis) against the same model + snapshot `chat.py` uses, recording
per-reply **latency** and **token usage** (prompt / completion / reasoning). Flags
let us A/B configs: `--data`, `--model`, `--reasoning-effort`, `--max-campaigns`,
`--stream`. It makes real paid calls, so it's a manual tool (named `bench_*`, not
collected by pytest).

```
python bench_chat.py --data ../data/_real_sample.json
python bench_chat.py --data ../data/_real_sample.json --reasoning-effort minimal
```

## Measured matrix (gpt-5-nano, 5-turn scenario, 2026-06-11)

| Config | avg latency | max | avg reasoning tok/reply | avg prompt tok |
|---|---|---|---|---|
| mock (4 campaigns) baseline | 10.9s | 13.5s | 576 | 1,156 |
| **real (84 campaigns) baseline** | **21.2s** | **52.4s** | **1,843** | 5,907 |
| real + `reasoning=minimal` | **2.5s** | 5.9s | **0** | 5,830 |
| real + trim to 25 campaigns | 13.9s | 26.2s | 780 | 2,439 |
| real + minimal + trim | 3.0s | 5.7s | 0 | 2,411 |

## Diagnosis: it's reasoning, not (mainly) input size

The intuitive guess was "the big snapshot is re-sent every turn." That's a real but
**secondary** cost. The dominant driver is that **gpt-5-nano is a reasoning model**:
it generates 500-4,400 internal **reasoning tokens** per reply (serially, so they
translate almost directly into seconds), even though the visible answer is ~100
chars. Evidence:

- Even the tiny mock (1,156 prompt tok) took ~11s with 576 reasoning tokens.
- One real-data turn produced **4,416 reasoning tokens -> 52 seconds**.
- Turning reasoning to `minimal` (0 reasoning tokens) cut real-data latency
  **21.2s -> 2.5s (~8x)** with the SAME ~5,800 prompt tokens.
- Trimming the snapshot ALONE (config D) barely helped (21s -> 14s) because
  reasoning still fired; with minimal reasoning, input size barely moves latency
  (2.5s vs 3.0s). So input size matters mostly for **cost**, not latency.

## Fixes applied to `chat.py`

1. **`REASONING_EFFORT = "minimal"`** (the big one). Passed via
   `extra_body={"reasoning": {"effort": ...}}`. For grounded extraction over a
   PRE-COMPUTED snapshot, the model mostly looks up + does light arithmetic, so
   reasoning adds latency without accuracy. Set to `None` to restore full reasoning.
2. **Streaming (`STREAM = True`)**. The REPL prints tokens as they arrive, so even
   the residual 2-3s feels instant (good time-to-first-token).
3. **Snapshot trim (`MAX_CAMPAIGNS = 30`)**. The per-campaign list is capped at the
   top-N by spend (the 84-campaign tail is immaterial: 28 campaigns hold 86% of
   spend). Account TOTALS still reflect all campaigns. Cuts input tokens (cost)
   every turn.
4. **`complete()` helper** — single source of truth for the call config (model +
   temperature + reasoning), used by both the REPL and the live tests, so tests
   prove grounding under the exact production settings.

## Did the fix hurt accuracy?

No. The 4 live grounding/anti-hallucination tests (correct blended ROAS, refuses
unknown metric, picks worst campaign, no invented campaigns) **all pass under
`reasoning=minimal`**, and the suite got faster (~22s vs ~45s for the 4 calls).
27 offline tests pass with the trimmed snapshot.

## Other levers (not needed yet, documented)

- **Prompt caching.** The static system snapshot is a stable prefix, so OpenRouter/
  OpenAI auto-cache it on repeat turns within a session -> lower input COST and some
  prefill latency. A cost win, not the latency fix.
- **Deterministic router.** Pure-lookup turns ("what's my spend / blended ROAS")
  can be answered from `meta_transform` with NO model call (instant, free, zero
  hallucination). Natural next step: route lookups to the brain, send only genuine
  reasoning questions to the LLM.
- **Cap history.** History is resent each turn; trimming to the last N turns bounds
  growth on long sessions (minor here).
- **Cheaper non-reasoning model.** `gemini-2.5-flash-lite` is not a reasoning model
  and would avoid the reasoning-token tax entirely; A/B if nano's minimal-reasoning
  accuracy ever wobbles.

## Full-data mode + model A/B (2026-06-11)

After the summary-path fixes, we added **`FULL_DATA` mode** (default on): the snapshot
appends EVERY (campaign × date) row with all 18 fields, so nothing is truncated/
summarized away. This made the input much bigger, which changed the model calculus.

**Token reality check.** `chars/4` badly underestimates dense numeric tables. The full
84-campaign month is ~183K chars, which tokenizes to **~110K (gpt-5) – ~144K (gemini)
tokens**, not the ~46K the `chars/4` print suggested (real ≈ 0.8 tok/char). It fits
(gemini 1M ctx, gpt-5 ~400K) but costs more than the naive estimate.

**Extraction A/B** — identical full-data context (~46K chars), one pinpoint question:
"list campaign DSG_TOF_CATALOG_IND_CBO_5/5/26's daily ROAS for its last 5 active days."
Ground truth: 05-29:5.22, 05-30:6.56, 05-31:2.85, 06-01:3.36, 06-02:2.68.

| Model | Latency | Accuracy on full-data extraction |
|---|---|---|
| `openai/gpt-5-nano` (reasoning low) | 18-25s | inconsistent: one run 3/5 + a FALSE "no spend" claim; another 4/5 with a wrong value (05-29: 5.88) |
| **`google/gemini-2.5-flash`** | **~6s** | **all reported values exact** (05-29/05-31/06-01/06-02 correct); minor off-by-one on which 5 are "last" |
| `google/gemini-2.5-flash-lite` | ~3s | **wrong**: returned 06-03…06-07 — likely read the account-daily section, not the campaign's rows |

**Decision: `MODEL = "google/gemini-2.5-flash"`** for the full-data default. It's the
only one that reliably extracts the right rows from the big dump, at acceptable speed.
flash-lite is fastest/cheapest but unreliable on large dumps; nano is slow and
inconsistent. For the SUMMARY-only path, `gpt-5-nano` + `reasoning=minimal` stays the
cheap/fast option. (`REASONING_EFFORT` only applies to the gpt-5 family; gemini flash
needs none.) Live grounding (4 tests) passes on gemini-2.5-flash.

## Recommended scaling path: the QUERY TOOL (function calling)

Stuffing the full table into context works but doesn't scale: input grows with the
data (already ~110-144K tokens for one month), cost is paid every turn, and small
models mis-read big dumps. The right architecture is to stop sending raw rows and give
the model a **tool to query the data**:

- Keep the typed `Dataset` / pandas `DataFrame` in the process (the L1 transform output).
- Expose 1-3 **functions** to the model via OpenRouter/OpenAI tool-calling, e.g.
  `query_campaigns(filter, sort, limit)`, `campaign_daily(campaign, since, until)`,
  `aggregate(group_by, metric)` — each runs real pandas and returns a SMALL exact result.
- The system prompt carries only the compact SUMMARY (for orientation); the model calls
  a tool when it needs detail, gets exact rows back, and answers from those.

Why it's the right answer:
- **Input stays tiny** (summary + tool schemas), so cost + latency stay low regardless
  of account size (84 or 84,000 rows).
- **Exactness**: pandas computes the filter/aggregate, so no model arithmetic over 1,176
  rows -> no mis-reads, no hallucinated rows.
- **Scales** to multi-account / multi-month where full-context stuffing is impossible.
- Trade-off: more moving parts (tool loop, schemas, an agentic turn), and 1-2 extra
  round-trips per detailed question. Worth it once data outgrows a single comfortable
  context.

Implementation sketch (not built yet): a `tools=[...]` list on the `complete()` call;
a dispatch loop that executes the requested function against the `DataFrame` and feeds
the result back as a `tool` message until the model returns a final answer. The
`meta_transform` facts are already a clean queryable table, so this is mostly a
chat-layer addition. This is the planned next step beyond context-stuffing.

## Bottom line

Two regimes:
- **Summary path** (compact, default-off-able): `chat.py` went **~21s -> ~2.5s** per
  reply by turning OFF gpt-5-nano reasoning; snapshot size was a latency red herring
  (it's a cost lever). Streaming makes it feel instant.
- **Full-data path** (default on, per "I need full data"): nothing is truncated; the
  whole 1,176-row table is sent. gpt-5-nano can't handle that reliably, so the default
  model is now **gemini-2.5-flash** (~6s, accurate). The durable fix for scale is the
  **query tool** above, not ever-bigger context.
