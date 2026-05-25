# `dev_reports/25_05/` — Index

**Date:** 2026-05-25
**Branch:** `analysis-and-cleanup` (5 commits ahead of `origin/analysis-and-cleanup`, not pushed yet)
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
d4195fe  fix(server): require auth on all /schedules routes        ← landed late 2026-05-24
7b08d0b  build(server): pin @types/node to ^20.19.0                ← landed late 2026-05-24
1c6a26a  docs: add 24_05 decision reports
c6d4f79  docs: track dev_reports under date-stamped folders
63e4711  fix(server): unblock build, wire Bridge Service route stubs
```

Five commits ahead of `origin/analysis-and-cleanup`. Zero pushed. None of the prior `analysis-and-cleanup` work is on the remote either (per `24_05/INDEX.md` — 80 commits ahead at the start of yesterday).

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
| 4 (was 5) | `it.skip` 8 pre-existing test fails | pending |
| 5 (was 6) | Local docker build smoke (sharp on Alpine) | pending |
| 6 (was 7) | `git push` + open PR `→ main` | pending |

PR description will explicitly note: `/shopify/*` routes are known-broken against legacy-shape DBs and will be reconciled by M1's Postgres+Drizzle migration.

---

## Reading order

1. `next_steps.md` — what to do today; renumbered Tier 1.
2. `shopify_tokens_fork.md` — why Commit 4 was dropped; what M1 has to handle.
3. `railway_data_at_risk.md` — context for "no production data to migrate"; decision to start fresh.

---

## Critical facts to remember after `/compact`

- **Branch is unpushed.** `analysis-and-cleanup` has 5 local commits, none on `origin`. Don't assume any of this work is durable until push.
- **`origin/main` is broken.** Established in `24_05/merge_readiness.md`. This branch is the first to make `main` buildable again.
- **No production data.** Old Railway account being retired; volume sacrificed; new account is a cold start. M1 doesn't need a data migration step — just schema setup.
- **`shopify_tokens` has two readers using two different PKs.** `routes/shopify.ts` + `services/shopify-client.ts` + `ad-watchdog.ts` use `user_id`; `services/cohort-ltv-analyzer.ts:184` + `services/unified-agent-runner.ts:178` use `brand_id`. M1 has to pick one (canonical: `user_id`) and patch the two stragglers.
- **Encryption-key continuity matters for OAuth tokens.** Even if Railway DB were recovered, tokens were encrypted with the old instance's `ENCRYPTION_KEY` / `JWT_SECRET`. Re-OAuth is mandatory regardless of recovery path. (Moot here: no real OAuth was ever stored.)
- **Session protocol still active:** explain each fix before applying; log every step in `session_log.md`; no `Co-Authored-By: Claude` trailers; no "Generated with Claude Code" attribution.
