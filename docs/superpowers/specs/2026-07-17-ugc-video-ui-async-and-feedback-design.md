# UGC Video UI, Async Delivery & Feedback — Design Spec

**Date:** 2026-07-17
**Branch:** feat/ai-layer-adapter
**Status:** approved design → hand to writing-plans

**Goal:** Expose the Python ai-layer's storyboard UGC-video pipeline through the product UI as a
quote-before-spend flow; deliver long renders asynchronously via the existing notification bell;
capture thumbs+comment feedback on chat and creative outputs; improve chat answer formatting; and
retire the AI Studio surface — all without recharging Anthropic and without adding a new feature to
the ai-layer.

**Architecture:** Three loosely-coupled subsystems, each independently shippable:
1. **Video UI + async lifecycle** (apps/web + apps/api) — a new planner component, a proxy for the
   ai-layer `/creative/video/*` endpoints, and a completion poller that writes an
   `autopilot_alerts` row.
2. **Feedback data model** (apps/api + apps/web) — one `ai_feedback` table, one route, thumbs +
   optional comment on chat answers and creative outputs.
3. **Chat formatting + AI Studio retirement** (apps/web, + one optional ai-layer prompt line).

**Tech Stack:** Angular 18 (standalone, signals), Fastify + Drizzle (Neon Postgres), FastAPI
(ai-layer, unchanged except two optional edits), `marked`+`DOMPurify` (already installed).

## Global Constraints

- **No Anthropic.** Every path is OpenRouter/fal (ai-layer) or deterministic. Never import
  `createMessage`/llm-gateway in new code.
- **No new dependencies.** `marked`, `dompurify`, `boto3`-free (volume, not R2). Nothing added to
  any `package.json` or `pyproject.toml`.
- **ai-layer is AI-engineer-owned.** The TS side must ship and demo with ZERO ai-layer changes. The
  only two ai-layer edits (below) are OPTIONAL, isolated, and split into their own tasks:
  - `apps/ai-layer/ai_layer/creative/service.py` (owner: dryayeet) — item 3 hardening.
  - `apps/ai-layer/ai_layer/chat.py` SYSTEM (owner: Procurio-AG) — item 7 prompt line.
  Do NOT touch `ai_layer/` Google-Ads consumption or any other ai-layer path.
- **Quote before spend.** No paid render fires without the user seeing the cost first.
- **Sanitizer stays strict.** `DOMPurify.sanitize` must remain on the chat render path; do not
  loosen it when richer markdown starts arriving.
- **TS code-freeze note.** All TS tasks are maintainer work (external contributors excluded).

---

## Subsystem 1 — UGC Video UI + Async Delivery

### Contract (verified against ai-layer, 2026-07-17)

- `POST /creative/video/plan` — body `{ job_id, seconds(6..90), creator?, direction?, n_shots?(1..12) }`.
  **409 if the run has no brand kit** → must `POST /creative/generate` first. Returns
  `{ job_id, script, storyboard, shots, duration_s, grounded, quote }` where
  `quote = { clips, estimated_usd, balance_usd, affordable, guard_enabled, shortfall_usd }`.
  Costs one LLM call, renders no pixels ($0).
- `POST /creative/video/generate` — body `{ job_id, aspect="9:16", resolution="720p", ugc_style,
  voiceover, captions, sfx, strict, guard_balance, variant_axis?, variant_values? }`.
  **409 without a storyboard** (plan first). **402 if guard_balance and balance can't cover.**
  Returns `{ job_id, status:"queued", clips }` immediately; renders in a BackgroundTask.
- `GET /creative/jobs/{job_id}` — poll; terminal states `complete` / `failed`. On complete:
  `job.video = { url, duration_s, shots }`, `job.qa = { verdict, checks, retry_hint }`,
  `job.cost_usd`, `job.actuals`. **`job.video` and `job.qa` are set side-by-side unconditionally
  on success — QA is advisory, it never deletes the render.**
- Cost facts: `SEEDANCE_CLIP_USD = 1.2222`; `affordable(n)` needs `n*1.2222 + 0.30` overhead. So the
  quote's `estimated_usd` (clips only) and the guard's `needed` (clips + $0.30) DIFFER — the UI must
  show both honestly, not blame a shortfall without naming the margin.

### The three balance states (correctness, not polish)

`quote.guard_enabled` is false when `FAL_ADMIN_KEY` is unset. It is currently SET (verified: live
balance read $8.24). The UI must still handle all three:

| guard_enabled | affordable | UI |
|---|---|---|
| true | true | `Balance $8.24 — covers this`, render button live with price |
| true | false | `Short $X of $Y` + fal top-up link, render button **disabled** |
| false | — | `Balance check off` (neutral, never green), button live with price |

### apps/api (proxy — no business logic)

`services/creative-gen-client.ts` — add:
- `videoPlan(jobId, opts) -> plan` → POST `/creative/video/plan`, X-API-Key + user Meta token.
- `videoGenerate(jobId, opts) -> { status, clips }` → POST `/creative/video/generate`.
- Reuse existing `getCreativeJob(jobId)` for polling (already present).

`routes/creative-studio.ts` — add three routes (all `preHandler:[app.authenticate]`):
- `POST /video/plan` — resolves the generation's `ai_job_id`, forwards to `videoPlan`, returns the
  quote. Passes through 409 (no brand kit) as a clean message.
- `POST /video/generate` — forwards to `videoGenerate`; on `202/queued`, marks the video output row
  `generating` and **starts the completion poller** (below). Passes through 402 (insufficient
  balance) with the top-up hint.
- `GET /video/job/:jobId` — proxies `getCreativeJob` straight through (live stage/progress for a
  user who stays on the page). No mirroring into studio_* — the render is long and the ai-layer
  already persists to Neon.

**`withVideo: false`** — change `startCreativeGen(... withVideo: formats.includes('video'))` at
`creative-studio.ts:544` so the storyboard flow OWNS video. Kills the unquoted $1.2222 smoke clip.
The "video" format now reveals the planner instead of auto-spending.

### The completion poller (async delivery — soft deadline)

A module `services/video-job-poller.ts` (mirrors `processGenerationViaAiLayer`'s poll loop):
- `pollVideoJob(generationId, aiJobId, userId)` — polls `getCreativeJob` every 15s.
- **No hard kill.** Loops until `job.status` is `complete` or `failed`.
- **Soft threshold 20m:** once elapsed > 20m and still running, log `WARN`
  (`[video-poller] job {id} still running past 20m`) ONCE, keep polling.
- **Absolute safety ceiling 90m:** log `ERROR`, stop the in-process timer, but **do NOT mark the
  generation failed** — the ai-layer persists the render to Neon regardless; boot-recovery/next poll
  surfaces the eventual result. The DB is the source of truth; the poller is only the notifier.
- On `complete`: set the video output row `completed` with the proxied URL + `qa.verdict` +
  `cost_usd`; write ONE notification (below).
- On `failed`: set the output `failed` with `job.error`; write a warning notification.

**Notification (reuse the existing bell — no new UI):**
```sql
INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity)
VALUES (?, ?, ?, 'video_ready', 'Your video is ready',
        'Your UGC video for "<brief.product_name>" finished rendering.', 'info')
```
Failure → `type:'video_failed'`, severity `'warning'`, content = the reason + next step. The bell
badge, dropdown, and unread-count already render `autopilot_alerts` (verified:
`autopilot-badge.service.ts`, topbar bell).

**Boot recovery** (restart safety) — in `index.ts`, alongside `recoverInterruptedSprints()` (:288),
add `recoverVideoJobs()`: on boot, find `studio_generations` with a video output still `generating`
and re-attach `pollVideoJob`. Matters because `tsx watch` restarts the API on every save, and a user
who paid must still be told.

### apps/web (the planner UI — quote as hero)

New standalone child `features/ugc-studio/generation-detail/video-planner/video-planner.component.ts`
(kept out of the 145-line parent), shown when a generation's status is `completed`:
- **Controls:** direction (free-text), n_shots stepper (1..12), seconds stepper (6..90),
  VO/captions/SFX toggles. Creator persona shown READ-ONLY from the plan response (see below).
- **Flow:** `Plan it · free` → renders the priced storyboard (each shot line = one $1.2222 clip;
  total = sum of visible lines) → `Render N clips — $X.XX` (money in `JetBrains Mono`, on the
  button). The quote IS the hero; no separate cost widget.
- **Playback:** the finished video via the existing `/api/creative-studio/asset/<job>/<file>` proxy.
- **Design tokens (existing):** navy `#1A1A2E`, accent `#6366F1`, `JetBrains Mono` for money/shot
  numbers, `dna` chip colors. Signature = the priced storyboard (shot list == invoice). No added
  motion.

`core/services/creative-studio.service.ts` — add `videoPlan()`, `videoGenerate()`,
`getVideoJob()` observables mirroring the existing method style.

### Creator persona (v1 — grouped by reliability, not a flat form)

`CreatorKit` is split by actuator with documented reliability: voice_id = GUARANTEE (exact),
speech = reliable wish, visual = WISH (drifts across shots). v1 DISPLAYS the creator the plan
auto-derived (read-only), so the UI never implies control it lacks. Reroll = re-plan. Group the
shown fields visually by reliability (voice: exact; look: best-effort). The pin-a-persona-across-runs
editor (saved creators + face_ref upload) is a later feature — see the deferred list.

---

## Subsystem 2 — Feedback (`ai_feedback`)

One table, both surfaces. Chat is NOT persisted server-side (history comes from the browser), so the
client supplies the Q&A pair on rating — no chat-persistence build.

`apps/api/src/db/pg-schema.ts` + a drizzle migration:
```ts
export const aiFeedback = pgTable('ai_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),              // 'chat' | 'creative'
  refId: text('ref_id').notNull(),           // studio_outputs.id | `${sessionId}:${turn}` | sessionId
  rating: integer('rating').notNull(),       // -1 | +1  (thumbs; smallint semantics)
  comment: text('comment'),                  // optional free text
  promptText: text('prompt_text'),           // browser-supplied Q (chat) / brief summary (creative)
  responseText: text('response_text'),       // browser-supplied A (chat)
  createdAt: timestamp('created_at', { mode:'string', withTimezone:true }).notNull().defaultNow(),
});
```

`apps/api` — one route `POST /feedback` (`preHandler:[app.authenticate]`): upsert on
`(userId, kind, refId)` so a re-vote overwrites. Returns `{ success }`.

`apps/web`:
- **Creative:** thumbs up/down on each `studio_outputs` item (inline), optional comment box on click.
  `ref_id = output.id`, `kind:'creative'`.
- **Chat:** thumbs on each assistant answer (`ref_id = ${sessionId}:${turn}`). An optional feedback
  box appears ONCE after the 3rd–4th turn in a session (`ref_id = sessionId`, `kind:'chat'`,
  rating optional/0 if comment-only — store rating nullable-safe: use 0 for comment-only).
  The browser already holds the Q&A pair and `session_id` (X-Session-Id header) — send them.

**Separation rule (documentary):** this signal is human taste, kept SEPARATE from Meta performance
(the ai-layer's existing `/creative/learn` loop). Do not blend into the graph without an explicit
future decision. For now it is study data.

---

## Subsystem 3 — Chat formatting + AI Studio retirement

### Chat formatting (mostly CSS — apps/web)

`features/ai-chat/ai-chat.component.ts` `.md-body` styles (render path already
`marked → DOMPurify.sanitize → bypassSecurityTrustHtml`, verified safe):
- Money/ROAS in `JetBrains Mono`, tabular-nums (scannable 0.62 vs 3.00).
- A bold first-line takeaway rendered as a left-border accent callout (`#6366F1`).
- Campaign names as subtle chips (reuse `dna` token colors).
- Style tables (`marked` emits them; `.md-body` doesn't style them yet).
- No typing animation / avatars (reads as AI-generated; buries the data).

**Optional ai-layer amplifier (owner: Procurio-AG, `ai_layer/chat.py:64` SYSTEM):** append one line
— "answer in tight markdown: a one-line **bold takeaway**, then short bullets; a table when comparing
campaigns; end with the single next action." Split as its own task; CSS ships without it.

### AI Studio retirement (apps/web)

Remove the surface but keep the route so deep links don't 404:
- `shared/components/sidebar/sidebar.component.ts:255` — remove the nav item.
- `features/dashboard/dashboard.component.ts` — remove the hero card (:79), the "see more" link
  (:455), and the "Ask AI" quick action (:682); soften the onboarding copy naming it (:862).
- `shared/components/command-palette/command-palette.component.ts` — remove the nav entry (:218),
  the "Continue in AI Studio" push (:351), and the `G→S` shortcut (:425).
- **Keep** `app.routes.ts:89` (the lazy route) so existing links resolve.
- Add a dev_reports highlight recording why (hidden-burden avoidance).

---

## Out of scope (deferred, documented)

- **Chat → Studio handoff** — `dev_reports/ai_serv/creative/chat-to-studio-handoff-deferred.md`.
  New ai-layer capability (emit structured brief); pairs with feedback next iteration. Keep
  `StudioBrief` shape stable.
- **R2 object storage** — `creative-studio-object-storage-plan.md` stays shelved; Railway volume now.
  Trigger to revisit: heavy third-party refetch or horizontal ai-layer scaling.
- **Creator persona editor** (pin-across-runs, face_ref) — v1 is read-only display.
- **A/B variants** (`variant_axis`/`variant_values`), aspect/resolution pickers — defaults only
  (9:16 / 720p).

## Testing

- **Video proxy/poller:** unit-test the soft-deadline logic (warn at 20m, ceiling at 90m, never marks
  failed) with a mocked clock + mocked `getCreativeJob`. Assert notification row written once on
  complete, and once with warning severity on failed.
- **Feedback:** route test — upsert overwrites a re-vote; both `kind`s persist; comment-only chat row
  stores.
- **Chat formatting:** DOMPurify still strips `<script>` after the prompt change (assert sanitized).
- **withVideo:** assert the storyboard flow sends `withVideo:false` and the generate screen no longer
  auto-produces `job.video`.
- No live render in any test — mock fal/ai-layer. Zero fal spend in CI.
