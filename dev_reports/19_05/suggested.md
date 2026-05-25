# Suggested Phasing — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/suggested.md` (2026-04-26)

> The original 6-phase plan (P0–P5) was written for the **academic-break window**. The window has closed; M1 is in flight. The plan still works but needs prepending with the cleanup steps (S0–S5) because **the server doesn't compile today**. This refresh re-orders the phases and adds the cleanup prefix.

---

## Order of operations (refreshed)

```
[NEW PREFIX]
S0  Recover environment            (chown + npm ci)               0.05 d
S1  Make server compile             (fix 25 broken imports)        0.5–1 d
S2  Consolidate schema              (11 lazy/script tables → schema.ts)  1 d
S3  Finish LLM gateway              (wrap last 2 services)         1.5 d

[ORIGINAL PHASES, kept but renumbered to follow the prefix]
P0.1 Wire Sentry (server + browser)                                0.5 d
P0.2 Request-id hook + console.* → logger                          1 d
P0.4 Move JWT to httpOnly cookie + refresh rotation                2–3 d
P1.1 Add missing SQLite indexes (top 10 hot queries)               0.5 d
P1.2 Type DB rows; remove production `as any`                       1.5–2 d
P2.1 Adopt Drizzle (one route as proof)                            2 d
P2.2 Stand up managed Postgres                                     1 d
P2.3 Migrate all routes to Drizzle (flagged)                       3 d
P2.4 Data migration + cutover                                      3 d
P2.5 Drizzle Kit migrations as SoT                                 0.5 d

[STAGED LATER — bundled into M2/M4 per scope alignment]
P3.1 Cron worker extraction (Risk B / J)
P3.2 DLQ + Sentry/Slack alerts
P4.1 Retry + circuit breaker
P4.2 Idempotency keys
P4.3 Provider-tagged Sentry + dashboard

[OUT OF SCOPE — backlog]
P5.1 Decompose `index.ts`
P5.2 Split `creative-engine.ts` + `ai.ts`
P5.3 Split landing/dashboard/pitch-deck components
H1   Decompose `competitor-creative-intel.ts` (NEW)
H2   Decompose `operator-experience.ts` (NEW)
H3   Decompose `comment-mining-agent.ts` (NEW)
```

---

## Cleanup prefix (S0–S5) — what changed since the original

The original `suggested.md` jumped straight to P0. It assumed the codebase was buildable. It is not. The prefix is non-negotiable:

| Step | What | Why it must precede P0 |
|---|---|---|
| S0 | `chown` + `npm ci` | No toolchain, no anything. |
| S1 | Resolve 25 missing imports | `tsc` fails; no test of any code change can pass. |
| S2 | Collapse fragmented schema | P1/P2 work assumes a single source of truth. |
| S3 | Wrap remaining 2 Anthropic call sites | P0.3 (cost ceiling) is partial without this. |
| S4 | Repo hygiene | Cosmetic; not blocking but cheap to ship alongside S1–S3. |
| S5 | CI grep guards (G1–G7) | Regression prevention; must land before any further analyst work. |

See `cleanup_suggestions.md` (root of `dev_reports/`) for the full breakdown.

---

## Phase 0 (refreshed)

After S3 lands, Phase 0 reduces to three items (P0.3 already shipped on the gateway branch — same as `feat: api/llm rate limiting`):

### P0.1 — Wire Sentry (server + browser)
**Effort:** 0.5 day.
**DoD:** manually-thrown error appears in Sentry within 30s; tagged with `service` + `release`; `unhandledRejection` and `uncaughtException` captured.

### P0.2 — Request-id Fastify hook + replace `console.*`
**Effort:** 1 day.
**Pre-state:** 96 `console.*` calls in production code (was 85).
**DoD:** `grep -rE "console\\.(log|error|warn)" server/src | grep -v __tests__ | wc -l` = 0 outside config.ts boot path; Sentry events carry `reqId`.

### P0.4 — JWT to httpOnly cookie + refresh rotation + tokenVersion + CSRF
**Effort:** 2–3 days.
**Sub-fix:** add `preHandler: [app.authenticate]` to `/schedules/*` (unchanged finding).

---

## Phase 1 (unchanged but with current numbers)

### P1.1 — Add missing SQLite indexes
**Pre-state:** 51 indexes today (was 17). Some originally-cited gaps are closed. **Recount needed.** Likely-still-missing candidates:
- `subscriptions.user_id`
- `meta_tokens.user_id`, `google_tokens.user_id`, `tiktok_tokens.user_id` (these are PK so OK)
- `cost_ledger(user_id, created_at)` — composite for the gateway hot query
- `competitor_snapshots.client_id`, `operator_behavior.client_id`
**DoD:** `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` for the top 10 hot queries.

### P1.2 — Type DB rows; remove production `as any`
**Pre-state:** 78 production `as any` (was ~35). Some are in new analyst services with no typed-row interface.
**DoD:** `grep -rE "\\bas any\\b" server/src | grep -v __tests__ | wc -l` = 0.

---

## Phase 2 (unchanged conceptually, larger surface)

Steps P2.1 → P2.5 same shape, but Step 1 (consolidate into Drizzle SQLite) is now a **larger migration** because 71 tables not 40. See `19_05/Database_migration_strat.md`.

---

## Removed from phasing

- **P0.3 (LLM cost ceiling)** — shipped on the gateway branch. Now part of S3 follow-up.

---

## Dependency diagram (post-cleanup-prefix)

```
S0 ─► S1 ─► S2 ─► S3 ─► P0.1 ─► P0.2 ─┐
                                       ├─► P1.1 ┐
                                P0.4   │        ├─► P2.1 ─► P2.3 ─► P2.4 ─► P2.5
                                       │        │       (P2.2 in parallel)
                                       └► P1.2 ─┘
```

S3 is parallelisable with P0.1 once S1 closes. P0.4 sits independently. P1 starts in parallel with P0 once S2 closes.

---

**End of refresh.**
