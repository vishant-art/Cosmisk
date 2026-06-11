# rnd/ — AI layer experiments

Standalone Python experiments for the AI/analytics layers. These are throwaway
R&D harnesses; once validated they get integrated into `apps/ai-layer`, and only
then do we retire the equivalent TypeScript. Nothing here imports from `apps/`.

Design docs (kept in sync with this code): `dev_reports/ai_serv/`.

## Files

| File | What it is |
|---|---|
| `make_mock.py` | Generates `mock_meta_ads.json` (seeded, reproducible). Shaped like a real Meta Insights campaign-level daily pull, with **intentionally messy action arrays** (22 action_types/row, same purchase under pixel/omni/onsite/bare keys). |
| `mock_meta_ads.json` | The generated mock dataset (4 campaigns × 30 days, with narratives). Synthetic, safe to commit. |
| `meta_transform.py` | **L1 transformation module** + typed contract (`CampaignDayFact`, `Dataset`): explodes nested arrays, picks the canonical purchase, returns tidy pandas frames. Single source of truth; consumers never touch raw JSON. |
| `brain.py` | Deterministic NL statements (materiality-gated) plus `--plots` EDA charts. No LLM. |
| `meta_live.py` | Live Graph API probe (paginated); `--save` exports a real envelope JSON. |
| `chat.py` | Context-injection RAG chatbot via OpenRouter (`openai/gpt-5-nano`). |
| `test_transform.py`, `test_chat.py` | pytest suites: L1 contract robustness + snapshot correctness + opt-in live grounding/anti-hallucination. |

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
python meta_live.py --account act_123 --preset last_30d --save _real_sample.json

# run the brain / chat on the captured real data
python brain.py --data _real_sample.json --plots
python chat.py  --data _real_sample.json

# File 3: RAG chatbot on mock (costs OpenRouter tokens)
python chat.py

# tests
python -m pytest                       # offline suite (free)
$env:RUN_LIVE_LLM=1; python -m pytest   # also run live LLM grounding tests
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
