# SHIP PLAN — merge `feat/ai_analy` + `feat/data-connectors` into `main`

**Goal:** ship the integrated pipeline (connectors → ai-layer blended ROAS + winning-creative
assets) and merge both branches to `main` as fast as is safe.
**Created:** 2026-07-01. **Owner legend:** 🟦 = me (this dev) · 🟨 = AI engineer · 🟩 = you/maintainer.
**This file is the source of truth for remaining work. Update checkboxes as items close.**

---

## 0. The single biggest unblock (do this first)

**🟨 Answer OQ1** (applicability-flag mechanism). It blocks the connector redesign implementation,
which blocks everything in Phase 0. Send the AI engineer the files in §4 today.

---

## 1. Branch facts (why there's no PR yet)

- `feat/ai_analy` — AI layer + creative. 18 ahead of `main`, 0 behind. Green (93+35+51 tests). No PR.
- `feat/data-connectors` — connectors. Branched off ai_analy@`fcf4b56`; 9 ahead / 2 behind ai_analy.
  HEAD `87660cc` (today's docs). 4 ahead of origin.
- **Zero file overlap** between the two → all merges are clean.
- **`main` auto-deploys** on Railway → a merge is a deploy. This is why Phase 1 is gated.

## 2. Open questions — 🟨 NEEDS AI-ENGINEER REPLY

Full text + trade-offs in `DEVIATIONS_FROM_AI_ANALY.md` (§ Open Questions). Short form:

- [ ] **OQ1 (BLOCKING)** — applicability flag: static per-platform capability sets *(suggested)* vs
      per-fact `na_fields`. → gates redesign impl.
- [ ] **OQ2** — `conversions` vs `purchases` field name *(suggested: keep `conversions` + 1-line
      brain alias)*.
- [ ] **OQ3** — derived fields stored vs computed-on-read *(suggested: store, parity with
      CampaignDayFact)*.
- [ ] **OQ4** — dedup `CampaignDayFact` now vs Phase-C *(suggested: defer)*.

## 3. Phase 0 — redesign + integrate + DEMO LOCALLY (no `main`, no prod risk)

- [ ] **OQ1 answered** 🟨
- [ ] **Implement Approach A redesign** 🟦 — `UnifiedFact` flat superset (preserve CampaignDayFact
      titles) + meta/shopify/google normalizers + flag (per OQ1) + tests. On `feat/data-connectors`.
      *(BLOCKED on OQ1.)*  Spec: `docs/superpowers/specs/2026-07-01-connector-fact-shape-redesign-design.md`.
- [ ] **Connector tests green** 🟦 — offline `pytest apps/connectors/tests` (Meta row fills all 20
      fields; nothing in `platform_extra` but residue; N/A=0.0 flagged).
- [ ] **Integration branch** 🟦 — `feat/integration` off `feat/ai_analy`; merge `feat/data-connectors`
      in (clean). Carries creative + AI layer + redesigned connectors.
- [ ] **Wire the additive seam** 🟦🟨 — new blended/cross-channel surface in ai-layer fed by
      `get_snapshot`/`get_assets` (+ `get_assets` winning creatives). Leave `CampaignDayFact`/brain
      Meta path untouched. Brain alias per OQ2.
- [ ] **Bundle connector into ai-layer image** 🟦 — Dockerfile build context → repo root,
      `COPY apps/connectors apps/connectors` + `pip install ./apps/connectors .` (see OPEN_ISSUES I5).
- [ ] **ai-layer + connector suites green together** 🟦 — `pytest apps/ai-layer/tests apps/connectors/tests`.
- [ ] **Local demo** 🟩 — full-stack devcontainer (api + web + ai-layer) with real Meta + Shopify
      creds; show blended ROAS + revenue gap + winning-creative assets end to end.
- [ ] **Shopify live smoke** 🟦🟩 — one real run (never live-smoked; OPEN_ISSUES I9).

## 4. Phase 1 — merge to `main` (GATED; `main` auto-deploys)

Clear these before merging, or the auto-deploy regresses prod / loses data:

- [ ] **I3 — SQLite persistent volume** 🟩 — Railway volume at `/app/data` (else store + cost ledger
      wiped every deploy).
- [ ] **I4 — LLM daily-cap enforcement** 🟦🟨 — competitor-spy + 2 crons are currently unbounded
      (billing risk).
- [ ] **I5 — Dockerfile + Railway build-context** 🟦🟩 — Dockerfile edit AND the ai-layer service's
      build-context/root setting flipped **atomically**.
- [ ] **I6 — Stand up ai-layer Railway service** 🟩 — deploy it + set `AI_LAYER_URL` & `AI_LAYER_API_KEY`
      (else autopilot/competitor-spy/morning-briefing degrade to templated content once ai_analy ships).
- [ ] **Decide deploy window** 🟩 — either disable `main` auto-deploy for the merge, or land in order:
- [ ] **PR-1: `feat/ai_analy` → `main`** 🟩 — after I6. Low risk (no connector, Dockerfile untouched).
- [ ] **PR-2: `feat/data-connectors` (+ seam) → `main`** 🟩 — after I3/I4/I5. Deploy-sensitive; careful review.
- [ ] **Post-merge smoke** 🟦🟩 — `/health`, blended endpoint, one chat turn, cost ledger persists.

## 5. Deferred (post-merge; tracked in OPEN_ISSUES)

- [ ] I1 persist snapshots for blended history · I2 dedup Meta path ×3 · I7 Approach C (one canonical
      None-safe fact type) · I8 Google live (dev-token approval) · I10 multi-tenant per-brand tokens.

## 6. Files index (everything created today — see §4 of the chat hand-off)

All committed on `feat/data-connectors` @ `87660cc` (this file adds a follow-up commit):
- `docs/superpowers/specs/2026-07-01-connector-fact-shape-redesign-design.md` — the design (🟨 review)
- `dev_reports/ai_serv/connectors/DEVIATIONS_FROM_AI_ANALY.md` — handover + OQ1–OQ4 (🟨 **reply**)
- `dev_reports/ai_serv/connectors/OPEN_ISSUES.md` — persistent blocker/issue tracker
- `dev_reports/ai_serv/connectors/SHIP_PLAN.md` — this file
