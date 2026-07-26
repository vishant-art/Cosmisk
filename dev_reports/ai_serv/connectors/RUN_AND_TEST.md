# Run & Test Cosmisk Locally (incl. the cost-incurring creative features)

> How to run the whole platform on your machine, test it as a user/admin, exercise the new
> **data connector**, and run the **`ai_analy` creative system** (image/video/audio) which spends
> real money — with a cost ladder to stay **under ~$2**. Verified against the repo 2026-06-27.

---

## 0. Branch reality (read first)

- The **data connector** is on **`feat/data-connectors`** (`apps/connectors/`).
- The **creative system + the new audio-in-video** feature (the ~$2 cost test) is on **`feat/ai_analy`**
  (`rnd/creative/`) — it is **NOT on the connector branch yet** (they aren't merged).
- The `rnd/creative` pipeline is a **standalone CLI**; it is **not wired to the web UI**. The UI's
  Creative Studio/Engine use separate TS providers. So "test the creative system as on ai_analy" =
  run the CLI on the `ai_analy` branch (§6), not the web UI.

Pick the branch for what you're testing: `git checkout feat/ai_analy` for creative,
`git checkout feat/data-connectors` for the connector.

---

## 1. Components & ports

| Service | Dir | Port | Run |
|---|---|---|---|
| API (Fastify + Postgres) | `apps/api` | `3000` | `npm run dev:api` |
| Web (Angular) | `apps/web` | `4200` (https, self-signed) | `npm start` |
| AI-layer (FastAPI) | `apps/ai-layer` | `8077` via `npm run dev`, or `8000` standalone | `uvicorn ai_layer.api:app` |
| Connector | `apps/connectors` | (library) | `pip install -e`, then imported |
| Creative CLI ($) | `rnd/creative` | — | `python src/main.py …` |

`npm run dev` (repo root → apps/api/dev.mjs) supervises **API + ai-layer together**.

---

## 2. One-time setup

```bash
cd /home/anantdluffy/workspace/Cosmisk
nvm install 22 && nvm use 22            # Node 22 (pinned)
npm install                              # web + packages/types workspaces
npm install --prefix apps/api            # API deps
python3 -m pip install -e apps/ai-layer  # ai-layer (FastAPI)
python3 -m pip install -e apps/connectors        # connector (on feat/data-connectors)
pip install -r rnd/creative/requirements.txt     # creative CLI (on feat/ai_analy)
```

## 3. Environment keys (`.env`)

TS API reads **`apps/api/.env`**; the Python layers (ai-layer, connectors, creative) read the
**repo-root `.env`**. Put platform keys in both (or symlink). Start from `apps/api/.env.example`.

| Key | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | API (live data) | Neon pooled URL, or local docker (§4) |
| `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` | API auth/token storage | any strong value for local |
| `ANTHROPIC_API_KEY` | API LLM features | |
| `OPENROUTER_API_KEY` | ai-layer chat, creative brand-brain + VLM critic | **creative needs this** |
| `FAL_KEY` | creative image/video generation | **the spend key** (fal.ai billing) |
| `META_ACCESS_TOKEN` (+ `META_AD_ACCOUNT_ID`) | ai-layer + connector Meta + creative `--meta-account` | |
| `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` | connector Shopify | |
| `GOOGLE_ADS_*` (5 vars) | connector Google | optional — connector stays `skipped` without them |
| `AI_LAYER_API_KEY` | ai-layer caller auth | optional locally |

## 4. Database

- **Neon (recommended):** set `DATABASE_URL` to your Neon pooled URL; schema applies on API boot.
  Manual: `cd apps/api && npm run db:migrate` (or `npm run db:check`).
- **Local Postgres:** `docker-compose -f infra/docker-compose.yml up -d` →
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cosmisk`.
- **Seed demo brands:** `cd apps/api && npx tsx scripts/seed-brands.ts`.

## 5. Run + test as a user/admin (UI, low/no cost)

```bash
# Terminal 1
npm run dev          # API :3000  (+ ai-layer :8077)
# Terminal 2
npm start            # Web https://localhost:4200  (accept the self-signed cert)
```
Then:
1. `https://localhost:4200/app/login` → sign up (creates an account) or use a seeded user.
2. Exercise dashboard / analytics / brand pages (reads DB + Meta if a token is set).
3. **Creative via UI** (Creative Studio/Engine) calls TS fal providers — this **does cost**
   (fal image gen), but is separate from the `rnd/creative` CLI below.

Health checks: `curl localhost:3000/health` · `curl localhost:8000/health` (standalone ai-layer).

## 6. Test the `ai_analy` creative system — the real-cost run (≤ $2)

```bash
git checkout feat/ai_analy && git pull        # the creative + audio features live here
cd rnd/creative
```

**Step 1 — free first.** Always dry-run the mocked suite ($0) before spending:
```bash
python -m pytest tests          # ~76+ passing, fal/LLM fully mocked, $0
```

**Step 2 — one real static run (~$0.60–0.80).** Generates real ads via fal + OpenRouter:
```bash
python src/main.py --data ../data/_real_sample.json \
    --select top-roas --images 3 --formats 1:1,4:5,9:16 --vlm
```
Output + the **exact cost** land in `output/<run_id>/` (`ledger.jsonl` ends with a TOTAL).

**Step 3 — the new audio-in-video feature (~$1–1.5 for a 5s clip).** Highest cost; do ONE short clip:
```bash
python src/main.py --resume <run_id> --video --duration 5
```

**Cost ladder — staying under ~$2:**

| Action | ~Cost | Running total |
|---|---|---|
| Mocked tests | $0 | $0 |
| One static multi-format run (`--vlm`) | ~$0.65 | ~$0.65 |
| One 5s video (`--video --duration 5`) | ~$1.0–1.3 | **~$1.7–2.0** |

Keep it ≤ $2 by doing **one** static run **and one** short video. Every step is priced in
`ledger.jsonl`; check it. Lower cost further: drop `--vlm`, fewer `--images`, fewer `--formats`,
shorter `--duration`. Never loop `--video` unattended.

## 7. Test the data connector (on `feat/data-connectors`, $0–small)

```bash
git checkout feat/data-connectors
cd apps/connectors && python -m pytest tests        # 25 tests, $0, no network
```
Live smoke (after putting Meta/Shopify keys in repo-root `.env`):
```bash
python -c "from connectors import get_snapshot, BrandRef, DateWindow; \
s=get_snapshot(BrandRef(brand_id='demo'), DateWindow.last_n_days(30)); \
print('blended ROAS', s.blended.blended_roas, '| statuses', [(x.platform,x.state) for x in s.statuses])"
```
Missing-cred platforms show `skipped`; nothing raises. This is read-only API calls (no spend).

---

## 8. Quick reference

- Whole stack: `npm run dev` (+ `npm start` for UI).
- $0 confidence first: `pytest` in `rnd/creative` and `apps/connectors`.
- Real creative spend is **only** `python src/main.py` with `FAL_KEY` set — budget via `ledger.jsonl`.
- Connector + creative are on **different branches** today; merging them is a future step.
