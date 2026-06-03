> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-23 smoke findings (shop_name 500, unauth /schedules); folded into later plans. Superseded by `24_05/next_steps.md` → `25_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# New Findings — Surfaced by 2026-05-23 Smoke

**What's new in this report:** two real bugs that the 2026-05-20 smoke test couldn't see (because the server wouldn't boot then). One smaller follow-up.

---

## 1. 🔴 `shopify_tokens.shop_name` column missing — live 500

### 1.1 Symptom

```
$ curl -s http://127.0.0.1:3000/shopify/status -H 'Authorization: Bearer <valid>'
HTTP 500
{"err":{"type":"SqliteError","message":"no such column: shop_name"},…}
```

### 1.2 Trace

```
SqliteError: no such column: shop_name
  at Database.prepare (/workspace/server/node_modules/better-sqlite3/lib/methods/wrappers.js:5:21)
  at Object.<anonymous> (/workspace/server/dist/routes/shopify.js:150:24)
  at preHandlerCallbackInner (/workspace/server/node_modules/fastify/lib/handle-request.js:168:24)
```

### 1.3 Root cause

The route handler at `routes/shopify.ts:150` issues a SQL `SELECT` that includes the column `shop_name`, but the `CREATE TABLE shopify_tokens` statement currently in effect does not define that column. This is exactly the kind of fragmentation the 19_05 audit (`Database_migration_strat.md` and `19_05/db_structure.md`) warned about — `shopify_tokens` is duplicated across two creation sites, and they're not in sync.

### 1.4 Fix options

| Option | What | Verdict |
|---|---|---|
| A | `ALTER TABLE shopify_tokens ADD COLUMN shop_name TEXT;` plus a migration row recording the change | **Recommended.** Minimal blast radius; matches the on-the-fly migration pattern already used in `index.ts:343` for the `users` table (`ensureUsersColumn`). |
| B | Rewrite `routes/shopify.ts:150` SQL to not reference `shop_name` (use `shop_domain` instead, which exists) | Less invasive but loses whatever the column was meant to hold — and any other site already writing to it would break. |
| C | Wait for full schema consolidation (S4) | Defers the live 500 indefinitely. Not viable. |

### 1.5 Effort

~30 minutes. The `ensureUsersColumn` helper at `index.ts:335` can be generalised to `ensureColumn('shopify_tokens', 'shop_name', 'TEXT')` and called at boot.

---

## 2. 🔴 `routes/schedules.ts` is reachable without auth

### 2.1 Symptom

```
$ curl -s http://127.0.0.1:3000/schedules     # NO Authorization header
[]
HTTP 200
```

### 2.2 Source confirmation

```
$ grep -n "preHandler.*authenticate\|app\.authenticate" server/src/routes/schedules.ts
(no matches)
```

Compared to a protected route:

```
$ grep -n "preHandler.*authenticate\|app\.authenticate" server/src/routes/ad-accounts.ts
12:    preHandler: [app.authenticate],
…
```

### 2.3 Impact

Anyone with the URL can:
- List all scheduled audits (`GET /schedules`)
- Likely create, modify, or delete schedules (depending on which handlers exist — needs file read)

This was flagged in `19_05/audit.md` and remains open.

### 2.4 Fix

Add `{ preHandler: [app.authenticate] }` as the second argument to every `app.get`/`app.post`/`app.put`/`app.delete` in `routes/schedules.ts`. ~5 minutes; one file.

---

## 3. 🟡 `routes/intelligence.ts` has no explicit auth either

### 3.1 Source check

```
$ grep -n "preHandler.*authenticate\|app\.authenticate" server/src/routes/intelligence.ts
(no matches)
```

### 3.2 Behaviour observed

The probe returned 200 with the JWT (which it ignored). Without the JWT, also probably 200. Not yet directly verified.

### 3.3 Why this is "medium" not "high"

The 19_05 audit didn't flag this one, suggesting the handlers may all be no-op stubs. The file is 365 LOC so it's not trivially small. Reading it for 5 minutes will confirm whether it exposes real data or returns canned strings.

### 3.4 Action

Read `routes/intelligence.ts`. If any handler returns DB data or mutates state, add `preHandler: [app.authenticate]`. If all handlers are stubs, optionally add auth anyway for defence-in-depth.

---

## 4. 🟢 LLM-gateway "8 failures" from 19_05 were false positives

### 4.1 What 19_05 said

> ### 4.2 LLM-gateway test failures (8) — important
> These hit the recently-shipped gateway. … gateway is partially under-spec'd, partially under-tested — needs reconciliation as part of S3.

### 4.2 What 2026-05-23 actually finds

```
$ npx vitest run src/__tests__/llm-gateway.test.ts
Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  7.94s
```

All 15 pass against the **same** gateway code (`server/src/services/llm-gateway.ts` only changed by a one-line `maxConcurrent` removal from a prior session, unrelated to the assertions).

### 4.3 Why the prior smoke saw them as failing

Each gateway test takes ~1.2 s because every `createMessage` invocation cycles a bottleneck reservoir + (in the new gateway) calls `countTokens`. A stricter per-test timeout in the prior run plausibly flagged them as fails. The 7.5 s total for 15 tests is consistent with that.

### 4.4 Action

None on the gateway. Closes Risk M from `19_05/new_and_added_risks.md`.

---

## 5. 🟢 The 11 skipped tests share one fixable root cause

### 5.1 Root cause

Every skipped test that calls `createMessage` mocks the Anthropic SDK as `mockAnthropicCreate.mockResolvedValueOnce({})` — no `usage` field. The gateway's cost-ledger step at line 317 (`computeCostCents(model, response.usage as UsageWithCache)`) reads `usage.input_tokens`, which throws on undefined.

### 5.2 Two viable fixes (and the trade-off)

| Approach | Files changed | Production effect | Risk |
|---|---|---|---|
| **A — Gateway tolerance** | `services/llm-gateway.ts` (1 line: `const cost = response.usage ? computeCostCents(…) : 0;`) | If Anthropic ever returns a response without `usage`, the gateway silently writes 0 instead of throwing. `recordCost` already skips when `cost ≤ 0`. | Low — Anthropic in production always returns `usage`. |
| **B — Test mock fixup** | `ad-watchdog.test.ts` (~7 sites), `reports-routes.test.ts` (~2 sites) | None | Many touches, easy to miss one. |

### 5.3 Recommendation

**A.** It's one line, makes the gateway more robust against malformed SDK responses, and unblocks all 9 skipped tests in one shot. Add a unit test asserting `cost = 0` when `response.usage` is undefined.

---

## 6. 🟢 `cohort-ltv-analyzer.ts` is 1029 LOC of real code but CLAUDE.md lists it as "not built"

### 6.1 Discrepancy

`CLAUDE.md`:

> | Cohort Intelligence | 🔧 NOT BUILT | — | Shopify MCP ready, needs implementation |

But:

```
$ wc -l server/src/services/cohort-ltv-analyzer.ts
1029 server/src/services/cohort-ltv-analyzer.ts
```

### 6.2 Action

Read the file, decide whether it satisfies the "Cohort Intelligence" agent description in CLAUDE.md, and update CLAUDE.md accordingly. ~15-minute audit.

---

## 7. 🟢 The 12 analyser files in `services/*-analyzer.ts` are all 21–38 LOC stubs

The runtime contract is fine — every call site checks `if (result)` and the stubs return `null`. But anyone reading CLAUDE.md's "9 Agents" claim and then opening these files will see they don't actually do anything yet. Worth surfacing in `module_inventory.md` (done — see `module_inventory.md` § 3.1).

---

## 8. Summary

| # | Finding | Severity | Effort to fix |
|---|---|---|---|
| 1 | `shopify_tokens.shop_name` missing | 🔴 High (live 500) | ~30 min |
| 2 | `routes/schedules.ts` unauth | 🔴 High (security) | ~5 min |
| 3 | `routes/intelligence.ts` no auth | 🟡 Medium (unaudited) | ~5-min read |
| 4 | LLM-gateway "8 fails" was false positive | 🟢 Closed | — |
| 5 | 9 skip-eligible tests share one root cause | 🟢 Low | ~30 min via Option A |
| 6 | `cohort-ltv-analyzer` doc drift | 🟢 Low | ~15-min audit |
| 7 | 12 analyser stubs vs CLAUDE.md claim | 🟢 Low | doc edit |
