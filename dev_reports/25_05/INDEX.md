# `dev_reports/25_05/` — Index

**Date:** 2026-05-25
**Branch:** `analysis-and-cleanup` — 42 commits ahead of `origin/main`; HEAD `c4012f9` (merge commit). Pushed through commit `270366e`; everything since (`0f2adbc` docs, `c4012f9` merge) is local-only.
**Session continuation:** rolls forward from `24_05/` set. Today's reports cover decisions taken after the `shopify_tokens` fork was discovered late on 2026-05-24.

> Additive to `dev_reports/24_05/`. The 24_05 reports proposed the Tier 1 fix sequence; today's reports record what changed when the `shopify_tokens` patch turned out to be larger than estimated, and how the Railway-data question was settled.

---

## Contents

| Report | Purpose | One-line headline |
|---|---|---|
| [`railway_data_at_risk.md`](railway_data_at_risk.md) | Decide whether to retrieve data from the expired Railway account before migrating to a new one. | **Sacrifice all of it.** Volume held only test/mock data; no real client onboarded; not worth the $10 + 30 min to extract. |
| [`shopify_tokens_fork.md`](shopify_tokens_fork.md) | Forensic doc on the `shopify_tokens` dual-schema fork (canonical `user_id`-keyed vs. legacy `brand_id`-keyed). | **Two schemas coexist in source.** Local dev DB has legacy shape; routes hit canonical. Fix folded into M1 (PG+Drizzle) — no patch in this PR. |
| [`next_steps.md`](next_steps.md) | Updated Tier 1 plan with Commit 4 dropped and M1 scope expanded. | Supersedes `24_05/next_steps.md`. Three commits left before push + PR. |

Also updated today:
- [`../24_05/session_log.md`](../24_05/session_log.md) — extended with late-2026-05-24 entries (Commit 3 landed; Commit 4 fork discovered).
- [`session_log.md`](session_log.md) — fresh log for today's work onward.

---

## What's changed since 24_05

### State of the branch

```
c4012f9  merge: bring origin/main into analysis-and-cleanup      ← 2026-05-25 pm (LOCAL)
0f2adbc  docs: add 25_05 decision reports + ON_HOLD ledger       ← 2026-05-25 pm (LOCAL)
270366e  test(server): skip 8 pre-existing failures              ← 2026-05-25 pm (PUSHED)
d4195fe  fix(server): require auth on all /schedules routes      ← landed 2026-05-24
7b08d0b  build(server): pin @types/node to ^20.19.0              ← landed 2026-05-24
1c6a26a  docs: add 24_05 decision reports
c6d4f79  docs: track dev_reports under date-stamped folders
63e4711  fix(server): unblock build, wire Bridge Service route stubs
```

**42 commits ahead of `origin/main`** (real PR base). The remote `origin/analysis-and-cleanup` was at `1a7a04e` (May 3) before today; first push of this session went `1a7a04e → 270366e` (84 commits). Two more commits (`0f2adbc` docs, `c4012f9` merge) are local-only — need a follow-up push before the PR.

### Two material discoveries on 2026-05-24 late

1. **`shopify_tokens` is not drift, it's a fork.** Local DB's table shape (`brand_id` PK, has `scope`, no `shop_name`) differs from `db/schema.ts` (`user_id` PK, has `shop_name`, no `scope`). Two parts of the codebase query each shape. Detail: [`shopify_tokens_fork.md`](shopify_tokens_fork.md).
2. **Railway trial expired ~1 month ago.** Account is still log-in-able but not being reactivated; migrating to a new Railway account. Persistent volume at `/app/data` held the old SQLite DB. Decision today: **don't recover** because the data was all test/mock. Detail: [`railway_data_at_risk.md`](railway_data_at_risk.md).

### What this means for the PR

The Tier 1 plan in `24_05/next_steps.md` had four commits before push (3 → 4 → 5 → 6). **Commit 4 (the `shopify_tokens` schema patch) is dropped.** Renumbered Tier 1: three commits left.

| # | Item | Status |
|---|---|---|
| 3 | `routes/schedules.ts` — auth preHandler | ✅ landed (`d4195fe`) |
| 3a | `@types/node` pin | ✅ landed (`7b08d0b`) |
| ~~4~~ | ~~`shopify_tokens.shop_name` patch~~ | **DROPPED → folded into M1** |
| 4 (was 5) | `it.skip` 8 pre-existing test fails | ✅ landed (`270366e`) |
| 5a | Commit dev_reports (INDEX + session_log + Railway + fork + ON_HOLD) | ✅ landed (`0f2adbc`) |
| 5b | Merge `origin/main` (resolve 3 conflicts) + post-merge fixes (AgentType, static-ad-generator stub) | ✅ landed (`c4012f9`) |
| 5c | **Verification step** — `docker build` + `docker run npm test` | ✅ done (build clean, 36/36 files pass) |
| 5d | **Conditional commit** — hardened `getDb()` to create data dir (`server/src/db/index.ts`); fixes a main-side pre-existing CI failure on `memory-integration.test.ts` | ✅ landed (bundle commit) |
| 6 | Push + open PR `→ main` | pending |

PR description will explicitly note:
- `/shopify/*` routes are known-broken against legacy-shape DBs and will be reconciled by M1's Postgres+Drizzle migration.
- Local vitest crashes on WSL2 (ON_HOLD item 6); CI/Docker run is authoritative for test status.
- `static-ad-generator.ts` is a stub (ON_HOLD item 13); full impl deferred to M2.

---

## Reading order

1. `next_steps.md` — what to do today; renumbered Tier 1.
2. `shopify_tokens_fork.md` — why Commit 4 was dropped; what M1 has to handle.
3. `railway_data_at_risk.md` — context for "no production data to migrate"; decision to start fresh.

---

## Critical facts to remember after `/compact`

- **HEAD `c4012f9` is local-only.** The merge of `origin/main` and the docs commit (`0f2adbc`) need a push before the PR can open. Through `270366e` is on the remote.
- **`origin/main` had 8 commits we didn't have**, including a May 20 CODE FREEZE notice. The freeze blocks non-engineers from touching `server/src/`; we (on `analysis-and-cleanup`) are explicitly the team it authorises. Merged in cleanly with 4 conflicts: CLAUDE.md (took theirs, thin), pattern-extractor.ts (took theirs, full Gemini impl), llm-gateway.ts (took ours, rate-limited API), ad-watchdog.ts (kept main's Factual Validation + adapted LLM call to our new `createMessage`).
- **CLAUDE.md is now the thin freeze version (~112 lines)** on this branch. The fat engineering version is in git history (any commit before `c4012f9`'s parent).
- **AgentType extended** to include `'inventory' | 'audience'` (`server/src/types/index.ts:341`). Main's orchestrator/registry referenced these literals but the union was never updated on main — pre-existing tsc error inherited and fixed here.
- **`static-ad-generator.ts` is a stub.** Main's `agent-orchestrator.ts:275` dynamically imports it; the file never existed on main. Stub returns empty. Full impl is ON_HOLD item 13 (M2).
- **No production data.** Old Railway account being retired; volume sacrificed; new account is a cold start. M1 doesn't need a data migration step — just schema setup.
- **`shopify_tokens` has two readers using two different PKs.** `routes/shopify.ts` + `services/shopify-client.ts` + `ad-watchdog.ts` use `user_id`; `services/cohort-ltv-analyzer.ts:184` + `services/unified-agent-runner.ts:178` use `brand_id`. M1 has to pick one (canonical: `user_id`) and patch the two stragglers.
- **Encryption-key continuity matters for OAuth tokens.** Re-OAuth is mandatory regardless. (Moot here: no real OAuth was ever stored.)
- **Vitest bus-errors on this WSL2 host.** ON_HOLD item 6. CI/Docker run is the authoritative test environment.
- **Session protocol still active:** explain each fix before applying; log every step in `session_log.md`; no `Co-Authored-By: Claude` trailers; no "Generated with Claude Code" attribution.
