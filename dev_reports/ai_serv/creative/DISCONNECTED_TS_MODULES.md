# ⚠️ **DISCONNECTED TS CREATIVE MODULES — DO NOT HARD-DELETE** ⚠️

> **Directive (2026-07-22):** Creative Studio serves **only** the ai-layer (Python) creative-generation module. `apps/api` is a **thin proxy** — no TS generation or scoring logic runs in the Creative Studio surface. The TS modules below are **preserved on disk but disconnected** (wiring + frontend options removed). They are **not deleted** — recover by uncommenting the wiring / re-adding the frontend calls.

## What was disconnected (and where the code still lives)

| TS module / path | State | Location (preserved) |
|---|---|---|
| **`services/creative-scorer.ts`** barrel + **`services/creative-scorer/`** (scorer, predictions, client-scoring, dimensions, dna-profile, html-report, types) — the 5-dim score + predicted-ROAS engine | **On disk, unimported at runtime.** Import kept in `creative-studio.ts` — referenced now only from inside the commented-out `/score` + `/accuracy` blocks, so it is the restore seam: keep it or reconnecting becomes a two-step. | `apps/api/src/services/creative-scorer*` |
| **`POST /creative-studio/score`** — on-demand TS scoring | **Commented out** (`/* DISCONNECTED … */`) | `creative-studio.ts` (`~:230`) |
| **`GET /creative-studio/accuracy`** — TS score-accuracy stats | **Commented out** | `creative-studio.ts` (`~:296`) |
| **`POST /creative-studio/analyze-url`** — TS URL→brief analyzer (LLM) | **Commented out** (already dead — URL hero removed from UI) | `creative-studio.ts` (`~:46`) |
| **`processGeneration()`** — legacy TS generation path (Flux + TS scorer) | **DELETED 2026-07-24** (−211 lines, with the now-orphan `FluxProvider` import). Unlike the routes above it was not a commented-out seam: it had no caller, no test, no export, and `/generate` hard-**503**s when the ai-layer is unconfigured (no TS fallback), so nothing could reach it. Recover from git if ever needed. | was `creative-studio.ts:435-644` (commit `d3fc75d^`) |
| **Frontend service methods** `analyzeUrl()` / `score()` / `getAccuracy()` | **Commented out** (no component called them) | `apps/web/.../core/services/creative-studio.service.ts` |
| **Entry legacy-UGC list** (`UgcService`/`getProjects`/`legacyProjects`) | **Removed from the Creative Studio entry only.** `UgcService` itself stays — onboarding + `project-detail` still use it; the `/app/ugc-studio/:id` route stays. | `apps/web/.../features/ugc-studio/ugc-studio.component.ts` |

## Left defined-but-unused (safe — do not migrate away)
- DB: `score_predictions`, `studio_outputs.score_json`, `url_analysis_cache` (write-dead; `account-routes.ts:267` still lists `score_predictions` in the deletion sweep — fine).

## NOT in scope (deliberately kept working)
- **`routes/media-gen.ts` + Graphic Studio** — a *separate* live feature doing TS image/video generation (FluxProvider). No ai-layer equivalent; retiring it would break Graphic Studio with no replacement. **User decision (2026-07-22): leave it.** Revisit only if Graphic Studio is re-platformed onto the ai-layer.

## To reconnect (if ever needed)
Uncomment the `/* DISCONNECTED … */` blocks in `creative-studio.ts`, restore the generate branch, re-add the frontend service methods, and re-wire the entry list. The scorer module never left disk.
