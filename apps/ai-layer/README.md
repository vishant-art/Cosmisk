# apps/ai-layer

Cosmisk **AI layer** — Meta Ads L1 transform, deterministic brain, RAG chat, an
accumulating SQLite store, and a **FastAPI service**. Phases 1-4 of the integration
plan (`dev_reports/ai_serv/ai-layer-integration-plan.md`) are done; not yet wired
into `apps/api` (Phase 5) or retiring the dormant TS (Phase 6).

> `rnd/` remains the experiment sandbox in parallel; retired in Phase 5/6. Treat
> `apps/ai-layer` as canonical.

## Package layout

```
apps/ai-layer/
  pyproject.toml          installable package (cosmisk-ai-layer)
  Dockerfile              container for the service
  ai_layer/
    config.py             env + paths (single place secrets are read)
    cost_ledger.py        Python-side LLM cost ledger (own tracking, not the TS gateway)
    meta_transform.py     L1 transform + typed contract (CampaignDayFact, Dataset)
    meta_live.py          live Meta ingestion (fetch_dataset/_envelope, list_accounts)
    store.py              SQLite store: trailing-window UPSERT, accumulates history
    brain.py              deterministic NL statements + EDA charts (no LLM)
    chat.py               context-injection RAG chatbot (LLM, gemini-2.5-flash)
    schemas.py            Pydantic request/response models (+ AiInsight cards)
    api.py                FastAPI service
    brain_real.py         live-fetch + brain + charts in one
    make_mock.py          regenerate data/mock_meta_ads.json
  tests/                  test_transform/chat/store/api (+ live, opt-in)
  data/                   mock_meta_ads.json (committed); store.sqlite/ledger/_real_* gitignored
```

## Service (FastAPI)

```powershell
uvicorn ai_layer.api:app --reload          # http://127.0.0.1:8000  (/docs for OpenAPI)
docker build -t cosmisk-ai-layer apps/ai-layer && docker run -p 8000:8000 --env-file .env cosmisk-ai-layer
```

Endpoints (all but `/health` require `X-API-Key` when `AI_LAYER_API_KEY` is set;
the user's Meta token is passed per-request via `X-Meta-Token`, env fallback locally):

| Method | Path | What |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/accounts` | ad accounts for the caller's Meta token |
| GET | `/insights/{account_id}?source=store\|live` | brain statements + `AiInsight[]` cards + daily chart data |
| POST | `/chat` | grounded analytical answer (RAG); `{account_id, message, history?, source}` |
| POST | `/ingest/{account_id}` | trailing-window UPSERT of live data into the store |
| GET | `/cost?account_id=` | LLM ledger total (per-account or all) |

**Store (Phase 3):** `store.py` persists `CampaignDayFact` rows in SQLite and uses
trailing-window UPSERT on `(account_id, campaign_id, date)` — `/ingest` re-pulls the
rolling window, restates recent (still-attributing) days, and appends new ones, so
history ACCUMULATES across runs. `source=store` reads the accumulated data; `live`
fetches fresh.

**Auth + tenancy (Phase 4):** caller auth via `X-API-Key`; per-user Meta token via
`X-Meta-Token` (service never touches the encrypted token DB); LLM cost attributed
per account in the ledger.

## Setup

```powershell
cos\Scripts\python.exe -m pip install -e apps\ai-layer
```

Reads `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `META_ACCESS_TOKEN` from the
repo-root `.env` (locally; `config.py` walks up to find it). In production these come
from real env vars.

## Run (from `apps/ai-layer`, as package modules)

```powershell
python -m ai_layer.make_mock                       # regenerate mock data
python -m ai_layer.brain --data data\mock_meta_ads.json --plots
python -m ai_layer.brain_real --account act_123    # live fetch + brain + charts
python -m ai_layer.chat                            # RAG chat; prompts for account
python -m ai_layer.meta_live                       # live probe

python -m pytest                                   # offline tests
$env:RUN_LIVE_LLM=1; python -m pytest               # also live LLM tests
```

## Database (Neon Postgres, `ai_layer` schema)

The facts store and cost ledger live in a dedicated `ai_layer` schema on the shared Neon
Postgres (SQLite/JSONL are retired). The service is **stateless** — no volume. Two env vars
are **required**: `DATABASE_URL` (pooled PgBouncer endpoint, runtime) and
`MIGRATION_DATABASE_URL` (direct/unpooled endpoint, DDL only) — the same split as the TS api.

- Access goes through `ai_layer.db` (`engine`, `models`, `repository`); `store.py` and
  `cost_ledger.py` are thin shims over it. All tables are `brand_id`-keyed (multi-tenant).
- Migrations are managed by Alembic and applied **manually**, never on container boot:
  `python -m ai_layer.db.migrate` (uses `MIGRATION_DATABASE_URL`).
- Tests run against a dedicated Neon **test branch** (built from `PG*`/`PG*_POOL` env vars)
  with per-test transactional rollback — see `tests/conftest.py`.

## Cost ledger

Every LLM call records `(model, tokens, cost_usd)` to the `ai_layer.cost_ledger` table via
`ai_layer.cost_ledger` (delegating to the repository). `chat` prints the running total on
exit. Prices in `cost_ledger.PRICING` are approximate OpenRouter 2026 figures — verify before
relying on absolute USD. This table owns **AI-layer-originated** cost (chat + insights +
creative roll-up); it is not total tenant LLM spend (TS `createMessage` cost stays TS-side).

## What changed vs `rnd/src`

Behaviour is identical; only the wiring is package-grade: absolute `from ai_layer
import ...` imports (no `sys.path` hacks), centralized `config`, the new
`cost_ledger`, and `pyproject.toml`. Field choices, the brain's materiality gates,
the chat's full-data + gemini + account-picker behaviour are all carried over.
Design docs: `dev_reports/ai_serv/`.
