# UGC Video UI + Async Delivery — Implementation Plan (Subsystem 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the ai-layer storyboard UGC-video pipeline in the product as a quote-before-spend flow, delivered asynchronously via the existing notification bell.

**Architecture:** apps/web planner component → apps/api proxy routes (`/video/plan`, `/video/generate`, `/video/job/:id`) → ai-layer `/creative/video/*`. Long renders are watched by an in-process poller with a soft deadline that writes one `autopilot_alerts` row on completion; a boot-recovery hook re-attaches orphaned pollers. The ai-layer already persists renders to Neon, so the DB is the source of truth and the poller is only the notifier.

**Tech Stack:** Angular 18 (standalone, signals), Fastify + Drizzle (Neon Postgres), vitest (api), the existing `getCreativeJob` client.

## Global Constraints

- **No Anthropic.** Never import `createMessage`/llm-gateway in new code. The video path is fal-only via the ai-layer.
- **No new dependencies.** Nothing added to any `package.json` or `pyproject.toml`.
- **Zero ai-layer changes in this plan.** Subsystem 1 ships entirely in `apps/api` + `apps/web`.
- **Quote before spend.** No paid render fires without the user seeing the cost first.
- **withVideo:false** — the storyboard flow owns video; the generate screen must stop auto-producing the $1.2222 smoke clip.
- **Cost facts (verbatim):** `SEEDANCE_CLIP_USD = 1.2222`; the guard needs `n*1.2222 + 0.30` overhead, so the quote's `estimated_usd` (clips only) and the guard's `needed` (clips + $0.30) differ — show both, never blame a shortfall without naming the $0.30 margin.
- **Soft deadline:** the poller never hard-kills. WARN at 20m, ERROR + stop-timer at 90m, and NEVER mark the generation failed on a ceiling hit.
- **Test invariant** (before any commit): default suite passes, pg suite passes, `tsc --noEmit` baseline-only (`billing.ts:4` stripe), `madge --circular` 0 cycles. No live fal spend in any test.

---

## File Structure

- `apps/api/src/services/creative-gen-client.ts` — MODIFY: add `videoPlan()`, `videoGenerate()` (thin ai-layer fetch wrappers). Reuses existing `getCreativeJob()`.
- `apps/api/src/services/video-job-poller.ts` — CREATE: the soft-deadline completion poller + notification write + `recoverVideoJobs()`.
- `apps/api/src/routes/creative-studio.ts` — MODIFY: 3 new routes; flip `withVideo` to false.
- `apps/api/src/index.ts` — MODIFY: call `recoverVideoJobs()` next to `recoverInterruptedSprints()`.
- `apps/api/src/services/__tests__/video-job-poller.test.ts` — CREATE: soft-deadline + notification unit tests (mocked clock + mocked client).
- `apps/web/src/app/core/services/creative-studio.service.ts` — MODIFY: `videoPlan()`, `videoGenerate()`, `getVideoJob()` observables + types.
- `apps/web/src/app/features/ugc-studio/generation-detail/video-planner/video-planner.component.ts` — CREATE: the planner UI (quote as hero).
- `apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts` — MODIFY: mount `<app-video-planner>` when status completed.

---

## Task 1: ai-layer video client wrappers (apps/api)

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts`

**Interfaces:**
- Consumes: existing `base()`, `config.aiLayerApiKey`, `AiLayerError` in the same file.
- Produces:
  - `videoPlan(jobId: string, opts: VideoPlanOpts, metaToken?: string): Promise<VideoPlan>`
  - `videoGenerate(jobId: string, opts: VideoGenOpts, metaToken?: string): Promise<{ job_id: string; status: string; clips: number }>`
  - types `VideoPlanOpts = { seconds?: number; direction?: string; n_shots?: number }`,
    `VideoGenOpts = { voiceover?: boolean; captions?: boolean; sfx?: boolean }`,
    `VideoPlan = { job_id: string; shots: number; duration_s: number; grounded: boolean; storyboard: any; quote: VideoQuote }`,
    `VideoQuote = { clips: number; estimated_usd: number; balance_usd: number | null; affordable: boolean; guard_enabled: boolean; shortfall_usd: number }`.

- [ ] **Step 1: Add the types and `videoPlan` wrapper**

At the end of `creative-gen-client.ts`, following the style of the existing `startCreativeGen`:

```ts
export interface VideoPlanOpts { seconds?: number; direction?: string; n_shots?: number; }
export interface VideoGenOpts { voiceover?: boolean; captions?: boolean; sfx?: boolean; }
export interface VideoQuote {
  clips: number; estimated_usd: number; balance_usd: number | null;
  affordable: boolean; guard_enabled: boolean; shortfall_usd: number;
}
export interface VideoPlan {
  job_id: string; shots: number; duration_s: number; grounded: boolean;
  storyboard: unknown; quote: VideoQuote;
}

/** POST /creative/video/plan — $0, LLM only. 409 if the run has no brand kit. */
export async function videoPlan(jobId: string, opts: VideoPlanOpts, metaToken?: string): Promise<VideoPlan> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-API-Key': config.aiLayerApiKey };
  if (metaToken) headers['X-Meta-Token'] = metaToken;
  const res = await fetch(`${base()}/creative/video/plan`, {
    method: 'POST', headers,
    body: JSON.stringify({ job_id: jobId, seconds: opts.seconds, direction: opts.direction, n_shots: opts.n_shots }),
  });
  if (!res.ok) throw new AiLayerError(`video/plan failed: ${await res.text()}`, res.status);
  return res.json() as Promise<VideoPlan>;
}
```

- [ ] **Step 2: Add the `videoGenerate` wrapper**

```ts
/** POST /creative/video/generate — PAID. 409 without a storyboard, 402 if balance can't cover. */
export async function videoGenerate(jobId: string, opts: VideoGenOpts, metaToken?: string): Promise<{ job_id: string; status: string; clips: number }> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-API-Key': config.aiLayerApiKey };
  if (metaToken) headers['X-Meta-Token'] = metaToken;
  const res = await fetch(`${base()}/creative/video/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({
      job_id: jobId,
      voiceover: opts.voiceover ?? true, captions: opts.captions ?? true, sfx: opts.sfx ?? true,
    }),
  });
  if (!res.ok) throw new AiLayerError(`video/generate failed: ${await res.text()}`, res.status);
  return res.json() as Promise<{ job_id: string; status: string; clips: number }>;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: only the baseline `src/routes/billing.ts(4,20)` stripe error.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/creative-gen-client.ts
git commit -m "feat(creative): ai-layer video plan/generate client wrappers"
```

---

## Task 2: the completion poller with soft deadline (apps/api)

This is the one piece with real logic. TDD it.

**Files:**
- Create: `apps/api/src/services/video-job-poller.ts`
- Test: `apps/api/src/services/__tests__/video-job-poller.test.ts`

**Interfaces:**
- Consumes: `getCreativeJob` from `creative-gen-client.ts` (existing: returns `{ status, error?, video?, qa?, cost_usd? }`), `getDbAdapter`, `logger`.
- Produces:
  - `pollVideoJob(args: { generationId: string; aiJobId: string; userId: string; videoOutputId: string; productName: string; accountId: string | null; deps?: PollerDeps }): Promise<void>`
  - `recoverVideoJobs(deps?: PollerDeps): Promise<void>`
  - `PollerDeps = { now?: () => number; sleep?: (ms: number) => Promise<void>; getJob?: typeof getCreativeJob }` (injected for tests).
  - constants `SOFT_WARN_MS = 20*60_000`, `HARD_CEIL_MS = 90*60_000`, `POLL_INTERVAL_MS = 15_000`.

- [ ] **Step 1: Write the failing test — soft warn then complete**

Create `apps/api/src/services/__tests__/video-job-poller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db adapter and logger before importing the poller.
const runs: Array<{ sql: string; params: unknown[] }> = [];
vi.mock('../../db/index.js', () => ({
  getDbAdapter: () => ({
    run: async (sql: string, params: unknown[]) => { runs.push({ sql, params }); },
    all: async () => [],
  }),
}));
const warns: string[] = []; const errors: string[] = [];
vi.mock('../../utils/logger.js', () => ({
  logger: { warn: (_: unknown, m: string) => warns.push(m), error: (_: unknown, m: string) => errors.push(m), info: () => {} },
}));

import { pollVideoJob, SOFT_WARN_MS } from '../video-job-poller.js';

beforeEach(() => { runs.length = 0; warns.length = 0; errors.length = 0; });

it('warns once past the soft deadline, then finishes on complete', async () => {
  let t = 0;
  const statuses = ['running', 'running', 'complete'];
  let i = 0;
  const getJob = vi.fn(async () => {
    // advance the clock past the soft warn on the 2nd poll
    if (i === 1) t = SOFT_WARN_MS + 1;
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return status === 'complete'
      ? { status, video: { url: '/creative/assets/j/video.mp4' }, qa: { verdict: 'pass' }, cost_usd: 3.67 }
      : { status };
  });
  await pollVideoJob({
    generationId: 'g1', aiJobId: 'j', userId: 'u1', videoOutputId: 'o1',
    productName: 'Widget', accountId: null,
    deps: { now: () => t, sleep: async () => {}, getJob: getJob as never },
  });
  expect(warns.filter(w => w.includes('past 20m')).length).toBe(1);
  // exactly one alert row written, type video_ready
  const alert = runs.find(r => r.sql.includes('autopilot_alerts'));
  expect(alert).toBeTruthy();
  expect(alert!.params).toContain('video_ready');
});
```

- [ ] **Step 2: Run it — fails (module missing)**

Run: `cd apps/api && npx vitest run src/services/__tests__/video-job-poller.test.ts`
Expected: FAIL — cannot find `../video-job-poller.js`.

- [ ] **Step 3: Implement the poller**

Create `apps/api/src/services/video-job-poller.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { getDbAdapter } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getCreativeJob } from './creative-gen-client.js';

export const POLL_INTERVAL_MS = 15_000;
export const SOFT_WARN_MS = 20 * 60_000;
export const HARD_CEIL_MS = 90 * 60_000;

export interface PollerDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  getJob?: typeof getCreativeJob;
}
interface PollArgs {
  generationId: string; aiJobId: string; userId: string;
  videoOutputId: string; productName: string; accountId: string | null;
  deps?: PollerDeps;
}

// /creative/assets/<job>/<sub> -> the apps/api proxy the browser can read.
const proxy = (jobId: string, u: string) =>
  `/api/creative-studio/asset/${jobId}/${u.replace(/^\/creative\/assets\/[^/]+\//, '')}`;

async function alert(userId: string, accountId: string | null, type: string, title: string, content: string, severity: string) {
  await getDbAdapter().run(
    `INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, accountId, type, title, content, severity],
  ).catch(() => { /* notification is best-effort; never throw out of the poller */ });
}

export async function pollVideoJob(args: PollArgs): Promise<void> {
  const now = args.deps?.now ?? Date.now;
  const sleep = args.deps?.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const getJob = args.deps?.getJob ?? getCreativeJob;
  const db = getDbAdapter();
  const start = now();
  let warned = false;

  for (;;) {
    let job: Awaited<ReturnType<typeof getCreativeJob>>;
    try {
      job = await getJob(args.aiJobId);
    } catch (err: unknown) {
      logger.warn({ err, aiJobId: args.aiJobId }, '[video-poller] poll error, will retry');
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (job.status === 'complete') {
      const url = job.video ? proxy(args.aiJobId, job.video.url) : null;
      await db.run(
        `UPDATE studio_outputs SET status = 'completed', output_json = ?, asset_url = ?, cost_cents = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify({ video_url: url, qa: job.qa ?? null, status: 'completed' }), url,
         Math.round((job.cost_usd ?? 0) * 100), new Date().toISOString(), args.videoOutputId],
      ).catch(() => {});
      await alert(args.userId, args.accountId, 'video_ready', 'Your video is ready',
        `Your UGC video for "${args.productName}" finished rendering.`, 'info');
      return;
    }
    if (job.status === 'failed') {
      await db.run(
        `UPDATE studio_outputs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
        [job.error ?? 'render failed', new Date().toISOString(), args.videoOutputId],
      ).catch(() => {});
      await alert(args.userId, args.accountId, 'video_failed', 'Video render failed',
        `Your UGC video for "${args.productName}" could not finish: ${job.error ?? 'unknown error'}.`, 'warning');
      return;
    }

    const elapsed = now() - start;
    if (elapsed > SOFT_WARN_MS && !warned) {
      warned = true;
      logger.warn({ aiJobId: args.aiJobId, elapsedMs: elapsed }, '[video-poller] job still running past 20m');
    }
    if (elapsed > HARD_CEIL_MS) {
      // Stop THIS timer only. Do NOT mark the generation failed — the ai-layer persists the
      // render to Neon regardless, so boot-recovery / a manual refresh still surfaces it.
      logger.error({ aiJobId: args.aiJobId, elapsedMs: elapsed }, '[video-poller] exceeded 90m ceiling, detaching poller (job may still finish server-side)');
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function recoverVideoJobs(_deps?: PollerDeps): Promise<void> {
  const db = getDbAdapter();
  // studio_outputs.format = 'video' still generating, with a live ai_job_id on the parent.
  const rows = await db.all<{
    output_id: string; generation_id: string; ai_job_id: string; user_id: string;
    meta_account_id: string | null; brief_json: string;
  }>(`SELECT o.id AS output_id, g.id AS generation_id, g.ai_job_id, g.user_id,
             g.meta_account_id, g.brief_json
        FROM studio_outputs o JOIN studio_generations g ON g.id = o.generation_id
       WHERE o.format = 'video' AND o.status = 'generating' AND g.ai_job_id IS NOT NULL`).catch(() => []);
  for (const r of rows) {
    const productName = (() => { try { return JSON.parse(r.brief_json)?.product_name ?? 'your product'; } catch { return 'your product'; } })();
    logger.info({ aiJobId: r.ai_job_id }, '[video-poller] re-attaching poller after restart');
    void pollVideoJob({
      generationId: r.generation_id, aiJobId: r.ai_job_id, userId: r.user_id,
      videoOutputId: r.output_id, productName, accountId: r.meta_account_id,
    });
  }
}
```

- [ ] **Step 4: Run the test — passes**

Run: `cd apps/api && npx vitest run src/services/__tests__/video-job-poller.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the failure + ceiling tests**

Append to the test file:

```ts
it('writes a warning alert on failed', async () => {
  const getJob = vi.fn(async () => ({ status: 'failed', error: 'fal 402' }));
  await pollVideoJob({ generationId: 'g', aiJobId: 'j', userId: 'u', videoOutputId: 'o',
    productName: 'X', accountId: null, deps: { now: () => 0, sleep: async () => {}, getJob: getJob as never } });
  const a = runs.find(r => r.sql.includes('autopilot_alerts'));
  expect(a!.params).toContain('video_failed');
  expect(a!.params).toContain('warning');
});

it('detaches at the 90m ceiling WITHOUT marking failed', async () => {
  let t = 0;
  const getJob = vi.fn(async () => { t += 100 * 60_000; return { status: 'running' }; });
  await pollVideoJob({ generationId: 'g', aiJobId: 'j', userId: 'u', videoOutputId: 'o',
    productName: 'X', accountId: null, deps: { now: () => t, sleep: async () => {}, getJob: getJob as never } });
  expect(errors.some(e => e.includes('90m'))).toBe(true);
  // no failed status write
  expect(runs.some(r => r.sql.includes("status = 'failed'"))).toBe(false);
});
```

Run: `cd apps/api && npx vitest run src/services/__tests__/video-job-poller.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` → baseline only.
```bash
git add apps/api/src/services/video-job-poller.ts apps/api/src/services/__tests__/video-job-poller.test.ts
git commit -m "feat(creative): async video completion poller with soft deadline + bell notification"
```

---

## Task 3: video proxy routes + withVideo:false (apps/api)

**Files:**
- Modify: `apps/api/src/routes/creative-studio.ts`

**Interfaces:**
- Consumes: `videoPlan`, `videoGenerate` (Task 1), `pollVideoJob` (Task 2), existing `getMetaTokenForUser`, `getDbAdapter`, `getCreativeJob`.
- Produces: routes `POST /video/plan`, `POST /video/generate`, `GET /video/job/:jobId`.

- [ ] **Step 1: Flip withVideo to false**

In `creative-studio.ts` at the `startCreativeGen({...})` call (~line 544), change:

```ts
withVideo: formats.includes('video'),
```
to:
```ts
// The storyboard flow (/video/*) owns video now; do not fire the unquoted single-clip smoke.
withVideo: false,
```

- [ ] **Step 2: Add the imports**

At the top of `creative-studio.ts`, extend the `creative-gen-client.js` import to include `videoPlan, videoGenerate` and add `import { pollVideoJob } from '../services/video-job-poller.js';`.

- [ ] **Step 3: Add the three routes**

Inside the route-registration function, near the other studio routes:

```ts
// POST /video/plan — $0 quote. 409 (no brand kit) surfaces as a clean message.
app.post('/video/plan', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { generation_id, seconds, direction, n_shots } = request.body as {
    generation_id: string; seconds?: number; direction?: string; n_shots?: number;
  };
  const db = getDbAdapter();
  const gen = await db.get<{ ai_job_id: string | null }>(
    'SELECT ai_job_id FROM studio_generations WHERE id = ? AND user_id = ?', [generation_id, request.user.id]);
  if (!gen?.ai_job_id) return reply.status(409).send({ success: false, error: 'Generate static ads first, then plan the video.' });
  try {
    const metaToken = await getMetaTokenForUser(request.user.id).catch(() => null);
    const plan = await videoPlan(gen.ai_job_id, { seconds, direction, n_shots }, metaToken || undefined);
    return { success: true, plan };
  } catch (err: any) {
    return reply.status(err.status ?? 500).send({ success: false, error: err.message });
  }
});

// POST /video/generate — PAID. Starts the poller on success. 402 surfaces the top-up hint.
app.post('/video/generate', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
  const { generation_id, voiceover, captions, sfx } = request.body as {
    generation_id: string; voiceover?: boolean; captions?: boolean; sfx?: boolean;
  };
  const db = getDbAdapter();
  const gen = await db.get<{ ai_job_id: string | null; brief_json: string; meta_account_id: string | null }>(
    'SELECT ai_job_id, brief_json, meta_account_id FROM studio_generations WHERE id = ? AND user_id = ?',
    [generation_id, request.user.id]);
  if (!gen?.ai_job_id) return reply.status(409).send({ success: false, error: 'Plan the video first.' });
  // Ensure a video output row exists to track against.
  const outputId = randomUUID();
  await db.run(`INSERT INTO studio_outputs (id, generation_id, format, status) VALUES (?, ?, 'video', 'generating')
                ON CONFLICT DO NOTHING`, [outputId, generation_id]);
  try {
    const metaToken = await getMetaTokenForUser(request.user.id).catch(() => null);
    const res = await videoGenerate(gen.ai_job_id, { voiceover, captions, sfx }, metaToken || undefined);
    const productName = (() => { try { return JSON.parse(gen.brief_json)?.product_name ?? 'your product'; } catch { return 'your product'; } })();
    void pollVideoJob({ generationId: generation_id, aiJobId: gen.ai_job_id, userId: request.user.id,
      videoOutputId: outputId, productName, accountId: gen.meta_account_id });
    return { success: true, status: res.status, clips: res.clips };
  } catch (err: any) {
    return reply.status(err.status ?? 500).send({ success: false, error: err.message });
  }
});

// GET /video/job/:jobId — live stage/progress passthrough for a user who stays on the page.
app.get('/video/job/:jobId', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  try { return { success: true, job: await getCreativeJob(jobId) }; }
  catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
});
```

- [ ] **Step 4: Verify `randomUUID` is imported** at the top of the file (it is used elsewhere in this file already — confirm; if not, add `import { randomUUID } from 'node:crypto';`).

- [ ] **Step 5: Typecheck + circular check**

Run: `cd apps/api && npx tsc --noEmit` → baseline only.
Run: `cd apps/api && npx madge --circular --extensions ts src/` → 0 cycles (the poller must not import routes).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/creative-studio.ts
git commit -m "feat(creative): video plan/generate/job routes; storyboard owns video (withVideo:false)"
```

---

## Task 4: boot recovery hook (apps/api)

**Files:**
- Modify: `apps/api/src/index.ts:288`

- [ ] **Step 1: Wire recoverVideoJobs next to recoverInterruptedSprints**

After the existing `await recoverInterruptedSprints();` (index.ts:288), add:

```ts
const { recoverVideoJobs } = await import('./services/video-job-poller.js');
await recoverVideoJobs();
```

- [ ] **Step 2: Typecheck + boot smoke**

Run: `cd apps/api && npx tsc --noEmit` → baseline only.
Boot the API (`npm run dev:api`) and confirm the log shows no crash and (with no in-flight jobs) no re-attach lines. Expected: server listens on :3000, stable.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(creative): re-attach video pollers on boot (restart safety)"
```

---

## Task 5: web service methods (apps/web)

**Files:**
- Modify: `apps/web/src/app/core/services/creative-studio.service.ts`

**Interfaces:**
- Produces: `videoPlan(generationId, opts)`, `videoGenerate(generationId, opts)`, `getVideoJob(jobId)` observables; types `VideoQuote`, `VideoPlan`.

- [ ] **Step 1: Add types + methods** mirroring the existing `generate()`/`getGeneration()` style:

```ts
export interface VideoQuote {
  clips: number; estimated_usd: number; balance_usd: number | null;
  affordable: boolean; guard_enabled: boolean; shortfall_usd: number;
}
export interface VideoPlan {
  job_id: string; shots: number; duration_s: number; grounded: boolean;
  storyboard: { shots: { title?: string; description?: string }[] }; quote: VideoQuote;
}

videoPlan(generationId: string, opts: { seconds?: number; direction?: string; n_shots?: number }):
  Observable<{ success: boolean; plan: VideoPlan; error?: string }> {
  return this.api.post('creative-studio/video/plan', { generation_id: generationId, ...opts });
}
videoGenerate(generationId: string, opts: { voiceover?: boolean; captions?: boolean; sfx?: boolean }):
  Observable<{ success: boolean; status: string; clips: number; error?: string }> {
  return this.api.post('creative-studio/video/generate', { generation_id: generationId, ...opts });
}
getVideoJob(jobId: string): Observable<{ success: boolean; job: any }> {
  return this.api.get(`creative-studio/video/job/${jobId}`);
}
```

- [ ] **Step 2: Build** — `cd apps/web && npx ng build --configuration development` → compiles (pre-existing NG8107 warnings ok, no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/core/services/creative-studio.service.ts
git commit -m "feat(creative): web service methods for video plan/generate/job"
```

---

## Task 6: the planner component — quote as hero (apps/web)

**Files:**
- Create: `apps/web/src/app/features/ugc-studio/generation-detail/video-planner/video-planner.component.ts`
- Modify: `apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts`

**Interfaces:**
- Consumes: `CreativeStudioService.videoPlan/videoGenerate` (Task 5). Input `@Input() generationId!: string; @Input() status!: string;`.

- [ ] **Step 1: Create the component**

```ts
import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreativeStudioService, VideoPlan } from '../../../../core/services/creative-studio.service';

const CLIP_USD = 1.2222;

@Component({
  selector: 'app-video-planner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mt-6 rounded-card border border-border bg-white p-5">
      <h3 class="font-display text-navy text-lg m-0 mb-3">Video</h3>

      <label class="block text-sm text-gray-600 mb-1">Direction</label>
      <input [(ngModel)]="direction" class="w-full rounded-lg bg-input-bg px-3 py-2 mb-3 font-body"
             placeholder="cozy handheld, morning light, slow" />

      <div class="flex flex-wrap gap-4 items-center mb-4">
        <span class="text-sm">Shots
          <button (click)="nShots.set(Math.max(1, nShots() - 1))" class="px-2">−</button>
          <span class="font-mono">{{ nShots() }}</span>
          <button (click)="nShots.set(Math.min(12, nShots() + 1))" class="px-2">+</button>
        </span>
        <span class="text-sm">Seconds
          <button (click)="seconds.set(Math.max(6, seconds() - 6))" class="px-2">−</button>
          <span class="font-mono">{{ seconds() }}</span>
          <button (click)="seconds.set(Math.min(90, seconds() + 6))" class="px-2">+</button>
        </span>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="voiceover" /> Voiceover</label>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="captions" /> Captions</label>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="sfx" /> SFX</label>
      </div>

      <button (click)="plan()" [disabled]="planning()"
              class="rounded-pill border border-accent text-accent px-4 py-2 font-semibold">
        {{ planning() ? 'Planning…' : 'Plan it · free' }}
      </button>

      @if (planError()) { <p class="text-red-600 text-sm mt-2">{{ planError() }}</p> }

      @if (quote(); as p) {
        <div class="mt-5 border-t border-divider pt-4">
          <div class="flex justify-between text-xs text-gray-500 mb-2">
            <span>STORYBOARD</span><span>{{ p.duration_s }}s · {{ p.grounded ? 'grounded' : 'brief-only' }}</span>
          </div>
          @for (s of p.storyboard.shots; track $index) {
            <div class="flex justify-between py-1 text-sm">
              <span><span class="font-mono text-gray-400 mr-2">{{ ($index + 1).toString().padStart(2,'0') }}</span>{{ s.title || s.description || 'Shot' }}</span>
              <span class="font-mono">\${{ CLIP_USD.toFixed(4) }}</span>
            </div>
          }
          <div class="flex justify-between border-t border-divider mt-2 pt-2 font-semibold">
            <span>{{ p.quote.clips }} clips</span>
            <span class="font-mono">\${{ p.quote.estimated_usd.toFixed(2) }}</span>
          </div>

          <p class="text-sm mt-2"
             [class.text-gray-500]="!p.quote.guard_enabled"
             [class.text-red-600]="p.quote.guard_enabled && !p.quote.affordable">
            @if (!p.quote.guard_enabled) { Balance check off }
            @else if (p.quote.affordable) { Balance \${{ p.quote.balance_usd }} — covers this (needs \${{ (p.quote.estimated_usd + 0.30).toFixed(2) }} incl. margin) }
            @else { Short \${{ p.quote.shortfall_usd.toFixed(2) }} — top up at fal.ai/dashboard/billing }
          </p>

          <button (click)="render()"
                  [disabled]="rendering() || (p.quote.guard_enabled && !p.quote.affordable)"
                  class="mt-3 rounded-pill bg-accent text-white px-5 py-2 font-semibold">
            {{ rendering() ? 'Rendering…' : 'Render ' + p.quote.clips + ' clips — $' + p.quote.estimated_usd.toFixed(2) }}
          </button>
          @if (rendered()) { <p class="text-sm text-green-700 mt-2">Rendering started. We'll notify you when it's ready — you can leave this page.</p> }
          @if (renderError()) { <p class="text-red-600 text-sm mt-2">{{ renderError() }}</p> }
        </div>
      }
    </section>
  `,
})
export class VideoPlannerComponent {
  @Input() generationId!: string;
  private studio = inject(CreativeStudioService);
  readonly Math = Math; readonly CLIP_USD = CLIP_USD;

  direction = ''; voiceover = true; captions = true; sfx = true;
  nShots = signal(3); seconds = signal(24);
  planning = signal(false); rendering = signal(false);
  rendered = signal(false); planError = signal(''); renderError = signal('');
  quote = signal<VideoPlan | null>(null);

  plan(): void {
    this.planning.set(true); this.planError.set('');
    this.studio.videoPlan(this.generationId, { seconds: this.seconds(), direction: this.direction || undefined, n_shots: this.nShots() })
      .subscribe({
        next: (r) => { this.planning.set(false); r.success ? this.quote.set(r.plan) : this.planError.set(r.error || 'Planning failed.'); },
        error: (e) => { this.planning.set(false); this.planError.set(e?.error?.error || 'Planning failed.'); },
      });
  }
  render(): void {
    this.rendering.set(true); this.renderError.set('');
    this.studio.videoGenerate(this.generationId, { voiceover: this.voiceover, captions: this.captions, sfx: this.sfx })
      .subscribe({
        next: (r) => { this.rendering.set(false); r.success ? this.rendered.set(true) : this.renderError.set(r.error || 'Could not start render.'); },
        error: (e) => { this.rendering.set(false); this.renderError.set(e?.error?.error || 'Could not start render.'); },
      });
  }
}
```

- [ ] **Step 2: Mount it in generation-detail** — import `VideoPlannerComponent`, add to `imports`, and in the template inside the `@if (!loading() && generation())` block add:

```html
@if (generation()!.status === 'completed') {
  <app-video-planner [generationId]="generation()!.id" />
}
```

- [ ] **Step 3: Build** — `cd apps/web && npx ng build --configuration development` → compiles, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/generation-detail/
git commit -m "feat(creative): UGC video planner — priced storyboard, quote before render"
```

---

## Task 7: manual end-to-end verification (no auto-render)

**Files:** none (verification only).

- [ ] **Step 1:** With all three services up, open a completed generation in the UI. Confirm the **Video** section renders and `Plan it · free` returns a priced storyboard (each shot line `$1.2222`, total = clips × that).
- [ ] **Step 2:** Confirm the balance line matches the guard state (`FAL_ADMIN_KEY` is set → shows real balance + the `+$0.30 margin` note).
- [ ] **Step 3:** Do NOT click Render unless you intend to spend. If you do: confirm the button shows the price, the "we'll notify you" message appears, and — within a minute — the bell badge increments with **"Your video is ready"** (or a warning on failure). This exercises the poller + notification live.
- [ ] **Step 4:** Restart the API mid-render; confirm the boot log re-attaches the poller and the notification still fires.

---

## Optional ai-layer task (OWNER: dryayeet — coordinate, do not self-merge)

## Task 8: harden the render_story strict-raise path (apps/ai-layer)

**Files:**
- Modify: `apps/ai-layer/ai_layer/creative/service.py` (`_run_video_job`)

**Rationale:** on a strict-QA exception inside `render_story`, the `except` sets `status:"failed"` with no `job.video`, so already-rendered (paid) clips are lost to the UI. Attach whatever rendered before re-raising.

- [ ] **Step 1:** In `_run_video_job`, wrap the `render_story` call so that if it raises after N clips exist on disk, the partial timeline path (if any) is written to `job["video"]` with a `partial: true` flag before setting `status:"failed"`. Keep `strict` semantics otherwise unchanged.
- [ ] **Step 2:** Add a pytest under `apps/ai-layer/tests/creative/` that mocks `render_story` to raise after producing a partial path and asserts `job["video"]["partial"] is True` and `status == "failed"`.
- [ ] **Step 3:** Run `cd apps/ai-layer && .venv/bin/pytest tests/creative/ -k video -q` → PASS. Hand to dryayeet for review; do not merge into the creative subtree unilaterally.

---

## Self-Review

**Spec coverage:** contract (T1,T3), three balance states (T6), withVideo:false (T3), poller soft-deadline (T2), notification via autopilot_alerts (T2), boot recovery (T4), planner quote-as-hero + creator read-only note [creator display folded into the plan response render — no separate control in v1, matches spec], proxy playback (T2 `proxy()` + existing asset route), optional ai-layer hardening (T8). Feedback + chat formatting + AI-Studio retirement are Subsystems 2 & 3 (separate plans). ✓

**Placeholder scan:** no TBD/TODO; every code step shows code; test steps show assertions. ✓

**Type consistency:** `VideoQuote`/`VideoPlan` identical across api (T1) and web (T5); `pollVideoJob` args match its caller in T3; `proxy()` regex matches the existing helper in creative-studio.ts. ✓

**Known follow-ups for the implementer:** confirm `getCreativeJob`'s return type actually exposes `video`/`qa`/`cost_us`d fields (it does per service.py:359-363, but the TS type may need widening — if so, extend the interface in creative-gen-client.ts as step 0 of Task 2).
