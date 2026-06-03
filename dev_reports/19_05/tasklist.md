> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 task-list refresh. Superseded by `23_05/next_steps.md` → `24_05/next_steps.md` → `25_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Cosmisk Cleanup Task List — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/tasklist.md` (2026-04-26)

> Prepends the cleanup steps (S0–S5) before the original P0–P5 phases. The original 20 tasks remain valid; their dependencies now include the S-prefix.

---

## Dependency map

```
S0 (env)  ─► S1 (build) ─► S2 (schema) ─► S3 (gateway wrap) ─► S4 (hygiene) ─► S5 (CI guards)
                                                  │
                                                  ├─► P0.1 (Sentry)  ─► P0.2 (request-id)
                                                  │                    P3.2 (DLQ alerts)
                                                  │                    P4.3 (provider tags)
                                                  ├─► P0.4 (cookie auth)        (parallel)
                                                  ├─► P1.1 (indexes)
                                                  ├─► P1.2 (typed rows) ─► P2.1 (Drizzle proof) ─► P2.3 ─► P2.4 ─► P2.5
                                                  └─► P2.2 (managed PG) ──────────────────────────► P2.3
                                                  
                                                  P3.1 (queue) ─► P3.2
                                                  P4.1 (retry/CB) ─► P4.2 (idempotency)
                                                  P5.1 / P5.2 / P5.3 (decomp)  (parallel, low risk, out of scope)
                                                  H1 / H2 / H3 (decomp, NEW out-of-scope items)
```

---

## Cleanup prefix tasks (NEW)

| ID | In scope? | Task | Owner gate | DoD |
|---|---|---|---|---|
| S0 | ✅ emergency | `chown` root-owned dirs + `npm ci` server | OG-1 | `npm --prefix server run build` exits 0 |
| S1.1 | ✅ emergency | Resolve 4 missing route imports (health-score, creative-scan, quick-wins, static-ads) | OG-2 | Imports removed OR files committed |
| S1.2 | ✅ emergency | Resolve `intelligence-integration.js` | OG-3 | Module recovered or callers updated |
| S1.3 | ✅ emergency | Resolve `utils/encryption.js` (shopify) | none | Imports point to `token-crypto.js` |
| S1.4 | ✅ emergency | Resolve `ad-engine/` cluster (4 imports) | OG-4 | Folder recovered or deleted |
| S1.5 | ✅ emergency | Resolve `learning-engine.ts` → `client-references.js` | OG-4 | Path A or B chosen |
| S1.6 | ✅ emergency | Resolve `strategic-cognition/` → `signal-discovery/` (4 imports) | OG-5 | Path A or B |
| S1.7 | ✅ emergency | Resolve `unified-agent-runner.ts` → 12 analyser files | OG-6 | Path A or B |
| S1.x | ✅ emergency | `npm --prefix server run build && npm --prefix server run test` exit 0 | — | Compile + tests green |
| S2.1 | ✅ in scope | Snapshot `cosmisk.db` before schema work | — | File at `server/data/cosmisk.db.snapshot-*` |
| S2.2 | ✅ in scope (Risk K) | Collapse `shopify_tokens` dual definition | — | Only `schema.ts` defines it; CI guard added |
| S2.3 | ✅ in scope | Move `brands`/`brand_context`/`audits` into `schema.ts` | — | `add-audit-tables.ts` no longer has CREATE TABLE |
| S2.4 | ✅ in scope | Move `client_contexts` into `schema.ts` | — | Lazy init in `client-context.ts` removed |
| S2.5 | ✅ in scope | Move `strategic_*` (×4) into `schema.ts` | — | Lazy init in `strategic-memory.ts` removed |
| S2.6 | ✅ in scope | Move `scheduled_audits` into `schema.ts` | — | Same pattern |
| S2.7 | ✅ in scope | Move `waitlist_leads` into `schema.ts` | — | Same pattern |
| S3.1 | ✅ in scope (Risk I) | Wrap `competitor-creative-intel.ts` in gateway | OG-7 | `grep -c 'new Anthropic' competitor-creative-intel.ts` = 0 |
| S3.2 | ✅ in scope (Risk I) | Wrap `comment-mining-agent.ts` in gateway | OG-7 | `grep -c 'new Anthropic' comment-mining-agent.ts` = 0 |
| S3.3 | ✅ in scope | Check `utils/claude-helpers.ts` for SDK instantiation | — | Wrapped if needed |
| S3.4 | ✅ in scope (Risk L) | Operator-script gateway policy | OG-7 | Policy documented; gateway accepts `operator:<name>` principals OR bypass flag added |
| S4.1 | ✅ hygiene | Move `analysis/` into `dev_reports/` | — | `analysis/` directory gone |
| S4.2 | ✅ hygiene | `dev_reports/` tracking policy | OG-8 | `.gitignore` reflects policy |
| S4.3 | ✅ hygiene | Triage stale branches (3× claude/* + dev + lean-devcontainer) | OG-9 | Branches archived + deleted OR kept |
| S4.4 | ✅ hygiene | Remove warmup logs from git | — | `git ls-files server/scripts/warmup*.log` empty |
| S4.5 | ✅ hygiene | Move top-level marketing/business docs to `docs/` | OG-10 | All files moved; CLAUDE.md + README.md + AGENTS.md stay at root |
| S4.6 | ✅ hygiene | Reconcile `mcp-servers/` with CLAUDE.md claims | — | Reality matches doc |
| S5 | ✅ in scope | CI grep guards G1–G7 | — | Synthetic regression PR fails CI |

---

## Original phase tasks (preserved with refreshed DoD)

### Phase 0 — Stop the bleeding (post-cleanup)

| ID | In scope? | Task | DoD (refreshed numbers) |
|---|---|---|---|
| 6 | ✅ Risk #2 | P0.1 Wire Sentry (server + browser) | Sentry receives manually-thrown error within 30s; `unhandledRejection` + `uncaughtException` captured |
| 7 | ✅ Risk #2 | P0.2 Request-id hook + replace 96 `console.*` with logger | `grep -rE "console\\.(log\|error\|warn)" server/src \| grep -v __tests__ \| wc -l` = 0 outside `config.ts` |
| 8 | ✅ done on cleanup branch | ~~P0.3 Per-user daily LLM cost ceiling~~ | Shipped on `analysis-and-cleanup` (`feat: api/llm rate limiting`). Followed by S3.x. |
| 9 | ✅ Risk A | P0.4 JWT to httpOnly cookie + refresh rotation + CSRF + `tokenVersion` + fix `/schedules/*` no-auth | JWT not visible to JS; refresh works; password change bumps tokenVersion |

### Phase 1 — DB indexes + typed rows

| ID | In scope? | Task | DoD (refreshed numbers) |
|---|---|---|---|
| 10 | ✅ Risk #1 | P1.1 Add missing SQLite indexes (recount from 51 baseline) | `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` for top-10 hot queries; >5× improvement on top-3 |
| 11 | ✅ Risk #3 | P1.2 Type DB rows; remove 78 production `as any` | `grep -rE "\\bas any\\b" server/src \| grep -v __tests__ \| wc -l` = 0 |

### Phase 2 — Postgres + Drizzle migration

(All P2.x preserved unchanged. Effort estimate stretched because 71 tables not 40; see `19_05/Database_migration_strat.md`.)

| ID | Task |
|---|---|
| 12 | P2.1 Adopt Drizzle ORM (one route as proof) |
| 13 | P2.2 Stand up managed Postgres + pool |
| 14 | P2.3 Migrate all routes to Drizzle (flagged) |
| 15 | P2.4 Data migration script + dual-run + cutover |
| 16 | P2.5 Adopt Drizzle Kit migrations; retire `addColumn` shim |

### Phase 3 — Job queue out of API process

| ID | Task |
|---|---|
| 17 | P3.1 Replace cron with BullMQ/pg-boss (Risk B / J — promote to P1 if cadence keeps rising) |
| 18 | P3.2 DLQ + Sentry/Slack alerts |

### Phase 4 — External-API resilience

| ID | Task |
|---|---|
| 19 | P4.1 Retry + circuit breaker in `safeFetch` |
| 20 | P4.2 Idempotency keys (Stripe/Razorpay/Resend/n8n) |
| 21 | P4.3 Provider-tagged Sentry + health dashboard |

### Phase 5 — Decomposition (out of scope)

| ID | Task | LOC today |
|---|---|---:|
| 22 | P5.1 Decompose `server/src/index.ts` | 1,326 |
| 23 | P5.2 Split `creative-engine.ts` + `ai.ts` | 1,641 + 1,379 |
| 24 | P5.3 Split landing/dashboard/pitch-deck components | 1,920 / 1,244 / 1,214 |
| **NEW H1** | Decompose `competitor-creative-intel.ts` (Risk H, decisive) | 2,614 |
| **NEW H2** | Decompose `operator-experience.ts` | 2,788 |
| **NEW H3** | Decompose `comment-mining-agent.ts` | 1,818 |

---

## Counts at a glance

| Metric | 2026-04-26 | 2026-05-19 |
|---|---:|---:|
| Tasks total | 20 | **20 + 19 new S-prefix = 39** (cleanup-only added) |
| In-scope | 12 | **20** (cleanup prefix all in scope) |
| Out of scope | 8 (P5 + risks A/B/C/E/F/G) | **6** (P5 + Risks B/C/M; Risks A and E are now fully in scope) |

---

**End of refresh.**
