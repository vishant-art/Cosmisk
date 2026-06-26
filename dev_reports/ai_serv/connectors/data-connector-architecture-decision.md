# Data Connector — Architecture Decision (Meta + Shopify + Google Ads)

> For the AI engineer who built the Python AI layer + Meta ingestion. Goal: pick the
> **optimal server state** for a connector that feeds all three platforms (data + media
> assets) into the Python analysis layer. All options, honest tradeoffs, and the reasoning
> for the recommendation are below — decide on the evidence, not the pitch.
> Branch: `feat/data-connectors`. Date: 2026-06-26.

---

## 1. Where we actually are today (ground truth, verified)

Two parallel worlds that do not touch:

| | TypeScript (`apps/api/src/audit/`) | Python (`rnd/src` + `apps/ai-layer`) |
|---|---|---|
| **Meta Ads** | `meta-ingestion.ts` (Graph v21) + pixel health + audience counts | `meta_live.py` (v23) + typed `CampaignDayFact`/`Dataset` + `meta_creatives.py` (asset download) |
| **Shopify** | `shopify-ingestion.ts` (2024-01): orders, AOV, repeat-rate, OOS | **none** |
| **Google Ads** | `google-ads-ingestion.ts` (v18, GAQL) + OAuth refresh | **none** |
| **Status** | stable, scheduled, in production | Meta-only, R&D-grade |

Facts that decide the architecture:

- **Credentials are already centralized in Neon Postgres** — `meta_tokens`, `google_tokens`,
  `shopify_tokens` (encrypted, with OAuth refresh in TS). *Either* approach can share this
  token store, so "secrets duplication" is **not** a real differentiator.
- **TS persists only analysis, not raw facts.** `saveAudit()` writes `AuditOutput` to the
  `audits` table (`apps/api/src/audit/index.ts:397`). The normalized per-day snapshots it
  builds live in memory and are discarded. There is **no** raw per-day fact table today.
- **The Python store is intentionally isolated.** `apps/ai-layer/ai_layer/store.py` is
  self-contained SQLite that "never touches the main Neon DB" — a deliberate boundary.
- **The two AIs are disconnected and duplicate work.** TS `runCreativeAudit` (all-3-platform
  LLM analysis) and the Python `brain`/`chat` (Meta-only) both analyze ad data with an LLM,
  in two languages.
- **Duplicated Meta layer.** `meta_live.py`/`meta_transform.py` exist **identically** in
  `rnd/src` *and* `apps/ai-layer/ai_layer`. (This also caused the code-graph's false
  ~100-file blast radius via the bare-name collision.)

**The Python layer's real gap is not ingesting — it is _consuming multi-platform data_ and
_downloading cross-platform assets_.** That framing drives the options.

---

## 2. The options (reality of each, no spin)

### Option 1 — Full Native Python
Port Shopify + Google Ads ingestion to Python (OAuth refresh, GAQL, pagination), reading the
encrypted tokens from Neon (+ porting `token-crypto`). Python becomes self-contained.

- **Pros:** AI layer fully self-contained / independently deployable; one clean typed
  contract end-to-end; no runtime dependency on the TS process; engineer works entirely in
  his domain.
- **Cons (the real cost):** ingestion logic now lives in **two languages** → 2× maintenance
  and guaranteed API-version drift (already real: Meta v21 TS vs v23 PY). **2× external API
  rate-limit consumption** — TS keeps ingesting, so every account gets hit twice (Meta BUC
  limits are per-account; Google/Shopify likewise). Must port OAuth-refresh + token
  decryption correctly (security-sensitive, easy to get subtly wrong). Longest path to first
  value — Google OAuth is the hard 60%.
- **Optimal-state verdict:** only justified if the explicit goal is a **fully decoupled
  Python service with no shared DB**. Otherwise it duplicates the hard, stable part.

### Option 2 — Full Bridge
Python calls TS for everything (data + assets); thin Python adapter over the TS snapshot.

- **Pros:** zero ingestion duplication; fastest to wire; TS stays the single owner.
- **Cons:** Python depends on the **TS server being up** at request time (tight service
  coupling); Python inherits TS's snapshot shape instead of the clean `CampaignDayFact`
  contract the brain/creative layer already speak; assets still aren't solved (TS only holds
  thumbnail URLs, no download); **least Python ownership** — gives the engineer almost nothing
  to build, and makes the AI layer a slave to TS API shapes.
- **Optimal-state verdict:** cheapest, but the runtime coupling and loss of the typed
  contract make it the weakest long-term state.

### Option 3 — Hybrid  ★ recommended
Split by **strength**, decouple via **data**:

1. **TS stays the single ingestion + credential owner** (it's stable, already has OAuth +
   encrypted tokens) and additionally **persists normalized per-platform facts** to Neon —
   a small new addition (today it only saves analysis).
2. **Python connector reads those facts** → maps into **one typed multi-platform contract**
   (extend `CampaignDayFact` to carry Shopify revenue truth + Google spend) → feeds the
   existing `brain` / `chat` / creative pipeline. This is where **blended ROAS, the
   Meta-pixel-vs-Shopify revenue gap, and true CPA** get computed — the numbers the Python
   AI currently can't produce.
3. **Python natively owns the one thing TS lacks: cross-platform asset download.** Extend
   `meta_creatives.py` into a platform-agnostic retriever (Meta winners + Shopify product
   images + Google image assets), each asset carrying its stat line. TS only returns URLs;
   Python already has the download-immediately/hash-resolution discipline.
4. **De-dup `meta_live`/`meta_transform`** into one shared module both `rnd` and
   `apps/ai-layer` import — the foundation, done first.

- **Pros:** single ingestion source of truth (no dup, no 2× rate-limit, no version drift);
  single encrypted token store; **the engineer still owns a substantial Python module**
  (typed contract + cross-platform reconciliation + asset retrieval — the interesting part,
  not boilerplate API plumbing); decoupled via the DB (Python needs Neon, not a live TS
  process); each language does what it's best at.
- **Cons (honest):** requires a **small TS change** (persist normalized facts) → one bout of
  cross-language coordination; Python now **reads Neon**, crossing the ai-layer's current
  "self-contained SQLite" boundary on purpose; a shared fact-schema contract to keep stable.
- **Optimal-state verdict:** best balance — eliminates duplication and unblocks the
  high-value analysis while keeping the Python layer meaningful and only loosely coupled.

#### Seam sub-decision (within Hybrid)
- **Neon table (recommended):** TS writes normalized facts; Python reads them. Decoupled,
  async, Python only needs the DB. Cost: a fact-table schema + TS write path.
- **Internal TS HTTP endpoint:** no schema, returns the snapshot on demand; but Python needs
  TS running and the call is synchronous/coupled — re-introduces Option 2's main weakness.

---

## 3. Recommendation & reasoning

**Adopt Option 3 (Hybrid) with the Neon-table seam.**

Reasoning, in priority order:

1. **Don't duplicate the stable, hard part.** Production OAuth ingestion for three platforms
   already exists and works in TS. Re-implementing it in Python buys decoupling at the price
   of permanent two-language maintenance and double API-rate-limit burn — a worse server
   state, not a better one.
2. **The Python gap is analysis + assets, not ingestion.** Hybrid targets exactly that gap and
   finally lets the Python brain compute **blended ROAS / revenue truth** — the single most
   valuable output, impossible while it's Meta-only.
3. **The engineer keeps real ownership.** The typed multi-platform contract, the
   cross-platform reconciliation math, and the asset retriever are substantial, interesting
   Python — he is not reduced to a thin adapter (Option 2) nor stuck porting OAuth (Option 1).
4. **Loose coupling via data, not a live service.** The DB seam means the AI layer depends on
   Neon (already the only DB), not on the TS process being up — better than Bridge's runtime
   coupling, without Native's duplication.

**When to override:** if the firm goal is a **fully independent, separately deployable Python
AI service with zero shared DB**, Option 1 (Native) becomes the right call despite the
duplication cost. That is the only scenario where Native wins.

---

## 4. First steps if Hybrid is approved (sequence)

1. **De-dup the Meta layer** → one shared `meta_live`/`meta_transform` module (foundation;
   removes the duplication landmine and the graph false-positive).
2. **Define the unified typed contract** (multi-platform fact extending `CampaignDayFact`:
   adds Shopify revenue/orders + Google spend/conv per day/entity).
3. **TS: persist normalized facts** to a new Neon table (reuse the in-memory snapshots
   `audit/index.ts` already builds).
4. **Python connector: read facts → contract → blended-ROAS analysis**, wired into
   `brain`/`chat`.
5. **Cross-platform asset retriever** (generalize `meta_creatives.py`).
6. **Bump/pin API versions** in the single ingestion owner (Meta → v25, etc.).

Each step is independently testable and mock-friendly (same lazy-import discipline as the
existing Python layer).
