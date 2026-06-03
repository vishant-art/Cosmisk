> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-23 ranked action list. Superseded by `24_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Next Steps — Ranked Action List

**Supersedes:** `dev_reports/19_05/suggested.md` (S0–S7) and `dev_reports/19_05/tasklist.md`.

> Ranked by **severity × inverse effort** — fastest, highest-impact items first. Each step has an explicit definition of done so you know when to move on.

---

## Tier 1 — fire-fast items (collectively < 1 hour)

These close 🔴 risks for less than an hour total. Do them before any structural work.

### 1. Commit the unblock work

**Why:** The diff is sitting in the working tree. Lose-able, hard to review otherwise.

**What:** Either of the two options from the session message — single combined commit or two-commit split. See [`session_log.md`](session_log.md) for the diff inventory.

**Definition of done:** `git status` clean except for `package-lock.json`, `analysis/new_added_risks_and_design.md` (untracked but separate scope), and any post-commit refactor.

**Effort:** ~10 min.

---

### 2. Add `preHandler: [app.authenticate]` to `routes/schedules.ts`

**Why:** 🔴 Closes Risk P. Currently anyone can `GET /schedules` without auth.

**What:**
- Edit `server/src/routes/schedules.ts`.
- For every `app.get/post/put/delete` invocation, add `{ preHandler: [app.authenticate] }` as the options object (second arg before the handler).
- Add a test in `__tests__/schedules-routes.test.ts` asserting 401 without auth (file doesn't exist yet; the cheapest version is one `it()` block).

**Definition of done:**
```bash
$ curl -sv http://127.0.0.1:3000/schedules 2>&1 | grep -E 'HTTP|401'
< HTTP/1.1 401 Unauthorized
```

**Effort:** ~5 min for the route; ~10 min for the test.

---

### 3. Fix `shopify_tokens.shop_name` schema drift

**Why:** 🔴 Closes Risk O. `/shopify/status` is 500ing today on every account that's loaded Shopify.

**What:**
- In `server/src/index.ts` near line 343 (where `ensureUsersColumn` runs), add a generalised helper `ensureColumn(table, column, def)` and call it for `shopify_tokens.shop_name TEXT`.
- Alternative: rewrite the SQL in `routes/shopify.ts:150` to use `shop_domain` (which exists) if `shop_name` was never load-bearing. Read the route first to decide.

**Definition of done:**
```bash
$ curl -s -H 'Authorization: Bearer <valid>' http://127.0.0.1:3000/shopify/status
{"connected":false,…}     # or however the real response looks; not 500
```

**Effort:** ~30 min, including reading the route to confirm column purpose.

---

## Tier 2 — high-leverage cleanup (collectively ~1 day)

### 4. Audit + protect `routes/intelligence.ts`

**Why:** 🟡 Closes Risk Q. File has no `app.authenticate` reference but returned 200 in the probe.

**What:** Read the file. If any handler returns DB data or mutates state, add the preHandler. If all handlers are stubs, still add the preHandler for defence-in-depth.

**Definition of done:** Same test as item #2 — 401 without auth.

**Effort:** ~10 min.

---

### 5. Wrap the 2 remaining LLM-gateway bypasses

**Why:** 🟡 Closes Risk I. `comment-mining-agent.ts` and `competitor-creative-intel.ts` instantiate Anthropic directly, bypassing rate limits, cost ledger, and daily caps.

**What:**
- In each file, remove `new Anthropic({...})` and the standalone import.
- Replace every `client.messages.create({...})` call with `createMessage({ userId, operation, request: {...} })`.
- Each call site needs a `userId` and `operation` string — pull from the surrounding context.
- Re-run the relevant tests.

**Definition of done:**
```bash
$ grep -lE "new Anthropic" server/src --include='*.ts' | grep -v __tests__
server/src/services/llm-gateway.ts     # only the gateway itself
```

**Effort:** ~½ day (the two files together have ~30 LLM call sites).

---

### 6. Unblock the 9 skipped tests

**Why:** 🟢 Closes Risk R. Cheapest path to 100% test pass rate.

**What (Option A — recommended):**
- In `services/llm-gateway.ts` near line 317, replace
  ```ts
  const cost = computeCostCents(opts.request.model, response.usage as UsageWithCache);
  ```
  with
  ```ts
  const cost = response.usage
    ? computeCostCents(opts.request.model, response.usage as UsageWithCache)
    : 0;
  ```
- Add a unit test in `llm-gateway.test.ts` asserting `cost = 0` and no cost-ledger row when `response.usage` is undefined.
- Remove the `it.skip` from the 9 tests in `ad-watchdog.test.ts` (7) and `reports-routes.test.ts` (2) — and verify they all pass.

**Definition of done:**
```
npx vitest run     # ≥ 888 passing, ≤ 2 skipped, ≤ 8 failing (same pre-existing)
```

**Effort:** ~30 min.

---

### 7. Fix the 8 pre-existing test failures (out of scope for current cleanup but cheap)

**Why:** 🟢 Closes the last gap to 100% green.

**What:**
- `media-gen-routes.test.ts` (5 fails): in `routes/media-gen.ts`, replace `throw new Error('Missing env')` patterns with `return reply.code(503).send({error: '…'})`.
- `content-routes.test.ts` (3 fails): wire the LLM mock in `beforeEach` so `createMessage` resolves to a valid response shape.

**Definition of done:** `npx vitest run` → 0 fails.

**Effort:** ~3 hours.

---

## Tier 3 — the larger cleanup arc (days to weeks)

These are unchanged from `19_05/cleanup_suggestions.md` S4–S7, modulo the items already closed.

### 8. Schema consolidation (was S4)

Consolidate 71 tables across 6 source locations into a single `db/schema.ts`. Add `deleted_at` to every table. Land the `shopify_tokens` duplicate as a single canonical definition. ~3 days.

### 9. CI grep guards (was S5)

`grep` guards in `.github/workflows/`:
- No `new Anthropic` outside `llm-gateway.ts`.
- No `CREATE TABLE` outside `db/schema.ts`.
- No file exceeds 500 LOC (with override-list).
- No `JWT_SECRET` or `TOKEN_ENCRYPTION_KEY` in committed files.

Each is a single-line `grep -r` in a shell job. ~half day.

### 10. Docs refresh (was S6)

- Update `CLAUDE.md` "9 Agents" table to reflect actual stub vs real state (Risk S + T).
- Audit `cohort-ltv-analyzer.ts` against the Cohort Intelligence description.
- Regenerate the route inventory from `server/src/index.ts` (current count: 43 prefixes).

~half day.

### 11. Deferred items (was S7)

- JWT-in-localStorage migration (Risk A) — frontend work.
- In-process cron → worker queue (Risk G) — design decision first.
- Non-Anthropic retry/circuit-breaker (Risk C) — wrap each platform client.
- Operator-script principal (Risk L) — design decision.

Each is its own work-stream; size at planning time.

---

## Tier 4 — feature work (the stubs become real)

These are the items that turn the 16 service stubs + 4 route stubs into real features. None of these is a cleanup item; they're product work. Ordered by user-visible value per CLAUDE.md.

| Stub | Real version delivers | Approx. effort |
|---|---|---|
| `routes/health-score.ts` | Composite 0–100 score per ad account (Bridge Service "Done For You" deliverable) | ~1 week |
| `routes/quick-wins.ts` | Dedup'd ranked actions surface | ~3 days (depends on real intelligence-integration) |
| `routes/creative-scan.ts` | Wire the existing creative-strategist + creative-scorer through the route | ~2 days |
| `routes/static-ads.ts` | Gemini-MCP-driven static ad generator | ~3 days (CLAUDE.md has the design) |
| `services/intelligence-integration.ts` | Real signal conversion + strategic prompt section | ~1 week (depends on signal-discovery) |
| `services/signal-discovery/index.ts` | The cross-platform `SignalDiscoveryService` — biggest single piece | ~2 weeks (4 strategic-cognition files depend on it) |
| `services/agent-brain.ts` | Real decision store + autopilot routing | ~1 week |
| `services/client-references.ts` + `pattern-extractor.ts` | Per-client reference library + extractor | ~1 week |
| 12 analyser files | Real cross-platform analytics (RTO-COD, geo-profitability, margin ROAS, etc.) | ~1 week each, parallelisable |
| `services/ad-engine/templates.ts` | `renderAd` with Sharp + SVG layouts | ~1 week |

---

## 5. Suggested order

If you want a single linear plan instead of tiers:

1. Commit (10 min)
2. Schedules auth (15 min)
3. shop_name drift (30 min)
4. Intelligence auth audit (10 min)
5. Gateway-bypass wraps (½ day)
6. Unblock 9 skipped tests (½ hour)
7. Fix 8 pre-existing fails (3 hours)
8. ✅ All-green test suite — good commit point
9. Schema consolidation + CI guards (3–4 days)
10. ✅ Cleanup branch merge-ready

Total: ~5 working days to a fully-merged, fully-tested, no-known-bugs `analysis-and-cleanup` branch. Feature work (Tier 4) starts from there.
