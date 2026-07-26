# Creative Studio UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every Creative Studio endpoint through `apps/api` and rebuild the `apps/web` surface to match the "see the evidence, see the price, then decide" design in `docs/superpowers/specs/2026-07-21-creative-studio-ui-redesign-design.md`.

**Architecture:** Two halves. (1) **apps/api passthrough** — the ai-layer already exposes every route and field; the gap is `apps/api` not forwarding four loop routes, several video/generate fields, and `direction` on static generate, plus one genuinely-new ai-layer voice-preview route. (2) **apps/web** — evolve the four existing components (`ugc-studio`, `generation-detail`, `video-planner`, `output-gallery`) into the spec's four zones + History loop; nothing is rebuilt from scratch.

**Tech Stack:** apps/ai-layer FastAPI + pytest; apps/api Fastify + vitest (fetch-mocked client tests, the repo's established pattern); apps/web Angular 17 standalone components + signals, Tailwind (`accent`/`navy`/`cream` tokens), Karma/Jasmine (used only for the service seam).

## Global Constraints

- **Ponytail (lazy/minimal):** extend existing files, do not rebuild. Shortest working diff. No new deps.
- **Single-tenant (Pratap Sons).** `balance_usd` is the raw platform fal balance, shown as-is. No per-client credit abstraction.
- **`n_shots` = 3, FIXED.** No shot-count UI control. Static video plan always plans 3 shots. (Spec resolved decision #1 overrides the `[3 ▾]` mockup in spec §3.1.)
- **`seconds` = 24 default**, editable (spec §3.1 shows a control; keep the existing one).
- **Progress feed = polling** (reuse `getGeneration`/`getVideoJob`, 3s). No SSE.
- **QA false-positives NOT surfaced** (caption critic @48px, cut_alignment double-count) — internal only.
- **Voice preview = real backend endpoint** (ai-layer MiniMax + apps/api passthrough), not pre-rendered samples.
- **Dead surfaces untouched:** Creative Cockpit, Director Lab, Creative Engine. Only `ugc-studio` is edited.
- **URL-analyze hero + "Import from Sprint" are removed** from this surface (dead Anthropic key / legacy). URL prefill returns only post-migration; do not render it.
- **Grounding is on by default, not configurable** — the UI states it and shows whether it can, via pills.
- **Degrade loudly:** grounding/guard/persona-seed/QA degradations are persistent amber badges, never toasts; a badge names the *consequence* ("faces may vary"), not the config.
- **Confirm buttons carry their dollar amount** ("Render 3 clips — spend ~$4.78"), never bare "Generate".
- **Radio, not checkboxes, for variant axis** — one axis per variant, enforced by the control.
- **Test invariant (before any commit):** apps/api vitest default suite stays green; `apps/ai-layer` pytest creative suite stays green. Run `tsc --noEmit` in apps/api and `ng build` in apps/web before the phase-final commit.
- **No push. No AI attribution / no Co-Authored-By on commits.**

## File Structure

**apps/ai-layer (Phase 1, Task 5 only):**
- Modify `apps/ai-layer/ai_layer/creative/service.py` — add `POST /creative/voice/preview` route + `VoicePreviewRequest`.
- Modify `apps/ai-layer/ai_layer/creative/video_providers.py` — reuse `generate_voiceover`; add a tiny `voice_preview()` helper that returns bytes/url without a run dir.
- Test `apps/ai-layer/tests/creative/test_creative_service.py` — add a mocked-fal preview test.

**apps/api (Phase 1):**
- Modify `apps/api/src/services/creative-gen-client.ts` — extend request interfaces + bodies; add `markPublished`, `learn`, `getPrior`, `getGraph`, `voicePreview`.
- Modify `apps/api/src/routes/creative-studio.ts` — thread `direction`; extend `/video/plan` + `/video/generate` bodies; add `/variants/:id/published`, `/learn`, `/prior/:acct`, `/graph/:acct`, `/voice/preview`.
- Test `apps/api/src/__tests__/creative-gen-client.test.ts` (**create**) — fetch-mocked body/URL assertions for every new/extended call.

**apps/web (Phase 2):**
- Modify `apps/web/src/app/core/services/creative-studio.service.ts` — extend types + methods; add loop + voice methods.
- Modify `apps/web/src/app/features/ugc-studio/ugc-studio.component.ts` — Zone A (brief+direction+formats), top-bar selectors + grounding pills, History rail + loop panel.
- Modify `apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts` — Zone B run feed (milestone rail + activity), badge host.
- Modify `apps/web/src/app/features/ugc-studio/generation-detail/video-planner/video-planner.component.ts` — Zone D: persona card, voice preview, pin_face/hero_with_creator, quote polish, 402 re-quote, guard-off notice, variants radio, publish stamp.
- Modify `apps/web/src/app/features/ugc-studio/output-gallery/output-gallery.component.ts` — Zone C: per-image QA chip, `rejected[]`, cost line, ai-layer video result QA banner.
- Create `apps/web/src/app/features/ugc-studio/shared/degrade-badge.component.ts` — the one badge component reused everywhere.

---

## PHASE 0 — code-review-graph coverage baseline

> The graph is fresh (rebuilt this session at HEAD `4e9abc9`). Use it to confirm the plan's premise from verified structure, not the spec's stale-grep note.

### Task 0: Verify creative endpoint coverage in the graph

**Files:** none (read-only verification).

- [ ] **Step 1: Query the graph for the creative surface**

Use the `code-review-graph` MCP tools:
- `semantic_search_nodes_tool` / `query_graph_tool` for `creative-studio` route handlers in `apps/api` and the `/creative/*` router in `apps/ai-layer`.
- Confirm which routes exist on each side and which fields flow through `creative-gen-client.ts`.

- [ ] **Step 2: Reconcile against the plan**

Confirm: (a) all four loop routes + voice exist upstream (ai-layer) and are absent in apps/api — matching T4/T5; (b) `direction`/`creator`/`pin_face`/`hero_with_creator` are absent from the apps/api forwarders — matching T1–T3. Record any mismatch; if the graph shows a route already routed that the plan says to add, drop that step (ponytail — don't re-add what exists).

No commit (verification only).

---

## PHASE 1 — apps/api backend passthrough

> All Phase-1 client tests follow the repo pattern in `apps/api/src/__tests__/meta-api.test.ts`: `vi.stubGlobal('fetch', mockFetch)`, `vi.mock('../config.js', …)`, then assert `mockFetch` was called with the right URL and JSON body. The routes are thin wrappers over the tested client; they are verified by the sim, not a separate Fastify harness (ponytail).

### Task 1: Forward `direction` on static generate

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts:15-24` (interface), `:73-82` (body)
- Modify: `apps/api/src/routes/creative-studio.ts:35-40` (`GenerateBody`), `:120` (destructure), `:154` + `:577-611` (thread through)
- Test: `apps/api/src/__tests__/creative-gen-client.test.ts` (create)

**Interfaces:**
- Consumes: ai-layer `POST /creative/generate` already accepts `direction: str | None` (verified `service.py:105`).
- Produces: `CreativeGenRequest.direction?: string`; `startCreativeGen` sends `direction` in the body.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/creative-gen-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config.js', () => ({
  config: { aiLayerUrl: 'http://ai-layer:8000', aiLayerApiKey: 'k' },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}

describe('creative-gen-client', () => {
  beforeEach(() => mockFetch.mockReset());

  it('startCreativeGen forwards direction in the body', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1' }));
    const { startCreativeGen } = await import('../services/creative-gen-client.js');
    await startCreativeGen({ brief: { brand_name: 'X' }, direction: 'tall blonde, rooftop' });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://ai-layer:8000/creative/generate');
    expect(JSON.parse(opts.body).direction).toBe('tall blonde, rooftop');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts`
Expected: FAIL — `direction` is `undefined` in the body.

- [ ] **Step 3: Add `direction` to the client interface + body**

In `apps/api/src/services/creative-gen-client.ts`, add to `CreativeGenRequest` (after `noLogo?: boolean;`):

```ts
  direction?: string;      // art-direction guide; casts one person across ads + video
```

In the `body` object inside `startCreativeGen` (after `no_logo: req.noLogo ?? false,`):

```ts
    direction: req.direction ?? null,
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread `direction` through the route**

In `apps/api/src/routes/creative-studio.ts`, add to `GenerateBody`:

```ts
interface GenerateBody {
  brief: Brief;
  formats: string[];
  meta_account_id?: string;
  url?: string;
  direction?: string;
}
```

Change the `/generate` destructure (`:120`):

```ts
    const { brief, formats, meta_account_id, direction } = request.body as GenerateBody;
```

Pass it into the ai-layer path (`:154`):

```ts
      const background = creativeGenEnabled()
        ? processGenerationViaAiLayer(generationId, brief, formats, outputIds, userId, meta_account_id, direction)
        : processGeneration(generationId, brief, formats, outputIds);
```

Add the param to `processGenerationViaAiLayer` (`:577-584`):

```ts
async function processGenerationViaAiLayer(
  generationId: string,
  brief: Brief,
  formats: string[],
  outputIds: Record<string, string>,
  userId: string,
  metaAccountId?: string,
  direction?: string,
): Promise<void> {
```

And forward it in the `startCreativeGen` call (`:603-611`), adding `direction,` to the request object:

```ts
    const jobId = await startCreativeGen({
      brief: brief as unknown as Record<string, unknown>,
      accountId: metaAccountId,
      images: 2,
      formats: ['1:1', '4:5', '9:16'],
      withVideo: false,
      noLogo: true,
      direction,
    }, metaToken || undefined);
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` (Expected: baseline-only — the known `billing.ts:4` stripe error is allowed; no new errors.)
Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts`

```bash
git add apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts apps/api/src/__tests__/creative-gen-client.test.ts
git commit -m "feat(creative-api): forward direction on static generate"
```

---

### Task 2: Forward `creator` on video/plan

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts:153` (`VideoPlanOpts`), `:165-175` (`videoPlan`)
- Modify: `apps/api/src/routes/creative-studio.ts:310-325` (`/video/plan`)
- Test: `apps/api/src/__tests__/creative-gen-client.test.ts`

**Interfaces:**
- Consumes: ai-layer `POST /creative/video/plan` accepts `creator: CreatorKit | None` (verified `service.py:114`).
- Produces: `VideoPlanOpts.creator?: CreatorKit`; a shared `CreatorKit` type exported from the client.

- [ ] **Step 1: Write the failing test**

Append to `creative-gen-client.test.ts`:

```ts
  it('videoPlan forwards creator + n_shots + seconds', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1', shots: 3, duration_s: 24, grounded: true, storyboard: {}, quote: {} }));
    const { videoPlan } = await import('../services/creative-gen-client.js');
    await videoPlan('j1', { seconds: 24, direction: 'cozy', n_shots: 3, creator: { name: 'Maya', gender: 'woman' } });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.job_id).toBe('j1');
    expect(body.n_shots).toBe(3);
    expect(body.creator).toEqual({ name: 'Maya', gender: 'woman' });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "videoPlan forwards"`
Expected: FAIL — `body.creator` is `undefined`.

- [ ] **Step 3: Add `CreatorKit` + extend `VideoPlanOpts` and the body**

In `apps/api/src/services/creative-gen-client.ts`, above `VideoPlanOpts`, add the pass-through type (matches ai-layer `CreatorKit`; all optional so the UI sends only what it has):

```ts
export interface CreatorKit {
  name?: string;
  age_range?: string;
  gender?: string;
  appearance?: string;
  wardrobe?: string;
  setting?: string;
  energy?: string;
  voice_id?: string;
}
```

Extend `VideoPlanOpts`:

```ts
export interface VideoPlanOpts { seconds?: number; direction?: string; n_shots?: number; creator?: CreatorKit; }
```

In `videoPlan`, extend the body:

```ts
    body: JSON.stringify({ job_id: jobId, seconds: opts.seconds, direction: opts.direction, n_shots: opts.n_shots, creator: opts.creator }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "videoPlan forwards"`
Expected: PASS.

- [ ] **Step 5: Thread `creator` through the route**

In `apps/api/src/routes/creative-studio.ts` `/video/plan` handler, extend the destructure and the `videoPlan` call:

```ts
    const { generation_id, seconds, direction, n_shots, creator } = request.body as {
      generation_id: string; seconds?: number; direction?: string; n_shots?: number; creator?: import('../services/creative-gen-client.js').CreatorKit;
    };
```
```ts
      const plan = await videoPlan(gen.ai_job_id, { seconds, direction, n_shots, creator }, metaToken || undefined);
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` (baseline-only)

```bash
git add apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts apps/api/src/__tests__/creative-gen-client.test.ts
git commit -m "feat(creative-api): forward creator persona on video/plan"
```

---

### Task 3: Forward `direction`+`creator`+`pin_face`+`hero_with_creator` on video/generate

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts:154` (`VideoGenOpts`), `:178-191` (`videoGenerate`)
- Modify: `apps/api/src/routes/creative-studio.ts:328-352` (`/video/generate`)
- Test: `apps/api/src/__tests__/creative-gen-client.test.ts`

**Interfaces:**
- Consumes: ai-layer `POST /creative/video/generate` (`VideoRenderRequest`) accepts `creator`, `direction`, `pin_face`, `hero_with_creator`, `voiceover`, `captions`, `sfx` (verified `service.py:123-151`).
- Produces: `VideoGenOpts` with the four new fields; `videoGenerate` sends them.

- [ ] **Step 1: Write the failing test**

Append:

```ts
  it('videoGenerate forwards direction, creator, pin_face, hero_with_creator', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1', status: 'queued', clips: 3 }));
    const { videoGenerate } = await import('../services/creative-gen-client.js');
    await videoGenerate('j1', {
      voiceover: true, captions: true, sfx: false,
      direction: 'cozy', creator: { name: 'Maya' }, pin_face: true, hero_with_creator: true,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.direction).toBe('cozy');
    expect(body.creator).toEqual({ name: 'Maya' });
    expect(body.pin_face).toBe(true);
    expect(body.hero_with_creator).toBe(true);
    expect(body.sfx).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "videoGenerate forwards"`
Expected: FAIL — new fields absent from the body.

- [ ] **Step 3: Extend `VideoGenOpts` + the body**

In `creative-gen-client.ts`:

```ts
export interface VideoGenOpts {
  voiceover?: boolean; captions?: boolean; sfx?: boolean;
  direction?: string; creator?: CreatorKit; pin_face?: boolean; hero_with_creator?: boolean;
}
```

In `videoGenerate`, extend the body (keep the existing `?? true` defaults for VO/captions/sfx):

```ts
    body: JSON.stringify({
      job_id: jobId,
      voiceover: opts.voiceover ?? true, captions: opts.captions ?? true, sfx: opts.sfx ?? true,
      direction: opts.direction, creator: opts.creator,
      pin_face: opts.pin_face ?? false, hero_with_creator: opts.hero_with_creator ?? false,
    }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "videoGenerate forwards"`
Expected: PASS.

- [ ] **Step 5: Thread through the route**

In `apps/api/src/routes/creative-studio.ts` `/video/generate` handler, extend the destructure and the `videoGenerate` call:

```ts
    const { generation_id, voiceover, captions, sfx, direction, creator, pin_face, hero_with_creator } = request.body as {
      generation_id: string; voiceover?: boolean; captions?: boolean; sfx?: boolean;
      direction?: string; creator?: import('../services/creative-gen-client.js').CreatorKit;
      pin_face?: boolean; hero_with_creator?: boolean;
    };
```
```ts
      const res = await videoGenerate(gen.ai_job_id, { voiceover, captions, sfx, direction, creator, pin_face, hero_with_creator }, metaToken || undefined);
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` (baseline-only)

```bash
git add apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts apps/api/src/__tests__/creative-gen-client.test.ts
git commit -m "feat(creative-api): forward direction/creator/pin_face/hero_with_creator on video/generate"
```

---

### Task 4: Proxy the four loop routes (publish · learn · prior · graph)

**Files:**
- Modify: `apps/api/src/services/creative-gen-client.ts` (append four functions)
- Modify: `apps/api/src/routes/creative-studio.ts` (append four routes)
- Test: `apps/api/src/__tests__/creative-gen-client.test.ts`

**Interfaces:**
- Consumes (all verified in `service.py`): `POST /creative/variants/{variant_id}/published {meta_ad_id}` (`:572`); `POST /creative/learn {account_id, preset?}` + `X-Meta-Token` (`:595`); `GET /creative/prior/{account_id}` (`:617`); `GET /creative/graph/{account_id}` (`:551`).
- Produces: `markPublished(variantId, metaAdId)`, `learn(accountId, metaToken?)`, `getPrior(accountId)`, `getGraph(accountId)`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
  it('markPublished POSTs meta_ad_id to the variant route', async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: 'published' }));
    const { markPublished } = await import('../services/creative-gen-client.js');
    await markPublished('var_9', '2384');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://ai-layer:8000/creative/variants/var_9/published');
    expect(JSON.parse(opts.body)).toEqual({ meta_ad_id: '2384' });
  });

  it('getPrior GETs the prior route', async () => {
    mockFetch.mockResolvedValueOnce(ok({ brief: '', n_observed: 0 }));
    const { getPrior } = await import('../services/creative-gen-client.js');
    await getPrior('act_123');
    expect(mockFetch.mock.calls[0][0]).toBe('http://ai-layer:8000/creative/prior/act_123');
  });

  it('learn passes the Meta token header', async () => {
    mockFetch.mockResolvedValueOnce(ok({ account_id: 'act_123', brief: '' }));
    const { learn } = await import('../services/creative-gen-client.js');
    await learn('act_123', 'tok');
    expect(mockFetch.mock.calls[0][1].headers['X-Meta-Token']).toBe('tok');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "markPublished\|getPrior\|learn passes"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add the four client functions**

Append to `apps/api/src/services/creative-gen-client.ts` (reuse the existing `base()`, `config`, `AiLayerError` pattern):

```ts
// ─── The closed loop: publish → learn → prior/graph ─────────────────────────

function jsonHeaders(metaToken?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-API-Key': config.aiLayerApiKey };
  if (metaToken) h['X-Meta-Token'] = metaToken;
  return h;
}

/** POST /creative/variants/{id}/published — stamp which Meta ad a variant became. */
export async function markPublished(variantId: string, metaAdId: string): Promise<{ status: string }> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const res = await fetch(`${base()}/creative/variants/${encodeURIComponent(variantId)}/published`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ meta_ad_id: metaAdId }),
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiLayerError(`published failed: ${await res.text()}`, res.status);
  return res.json() as Promise<{ status: string }>;
}

/** POST /creative/learn — harvest realized performance, rebuild the prior. */
export async function learn(accountId: string, metaToken?: string): Promise<Record<string, unknown>> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const res = await fetch(`${base()}/creative/learn`, {
    method: 'POST', headers: jsonHeaders(metaToken), body: JSON.stringify({ account_id: accountId }),
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiLayerError(`learn failed: ${await res.text()}`, res.status);
  return res.json() as Promise<Record<string, unknown>>;
}

/** GET /creative/prior/{acct} — what this account has proven. */
export async function getPrior(accountId: string): Promise<Record<string, unknown>> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const res = await fetch(`${base()}/creative/prior/${encodeURIComponent(accountId)}`, {
    method: 'GET', headers: { 'X-API-Key': config.aiLayerApiKey }, signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiLayerError(`prior failed: ${await res.text()}`, res.status);
  return res.json() as Promise<Record<string, unknown>>;
}

/** GET /creative/graph/{acct} — structural winner-vs-loser correlations. */
export async function getGraph(accountId: string): Promise<Record<string, unknown>> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const res = await fetch(`${base()}/creative/graph/${encodeURIComponent(accountId)}`, {
    method: 'GET', headers: { 'X-API-Key': config.aiLayerApiKey }, signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiLayerError(`graph failed: ${await res.text()}`, res.status);
  return res.json() as Promise<Record<string, unknown>>;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Add the four routes**

In `apps/api/src/routes/creative-studio.ts`, extend the import (`:11-14`) to add `markPublished, learn, getPrior, getGraph`, then append these routes inside `creativeStudioRoutes` (before the closing brace at `:360`). `prior`/`graph`/`learn` key on the account id; single-tenant demo passes it from `meta_account_id`. Learn needs the user's Meta token.

```ts
  // POST /variants/:variantId/published — stamp the Meta ad a variant became (THE JOIN).
  app.post('/variants/:variantId/published', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { variantId } = request.params as { variantId: string };
    const { meta_ad_id } = request.body as { meta_ad_id?: string };
    if (!meta_ad_id) return reply.status(400).send({ success: false, error: 'meta_ad_id is required' });
    try { return { success: true, ...(await markPublished(variantId, meta_ad_id)) }; }
    catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });

  // POST /learn — harvest published-ad outcomes for an account, rebuild the prior.
  app.post('/learn', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const { account_id } = request.body as { account_id?: string };
    if (!account_id) return reply.status(400).send({ success: false, error: 'account_id is required' });
    try {
      const metaToken = await getMetaTokenForUser(request.user.id).catch(() => null);
      return { success: true, result: await learn(account_id, metaToken || undefined) };
    } catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });

  // GET /prior/:acct — what this account has actually proven.
  app.get('/prior/:acct', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { acct } = request.params as { acct: string };
    try { return { success: true, prior: await getPrior(acct) }; }
    catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });

  // GET /graph/:acct — structural winner-vs-loser correlations (list-only in the UI).
  app.get('/graph/:acct', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { acct } = request.params as { acct: string };
    try { return { success: true, graph: await getGraph(acct) }; }
    catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` (baseline-only)

```bash
git add apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts apps/api/src/__tests__/creative-gen-client.test.ts
git commit -m "feat(creative-api): proxy the publish/learn/prior/graph loop routes"
```

---

### Task 5: Voice-preview endpoint (ai-layer route + apps/api passthrough)

**Files:**
- Modify: `apps/ai-layer/ai_layer/creative/video_providers.py` (add `voice_preview`)
- Modify: `apps/ai-layer/ai_layer/creative/service.py` (add `VoicePreviewRequest` + `POST /creative/voice/preview`)
- Modify: `apps/api/src/services/creative-gen-client.ts` (add `voicePreview`)
- Modify: `apps/api/src/routes/creative-studio.ts` (add `POST /voice/preview`)
- Test: `apps/ai-layer/tests/creative/test_creative_service.py`; `apps/api/src/__tests__/creative-gen-client.test.ts`

**Interfaces:**
- Consumes: `video_providers.generate_voiceover(text, out_path, voice=…)` (verified `:94`) → `{provider, model, path, cost_usd}`; TTS model `fal-ai/minimax/speech-02-hd`; default voice `config.VIDEO_TTS_VOICE`.
- Produces: ai-layer `POST /creative/voice/preview {voice_id?, text?}` → `{url}` (the fal audio URL, streamed straight back — no run dir, no disk). apps/api `voicePreview(voiceId?, text?)` → `{ url }`.

> Ponytail: the preview must NOT write a run dir or persist — it returns the fal-hosted audio URL directly. Add a thin `voice_preview()` that calls fal TTS and returns the URL without downloading. Each call spends ~a fraction of a cent of fal TTS; the fixed sample text is short. No caching (cents; YAGNI) — leave a `ponytail:` note.

- [ ] **Step 1: Write the failing ai-layer test**

In `apps/ai-layer/tests/creative/test_creative_service.py`, add (match the file's existing FastAPI `TestClient` + monkeypatch style — check the top of the file for the fixture name; assume `client` TestClient over the app with the router mounted):

```python
def test_voice_preview_returns_url(client, monkeypatch):
    import ai_layer.creative.video_providers as vp
    monkeypatch.setattr(vp, "voice_preview", lambda voice_id, text: {"url": "https://fal.media/x.mp3"})
    r = client.post("/creative/voice/preview", json={"voice_id": "abc", "text": "Hi there"})
    assert r.status_code == 200
    assert r.json()["url"] == "https://fal.media/x.mp3"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/ai-layer && python -m pytest tests/creative/test_creative_service.py::test_voice_preview_returns_url -q`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Add `voice_preview` to video_providers**

In `apps/ai-layer/ai_layer/creative/video_providers.py`, after `generate_voiceover` (`:110`):

```python
def voice_preview(voice_id: str | None, text: str) -> dict:
    """A short TTS sample for the persona voice picker. Returns the fal-hosted audio URL
    directly (no download, no run dir) — the browser plays it straight from fal.

    ponytail: no cache; a preview is a few cents of TTS and the sample text is short.
    Add a content-addressed cache only if preview spend ever shows up on a bill.
    """
    import fal_client  # lazy
    args = {"text": text[:200],
            "voice_setting": {"voice_id": voice_id or config.VIDEO_TTS_VOICE}}
    res = fal_client.subscribe(config.VIDEO_TTS_MODEL, arguments=args, with_logs=False)
    audio = res.get("audio") or res.get("audio_file") or {}
    url = audio.get("url") or res.get("url")
    if not url:
        raise RuntimeError("tts returned no audio url")
    return {"url": url}
```

- [ ] **Step 4: Add the route to service.py**

In `apps/ai-layer/ai_layer/creative/service.py`, near the other request models, add:

```python
class VoicePreviewRequest(BaseModel):
    voice_id: str | None = None
    text: str = "Wait — this anarkali has actual pockets."
```

And a route (place it with the other `@router.post` handlers):

```python
@router.post("/voice/preview")
def voice_preview(req: VoicePreviewRequest):
    """A short spoken sample of the persona's voice, so the picker is a guarantee you can
    HEAR before you pay. Returns the fal-hosted audio URL; the browser plays it directly."""
    from ai_layer.creative import video_providers
    try:
        return video_providers.voice_preview(req.voice_id, req.text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"voice preview failed: {e}") from e
```

- [ ] **Step 5: Run to verify the ai-layer test passes**

Run: `cd apps/ai-layer && python -m pytest tests/creative/test_creative_service.py::test_voice_preview_returns_url -q`
Expected: PASS.

- [ ] **Step 6: Write the failing apps/api client test**

Append to `apps/api/src/__tests__/creative-gen-client.test.ts`:

```ts
  it('voicePreview POSTs voice_id + text and returns the url', async () => {
    mockFetch.mockResolvedValueOnce(ok({ url: 'https://fal.media/x.mp3' }));
    const { voicePreview } = await import('../services/creative-gen-client.js');
    const out = await voicePreview('abc', 'Hi');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://ai-layer:8000/creative/voice/preview');
    expect(JSON.parse(opts.body)).toEqual({ voice_id: 'abc', text: 'Hi' });
    expect(out.url).toBe('https://fal.media/x.mp3');
  });
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts -t "voicePreview"`
Expected: FAIL — not exported.

- [ ] **Step 8: Add the apps/api client fn + route**

In `apps/api/src/services/creative-gen-client.ts`:

```ts
/** POST /creative/voice/preview — a short TTS sample; returns the fal audio URL. */
export async function voicePreview(voiceId?: string, text?: string): Promise<{ url: string }> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const res = await fetch(`${base()}/creative/voice/preview`, {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({ voice_id: voiceId, text }),
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiLayerError(`voice preview failed: ${await res.text()}`, res.status);
  return res.json() as Promise<{ url: string }>;
}
```

In `apps/api/src/routes/creative-studio.ts`, add `voicePreview` to the import and this route:

```ts
  // POST /voice/preview — a short spoken sample of a persona voice (before you pay).
  app.post('/voice/preview', { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const { voice_id, text } = request.body as { voice_id?: string; text?: string };
    try { return { success: true, ...(await voicePreview(voice_id, text)) }; }
    catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });
```

- [ ] **Step 9: Run both test suites + typecheck**

Run: `cd apps/api && npx vitest run src/__tests__/creative-gen-client.test.ts` (PASS all)
Run: `cd apps/api && npx tsc --noEmit` (baseline-only)
Run: `cd apps/ai-layer && python -m pytest tests/creative/test_creative_service.py -q` (green)

- [ ] **Step 10: Commit**

```bash
git add apps/ai-layer/ai_layer/creative/video_providers.py apps/ai-layer/ai_layer/creative/service.py apps/api/src/services/creative-gen-client.ts apps/api/src/routes/creative-studio.ts apps/api/src/__tests__/creative-gen-client.test.ts apps/ai-layer/tests/creative/test_creative_service.py
git commit -m "feat(creative): voice-preview endpoint (ai-layer MiniMax + apps/api passthrough)"
```

---

### Task 6: Phase-1 gate — full suites

- [ ] **Step 1: apps/api default suite**

Run: `cd apps/api && npm test`
Expected: green (default suite; the new client tests are additive).

- [ ] **Step 2: ai-layer creative suite**

Run: `cd apps/ai-layer && python -m pytest tests/creative -q`
Expected: green.

- [ ] **Step 3: typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: baseline-only (`billing.ts:4`).

- [ ] **Step 4: code-review-graph impact review**

Run `code-review-graph` `detect_changes_tool` then `get_impact_radius_tool` on the changed apps/api + ai-layer files. Confirm no consumer of the touched functions was missed (e.g. any other caller of `videoGenerate`/`videoPlan`/`startCreativeGen`). Record findings.

No commit (verification only). If red, fix before Phase 2.

---

## PHASE 2 — apps/web UI

> **Visual authoring:** the spec (`…-ui-redesign-design.md`) is the detailed visual design — its ASCII mockups, copy, and per-zone rules are the source of truth for layout and wording. Use the `frontend-design` skill for the visual treatment **within Cosmisk's existing token system** (`accent` purple, `navy`, `cream`, `card`, `input`, `font-display`/`font-body`; see the current components). Each task below fixes the data contract, the component boundaries, and the non-obvious logic; the exact Tailwind markup is authored against the spec during the step, not transcribed here. Every zone must degrade loudly and show cost per the Global Constraints.
>
> **Verification:** Phase 2 is verified by running the sim (`docker-compose.sim.yml`, see the resume note) and clicking the flow, plus `ng build` for compile safety. No Karma component specs are added for the redesign (ponytail — full-template Karma tests are more brittle than the UI warrants for a single-tenant demo); the one testable seam is the service layer (Task 7).

### Task 7: Extend `creative-studio.service.ts` (types + methods)

**Files:**
- Modify: `apps/web/src/app/core/services/creative-studio.service.ts`
- Test: `apps/web/src/app/core/services/creative-studio.service.spec.ts` (create — one smoke per new method group)

**Interfaces:**
- Consumes: the apps/api routes from Phase 1.
- Produces: `CreatorKit` type; `generate(brief, formats, opts?)` with `direction`; `videoPlan`/`videoGenerate` with persona + toggles; `markPublished`, `learn`, `getPrior`, `getGraph`, `voicePreview`; extended `StudioGeneration`/`VideoPlan` types for QA/rejected/variants.

- [ ] **Step 1: Add the `CreatorKit` type + extend request types**

In `creative-studio.service.ts`, add:

```ts
export interface CreatorKit {
  name?: string; age_range?: string; gender?: string;
  appearance?: string; wardrobe?: string; setting?: string;
  energy?: string; voice_id?: string;
}
```

Extend `StudioGeneration` with the fields the run object already carries (from `getCreativeJob`): add `rejected?: string[];`, `cost_usd?: number;`, `qa_passed?: boolean | null;`, and on `StudioOutput.output` the QA/asset extras are already `any`. Extend `VideoPlan` shots typing:

```ts
export interface VideoPlan {
  job_id: string; shots: number; duration_s: number; grounded: boolean;
  script?: { hook?: string; demo?: string; cta?: string } | any;
  storyboard: { shots: { title?: string; description?: string; duration_s?: number; camera?: string; subject?: string; dialogue?: string }[] };
  quote: VideoQuote;
}
```

- [ ] **Step 2: Extend `generate` / `videoPlan` / `videoGenerate` signatures**

```ts
  generate(brief: StudioBrief, formats: string[], opts?: { metaAccountId?: string; direction?: string }): Observable<{ success: boolean; generation_id: string }> {
    return this.api.post('creative-studio/generate', { brief, formats, meta_account_id: opts?.metaAccountId, direction: opts?.direction });
  }

  videoPlan(generationId: string, opts: { seconds?: number; direction?: string; n_shots?: number; creator?: CreatorKit }):
    Observable<{ success: boolean; plan: VideoPlan; error?: string }> {
    return this.api.post('creative-studio/video/plan', { generation_id: generationId, ...opts });
  }

  videoGenerate(generationId: string, opts: { voiceover?: boolean; captions?: boolean; sfx?: boolean; direction?: string; creator?: CreatorKit; pin_face?: boolean; hero_with_creator?: boolean }):
    Observable<{ success: boolean; status: string; clips: number; error?: string }> {
    return this.api.post('creative-studio/video/generate', { generation_id: generationId, ...opts });
  }
```

- [ ] **Step 3: Add loop + voice methods**

```ts
  markPublished(variantId: string, metaAdId: string): Observable<{ success: boolean; status: string; error?: string }> {
    return this.api.post(`creative-studio/variants/${variantId}/published`, { meta_ad_id: metaAdId });
  }
  learn(accountId: string): Observable<{ success: boolean; result: any; error?: string }> {
    return this.api.post('creative-studio/learn', { account_id: accountId });
  }
  getPrior(accountId: string): Observable<{ success: boolean; prior: any }> {
    return this.api.get(`creative-studio/prior/${accountId}`);
  }
  getGraph(accountId: string): Observable<{ success: boolean; graph: any }> {
    return this.api.get(`creative-studio/graph/${accountId}`);
  }
  voicePreview(voiceId?: string, text?: string): Observable<{ success: boolean; url: string; error?: string }> {
    return this.api.post('creative-studio/voice/preview', { voice_id: voiceId, text });
  }
```

- [ ] **Step 4: One smoke spec (HttpTestingController)**

Create `apps/web/src/app/core/services/creative-studio.service.spec.ts` matching the repo's existing service-spec pattern (`provideHttpClientTesting`), asserting `generate(...)` posts `direction` and `markPublished(...)` hits the right URL. Keep it to ~2 assertions (ponytail).

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreativeStudioService } from './creative-studio.service';
import { environment } from '../../../environments/environment';

describe('CreativeStudioService', () => {
  let svc: CreativeStudioService; let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(CreativeStudioService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('generate forwards direction', () => {
    svc.generate({ brand_name: 'X', product_name: 'Y', product_description: 'Z', target_audience: 'A' }, ['1:1'], { direction: 'cozy' }).subscribe();
    const req = http.expectOne(`${environment.API_BASE_URL}/creative-studio/generate`);
    expect(req.request.body.direction).toBe('cozy'); req.flush({ success: true, generation_id: 'g' });
  });

  it('markPublished hits the variant route', () => {
    svc.markPublished('v1', '2384').subscribe();
    const req = http.expectOne(`${environment.API_BASE_URL}/creative-studio/variants/v1/published`);
    expect(req.request.body).toEqual({ meta_ad_id: '2384' }); req.flush({ success: true, status: 'published' });
  });
});
```

- [ ] **Step 5: Run the spec**

Run: `cd apps/web && npx ng test --watch=false --include='**/creative-studio.service.spec.ts' --browsers=ChromeHeadless`
Expected: PASS (2 specs). If Chrome is unavailable in the environment, note it and rely on `ng build` + sim for verification.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/core/services/creative-studio.service.ts apps/web/src/app/core/services/creative-studio.service.spec.ts
git commit -m "feat(creative-web): extend studio service with direction, persona, loop + voice methods"
```

---

### Task 8: The degrade-loudly badge component

**Files:**
- Create: `apps/web/src/app/features/ugc-studio/shared/degrade-badge.component.ts`

**Interfaces:**
- Produces: `<app-degrade-badge [text]="…" [tone]="'amber'|'neutral'" [detail]="…" />` — an amber (or neutral-gray) pill with a hover/expand `detail`. Reused in top bar, run header, History rows, quote card, video result. Per spec §7 a badge names the *consequence*.

- [ ] **Step 1: Build the component**

Create the file — a standalone, `input()`-based presentational component:

```ts
import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-degrade-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="open.set(!open())"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-body font-semibold"
      [ngClass]="tone() === 'neutral' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'">
      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="tone() === 'neutral' ? 'bg-gray-400' : 'bg-amber-500'"></span>
      {{ text() }}
    </button>
    @if (open() && detail()) {
      <span class="block text-[10px] text-gray-500 font-body mt-0.5 max-w-xs">{{ detail() }}</span>
    }
  `,
})
export class DegradeBadgeComponent {
  text = input.required<string>();
  tone = input<'amber' | 'neutral'>('amber');
  detail = input<string>('');
  open = signal(false);
}
```

- [ ] **Step 2: Compile check + commit**

Run: `cd apps/web && npx ng build --configuration development` (Expected: builds; the component is not yet imported anywhere — that's fine, it's used next tasks. Alternatively defer this build to Task 9's first import.)

```bash
git add apps/web/src/app/features/ugc-studio/shared/degrade-badge.component.ts
git commit -m "feat(creative-web): degrade-loudly badge component"
```

---

### Task 9: Zone A — brief-first setup + top-bar selectors + grounding pills

**Files:**
- Modify: `apps/web/src/app/features/ugc-studio/ugc-studio.component.ts`

**Interfaces:**
- Consumes: `studioService.generate(brief, formats, { direction, metaAccountId })`; `DegradeBadgeComponent`.
- Produces: on generate success, navigates to `/app/ugc-studio/gen/:id` (the run view, Zones B–D) — the entry component's job ends at "start the run".

**Design (per spec §2.2 / §9):**
- **Remove** the URL hero (`:26-88`), the `analyzeUrl()` method, the `UrlAnalysis` import/usage, the `manualMode` toggle, and the "Import from Sprint" link (`:208-215`).
- Promote the brief form to the primary entry, always visible. Fields: brand*, product*, description*, target audience*, key features (optional), price (optional), **direction** (free text, first-class), formats (aspect-ratio chips `1:1`/`4:5`/`9:16`/`16:9`, default first three), `voiceover` toggle. `with_video` stays off (the storyboard path owns video).
- **Top bar:** brand label (Pratap Sons, single-tenant) + ad-account label + two grounding pills (`app-degrade-badge` amber "Ungrounded — no Meta account" when not connected, else a green "● grounded" static chip). Single-tenant: the ad account comes from the app's Meta connection state; if unknown, show the ungrounded pill and a "Connect Meta in Settings" detail.
- Generate button carries its price: **"Generate concepts · ~$0.60–0.81"**.
- History rail stays (existing `generations()` + `legacyProjects()` list), plus a new loop panel added in Task 12.

- [ ] **Step 1: Change `formatOptions` to aspect ratios + default**

```ts
  formatOptions = [
    { id: '1:1', label: '1:1' }, { id: '4:5', label: '4:5' },
    { id: '9:16', label: '9:16' }, { id: '16:9', label: '16:9' },
  ];
  selectedFormats = signal<string[]>(['1:1', '4:5', '9:16']);
```

Add `direction = ''` to the component and `key_features`/`price` handling to `brief`.

- [ ] **Step 2: Rewrite the template** per spec §2.2 (brief form + direction + format chips + grounding pills top bar), removing the URL hero, manual-mode branches, and Import-from-Sprint. Author the markup against the spec with the `frontend-design` skill, reusing the existing `card`/`input`/`accent` classes already in this file.

- [ ] **Step 3: Rewrite `generateAll()` to send direction + navigate to the run view**

```ts
  generateAll() {
    if (!this.brief.brand_name || !this.brief.product_description || this.selectedFormats().length === 0) return;
    this.generating.set(true);
    this.studioService.generate(
      { brand_name: this.brief.brand_name, product_name: this.brief.product_name,
        product_description: this.brief.product_description, target_audience: this.brief.target_audience,
        price: this.brief.price || undefined },
      this.selectedFormats(),
      { direction: this.direction || undefined, metaAccountId: this.metaAccountId() || undefined },
    ).subscribe({
      next: (res) => {
        this.generating.set(false);
        if (res.success && res.generation_id) this.router.navigate(['/app/ugc-studio/gen', res.generation_id]);
      },
      error: (err) => { this.generating.set(false); this.toast.error('Generation Failed', err.error?.error || 'Please try again'); },
    });
  }
```

Delete `analyzeUrl`, `pollGeneration`, `activeGeneration`, and the URL/analysis signals (the run view owns polling now). Keep `fetchHistory`.

- [ ] **Step 4: Remove dead imports/usages**

Drop `UrlAnalysis` from the `CreativeStudioService` import; remove `OutputGalleryComponent` if no longer used here (it moves to the run view). Remove the `creative-engine` RouterLink.

- [ ] **Step 5: Build + sim-verify**

Run: `cd apps/web && npx ng build --configuration development`
Expected: builds clean.
Then run the sim and confirm: the studio opens on the brief form (no URL box), the direction field is present, grounding pill shows, "Generate concepts · ~$…" starts a run and navigates to `/gen/:id`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/ugc-studio.component.ts
git commit -m "feat(creative-web): brief-first setup with direction + grounding pills; remove dead URL hero"
```

---

### Task 10: Zone B — run milestone rail + activity feed

**Files:**
- Modify: `apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts`

**Interfaces:**
- Consumes: `generation().stage`, `generation().progress[]`, `generation().status`, `DegradeBadgeComponent`.
- Produces: the run header hosts badges (grounding shouts promoted from `progress[]`); the activity feed renders `progress[]` verbatim.

**Design (per spec §5):**
- Add a **milestone rail** (small fixed set of human-named phases derived from `stage`) and an **activity feed** (the `progress[]` strings verbatim, timestamped by arrival, monospace, auto-scroll) while `status === 'generating'`.
- Promote grounding shouts to badges: if any `progress[]` line contains "UNGROUNDED" / "GROUNDING UNAVAILABLE", render an amber `app-degrade-badge` "Ungrounded — no Meta account" in the run header, persistent.
- `status: failed` → keep the feed visible; render `error` as a final red line; show a "Retry" that returns to `/app/ugc-studio` (Zone A).
- Keep the existing 3s poll (`:132-144`).

- [ ] **Step 1: Add the feed + rail to the template** (between the header and the gallery). Derive a small `milestones()` computed from `stage`. Render `progress()` as a monospace list. Author against spec §5 with `frontend-design`.

- [ ] **Step 2: Add badge promotion logic**

```ts
  ungrounded = computed(() =>
    (this.generation()?.progress ?? []).some(p => /UNGROUNDED|GROUNDING UNAVAILABLE/i.test(p)));
```

Render `@if (ungrounded()) { <app-degrade-badge text="Ungrounded — no Meta account" detail="This run was not conditioned on your real Meta winners. Reconnect Meta in Settings." /> }` in the header.

- [ ] **Step 3: Import `DegradeBadgeComponent`** into the component's `imports`.

- [ ] **Step 4: Build + sim-verify** — start a run, watch the milestone rail advance and the activity feed stream the raw progress lines.

Run: `cd apps/web && npx ng build --configuration development`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts
git commit -m "feat(creative-web): run milestone rail + verbatim activity feed with grounding badge"
```

---

### Task 11: Zone C — evidence-forward results (QA chips · rejected[] · cost)

**Files:**
- Modify: `apps/web/src/app/features/ugc-studio/output-gallery/output-gallery.component.ts`
- Modify: `apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts` (pass `rejected`/`cost`/QA into the gallery zone)

**Interfaces:**
- Consumes: the ai-layer run object's `assets[]` (each with `copy` + `qa`), `rejected[]`, `cost_usd`, and for the video job `qa_passed` + `qa.checks`.
- Produces: the concept gallery shows per-image QA chip, a "we rejected N" expander, and a cost line; the video result shows the QA banner.

**Design (per spec §6):**
- The ai-layer static path produces aspect images under one `static`-format output already mapped to `img.image_url` (the proxy URL). Add, when present: a **per-image QA chip** (`✓ passed` green / `⚠ flagged, shipped` amber, from `img.qa`), the composited **copy** (headline/subhead/cta as text, copy-on-click — reuse `copyText`), and a **"Make a video →"** affordance that scrolls to the planner.
- Below the grid: **`rejected[]`** — "We rejected N concepts that failed QA" expandable to titles (neutral, proud framing); and a **cost line** "Run cost: $X (estimate) · grounded: Meta ✓ Shopify ✓".
- **Video result** (in the planner's output area, Task 12): a QA banner — `qa_passed:true` → slim green "QA passed — N checks"; `false` → amber `app-degrade-badge` "⚠ Shipped with QA flags" expandable to the check table. Do NOT surface the two known false-positive checks (filter them out by name: `caption` critic @48px, `cut_alignment`) — internal marker only.

- [ ] **Step 1: Extend the `static` case** in `output-gallery` to render `img.qa` as a chip and the `img.headline`/copy as text with copy-on-click. Guard on presence (older rows lack `qa`).

- [ ] **Step 2: Add the rejected + cost footer** — accept two new `input()`s on the gallery (`rejected = input<string[]>([])`, `costUsd = input<number | null>(null)`) and render the "we rejected N" expander + cost line below the grid. Pass them from `generation-detail` using the run object's fields.

- [ ] **Step 3: Build + sim-verify** — a completed run shows QA chips on concepts, the rejected expander, and the cost line.

Run: `cd apps/web && npx ng build --configuration development`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/output-gallery/output-gallery.component.ts apps/web/src/app/features/ugc-studio/generation-detail/generation-detail.component.ts
git commit -m "feat(creative-web): evidence-forward results — QA chips, rejected[], run cost"
```

---

### Task 12: Zone D — persona, quote polish, voice preview, variants radio, publish loop

**Files:**
- Modify: `apps/web/src/app/features/ugc-studio/generation-detail/video-planner/video-planner.component.ts`

**Interfaces:**
- Consumes: `studioService.videoPlan(id, { seconds, direction, n_shots: 3, creator })`, `videoGenerate(id, { …, creator, pin_face, hero_with_creator })`, `voicePreview(voiceId, text)`, `markPublished(variantId, metaAdId)`, `getVideoJob(jobId)`; `DegradeBadgeComponent`.
- Produces: the full quote-before-spend + persona + variants + publish surface (Zone D).

**Design (per spec §3.1 / §4 / §6.2 / §6.3 / §8.2):**
- **Persona card ("Who is on camera")** above the plan controls: age_range, gender, energy, appearance, wardrobe, setting; a **voice** row with a **preview ▸** button (calls `voicePreview`, plays the returned `url` via an `<audio>` element) labeled a **guarantee** ("this voice ships"); the visual rows labeled **best-effort** in-line. Two experimental toggles, off by default: **Pin face** and **Creator holds the product in hero shots**.
- **`n_shots` is FIXED at 3** — remove the shots `+/−` control; keep the `seconds` control. Rough estimate `3 × ~$1.42`.
- **Plan button:** "Plan storyboard — $0". On plan, the quote card shows script (hook/demo/cta), the shot table, and the quote mapped 1:1 to `plan.quote`.
- **Quote polish:** the render button states the dollar amount (already does). Add: `guard_enabled:false` → amber `app-degrade-badge` "Balance guard off — spend unverified"; `affordable:false` → disabled render button + "Short by $X" + a "Re-plan" affordance (re-plan is free) + "Top up at fal.ai"; a **402** from `videoGenerate` → catch, show "Balance changed since the quote — re-quoted below" and auto re-plan.
- Pass `creator`, `pin_face`, `hero_with_creator`, `direction` into both `videoPlan` and `videoGenerate`.
- **Variants (after render):** a **radio** (Hook paid ~$1.42 / Caption ~$0 / Aesthetic ~$0) — one axis only; the paid axis routes through the same explicit-$ confirm. (Wire the axis to `videoGenerate` only if the render path supports `variant_axis`; otherwise mark variants as a follow-up and render the radio disabled with a "coming after first render" note — do not fake it.)
- **Publish loop:** each variant row (and the base video) carries **[Published? ▸]** → inline `meta_ad_id` input → `markPublished(variantId, metaAdId)`; a stamped row shows `linked ✓`.
- **Poll the video job** for its result (reuse `getVideoJob(aiJobId)`); render the `video.url` player + the QA banner from Task 11's rules.

- [ ] **Step 1: Add persona state + card**

```ts
  creator = { name: 'Creator', age_range: '25-34', gender: 'woman', energy: 'warm', appearance: '', wardrobe: '', setting: '', voice_id: '' };
  pinFace = false; heroWithCreator = false;
  voiceUrl = signal(''); voicePreviewing = signal(false);

  previewVoice(): void {
    this.voicePreviewing.set(true);
    this.studio.voicePreview(this.creator.voice_id || undefined).subscribe({
      next: (r) => { this.voicePreviewing.set(false); if (r.success) this.voiceUrl.set(r.url); },
      error: () => this.voicePreviewing.set(false),
    });
  }
```

Add the persona card markup above the controls per spec §3.1, with an `<audio [src]="voiceUrl()" controls>` shown once a preview loads.

- [ ] **Step 2: Fix `n_shots` to 3, remove the shots control**

Delete the `nShots` `+/−` buttons from the template; set `n_shots: 3` in the `plan()` call. Keep `seconds`.

- [ ] **Step 3: Thread persona + toggles into plan/render**

```ts
  plan(): void {
    this.planning.set(true); this.planError.set('');
    this.studio.videoPlan(this.generationId, { seconds: this.seconds(), direction: this.direction || undefined, n_shots: 3, creator: this.creator })
      .subscribe({ next: (r) => { this.planning.set(false); r.success ? this.quote.set(r.plan) : this.planError.set(r.error || 'Planning failed.'); },
        error: (e) => { this.planning.set(false); this.planError.set(e?.error?.error || 'Planning failed.'); } });
  }
  render(): void {
    this.rendering.set(true); this.renderError.set('');
    this.studio.videoGenerate(this.generationId, {
      voiceover: this.voiceover, captions: this.captions, sfx: this.sfx,
      direction: this.direction || undefined, creator: this.creator,
      pin_face: this.pinFace, hero_with_creator: this.heroWithCreator,
    }).subscribe({
      next: (r) => { this.rendering.set(false); r.success ? this.rendered.set(true) : this.renderError.set(r.error || 'Could not start render.'); },
      error: (e) => {
        this.rendering.set(false);
        if (e?.status === 402) { this.renderError.set('Balance changed since the quote — re-quoted below.'); this.plan(); }
        else this.renderError.set(e?.error?.error || 'Could not start render.');
      },
    });
  }
```

- [ ] **Step 4: Quote polish** — add the guard-off badge and the shortfall re-plan affordance to the quote card markup (the affordable/short logic already exists at `:59-65`; add the `app-degrade-badge` for `!guard_enabled` and a "Re-plan — $0" button for `!affordable`).

- [ ] **Step 5: Publish stamp** — add the `[Published? ▸]` popover + `markPublished` call on the video/variant rows.

```ts
  stampAdId = ''; stamping = signal(false); stamped = signal(false);
  stamp(variantId: string): void {
    if (!this.stampAdId) return;
    this.stamping.set(true);
    this.studio.markPublished(variantId, this.stampAdId).subscribe({
      next: (r) => { this.stamping.set(false); if (r.success) this.stamped.set(true); },
      error: () => this.stamping.set(false),
    });
  }
```

- [ ] **Step 6: Import `DegradeBadgeComponent`** + `FormsModule` (already imported) and build.

Run: `cd apps/web && npx ng build --configuration development`

- [ ] **Step 7: Sim-verify (minimal-cost real run)** — per the resume note, do ONE real run with minimal params: plan ($0) → confirm the quote card, guard state, and persona card → render 3 clips (~$4.78, real fal spend) → confirm the video player + QA banner → stamp a dummy meta_ad_id. Keep params minimal; `guard_balance` refuses if short.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/generation-detail/video-planner/video-planner.component.ts
git commit -m "feat(creative-web): persona, voice preview, quote polish, 402 re-quote, publish stamp"
```

---

### Task 13: History loop panel — "What this account has proven" + Harvest

**Files:**
- Modify: `apps/web/src/app/features/ugc-studio/ugc-studio.component.ts`

**Interfaces:**
- Consumes: `studioService.getPrior(acct)`, `getGraph(acct)`, `learn(acct)`.
- Produces: a small panel under the History rail rendering prior entries as sentences + graph correlations as a list (with the graph's own "Correlation, not proven cause" disclaimer verbatim), and a "Harvest results" button firing `learn` and reporting its result line.

**Design (per spec §8):**
- Panel shows `prior.brief` (the verbatim brain-facing text) as sentences; `graph.brief`/atoms as a plain list prefixed with the disclaimer. New account (empty) → neutral `app-degrade-badge` "New account — no prior yet" + "Publish and stamp ads to start building proof."
- "Harvest results" → `learn(acct)`; report the summary in the button's own result line ("2 arms updated · 1 UNDECIDED"). Render `UNDECIDED` as `UNDECIDED` (no fake certainty).
- Single-tenant: the account id is the app's Meta account; if none, hide the panel behind the neutral badge.

- [ ] **Step 1: Add the panel state + fetch on init**

```ts
  prior = signal<any | null>(null);
  graph = signal<any | null>(null);
  harvesting = signal(false); harvestResult = signal('');

  private fetchProven() {
    const acct = this.metaAccountId(); if (!acct) return;
    this.studioService.getPrior(acct).subscribe({ next: r => this.prior.set(r.prior), error: () => {} });
    this.studioService.getGraph(acct).subscribe({ next: r => this.graph.set(r.graph), error: () => {} });
  }
  harvest() {
    const acct = this.metaAccountId(); if (!acct) return;
    this.harvesting.set(true);
    this.studioService.learn(acct).subscribe({
      next: r => { this.harvesting.set(false); this.harvestResult.set(r.result?.brief ? 'Prior updated.' : 'No new outcomes cleared the bar.'); this.fetchProven(); },
      error: e => { this.harvesting.set(false); this.harvestResult.set(e?.error?.error || 'Harvest failed.'); },
    });
  }
```

Call `fetchProven()` in `ngOnInit`.

- [ ] **Step 2: Add the panel markup** under the History card per spec §8.2, with the neutral badge for the empty state.

- [ ] **Step 3: Build + sim-verify** — the panel renders (empty state for the demo account is the honest expected result); Harvest fires without error.

Run: `cd apps/web && npx ng build --configuration development`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/features/ugc-studio/ugc-studio.component.ts
git commit -m "feat(creative-web): 'what this account has proven' panel + harvest loop"
```

---

### Task 14: Phase-2 gate — build + full sim run

- [ ] **Step 1: Production build**

Run: `cd apps/web && npx ng build`
Expected: builds clean (no template/type errors).

- [ ] **Step 2: apps/api suite still green** (routes changed)

Run: `cd apps/api && npm test`
Expected: green.

- [ ] **Step 3: End-to-end sim** — bring the sim up (`docker-compose.sim.yml` per the resume note), connect Meta (real key), and walk the full flow: brief+direction → concepts (with QA chips + rejected + cost) → persona + voice preview → plan ($0 quote) → render 3 clips (real, minimal spend) → video + QA banner → stamp → harvest. Confirm degrade-loudly badges appear where grounding/guard/persona degrade.

- [ ] **Step 4: code-review-graph final review**

Rebuild/update the graph (`build_or_update_graph_tool`, incremental) and run `get_review_context_tool` over the branch diff to confirm every `/creative/*` endpoint is now routed frontend↔api↔ai-layer with no orphaned handler or dead forwarder. This is the endpoint-coverage guarantee the spec §11 note asked for.

- [ ] **Step 5: Finish the branch**

Announce and use `superpowers:finishing-a-development-branch`. Do NOT push (no permission). Report the full sim outcome (what rendered, what it cost, any degradations observed) to the user.

---

## Self-Review

**1. Spec coverage:**
- §2.2 brief-first + direction + remove URL hero → Task 9. ✓
- §2.1/§9 top-bar selectors + grounding pills → Task 9. ✓
- §3.1 persona card (voice guarantee, best-effort visual, pin_face/hero_with_creator, fixed n_shots=3) → Task 12. ✓
- §4 quote-before-spend (dollar button, guard-off, shortfall, 402 re-quote) → Task 12. ✓
- §5 milestone rail + verbatim activity feed + failed-run report → Task 10. ✓
- §6.1 concept gallery QA chips + rejected[] + cost → Task 11. ✓
- §6.2 video QA banner (flagged-but-shipped, hide known false-positives) → Task 11 rules + Task 12 render. ✓
- §6.3 variants radio → Task 12 (with honest disabled-until-supported fallback). ✓
- §7 badge system → Task 8 + used in 9/10/11/12/13. ✓
- §8 History loop (publish stamp, harvest, prior/graph panel) → Task 12 (stamp) + Task 13 (panel/harvest). ✓
- §10 endpoint map — all forwarded: direction (T1), creator/plan (T2), generate fields (T3), loop routes (T4), voice (T5), assets (already). ✓
- §11 voice-preview backend endpoint → Task 5. ✓
- Deferred (URL-analyze prefill, graph viz, brand-kit viewer, multi-tenant, `<a download>` fix) — correctly NOT built.

**2. Placeholder scan:** Backend steps carry complete code. Frontend template bodies are deliberately authored-against-spec during execution (the spec is the detailed visual design, cited per task) rather than transcribed — flagged explicitly in the Phase-2 preamble, not a hidden TODO. Non-obvious frontend logic (generate/plan/render/402/stamp/harvest/preview handlers, badge promotion) is given as complete code.

**3. Type consistency:** `CreatorKit` defined once in the client (T2) and once in the web service (T7), field-identical. `direction` threaded generate→plan→render consistently. `markPublished(variantId, metaAdId)`, `learn(accountId)`, `getPrior/getGraph(accountId)`, `voicePreview(voiceId?, text?)` — same names in client (T4/T5), route, and web service (T7). `n_shots: 3` fixed everywhere it's sent.

**Known risk to verify at execution:** Task 5's ai-layer test assumes a `client` TestClient fixture in `test_creative_service.py`; open the file first and match its actual fixture/mounting style. Task 12's variant-axis wiring depends on the render path accepting `variant_axis`/`variant_values` from the same job — if the current `videoGenerate` client doesn't carry them, render the radio as a labeled follow-up rather than faking the call.
