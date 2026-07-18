# Handoff → ai-engineer (2026-07-18)

**Status:** 🔵 ACTIVE · **Latest handoff.** From the demo-prep session that shipped the UGC
video UI, chat formatting, AI-Studio retirement, and the `ai_feedback` capture layer on
`feat/ai-layer-adapter`. Nothing here touches Google-Ads consumption — that stays yours.

## TL;DR for you

- **Your surface is untouched.** No edits to Google-Ads ai-layer consumption, its routes, or
  its ingestion. `withVideo:false` and the new `/creative-studio/video/*` routes are creative-only.
- **New study data you may want later:** the `ai_feedback` table now captures human thumbs +
  optional comments on chat answers and creative outputs. It is deliberately **NOT** wired into
  any learning loop or the intelligence graph yet — raw capture only, for a future iteration.
- **AI serving is Python-side for the demo.** The demo shows the whole platform in synergy, but
  every AI response is fulfilled by the `apps/ai-layer` (FastAPI). The one UI-reachable route still
  calling TS Anthropic is `/analyze-url` (creative brief extraction) — flagged, not yours.

## What shipped this session (context)

1. **UGC video (async).** `apps/api` proxy routes `POST /creative-studio/video/{plan,generate}` +
   `GET .../video/job/:id` → ai-layer `/creative/video/*` storyboard track. Quote-before-spend UI.
   A soft-deadline poller (`services/video-job-poller.ts`) watches the long render and writes ONE
   `autopilot_alerts` bell row on completion; a boot hook (`recoverVideoJobs()`) re-attaches after
   restart. The ai-layer persists renders to Neon, so the DB is source of truth — the poller only
   notifies. `withVideo:false` so the storyboard track owns video (no unquoted smoke clip).
2. **Chat formatting.** `.md-body` CSS (mono money, bold-takeaway callout, tables) + a `chat.py`
   SYSTEM line asking for that shape. Sanitizer path (`marked → DOMPurify`) unchanged.
3. **AI Studio retired from the UI.** All entry points removed; lazy route kept for deep links;
   CTAs repointed to AI Chat. See [`ai-studio-retired.md`](./ai-studio-retired.md).
4. **Feedback capture.** `ai_feedback` table (migration `0004`, applied to Neon) + `POST /feedback`
   upsert + thumbs on chat/creative + a once-per-session comment box.

## The `ai_feedback` contract (if/when you consume it)

Table `ai_feedback` — upsert on `(user_id, kind, ref_id)`:

| col | meaning |
|---|---|
| `kind` | `'chat'` \| `'creative'` |
| `ref_id` | `studio_outputs.id` (creative) · `` `${sessionId}:${turn}` `` (chat answer) · `sessionId` (session comment) |
| `rating` | `-1` down · `0` comment-only · `+1` up |
| `comment` | optional free text |
| `prompt_text` / `response_text` | the chat Q&A pair (browser-supplied; chat is not server-persisted) |

**Separation rule (do not break):** this is human-taste data, kept SEPARATE from Meta performance
(`/creative/learn`). Do not blend it into the graph. It is study data for the next iteration.

## Open items / not done (deliberate)

- **No fal render was triggered** — that is the user's manual demo click. Do not auto-render in tests.
- **ai-layer `service.py` video hardening** (attach partial render on strict-QA raise) is deferred to
  **dryayeet** (creative subtree owner) — not merged.
- **Feedback learning loop** — capture only; no scoring/winner-loser wiring.
- **Chat→Creative-Studio handoff** — deferred; design in
  [`creative/chat-to-studio-handoff-deferred.md`](./creative/chat-to-studio-handoff-deferred.md).
