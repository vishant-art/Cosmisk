# RH-1 — LLM-Gateway Consolidation: Implementation Spec

> **Audience:** the engineer who will consolidate LLM calls. **Goal:** route every model call through `services/llm-gateway.ts` so per-user daily caps + cost-ledger apply (CLAUDE.md: "NO DIRECT LLM CALLS — llmGateway only"; billing-risk concern). **Behavioral** — these calls become cap-subject (can 429). Own branch, gated.

---

## Current gateway shape (what exists)
`services/llm-gateway.ts`:
- `createMessage(opts: {userId, operation, request: MessageCreateParams, maxRetries?, estimateTokens?}): Promise<Message>` — **Anthropic-only** (`:266`). Does: daily cap check (`checkDailyLimit(userId, {apiProvider:'anthropic'})` `:268`), countTokens pre-flight, rate-limited dispatch (`limiters[cls]`), cost-ledger write (`recordCost`), surfaces `DailyCapExceededError`/`UpstreamRateLimitedError`.
- `checkDailyLimit`, `getDailySpendCents`, `getUserDailyLimit` — per-user, **per-provider** (`apiProvider:'anthropic'|'gemini'`).
- `computeCostCents(model, usage)` — Anthropic `PRICING[modelClass]` only.
- `recordCost({userId, operation, apiProvider:'anthropic'|'gemini', costCents, metadata})` — `cost_ledger` already has the `api_provider` column (`:198,:207`).
- **Gap:** there is NO Gemini dispatch entry. `cost_ledger` knows about `'gemini'` but nothing writes it.

---

## Part 1 — Anthropic direct bypasses (UNAMBIGUOUS, do first)
Two sites construct the SDK directly and call `.messages.create`, skipping caps + ledger:
- `services/competitor-creative-intel/ai-clients.ts:13` (`export const anthropic = new Anthropic(...)`) → consumed by `relevance.ts:90`, `ai-analysis.ts:58`
- `services/comment-mining/state.ts:12` (`export const anthropic = new Anthropic(...)`)

**Fix:** replace `anthropic.messages.create({...})` call sites with `createMessage({ userId, operation: 'competitor-intel.relevance' | 'comment-mining.<op>', request: {...} })`. Delete the direct `new Anthropic` singletons once unused. `extractText(msg)` (`utils/claude-helpers.js`) parses the returned `Message`.

**userId:** these run inside agent flows that have a `clientId`/`userId` in scope — thread it through. For system/cron contexts with no user, see Part 3.

---

## Part 2 — Gemini bypasses (DESIGN DECISION REQUIRED)
~8 sites call Gemini directly (SDK `@google/generative-ai` or raw `fetch` to `generativelanguage.googleapis.com`):
- `audit/audit-agent.ts` (GoogleGenerativeAI)
- `services/visual-analyzer.ts` (fetch ×4 — file upload + generateContent)
- `services/comment-mining/{classification.ts,concepts.ts}` (dynamic import GoogleGenerativeAI)
- `services/competitor-creative-intel/ai-clients.ts:14` (`gemini`)
- `services/pattern-extractor.ts:102` (`gemini`)
- `services/ad-engine/validator/gemini.ts:58` (fetch)
- `services/ad-engine/gemini-generator.ts` (dormant; image-gen)

**Decision:** the clean fix is to add a gateway Gemini entry:
```
createGeminiMessage(opts: { userId, operation, model, request }): Promise<GeminiResult>
```
that mirrors `createMessage`: `checkDailyLimit(userId, {apiProvider:'gemini'})` → dispatch (consolidate ONE Gemini client/transport here) → `computeGeminiCostCents(model, usage)` → `recordCost({apiProvider:'gemini', ...})`. Requires:
1. A **Gemini pricing table** + `computeGeminiCostCents` (Gemini bills by input/output tokens per model; `gemini-2.5-flash` etc. — pull current rates).
2. A **rate limiter** for Gemini (mirror `limiters`), or reuse a generic one.
3. Handling **non-text modalities**: `visual-analyzer` does file upload + multimodal; `gemini-generator` does image generation. These don't fit a text `MessageCreateParams` shape — the gateway entry needs a flexible request type, OR these stay out-of-gateway with cost instrumented manually (`recordCost`) at minimum. **Recommend:** text/vision-analysis Gemini → gateway; image-generation (gemini-generator, dormant) → defer, instrument cost only.

> Alternative (lighter): keep Gemini calls where they are but wrap each with a thin `recordCost` + `checkDailyLimit` helper, so billing visibility/caps apply without centralizing transport. Less clean, faster.

---

## Part 3 — The system/no-user problem (must resolve)
`createMessage` requires a `userId` for per-user caps. But several bypass sites run in **cron/system context** with no end user: `audit-agent` (scheduled audits), `visual-analyzer` (called by watchdog cron), `pattern-extractor`, some `comment-mining`. Options:
- A reserved `'system'` userId with its own (higher) daily cap → system spend is tracked + bounded.
- Thread the owning `clientId` through where one exists (preferred when the run is per-client).
Pick one convention and apply consistently; document it in the gateway.

---

## Migration order & acceptance
1. **Part 1** (Anthropic) — smallest, unambiguous; ship first. Verify cost_ledger rows appear with `api_provider='anthropic'` for those operations; a capped user gets 429.
2. **Part 3** decision (system userId) — prerequisite for the cron-context Gemini sites.
3. **Part 2** (Gemini) — after the design decision; ship per-site.
- **Invariant per step:** default 400/9, pg 388/10, tsc baseline, madge 0. Behavioral change ⇒ add tests asserting cap-check + ledger write happen (mock the provider).
- **Definition of done:** `grep -rn "new Anthropic\|\.messages\.create\|new GoogleGenerativeAI\|generativelanguage\.googleapis" src/ | grep -v llm-gateway | grep -v '\.test\.'` returns only the gateway's own internal client(s) + (if deferred) the image-gen site, with a tracked exception list.

---

## Key file references
| Purpose | File:line |
|---|---|
| Gateway entry (Anthropic) | `services/llm-gateway.ts:266` (`createMessage`) |
| Cap check (per-provider) | `services/llm-gateway.ts:118` (`checkDailyLimit`) |
| Cost compute / ledger | `services/llm-gateway.ts:177` (`computeCostCents`), `:203` (`recordCost`) |
| Anthropic bypass #1 | `services/competitor-creative-intel/ai-clients.ts:13` (+ `relevance.ts:90`, `ai-analysis.ts:58`) |
| Anthropic bypass #2 | `services/comment-mining/state.ts:12` |
| Gemini bypasses | `audit/audit-agent.ts`, `services/visual-analyzer.ts`, `comment-mining/{classification,concepts}.ts`, `competitor-creative-intel/ai-clients.ts:14`, `pattern-extractor.ts:102`, `ad-engine/validator/gemini.ts:58`, `ad-engine/gemini-generator.ts` |
