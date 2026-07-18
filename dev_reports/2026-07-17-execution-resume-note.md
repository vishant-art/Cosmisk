# Execution resume note (2026-07-17) — ✅ COMPLETED, compressed

> ✅ **IMPLEMENTED / SUPERSEDED.** This was the compact-survival handoff written the night before
> executing three plans. **All three plans were executed on 2026-07-18** (13 commits on
> `feat/ai-layer-adapter`, no push). This body was compressed in-place on 2026-07-18 —
> the full original (execution order, verified interfaces, restart commands, FAL_ADMIN_KEY state)
> remains in git history. For the outcome + handoff, read
> [`ai_serv/2026-07-18-ai-engineer-handoff.md`](./ai_serv/2026-07-18-ai-engineer-handoff.md).

## What it planned (all done)

Execute, inline, in order: **Plan 1** UGC video UI (`plans/2026-07-17-ugc-video-ui-async.md`) →
**Plan 3** chat formatting + AI-Studio retirement → **Plan 2** feedback. Targeted tests + tsc per
task; full invariant per plan; local commits, no push, no AI attribution.

## Decisions that outlived the note (still in force)

- **Poller, not SSE** for the ~15-min video render; soft deadline (warn 20m, detach 90m, never mark
  failed — the ai-layer persists to Neon regardless); boot recovery re-attaches.
- **`withVideo:false`** — the storyboard `/video/*` track owns video.
- **`chat.py` SYSTEM prompt line is in-scope** (user's own file); **`service.py` hardening is
  dryayeet's** (deferred); **feedback folded in** (cheap, additive).
- **`CreativeGenJob` needed a `qa?` field** — done in Task 1.
- **No fal spend in execution** — render is the user's manual demo click only.

## Standing constraints (unchanged)

No push without per-instance permission · no AI attribution · never print secrets · never
`railway agent` · no direct TS LLM calls · don't touch ai-engineer's Google-Ads consumption or
dryayeet's creative subtree · single-tenant demo (Pratap Sons).
