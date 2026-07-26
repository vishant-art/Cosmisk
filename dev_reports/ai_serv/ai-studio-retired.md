# AI Studio — retired from the UI (2026-07-17)

**What:** Removed the AI Studio entry points and redirected the conversational CTAs to
**AI Chat** (the surviving ai-layer-served surface):

- **Sidebar** nav item — removed.
- **Command palette** — removed the `nav-ai` page entry and the `G→S` shortcut (desc + map);
  the "Continue in AI Studio" suggested action now points to **AI Chat**.
- **Dashboard** — the Morning Briefing widget keeps its live summary but its "Full Briefing"
  CTA (→ ai-studio) was dropped; the "Ask Cosmisk AI" link and the "Ask AI" quick-action now
  route to **AI Chat**; the fallback briefing copy says "open AI Chat" instead of "AI Studio".

The lazy route `app.routes.ts:89` is **KEPT** so existing deep links resolve instead of 404-ing.
The topbar breadcrumb map entry (`topbar.component.ts:200`) is also kept — it only labels the
page when you land on it via a deep link; it is not an entry point.

**Why:** AI Studio is being retired in favour of the ai-layer (Python). It had multiple entry
points, so removing only the navlink would have left several paths into a page we no longer want —
a hidden maintenance burden. Chat + Creative Studio (both ai-layer-served) are the surfaces going
forward. Where a CTA had standalone value ("ask the AI a question"), it was repointed to AI Chat
rather than deleted, since AI Chat now serves that intent.

**Not deleted:** the `features/ai-studio/` component and its route, so nothing 404s and the removal
is trivially reversible. Delete them only after the ai-layer fully covers the use case.
