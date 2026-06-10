# rnd/ — AI layer experiments

Standalone Python experiments for the AI/analytics layers. These are throwaway
R&D harnesses; once validated they get integrated into `apps/ai-layer`, and only
then do we retire the equivalent TypeScript. Nothing here imports from `apps/`.

Design docs (kept in sync with this code): `dev_reports/ai_serv/`.

## Files

| File | What it is |
|---|---|
| `make_mock.py` | Generates `mock_meta_ads.json` (seeded, reproducible). Shaped like a real Meta Insights campaign-level daily pull. |
| `mock_meta_ads.json` | The generated mock dataset (4 campaigns × 30 days, with narratives). |
| `meta_common.py` | Shared parser: loads insights, explodes the nested `actions`/`action_values` arrays, returns tidy pandas frames. |
| `brain.py` | **File 1** — deterministic natural-language statements about the data, plus `--plots` EDA charts. No LLM. |
| `meta_live.py` | **File 2** — hits the live Graph API with `META_ACCESS_TOKEN` and prints exactly what we receive. |
| `chat.py` | **File 3** — context-injection RAG chatbot over the data via OpenRouter (`google/gemini-3.1-flash-lite`). |

## Setup

Uses the repo's `cos/` virtualenv. From the repo root:

```powershell
cos\Scripts\python.exe -m pip install -r rnd\requirements.txt
```

Credentials are read from the repo-root `.env` (`META_ACCESS_TOKEN`,
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`). The OpenRouter model is set as a
constant at the top of `chat.py`, not in env.

## Run (from inside `rnd/`)

```powershell
# regenerate the mock data
python make_mock.py

# File 1: deterministic brain (+ charts)
python brain.py
python brain.py --plots            # writes PNGs to rnd/plots/

# File 2: live Meta probe (read-only GET against the real API)
python meta_live.py
python meta_live.py --preset last_30d --level ad

# File 3: RAG chatbot (costs OpenRouter tokens)
python chat.py
```

## Notes / decisions

- **Brain is deterministic templating**, not an LLM: numbers are computed and
  filled into sentence templates, so it cannot misstate a figure.
- **RAG is context-injection**, not embeddings: one account's metrics fit in
  context, so the whole compressed snapshot is handed to the model each turn.
- **Revenue is single-source** (Meta pixel purchases). Cross-platform blended
  ROAS / MER is out of scope here; that belongs in the normalization layer.
- Meta Insights is **polled JSON, not a stream**, and metrics restate for days;
  any real ingestion needs trailing-window re-pulls (see the design docs).
