# Cosmisk Codebase Audit — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/audit.md` (2026-04-26 @ `69b4352`)
**Baseline:** `analysis-and-cleanup` @ `ebff657` (post-merge)
**Graph:** 376 files / 11,209 nodes / 84,530 edges / 1,958 IMPORTS_FROM edges (rebuilt 2026-05-19T19:52)

> Refresh of the original three-risk audit with post-merge counts and one new fatal finding (the build is broken). The original three risks are still in scope; their numbers have all moved.

---

## Headline change since 2026-04-26

**The codebase no longer compiles.** Fifteen TypeScript files import 25 non-existent modules (full list in `19_05/new_and_added_risks.md` § N). This was masked by `dist/` and `server/dist/` being pre-built on 2026-05-03 from an older tree. **No quantitative finding below is reachable via `tsc` until this is resolved.**

---

## Risk 1 — Database performance (still confirmed, worse in shape)

| Metric | 2026-04-26 audit | 2026-05-19 reality | Delta |
|---|---:|---:|---:|
| Tables in `schema.ts` | 35 | **60** | +25 |
| Tables outside `schema.ts` (lazy / scripts) | 5 | **11** | +6 |
| Total unique tables in the system | 40 | **71** | +31 |
| Source locations for `CREATE TABLE` | 3 | **6** | +3 |
| Secondary indexes in `schema.ts` | ~17 | **51** | +34 |
| `ensureColumn` ALTER calls | (not enumerated) | **19** | n/a |
| `shopify_tokens` defined twice (`schema.ts` AND `add-shopify-tables.ts`) | n/a | **Yes** | new risk K |

**New tables outside `schema.ts`:** `client_contexts` (services/client-context.ts), `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions` (all four in services/strategic-memory.ts), `scheduled_audits` (services/audit-scheduler.ts), `waitlist_leads` (index.ts), `brands`, `brand_context`, `audits` (in `server/scripts/add-audit-tables.ts`).

**Verdict.** Risk 1 stands. The pain shape (single connection, write serialisation, no horizontal scaling) is identical. The blast radius is larger because there are more tables and more lazy-init sources to consolidate before Postgres adoption.

---

## Risk 2 — System visibility (still confirmed, ratios worse)

| Metric | 2026-04-26 audit | 2026-05-19 reality | Delta |
|---|---:|---:|---:|
| `console.log/warn/error/info/debug` in production code | 85 | **96** | +11 |
| `logger.{info,warn,error,debug}` in production code | 116 | **539** | +423 |
| Try/catch blocks (original count) | 108 → corrected to 222 | not re-measured (regex match shape changed) | n/a |
| Sentry wiring | none | **none** | unchanged |
| Request-id Fastify hook | none | **none** | unchanged |
| `unhandledRejection` / `uncaughtException` handlers | none | **none** | unchanged |
| Cron schedule sites inside API process | (8 cited) | **13** | +5 |

**Why `logger.*` jumped 4.6×.** The new analyst services adopted the shared pino logger from day one. `ad-watchdog.ts` alone contributes ~80 logger calls. **`console.*` did not drop in parallel** because the audit pipeline still uses console; see `19_05/structured_logging.md` for the per-file breakdown.

**Verdict.** Risk 2 stands. The migration plan in `structured_logging.md` is the right shape but operates on stale counts.

---

## Risk 3 — Code stability (type safety — counts revised)

| Metric | 2026-04-26 audit | 2026-05-19 reality | Delta |
|---|---:|---:|---:|
| `as any` in production code (excl. `__tests__`) | ~35 | **78** | +43 |
| `as any` in tests | ~53 | not re-measured (counting drift) | n/a |
| `as any` total | 104 | not re-measured | n/a |
| TS `strict: true` | on | **on** | unchanged |
| Zod usages | 229 | not re-measured | n/a |

The 2.2× jump in production casts comes from the new analyst services bypassing the typed-row pattern. None of `competitor-creative-intel.ts`, `oos-detector.ts`, `cohort-ltv-analyzer.ts`, `service-clients.ts`, or `discount-leakage-detector.ts` declared explicit DB-row interfaces.

**Verdict.** Risk 3 stands and is materially larger.

---

## What's still healthy (verified post-merge)

- Fastify security plugins (`cors`, `helmet`, `rate-limit`, `jwt`) still registered.
- Per-route rate limits on `/auth/*` still in place.
- Razorpay webhook HMAC signature verification unchanged.
- Production refuses to start with default `JWT_SECRET` / `tokenEncryptionKey` (`config.ts` boot guard).
- Dynamic SQL fragments in `routes/content.ts` and `routes/billing.ts` still use whitelisted columns — no SQLi risk introduced.
- Strict TS still on.
- 35 server `vitest` files (up from 26) + 38 frontend `*.spec.ts` files.
- CI workflow present at `.github/workflows/ci.yml` (not re-audited).

---

## New finding N — Build broken (CRITICAL, supersedes Risk priority order)

`server/src/index.ts` and 14 other files import 25 modules that do not exist anywhere in the working tree. Until they are resolved, every metric in this report relies on grep, not on TypeScript's understanding. See `19_05/new_and_added_risks.md` § N for the full inventory; `19_05/cleanup_suggestions.md` S1 for the remediation steps.

---

**End of refresh.**
