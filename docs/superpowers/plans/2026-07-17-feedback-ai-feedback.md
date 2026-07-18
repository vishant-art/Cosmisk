# Feedback (`ai_feedback`) — Implementation Plan (Subsystem 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture thumbs (+optional comment) on chat answers and creative outputs into one `ai_feedback` table, for study — no learning-loop wiring yet.

**Architecture:** One Drizzle table + one Fastify route (`POST /feedback`, upsert). Chat is not persisted server-side, so the browser supplies the Q&A pair on rating. Angular adds thumbs to chat answers and creative outputs, plus a once-per-session comment box after the 3rd–4th chat turn.

**Tech Stack:** Fastify + Drizzle (Neon), Angular 18 signals.

## Global Constraints

- **No Anthropic. No new dependencies.**
- **Separation rule:** this is human-taste data, kept SEPARATE from Meta performance (`/creative/learn`). Do not blend into the graph. Study data only.
- **Rating semantics:** `-1` = down, `+1` = up, `0` = comment-only (chat session box).
- **Test invariant** before commit (default + pg suites, tsc baseline-only, madge 0 cycles).

---

## File Structure

- `apps/api/src/db/pg-schema.ts` — MODIFY: add `aiFeedback` table.
- `apps/api/drizzle/` — GENERATED: new migration for the table.
- `apps/api/src/routes/feedback.ts` — CREATE: `POST /feedback` upsert route.
- `apps/api/src/boot/` route registration — MODIFY: register the feedback route.
- `apps/api/src/routes/__tests__/feedback.test.ts` — CREATE: upsert-overwrite + both-kinds test.
- `apps/web/src/app/core/services/feedback.service.ts` — CREATE: `rate()` method.
- `apps/web/src/app/features/ai-chat/ai-chat.component.ts` — MODIFY: per-answer thumbs + session comment box after turn 3–4.
- `apps/web/src/app/features/ugc-studio/**` (the output display) — MODIFY: per-output thumbs.

---

## Task 1: the `ai_feedback` table + migration (apps/api)

**Files:**
- Modify: `apps/api/src/db/pg-schema.ts`
- Test: `apps/api/src/routes/__tests__/feedback.test.ts` (added in Task 2)

- [ ] **Step 1: Add the table** near `autopilotAlerts` in `pg-schema.ts`:

```ts
export const aiFeedback = pgTable('ai_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),               // 'chat' | 'creative'
  refId: text('ref_id').notNull(),            // studio_outputs.id | `${sessionId}:${turn}` | sessionId
  rating: integer('rating').notNull(),        // -1 | 0 | +1
  comment: text('comment'),
  promptText: text('prompt_text'),
  responseText: text('response_text'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniqUserKindRef: unique().on(t.userId, t.kind, t.refId) }));
```

Ensure `unique` is imported from `drizzle-orm/pg-core` (add to the existing import if missing).

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npm run db:generate`
Expected: a new `drizzle/NNNN_*.sql` creating `ai_feedback` with the unique constraint.

- [ ] **Step 3: Apply it**

Run: `cd apps/api && npm run db:migrate`
Expected: applies cleanly against Neon.

- [ ] **Step 4: Verify** the table exists:

Run: `cd apps/api && npx tsx src/db/check-connection.ts` (or a psql `\d ai_feedback`) → table present with the unique index.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/pg-schema.ts apps/api/drizzle/
git commit -m "feat(feedback): ai_feedback table (thumbs + optional comment, both surfaces)"
```

---

## Task 2: `POST /feedback` upsert route (apps/api)

**Files:**
- Create: `apps/api/src/routes/feedback.ts`
- Modify: the boot route-registration module (mirror how `autopilot` routes register).
- Test: `apps/api/src/routes/__tests__/feedback.test.ts`

**Interfaces:**
- Produces: `POST /feedback` body `{ kind: 'chat'|'creative'; ref_id: string; rating: -1|0|1; comment?: string; prompt_text?: string; response_text?: string }` → `{ success: true }`. Upserts on `(user_id, kind, ref_id)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildTestApp } from '../../__tests__/helpers.js'; // use the repo's existing test app helper

describe('POST /feedback', () => {
  it('upserts and a re-vote overwrites', async () => {
    const app = await buildTestApp();
    const auth = await app.loginTestUser();
    const post = (body: unknown) => app.inject({ method: 'POST', url: '/feedback', headers: auth, payload: body });

    let r = await post({ kind: 'creative', ref_id: 'out1', rating: 1 });
    expect(r.statusCode).toBe(200);
    r = await post({ kind: 'creative', ref_id: 'out1', rating: -1 }); // re-vote
    expect(r.statusCode).toBe(200);
    const rows = await app.db.all(`SELECT rating FROM ai_feedback WHERE ref_id='out1'`);
    expect(rows.length).toBe(1);
    expect(rows[0].rating).toBe(-1);
  });

  it('stores a comment-only chat row', async () => {
    const app = await buildTestApp();
    const auth = await app.loginTestUser();
    const r = await app.inject({ method: 'POST', url: '/feedback', headers: auth,
      payload: { kind: 'chat', ref_id: 'sess-9', rating: 0, comment: 'helpful', prompt_text: 'q', response_text: 'a' } });
    expect(r.statusCode).toBe(200);
  });
});
```

(If `buildTestApp`/`loginTestUser` differ in this repo, adapt to the existing pg-test harness in `apps/api/src/__tests__/`.)

- [ ] **Step 2: Run it — fails** (route missing → 404).

Run: `cd apps/api && npx vitest run -c vitest.pg.config.ts src/routes/__tests__/feedback.test.ts`

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/feedback.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDbAdapter } from '../db/index.js';

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.post('/feedback', { preHandler: [app.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const b = request.body as {
      kind?: string; ref_id?: string; rating?: number;
      comment?: string; prompt_text?: string; response_text?: string;
    };
    if ((b.kind !== 'chat' && b.kind !== 'creative') || !b.ref_id || ![-1, 0, 1].includes(b.rating as number)) {
      return reply.status(400).send({ success: false, error: 'kind, ref_id and rating (-1|0|1) are required' });
    }
    await getDbAdapter().run(
      `INSERT INTO ai_feedback (id, user_id, kind, ref_id, rating, comment, prompt_text, response_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, kind, ref_id)
       DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
                     prompt_text = EXCLUDED.prompt_text, response_text = EXCLUDED.response_text`,
      [randomUUID(), request.user.id, b.kind, b.ref_id, b.rating,
       b.comment ?? null, b.prompt_text ?? null, b.response_text ?? null],
    );
    return { success: true };
  });
}
```

- [ ] **Step 4: Register it** in the boot module that wires the other routes (follow the existing `registerAutopilotRoutes`/similar pattern), e.g. `registerFeedbackRoutes(app);`.

- [ ] **Step 5: Run the test — passes.** Then `npx tsc --noEmit` (baseline) + `npx madge --circular --extensions ts src/` (0 cycles).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/feedback.ts apps/api/src/routes/__tests__/feedback.test.ts apps/api/src/boot/
git commit -m "feat(feedback): POST /feedback upsert route"
```

---

## Task 3: web thumbs on chat + creative (apps/web)

**Files:**
- Create: `apps/web/src/app/core/services/feedback.service.ts`
- Modify: `apps/web/src/app/features/ai-chat/ai-chat.component.ts`
- Modify: the ugc-studio output display component (`generation-detail` / `output-gallery`).

**Interfaces:**
- Consumes: `POST /feedback` (Task 2). `rate(kind, refId, rating, extra?)`.

- [ ] **Step 1: The service**

```ts
import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private api = inject(ApiService);
  rate(kind: 'chat' | 'creative', refId: string, rating: -1 | 0 | 1,
       extra?: { comment?: string; prompt_text?: string; response_text?: string }) {
    return this.api.post('feedback', { kind, ref_id: refId, rating, ...extra });
  }
}
```

- [ ] **Step 2: Chat thumbs** — in `ai-chat.component.ts`, for each assistant message add up/down buttons that call
  `feedback.rate('chat', \`${sessionId}:${turn}\`, rating, { prompt_text: userMsg, response_text: m.content })`.
  Track a local `rated` map so the chosen thumb shows selected. Use the `X-Session-Id` the chat already receives.

- [ ] **Step 3: Session comment box** — after the assistant's 3rd–4th turn in a session, render a one-time
  optional textarea; on submit call `feedback.rate('chat', sessionId, 0, { comment })`. Dismissable; show once per session.

- [ ] **Step 4: Creative thumbs** — in the output display, for each `studio_outputs` item add up/down calling
  `feedback.rate('creative', output.id, rating)` with an optional inline comment field on click.

- [ ] **Step 5: Build** — `cd apps/web && npx ng build --configuration development` → compiles, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/core/services/feedback.service.ts apps/web/src/app/features/ai-chat/ apps/web/src/app/features/ugc-studio/
git commit -m "feat(feedback): thumbs on chat answers + creative outputs, session comment box"
```

---

## Self-Review

**Spec coverage:** table shape verbatim (T1), upsert overwrite (T2 + test), both kinds (T2 test), chat thumbs keyed `${sessionId}:${turn}` (T3.2), session box after 3–4 turns keyed `sessionId` rating 0 (T3.3), creative thumbs on `output.id` (T3.4), separation rule (Global Constraints). ✓
**Placeholder scan:** clean. The only adapt-to-repo note is the test harness helper name (T2 step 1), which is genuine — the repo's pg-test helper is the source of truth. ✓
**Type consistency:** `rate(kind, refId, rating, extra)` signature matches all four call sites; route body keys match the service payload. ✓
