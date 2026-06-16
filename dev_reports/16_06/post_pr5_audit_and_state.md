# Post-PR#5 Audit — AI Layer Integration: Changes, Scrutiny, SoW & State

> **Status: 🔵 ACTIVE (2026-06-16).** Audit of everything committed after the PR #5 merge,
> scrutinised, checked against the SoW, with the true git/deploy state and the remaining work.

**Audited range:** `aa0672e` (PR #5 merge) → `c715d28` (HEAD) — **10 commits**
**Work lives on:** `origin/feat/ai_analy` (= local HEAD, in sync)
**SoW window today:** M3 — AI Analysis (RAG + Anomaly), Jun 11–22
**Updated:** 2026-06-16 — extended to cover commits `6c87a64` (*integration to main services 3*)
and `c715d28` (*chat demo doc*), which materially change the LLM-routing picture (see §2.1, §2.5).

---

## 1. What changed (the facts)

The 10 commits (`exp: initial rnd` → `chat demo doc`) build the **AI analysis layer** as a
standalone Python service, wire it into the app behind a flag, delete the dead TS the new
service replaces, and — in the last two commits — **migrate three live TS services off the
Anthropic gateway onto the ai-layer's OpenRouter path** (the consolidation, see §2.1).

| Area | Change | Size |
|---|---|---|
| **`apps/ai-layer/`** (NEW) | FastAPI service: `meta_transform` (typed L1), `brain`/`brain_real` (deterministic insights), `chat` (RAG), `store` (SQLite trailing-window UPSERT), `context_cache`, `cost_ledger`, `schemas`, `api`, `Dockerfile`, 7 test files | 24 files |
| **`apps/api/`** (wiring) | `boot/ai-layer-routes.ts` (insights/chat/refresh), `services/ai-layer-client.ts` (HTTP client), `config.ts` (+`aiLayerUrl`/`aiLayerApiKey`/`metaAccessToken`/`demoAccountId`), `index.ts` registration, `__tests__/ai-layer-routes.test.ts` | 5 added/modified |
| **`apps/api/`** (deletion) | **16.9K LOC dormant TS removed**: `elite-intelligence/`, `intelligence-layer/`, `quality-governance/`, `signal-discovery/`, most of `strategic-cognition/`, `quality-gated-runner.ts` | ~39 files deleted |
| **`apps/web/`** | AI Chat tab (`ai-chat.component.ts`), `ai-layer-insights.component.ts` (Dashboard/Brain/Analytics), routes/sidebar/env | 10 files |
| **`rnd/`** | Python experiment sandbox (source of the ai-layer) + committed mock data & plots | ~18 files |
| **`dev_reports/ai_serv/`** | 9 design/decision docs | docs only |
| **LLM consolidation** (commits `6c87a64`/`c715d28`) | New Python `/complete` + `/chat/stream` endpoints; `createViaAiLayer`/`aiLayerComplete` added to `ai-layer-client.ts`; **`competitor-spy.ts`, `autopilot-engine.ts`, `morning-briefing.ts` switched from `createMessage` (gateway) → `createViaAiLayer`**; web streaming chat (`chat-state.service.ts`); dev tooling (`apps/api/dev.mjs` one-command launcher, `start-ai-layer.ps1`) | ~21 files |

Maps cleanly to `dev_reports/ai_serv/ai-layer-integration-plan.md`: Phases 1–6, architecture
path **A** (Python service over HTTP at the seam). The last two commits go **beyond** that plan:
they begin retiring the **TS Anthropic gateway** as the LLM path for live agents (§2.1).

---

## 2. Scrutiny — issues worth attention

**🔴 1. Architecture Rule #1 — the gateway is being *replaced*, not bypassed (the #1 sign-off item).**
Two things, escalating:
- The Python ai-layer calls **OpenRouter directly** (`chat.py:304`, `api.py:151` —
  `OpenAI(base_url=openrouter)`), tracking spend via a *parallel* `cost_ledger.py`.
- **As of `6c87a64`, three live TS services were switched off the gateway onto the ai-layer:**
  `competitor-spy.ts`, `autopilot-engine.ts` (cron ~4h), `morning-briefing.ts` (cron) replaced
  `createMessage(...)` (llm-gateway) with `createViaAiLayer(...)` → the new Python `/complete`
  endpoint. The `/complete` docstring states the intent plainly: *"all OpenRouter usage + cost
  lives here, not in the TS Anthropic gateway."* This is a deliberate **architecture migration**,
  not an accidental leak — but it inverts CLAUDE.md Rule #1 (gateway-only), so it needs an explicit
  decision to bless the new policy (or reverse it).

Two concrete consequences to sign off on:
- **Cap enforcement lost on these paths.** The old TS gateway ran `checkDailyLimit` /
  `getDailySpendCents` in-path. The Python `/complete` only *records* cost
  (`cost_ledger.total_usd` before/after) — **no daily-cap check**. So spend is now *tracked* but
  not *capped* for competitor-spy + the two crons. The crons fire automatically → unbounded by design.
- **Model/provider change for production agents.** These three previously ran on **Anthropic
  Claude** via the gateway; they now run on **OpenRouter / Gemini-2.5-flash**. Their prompts were
  Claude-tuned — an output-quality regression risk worth a spot-check.

**🟠 2. A planned deliverable was deleted as "dead code."**
`strategic-cognition/client-report-generator.ts` was removed in the Phase-6 dormant-island
sweep, but `CLAUDE.md` lists `client-report-generator` under "Needs wiring: WhatsApp/HTML
delivery." It was provably 0-caller dead code, so the deletion is *technically* safe — but it
removes the prior scaffold for the M4 client-report-delivery feature. **Decision:** re-scope M4
delivery onto the ai-layer path, or restore.

**🟡 3. Git hygiene** (fixes in §6).
- `rnd/__pycache__/meta_common.cpython-312.pyc` is **still tracked** despite the
  "added pycache to gitignore" commit (ignore added, file never `git rm --cached`'d).
- `mock_meta_ads.json` (17K lines) committed **twice** (`rnd/data/` + `apps/ai-layer/data/`).
  Generated mock data (no real keys/tokens — verified), so low-risk, just bloat/duplication.

**🟢 4. Integration quality is good.** `ai-layer-routes.ts` is flag-gated (no-op without
`AI_LAYER_URL`), auth-guarded, demo-mode gated on prod-empty `metaAccessToken`, and degrades
gracefully on every error path. No secrets committed (`.env` files are `.example` only).

**🟠 5. No longer purely additive — 3 live features now degrade without the ai-layer.**
The earlier commits were additive (flag-off = invisible). The `6c87a64` switch is different: the
behaviour of *existing* features now changes the moment these commits ship. If `AI_LAYER_URL` is
unset (prod today — service not deployed), `createViaAiLayer` throws `AiLayerError 503`. **The
good news:** all three callers `catch` it and degrade gracefully —
`autopilot-engine` → `generateFallbackContent` (templated alerts), `competitor-spy` → a static
analysis string, `morning-briefing` → a fallback briefing object. So **no outage** — but in prod
today these three run on **non-AI fallback content** (the AI value is silently off) until the
ai-layer is deployed and `AI_LAYER_URL` is set. It self-heals on deploy. Net: ship these commits
and deploy the ai-layer *together*, or accept degraded-but-safe behaviour in the interim.

---

## 3. Gate verification (Test Invariant)

| Gate | Result |
|---|---|
| `tsc --noEmit` (apps/api) | ✅ **baseline-only** (`billing.ts:4` stripe TS7016; nothing else) — re-verified after the `6c87a64` pull |
| `madge --circular` | ✅ **0 cycles** — re-verified after the pull |
| vitest default + pg suites | ⚠️ **not runnable on this WSL2 host** (rolldown native binary SIGBUS). Plan reports ~413 default pass; gates in CI. |
| ai-layer pytest (plan claims 50 pass) | ⚠️ **not re-verified** (no pytest/venv in base env). Claim is from the dev report. |

---

## 4. SoW alignment

| Milestone | Window | Status |
|---|---|---|
| M1 — Infrastructure | May 16–28 | ✅ Done (PG migration, gateway, monorepo) |
| M2 — Ingestion & Normalization | May 29–Jun 10 | ✅ Delivered by ai-layer (`meta_live` ingest + `store` UPSERT + `meta_transform` L1) |
| **M3 — AI Analysis (RAG + Anomaly)** | **Jun 11–22** | 🔵 **This is the work.** `brain` = anomaly/insights; `chat` = RAG. Built & locally verified; **on track in-window.** |
| M4 — Generative Engine | Jun 23–Jul 3 | ⏳ Pending (note: client-report-generator scaffold deleted — §2.2) |
| M5 — QA & Final Delivery | Jul 4–Jul 10 | ⏳ Pending |

On-milestone and on-schedule for M3.

---

## 5. State of the codebase (CORRECTED)

> An earlier verbal read of "unpushed / 9 commits ahead" was **wrong** — an artifact of the
> local branch tracking a stale upstream. Corrected below.

**Push state — everything is pushed. Zero local-only commits** (`git log --not --remotes` empty).

```
origin/main                 ← PR#5 (aa0672e) + fb9b926.  Does NOT have ai-layer work.
origin/feat/ai_analy        ← has EVERYTHING (= local HEAD c715d28, in sync).  ✅
origin/monorepo-restructure ← STALE, pre-merge (f68e738).
```

The "9 ahead" came from the local branch (`monorepo-restructure`) tracking the **stale**
`origin/monorepo-restructure` while the real work was pushed to `origin/feat/ai_analy`.
Fixed by checking out a local `feat/ai_analy` that tracks the correct remote (§6); the remote
had advanced by 2 commits (`6c87a64`, `c715d28`) which were fast-forward-pulled — now in sync.

**Deploy state — built but OFF in production:**
- `railway.toml` is single-service (`node dist/index.js` = Fastify only). `apps/ai-layer` has a
  `Dockerfile` but **no Railway service wired** — the Python service is not running in prod.
- `AI_LAYER_URL` defaults to `''` → the `/ai-layer/*` routes are a **no-op in prod**. Even if
  merged, the feature stays dark until the Python service is deployed and the URL is set.

**So:** fully built, fully pushed, green on static gates — but **not merged to `main`** and
**not deployed/enabled** in production.

---

## 6. Remaining work — done / how / left

**Done & how:** M3 AI analysis (RAG + anomaly brain) built as `apps/ai-layer` (Python/FastAPI)
via path A (HTTP at the seam), wired into apps/api behind `AI_LAYER_URL`, surfaced in apps/web
(Chat tab + insight cards). 16.9K LOC dormant TS removed. tsc + madge green locally. All pushed
to `origin/feat/ai_analy`.

**Left to do (priority order):**

1. **Sign-off: LLM policy (Rule #1).** Bless or reverse the migration of live agents
   (competitor-spy, autopilot, morning-briefing) off the TS gateway onto the ai-layer's
   OpenRouter `/complete`. If blessed, **add a daily-cap check to the Python path** (cost is
   recorded but not capped today — the crons are unbounded) and **spot-check output quality**
   on the Claude→Gemini provider switch. *(The #1 risk.)*
2. **Deploy `apps/ai-layer` + set `AI_LAYER_URL` *with* the API ship.** No longer optional:
   three live features now run on degraded fallback content until the ai-layer is reachable
   (§2.5). Deploy them together, or knowingly accept the interim degrade.
3. **Open PR** `feat/ai_analy` → `main` and run CI (the only place vitest/pg/docker gates run).
   *(Note: it is pushed — this is a merge, not a push.)*
4. **Decide** the `client-report-generator` deletion (§2.2) — re-scope M4 onto ai-layer or restore.
5. Background `/ingest` cron to keep the store warm (documented prod follow-up).

### Hygiene fixes (recommended commands)

```bash
# 1. Untrack the committed bytecode (ignore was added but the file was never removed)
git rm --cached rnd/__pycache__/meta_common.cpython-312.pyc
git rm -r --cached --ignore-unmatch rnd/__pycache__   # belt-and-suspenders for any other .pyc

# 2. Dedup the 17K-line mock dataset. It is generated by make_mock.py, so it need not be
#    committed at all. Pick ONE:
#    (a) keep a single canonical copy (apps/ai-layer/data) and drop the rnd copy:
git rm --cached rnd/data/mock_meta_ads.json
#    (b) OR stop tracking both (regenerate on demand) and gitignore the pattern:
#        echo 'data/mock_meta_ads.json' >> .gitignore   # add per-dir as needed

# 3. Verify .gitignore covers Python bytecode so this can't recur
grep -qE '__pycache__|\*\.pyc' .gitignore || printf '\n__pycache__/\n*.pyc\n' >> .gitignore

# 4. Branch hygiene (the root cause of the "unpushed?" confusion):
#    work on a branch that tracks the real remote, not the stale one.
git checkout -b feat/ai_analy origin/feat/ai_analy   # local branch tracks origin/feat/ai_analy
#    (optional) delete the misleading local branch once switched:
#    git branch -D monorepo-restructure
```

After the hygiene commits, re-confirm gates: `tsc` baseline-only · `madge` 0 cycles · CI for the
test suites.
