# Resume note — Creative Studio redesign (2026-07-21)

**Status:** 🟢 IMPLEMENTATION COMPLETE · compact-survival note. Branch `improve/creative`.
**Not pushed. `finishing-a-development-branch` not yet run.**

## What's done (14 commits, `dddb396..b7a61c2`)

Built subagent-driven off `docs/superpowers/plans/2026-07-21-creative-studio-ui-redesign.md`
(spec: `docs/superpowers/specs/2026-07-21-creative-studio-ui-redesign-design.md`). Every task
two-stage reviewed (spec ✅ + quality approved). Full per-task record + commit hashes:
`.superpowers/sdd/progress.md` (the SDD ledger).

**Backend passthrough (Phase 1, TDD):** `direction` on generate · `creator` on video/plan ·
`direction`+`creator`+`pin_face`+`hero_with_creator` on video/generate · 4 loop routes proxied
(published/learn/prior/graph) · voice-preview endpoint (new ai-layer MiniMax route + passthrough).

**Frontend (Phase 2, build-verified — no Chrome so Karma can't run here):** studio service
extended · degrade-badge component · brief-first Zone A (removed dead URL hero + Import-from-Sprint)
· run milestone rail + verbatim activity feed · evidence-forward results (rejected[]+cost; **no
fabricated per-image QA** — static assets carry none) · persona + voice preview + quote polish +
402 re-quote + video QA banner (filters the 2 known-FP checks `caption_audio`/`cut_alignment`) ·
prior/graph + harvest panel (metaAccountId consolidated onto `AdAccountService`).

**Gates:** web prod build 0 errors · apps/api **436 passed / 2 skipped** · ai-layer creative
**487 passed** · tsc baseline-only (`billing.ts:4`) · code-review-graph: every `/creative/*`
endpoint routed frontend↔api↔ai-layer, **no orphans**. Final whole-branch review:
**READY-WITH-FOLLOWUPS**; its one Important find (persona Age/Gender/Energy free-text → 422 on the
$0 plan step) was **fixed** → taxonomy `<select>` dropdowns (`b7a61c2`).

## Do this next (pick up here)

1. **Decide branch completion** — run `superpowers:finishing-a-development-branch` (verify + summary,
   **no push** without explicit per-instance permission). Eventual: merge `improve/creative` → main → deploy from main.
2. **Paid end-to-end sim run (~$4.78 real fal)** — user's call, NOT triggered. Bring the sim up
   (`docker compose -f docker-compose.sim.yml up -d --wait --build`; migrate once; `./infra/sim-smoke.sh`;
   open http://localhost:8080; connect Meta with the real key), walk brief+direction → concepts
   (QA/rejected/cost) → persona+voice → plan ($0 quote) → render 3 clips → video+QA banner. Ports:
   web 8080, api 3100, ai-layer 8000.

## Deferred (honest, documented — NOT faked in the UI)

- **Variant A/B + publish→stamp→learn BACK HALF** — the front (prior/graph/harvest panel) IS built.
  The back half needs `apps/api /video/generate` to forward `variant_axis`/`variant_values` and
  surface the ai-layer job's `variants[]`+`variant_id`s. T12 renders a visible "follow-up" note, no
  fake control. The 4 loop routes are already proxied (callable), just not driven by the UI yet.
- **Minor design-copy gaps** (non-blocking, from the final review): §3.1 pin_face explainer copy +
  §7 "persona seed dropped" badge absent (the seed-drop shout lands in the video job's `progress[]`
  but Zone D doesn't render that feed/badge — only real honesty gap, mitigated by pin_face being
  off-by-default experimental); QA-passed green pill has no expand-to-checks; guard-off badge
  duplicates a "Balance check off" line; `VideoPlan.script?: {…}|any` no-op union (script never
  shown on quote); `aiJob`/`videoJob` signals untyped `any` (read by 2 components).
- **Spec §11 deferrals (unchanged):** URL-analyze prefill (`/analyze-url` off dead Anthropic →
  ai-layer, ts-wiring #5); graph visualization; brand-kit viewer; `<a download>` cross-origin fix;
  multi-tenant credits.

## Constraints (still in effect)

Ponytail; single-tenant (Pratap Sons); `n_shots`=3 fixed; no push without per-instance permission;
no AI attribution / no Co-Authored-By; QA false-positives internal-only. Token usage this run ~1.7M.
