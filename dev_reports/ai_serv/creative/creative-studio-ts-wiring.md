# Creative Studio — TypeScript / UI wiring backlog (code freeze, maintainers)

**Created:** 2026-07-20 · **Owner:** maintainers (TS is under the production-hardening code freeze;
the AI side does not touch `apps/`).

> One place for every `apps/web` + `apps/api` wiring item the Python creative work has surfaced.
> All are additive and optional: the Python backend functions without any of them, and every new
> field is additive (a TS client that ignores it is unaffected). Pulled from the prompt-improvement
> plan, the future-scope doc, and the 2026-07-18 / 2026-07-19 handoffs.

## Pending

| # | Item | Where | Why / notes |
|---|---|---|---|
| 1 | **Send `direction` to `POST /creative/generate`** | `apps/web` `creative-studio.service.ts`, `apps/api` `creative-gen-client.ts` + `routes/creative-studio.ts`, cockpit input | Enables 1d concept-casting on the STATIC ads. Backend now accepts `CreativeRequest.direction`; today the UI sends `direction` only to `/creative-studio/video/plan`. Without this, 1d casts the video path only and concept-ad casting stays dormant. |
| 2 | **Show `qa_passed` + per-check QA evidence** | `apps/web` video-planner / cockpit | The job now carries `qa_passed` (bool); Phase 3 adds per-check `evidence`. A QA-flagged-but-shipped render should read clearly. Pairs with the salvage change (a paid render is never discarded). |
| 3 | **Handle the new brand-kit shape** | `apps/web` (only if it renders the kit) | Phase 2 adds `tone_scales` (0-10 axes) + `always_use` / `banned` lexicon arrays to the brand kit. Additive: the `tone` string stays, so nothing breaks; render the new fields if useful. |
| 4 | **Surface new job/output fields** | `apps/web` review UI | All additive: `awareness_stage` + logged `ad_copy` on concepts; `on_screen_text` first-frame hook on the script; `camera_move` + `continuity` on shots. Optional to display. |
| 5 | **Migrate `/analyze-url` off TS Anthropic** | `apps/api` | The one UI-reachable route still fulfilled by TS Anthropic (creative brief extraction), flagged in the 2026-07-18 handoff. Move to the ai-layer, or leave as-is. |
| 6 | **TS-side R2 client** (deferred) | `apps/api` | Only if the TS side ever needs to own storage instead of the ai-layer 302-to-R2 proxy. See `../2026-07-19-ts-r2-client-future-work.md`. |
| 7 | **`<a download>` cross-origin fix** | `apps/web` + presign path | A cross-origin R2 asset opens in a new tab instead of downloading. Upgrade: presign with `ResponseContentDisposition=attachment` behind a `?download=1` flag. (2026-07-19 R2 handoff.) |

## Already shipped (not pending)

- The UGC video track UI (storyboard planner, quote-before-spend, `video-job-poller.ts`, bell
  notification, `recoverVideoJobs` boot hook) shipped on `feat/ai-layer-adapter` (2026-07-18) and
  is merged into `improve/creative`. This closed the old "no UI for the video track" gap.

---

_The Python side keeps these decoupled on purpose: it never blocks on a TS change, and every field
above is additive. Update this doc when an item is wired or a new one is surfaced._
