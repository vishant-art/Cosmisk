# Chat Formatting + AI Studio Retirement — Implementation Plan (Subsystem 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ai-chat answers scannable (mono numbers, accent takeaway, campaign chips, styled tables) via CSS on the existing safe render path; retire the AI Studio surface without breaking deep links.

**Architecture:** Pure `apps/web` CSS + template work on the already-safe `marked → DOMPurify` chat render path, plus removal of AI Studio nav/dashboard/command-palette entry points (route kept). One OPTIONAL ai-layer prompt line (owner: Procurio-AG) amplifies the formatting but is not required.

**Tech Stack:** Angular 18, `marked` + `dompurify` (already installed).

## Global Constraints

- **No new dependencies. No Anthropic.**
- **Sanitizer stays strict:** `DOMPurify.sanitize` must remain on the chat render path; never `bypassSecurityTrustHtml` raw model output.
- **Keep the AI Studio route** (`app.routes.ts:89`) so existing links resolve; remove only the entry points.
- **The optional ai-layer prompt line** (`ai_layer/chat.py:64` SYSTEM) is a SEPARATE, owner-flagged task; the CSS ships without it.
- Build must compile (pre-existing NG8107 warnings acceptable, no new errors).

---

## File Structure

- `apps/web/src/app/features/ai-chat/ai-chat.component.ts` — MODIFY: `.md-body` styles (mono numbers, takeaway callout, chips, tables).
- `apps/web/src/app/shared/components/sidebar/sidebar.component.ts:255` — MODIFY: remove nav item.
- `apps/web/src/app/features/dashboard/dashboard.component.ts` — MODIFY: remove hero card / link / quick action; soften onboarding copy.
- `apps/web/src/app/shared/components/command-palette/command-palette.component.ts` — MODIFY: remove nav entry, "Continue in AI Studio", G→S shortcut.
- `apps/web/src/app/app.routes.ts:89` — KEEP (do not remove).
- `dev_reports/ai_serv/ai-studio-retired.md` — CREATE: the why-highlight.
- `apps/ai-layer/ai_layer/chat.py:64` — OPTIONAL, owner Procurio-AG.

---

## Task 1: chat answer formatting (apps/web CSS)

**Files:**
- Modify: `apps/web/src/app/features/ai-chat/ai-chat.component.ts` (the `styles` block with `.md-body`, ~lines 160-168).

- [ ] **Step 1: Extend the `.md-body` styles.** Append to the existing style block:

```css
/* Money & ROAS: mono, tabular — scannable 0.62 vs 3.00 */
.md-body :where(code) { font-variant-numeric: tabular-nums; }
/* First bold line reads as the takeaway when the model leads with it */
.md-body :where(p:first-child strong:only-child) {
  display: block; border-left: 3px solid #6366F1; padding-left: 0.6rem;
  margin-bottom: 0.6rem; font-size: 1rem;
}
/* Tables (marked emits them; give them structure) */
.md-body :where(table) { border-collapse: collapse; width: 100%; margin: 0.5rem 0; font-size: 0.85rem; }
.md-body :where(th, td) { border: 1px solid #E3E5EB; padding: 0.3rem 0.5rem; text-align: left; }
.md-body :where(th) { background: #F1F3F7; font-weight: 600; }
.md-body :where(td) { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Verify sanitizer is untouched.** Confirm `renderMd` still returns `bypassSecurityTrustHtml(DOMPurify.sanitize(html))` — do not change that line.

- [ ] **Step 3: Build + eyeball.** `cd apps/web && npx ng build --configuration development` → compiles. In the running app, send a chat message; confirm numbers render mono and a leading `**bold**` line shows the accent left-border. (If the model isn't yet producing tables/bold-leads, that's Task 4's job — the CSS is ready for when it does.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/features/ai-chat/ai-chat.component.ts
git commit -m "feat(chat): scannable answer formatting — mono numbers, takeaway callout, tables"
```

---

## Task 2: retire the AI Studio entry points (apps/web)

**Files:**
- Modify: sidebar, dashboard, command-palette (paths above). Keep `app.routes.ts:89`.

- [ ] **Step 1: Sidebar** — remove the nav item at `sidebar.component.ts:255`:
```ts
{ label: 'AI Studio', icon: 'sparkles', route: '/app/ai-studio', live: true },
```

- [ ] **Step 2: Dashboard** — remove the AI-Studio hero card (`dashboard.component.ts:79`), the "see more" link (:455), and the "Ask AI" quick-action entry (:682). In the onboarding copy (:862), drop the "check the **AI Studio**" clause, leaving the Cmd+K guidance intact.

- [ ] **Step 3: Command palette** — remove the nav entry (`command-palette.component.ts:218`), the "Continue in AI Studio" push (:351), and the `['G','S']` shortcut (:425) plus its `s: '/app/ai-studio'` map entry (:425 region).

- [ ] **Step 4: Confirm the route stays.** `app.routes.ts:89` (`path: 'ai-studio'`) is UNCHANGED — deep links still resolve.

- [ ] **Step 5: Build.** `cd apps/web && npx ng build --configuration development` → compiles, no new errors. Grep to confirm no dangling references outside the route:
```bash
grep -rn "ai-studio" apps/web/src --include=*.ts | grep -v "app.routes.ts" | grep -v "features/ai-studio/"
```
Expected: no nav/dashboard/palette hits remain.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/shared/components/sidebar/ apps/web/src/app/features/dashboard/ apps/web/src/app/shared/components/command-palette/
git commit -m "chore(ai-studio): remove entry points, keep route for deep links"
```

---

## Task 3: record why (dev_reports highlight)

**Files:**
- Create: `dev_reports/ai_serv/ai-studio-retired.md`

- [ ] **Step 1: Write the highlight**

```markdown
# AI Studio — retired from the UI (2026-07-17)

**What:** Removed all AI Studio entry points (sidebar nav, dashboard hero/link/quick-action,
command-palette nav + "Continue in AI Studio" + G→S shortcut). The lazy route `app.routes.ts:89`
is KEPT so existing deep links resolve instead of 404-ing.

**Why:** AI Studio is being retired in favour of the ai-layer (Python). It had SIX entry points, so
removing only the navlink would have left five paths into a page we no longer want — a hidden
maintenance burden. Chat + Creative Studio (both ai-layer-served) are the surfaces going forward.

**Not deleted:** the `features/ai-studio/` component and its route, so nothing 404s and the removal
is trivially reversible. Delete them only after the ai-layer fully covers the use case.
```

- [ ] **Step 2: Commit**

```bash
git add dev_reports/ai_serv/ai-studio-retired.md
git commit -m "docs(ai-studio): record the UI retirement + why the route stays"
```

---

## OPTIONAL ai-layer task (OWNER: Procurio-AG)

## Task 4: chat prompt asks for structured markdown (apps/ai-layer)

**Files:**
- Modify: `apps/ai-layer/ai_layer/chat.py` — the `SYSTEM` string at line 64.

- [ ] **Step 1:** Append one instruction to `SYSTEM` (do not change its grounding rules):
  "Answer in tight markdown: lead with a one-line **bold takeaway**, then short bullets. Use a table
  when comparing campaigns. Put money and ROAS in `code` so they render monospaced. End with the
  single next action."
- [ ] **Step 2:** Restart the ai-layer (`config.py` reads `.env` at import; uvicorn `--reload` watches `.py`, so a `chat.py` edit reloads). Send a chat message; confirm the answer leads with a bold takeaway and numbers are in backticks — which the Task 1 CSS then styles.
- [ ] **Step 3:** Confirm `DOMPurify` still strips a `<script>` payload if one ever appears (the sanitizer is unchanged; this is a regression guard). Commit on the ai-layer side per that tree's conventions.

---

## Self-Review

**Spec coverage:** mono numbers + takeaway callout + chips (T1 — chips reuse existing dna tokens; if a chip needs a class, it's added inline in T1), tables (T1), sanitizer untouched (T1.2, Global Constraints), all 3 entry-point groups removed + route kept (T2), dev_reports highlight (T3), optional prompt line owner-flagged (T4). ✓
**Placeholder scan:** clean; every removal cites an exact file:line. ✓
**Type consistency:** n/a (CSS + deletions); the one behavioural contract — "leading `**bold**` line → callout" — is produced by T4 and styled by T1, and they reference the same shape. ✓
