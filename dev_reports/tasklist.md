# Cosmisk Cleanup Task List — 2026-04-26

Source: `suggested.md`. Status reflects in-conversation TaskList; treat this file as the human-readable mirror.

> **Scope note:** items prefixed `*` are NOT in the official Cosmisk Scope of Work (April 15, 2026). They were surfaced during audit and need an explicit go/no-go before they can be scheduled. See `scope_alignment.md` for the in-scope vs out-of-scope split.

## Dependency map

```
P0.1 (Sentry) ──► P0.2 (request-id)
                  P3.2 (DLQ alerts)
                  P4.3 (provider tags)
P1.1 (indexes) ─┐
P1.2 (typed rows) ─► P2.1 (Drizzle proof) ─► P2.3 (full migrate) ─► P2.4 (cutover) ─► P2.5 (drizzle-kit)
P2.2 (managed PG) ─────────────────────────► P2.3
P0.3 (cost ceiling)         (parallel)
P0.4 (cookie auth)          (parallel)
P3.1 (queue) ─► P3.2
P4.1 (retry/CB) ─► P4.2 (idempotency)
P5.1 / P5.2 / P5.3 (decomp)  (parallel, low risk)
```

## Tasks

### Phase 0 — Stop the bleeding (1–2 days)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 6 | ✅ Risk #2 | P0.1 Wire Sentry on server + browser | — | Manually-thrown error appears in Sentry within 30s; tagged with `service` + `release`; `unhandledRejection` and `uncaughtException` captured. |
| 7 | ✅ Risk #2 | P0.2 Request-id Fastify hook + replace `console.*` with logger | 6 | `grep -rE "console\\.(log\|error\|warn)" server/src \| wc -l` returns 0 outside boot/fatal paths; Sentry events carry `reqId`. |
| 8 | * Added Risk E | P0.3 Per-user daily LLM cost ceiling | — | Load test exceeding cap returns `429 {error:'daily_limit'}`; `cost_ledger` row created per call. |
| 9 | * Added Risk A | P0.4 Move JWT to httpOnly cookie + refresh rotation | — | JWT not visible to JS; refresh flow works; password change bumps `tokenVersion` and invalidates old refresh tokens. |

### Phase 1 — DB indexes + typed rows (2–3 days)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 10 | ✅ Risk #1 | P1.1 Add missing SQLite indexes | — | `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` for top-10 hot queries; >5× improvement on top-3. |
| 11 | ✅ Risk #3 | P1.2 Type DB rows; remove production `as any` | — | `grep -rE "\\bas any\\b" server/src \| grep -v __tests__ \| wc -l` = 0. |

### Phase 2 — Postgres + Drizzle migration (1–2 weeks)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 12 | ✅ Risk #1 | P2.1 Adopt Drizzle ORM (one route as proof) | 11 | One route module migrated end-to-end; tests pass on Drizzle path. |
| 13 | ✅ Risk #1 | P2.2 Stand up managed Postgres + connection pool | — | Server boots in `DATABASE_DRIVER=pg` against managed PG with empty schema; `/health` reports DB status. |
| 14 | ✅ Risk #1 | P2.3 Migrate all routes to Drizzle (flagged) | 12, 13 | Full test suite green on both drivers; staging flag-flip passes smoke tests. |
| 15 | ✅ Risk #1 | P2.4 Data migration script + dual-run + cutover | 14 | Production runs on PG; two replicas active; zero-downtime deploy; daily backup verified by restore drill. |
| 16 | ✅ Risk #1 | P2.5 Adopt Drizzle Kit migrations; retire `addColumn` shim | 15 | `schema.ts` contains zero `ALTER TABLE` shim calls; CI runs `drizzle-kit migrate` against clean PG. |

### Phase 3 — Job queue out of API process (3–5 days)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 17 | * Added Risk B | P3.1 Replace cron with BullMQ/pg-boss | — | API process has zero in-process timers; killing all worker processes leaves API responsive. |
| 18 | * Added Risk B + ✅ Risk #2 | P3.2 DLQ + Sentry/Slack alerts on job failure | 17, 6 | Deliberately-failing job appears in Sentry within 60s and posts to Slack. |

### Phase 4 — External-API resilience (2–3 days)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 19 | * Added Risk C | P4.1 Retry + circuit breaker in `safeFetch` | — | Chaos test returning 503 from one provider doesn't fail user request after retry; tripped breaker fails fast. |
| 20 | * Added Risk C | P4.2 Idempotency keys for Stripe/Razorpay/Resend/n8n | 19 | Replayed safeFetch call with retry produces only one downstream effect (verified in staging). |
| 21 | * Added Risk C + ✅ Risk #2 | P4.3 Provider-tagged Sentry + health dashboard | 6 | Dashboard live; alert rule fires when any provider error rate >5% over 10min. |

### Phase 5 — Decomposition (ongoing, low risk)
| ID | In scope? | Task | Blocked by | Definition of done |
|---|---|---|---|---|
| 22 | * Out of scope | P5.1 Decompose `server/src/index.ts` (1287 LOC) | — | `index.ts` < 200 LOC; all extracted endpoints have tests. |
| 23 | * Out of scope | P5.2 Split `creative-engine.ts` + `ai.ts` | — | No route file > 600 LOC; cross-community edges between routes and `services-generate` < 200. |
| 24 | * Out of scope | P5.3 Split landing/dashboard/pitch-deck components | — | No Angular component > 600 LOC; main bundle size drops measurably. |
