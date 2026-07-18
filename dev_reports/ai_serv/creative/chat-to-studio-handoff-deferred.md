# Chat → Creative Studio handoff (DEFERRED — next iteration)

**Status:** designed, not built. Deliberately out of the current ship/demo scope.
**Date:** 2026-07-17
**Why deferred:** it is a *new capability* on the ai-layer chat endpoint (emit a structured
brief, not just prose), which falls outside the standing rule for this batch — "ship what is
done, add no new features." It is a fast follow, not part of demo hardening.

---

## The idea

In ai-chat, when the user asks for ideas for their next ad ("what should I make next?", "give me
angles for the winter sale"), the assistant returns the ideas **and** offers a one-click path to
generate one in Creative Studio — with no manual re-typing of a brief.

This closes the product's core loop: **insight (chat) → creative (studio)**. It is a good idea.
It is deferred on *timing*, not merit.

## Why it is not "just wiring"

Creative Studio's `POST /creative-studio/generate` consumes a **structured `StudioBrief`**, not
text:

```ts
// apps/web/src/app/core/services/creative-studio.service.ts:15
interface StudioBrief {
  brand_name: string;
  product_name: string;
  product_description: string;
  target_audience: string;
  key_features?: string[];
  price?: string;
}
```

ai-chat today returns **prose only** — `chat.py` returns `resp.choices[0].message.content` (a
string). There is no structured channel. So "seamless, no extra step" requires *something* to turn
free-text ideas into that exact object. That extraction is the new capability, and it lives on the
Python side.

## Chosen design (for when this is built): prefill, don't auto-fire

Three options were weighed:

| Option | UX | Verdict |
|---|---|---|
| **(a) Prefill + confirm** | chat emits prose + a hidden structured brief per idea; each idea has a **"Generate this"** button that deep-links to the studio with the brief **pre-filled**; one confirm click spends | **CHOSEN** |
| (b) Fully automatic | chat click fires a paid generation immediately, nothing shown first | **Rejected** — spends money from a conversational surface with no cost shown, contradicting the studio's own quote-before-spend thesis |
| (c) Copy-paste | chat suggests, user manually fills the brief | Rejected — it *is* the "extra step" the feature exists to remove |

(a) delivers "no extra work" (the user never types a brief) without "no confirmation" (they still
see what they will pay for before spending). It is consistent with the UGC video UI's rule that
cost is always visible before a spend.

## What it needs (next iteration)

1. **ai-layer:** the chat call, on detecting an idea request, appends a machine-readable brief
   block (e.g. a fenced JSON object matching `StudioBrief`) after the prose. The endpoint returns
   both; the UI parses and strips the block from the visible answer.
2. **apps/web:** intent affordance in ai-chat — render a "Generate this" button per idea, deep-link
   to `ugc-studio` with the parsed brief pre-filled into the generate form (do not auto-submit).
3. **Contract:** `StudioBrief` (above) is the target contract. **Do not change its shape carelessly
   before this lands** — the future handoff extracts exactly these fields.

## Natural pairing

Build this atop the **chat-persistence + `ai_feedback`** work: once chat Q&A pairs are stored
(session_id + turn), the emitted brief is one more field on the same rows, and the thumbs/feedback
signal can later be correlated with which ideas the user chose to generate. It also depends on the
**chat prompt-structure change** (the "answer in structured markdown" system-prompt line) landing
first — the same call that formats answers is the one that would emit the brief block.

## Foundation preserved now (zero code)

Nothing is built for this in the current batch. The only carry-forward is documentary: the
`StudioBrief` interface is the handoff contract — leave it stable. See
[[2026-07-17-ai-layer-demo-state-and-tasklist]] §deferred.
