# Resume note — Creative Studio frontend redesign (2026-07-21)

**Status:** 🔵 ACTIVE · compact-survival note. Branch `improve/creative`. **Next action: build the
Creative Studio UI redesign.**

## Do this next

Invoke **`superpowers:writing-plans`** to turn the design spec into an implementation plan, then
**`superpowers:executing-plans`** to build it:

> Spec: `docs/superpowers/specs/2026-07-21-creative-studio-ui-redesign-design.md` (authoritative)

Frontend = Angular `apps/web` (the `ugc-studio` component / `/app/ugc-studio` route is the live
Creative Studio surface). Backend passthrough = `apps/api`. `frontend-design` skill applies for the
visual treatment **within Cosmisk's existing dark/purple system** (not a new identity). Ponytail; no
push without permission; no AI attribution.

## The build has TWO halves

**1. apps/api backend passthrough (verified gaps, 2026-07-21 live grep):**
- **4 loop routes NOT routed** — add proxies: `POST /creative/variants/{id}/published`,
  `POST /creative/learn`, `GET /creative/prior/{acct}`, `GET /creative/graph/{acct}`.
- **Fields NOT forwarded** — add: `direction` on `/generate`; `creator` on `/video/plan`;
  `direction`+`creator`+`pin_face`+`hero_with_creator` on `/video/generate`.
- **New voice-preview endpoint** (ai-layer MiniMax + apps/api passthrough).
- Already routed & working: `/generate`, `/video/plan`, `/video/generate`, `/jobs`
  (`/generation/:id`, `/video/job/:id`), assets (`/asset/:jobId/*`, R2-backed 302).

**2. apps/web UI** per the spec: brief + `direction` as the hero (remove the dead URL-analyze box
and "Import from Sprint"); persona inputs; **the quote-before-spend screen** (the centerpiece —
`/video/plan` quote card, paid-confirm, 402/shortfall state); progress feed (poll the shipped
`video-job-poller`, the 12-step narrative); evidence-forward results (QA chips, `rejected[]` shown,
variants as a radio); degrade-loudly badges; History + the publish→`meta_ad_id` loop.

## Resolved decisions (baked into the spec)

1. `n_shots` = **3, FIXED** — no UI control. 2. **Single-tenant** now; multi-tenant credits deferred.
3. Progress feed = **polling**. 4. QA false-positives (caption@48px, cut_alignment) **NOT shown** —
internal marker only. 5. Voice preview = **backend endpoint**.

## I/O contract (source of truth = `dev_reports/ai_serv/creative/`)

9 routes under `/creative` (X-API-Key; per-user Meta token via `X-Meta-Token`). USER provides: brief
{brand,product,description,audience,features?,price?}, `direction`, formats, persona, toggles,
`meta_ad_id` at publish. SYSTEM sources: brand kit+copy (Gemini/OpenRouter), Meta winners/losers
grounding, Shopify bestseller, voice, cost. OUTPUT job: {status, stage, progress[], assets[],
brand_kit, winners[], video{url}, variants[], qa_passed(+evidence), cost_usd, rejected[], error};
video ships as `video_captioned.mp4`. **Always call `/video/plan` (free quote) before paid
`/video/generate`.** Cost: static ~$0.60-0.81; grounded video ~$1.42/clip; 3-clip ~$4.78; 402 if
balance short. Full detail: the redesign spec §10 endpoint map + the creative docs.

## Environment / platform state (all green for a run)

- **Split env done:** `apps/ai-layer/.env` is the single superset for the merged Railway-B service
  (ai-layer + connectors in one process); `apps/api/.env`, `apps/web` build args. `apps/connectors/.env`
  deleted (redundant), `.env.example` kept. Root `.env`/`.env.example` consolidated by service.
- **Meta:** real ad account wired for **grounded** runs. `META_AD_ACCOUNT_ID`+`META_AD_ACCOUNT` set in
  `apps/ai-layer/.env`. `TOKEN_ENCRYPTION_KEY` set. **Meta OAuth is wired** (`/auth/meta-oauth/exchange`,
  `META_OAUTH_ENABLED=true`) — clicking **Connect Meta** in Settings stores the token encrypted with
  the key and clears the dashboard 500s.
- **Neon:** demo branch migrated (9 `ai_layer` tables). **R2:** built (Mode-2 delivery), assets survive
  redeploy. **fal:** `FAL_KEY` live (paid renders enabled; `guard_balance` refuses if balance short —
  keep params minimal; a real generate spends, e.g. ~$4.78 for 3 clips).

## Run the sim (validated green 2026-07-21)

```
docker compose -f docker-compose.sim.yml run --rm migrate     # once (idempotent)
docker compose -f docker-compose.sim.yml up -d --wait --build
./infra/sim-smoke.sh          # → open http://localhost:8080
```
Ports: web 8080, **api 3100** (host 3000 is a stuck Docker-Desktop phantom reservation — nothing
holds it, only a Docker Desktop restart clears it; 3100 is transparent since web bakes
`API_BASE_URL=http://localhost:3100`), ai-layer 8000. The compose injects a sim-only throwaway
`TOKEN_ENCRYPTION_KEY` (real one on Railway A).

## Constraints / leave-as-is

- **Dead TS surfaces stay untouched:** Creative Cockpit, Director Lab, Creative Engine (legacy,
  still routed, not the ai-layer). Only `ugc-studio` (Creative Studio) is the live surface.
- **Deferred (logged):** `/analyze-url` off dead Anthropic → ai-layer (`ts-wiring.md #5`); multi-tenant
  credits (spec decision #2); TS-R2 client (`2026-07-19-ts-r2-client-future-work.md`); `<a download>`
  cross-origin fix (`ts-wiring #7`); creative↔connectors convergence
  (`2026-07-21-creative-connectors-convergence-debt.md`).
- Single-tenant demo (Pratap Sons). ponytail; no push without per-instance permission; no AI attribution.
