# rnd/ — AI layer experiments

Standalone Python experiments for the AI/analytics layers. These are throwaway
R&D harnesses; once validated they get integrated into `apps/ai-layer`, and only
then do we retire the equivalent TypeScript. Nothing here imports from `apps/`.

Design docs (kept in sync with this code): `dev_reports/ai_serv/`.

## Layout

```
rnd/
  src/        source modules
    meta_transform.py   L1 transform + typed contract (CampaignDayFact, Dataset)
    brain.py            deterministic NL statements + EDA charts (no LLM)
    chat.py             context-injection RAG chatbot (OpenRouter, gemini-2.5-flash; full data)
    meta_live.py        live Graph API probe (paginated); --save exports an envelope
    make_mock.py        generates data/mock_meta_ads.json (seeded, messy actions)
  tests/      pytest: test_transform.py (L1 contract), test_chat.py (snapshot + live)
  data/       mock_meta_ads.json (synthetic, committed); _real_*.json (real, gitignored)
  plots/      chart output (gitignored)
  requirements.txt, README.md
```

`src/` modules import each other by bare name (each adds its own dir to `sys.path`);
tests add `src/` to the path. Field interpretation is documented in
`dev_reports/ai_serv/meta-field-choices.md`.

## Setup

Uses the repo's `cos/` virtualenv. From the repo root:

```powershell
cos\Scripts\python.exe -m pip install -r rnd\requirements.txt
```

Credentials are read from the repo-root `.env` (`META_ACCESS_TOKEN`,
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`). The OpenRouter model is a constant
at the top of `src/chat.py`, not in env.

## Run (from inside `rnd/`)

```powershell
# regenerate the mock data  (-> data/mock_meta_ads.json)
python src\make_mock.py

# deterministic brain (+ charts to rnd/plots/)
python src\brain.py
python src\brain.py --plots

# live Meta probe (read-only GET); --save writes a real envelope into data/
python src\meta_live.py
python src\meta_live.py --account act_123 --preset last_30d --save data\_real_sample.json

# brain on captured real data
python src\brain.py --data data\_real_sample.json --plots

# RAG chatbot -- pulls LIVE Meta data on start (costs OpenRouter tokens)
python src\chat.py
python src\chat.py --account act_123 --preset last_14d
python src\chat.py --data data\_real_sample.json   # offline override

# tests
python -m pytest tests                          # offline suite (free)
$env:RUN_LIVE_LLM=1; python -m pytest tests      # also run live LLM grounding tests
```

## Notes / decisions

- **Field choices matter.** We take LINK clicks (`inline_link_clicks`/`_ctr`), not
  all-clicks (`clicks`/`ctr`); WEBSITE pixel purchase (not omni) for revenue; and
  DERIVE ROAS. Full rationale: `dev_reports/ai_serv/meta-field-choices.md`.
- **Brain is deterministic templating**, not an LLM: numbers are computed and
  filled into sentence templates, so it cannot misstate a figure.
- **RAG is context-injection**, not embeddings: one account's metrics fit in
  context, so the whole compressed snapshot is handed to the model each turn.
- **Revenue is single-source** (Meta website pixel purchases). Cross-platform
  blended ROAS / MER (L2) is out of scope here.
- Meta Insights is **polled JSON, not a stream**, and metrics restate for days;
  any real ingestion needs trailing-window re-pulls (see the design docs).
