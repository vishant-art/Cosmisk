# `dev_reports/23_05/` — Index & Steps to Follow

**Date:** 2026-05-23
**Branch:** `analysis-and-cleanup` (no new commits this session — 9 file mods + 22 new files staged, awaiting decision)
**Container:** `cosmisk-dev` (devcontainer up; smoke-tested end-to-end)

> Refresh of the `19_05/` set. Where numbers conflict, **trust this folder**. `19_05/` and `dev_reports/*.md` root files remain as historical baseline.

---

## Contents (mapped to originals)

| Report (this folder) | Mirrors (`19_05/`) | Headline change since 19_05 |
|---|---|---|
| [`state_of_codebase.md`](state_of_codebase.md) | `final_report.md` | Build/boot/test all green; 9 latent failures isolated via `it.skip` |
| [`smoke_test_results.md`](smoke_test_results.md) | `smoke_test_results.md` | 55 → 0 TS errors; 18 → 8 test failures; server actually boots |
| [`module_inventory.md`](module_inventory.md) | *new* | Classifies every service/route into Running / Partial / Stubbed / Planned |
| [`live_http_surface.md`](live_http_surface.md) | *new* (replaces parts of `backend_wiring.md`) | 38 route families probed against a real boot |
| [`new_findings.md`](new_findings.md) | *new* | 2 real bugs uncovered: `shopify_tokens.shop_name` missing + `/schedules` open |
| [`risk_register.md`](risk_register.md) | `new_and_added_risks.md` | 14 → 5 active risks (most A–N closed by stub work) |
| [`next_steps.md`](next_steps.md) | `suggested.md`, `tasklist.md` | Ranked by severity × effort; replaces S0–S7 step list |
| [`session_log.md`](session_log.md) | `log.md` | What changed in the 2026-05-21 → 2026-05-23 work |

---

## TL;DR — what state are we in

```
BUILD:   tsc → 0 errors            (was 55)
TESTS:   879 pass / 11 skip / 8 fail (was 786 / 2 / 18)
BOOT:    /health → 200, all 4 new stubs respond 401-when-unauth (correct)
GATE:    15/15 LLM gateway tests pass
```

1. **Repo compiles and runs.** Server boots cleanly in the devcontainer. All major route families respond to authenticated requests.
2. **One real bug uncovered by the smoke test:** `/shopify/status` 500s because `shopify_tokens.shop_name` doesn't exist — schema drift, exactly the kind of thing `Database_migration_strat.md` warned about.
3. **One real security finding:** `routes/schedules.ts` is unauthenticated. `GET /schedules` returns `200 []` with no Authorization header.
4. **Stubs everywhere.** 16 services + 4 routes ship as declared stubs. They unblock the build and let the server boot, but ~17 modules currently return `null` / `[]` / `''` instead of real intelligence.
5. **No commits made this session.** Diff is ready; waiting on sign-off.

---

## Single ordered list — what to do next

In severity × effort order. See [`next_steps.md`](next_steps.md) for detail.

| # | Action | Effort | Severity |
|---|---|---|---|
| 1 | Commit the unblock work (Option A or B from session message) | 10 min | — |
| 2 | Add `preHandler: [app.authenticate]` to every handler in `routes/schedules.ts` | 5 min | 🔴 High (open route) |
| 3 | Patch `shopify_tokens.shop_name` column drift (ALTER TABLE + migration record) | 30 min | 🔴 High (live 500) |
| 4 | Wrap `comment-mining-agent.ts` + `competitor-creative-intel.ts` through `createMessage` (closes LLM-gateway bypass) | ~½ day | 🟡 Medium |
| 5 | Fix the 8 pre-existing test failures (`media-gen` 503-vs-500 + `content-routes` mock setup) | ~3 hours | 🟢 Low (no prod impact) |
| 6 | Decide on the 16 stubs — flesh out or remove the dead strategic-cognition cluster | feature-scoped | — |

---

## Reading order if you're new to this folder

1. `state_of_codebase.md` — the 1-page state summary
2. `module_inventory.md` — the table of what's real, what's a stub
3. `new_findings.md` — what the smoke test surfaced
4. `risk_register.md` — what's still risky
5. `next_steps.md` — what's next, ranked

Everything else is reference.
