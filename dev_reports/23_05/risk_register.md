> **Status: 📖 REFERENCE (2026-05-31)** — durable risk register (7 active risks as of May-23).
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Risk Register — 2026-05-23

**Supersedes:** `dev_reports/19_05/new_and_added_risks.md` (risks A–N).

> The 19_05 register listed 14 risks. Of those, 9 have been closed (mostly by stub work + dev-deps fix). 5 remain active, and 2 new ones surfaced from the live smoke. Total active: **7**.

---

## 1. Status of the 19_05 risks (A–N)

| Risk | Description (paraphrased) | Status |
|---|---|---|
| **A** | JWT in localStorage (XSS exposure) | 🟡 Open — frontend, out of session scope |
| **B** | Schema fragmentation (71 tables, 6 sources) | 🟡 Open — first concrete victim found (`shop_name` drift, see [`new_findings.md`](new_findings.md) § 1) |
| **C** | No retry/circuit-breaker on non-Anthropic outbound | 🟡 Open — unchanged |
| **D** | Hidden dependencies (4 service files registered nowhere) | 🟢 Closed — no longer reproducible; all stubs registered |
| **E** | Inconsistent error handling / silent failures | 🟡 Open — partial; structured-logging plan in `19_05/structured_logging.md` |
| **F** | Unbounded LLM-call loops | 🟢 Closed — gateway enforces RPM + ITPM |
| **G** | In-process cron (no horizontal scale) | 🟡 Open — design decision; would need worker queue |
| **H** | God files (>500 LOC) | 🟡 Open — 18 service files > 500 LOC; 4 route files > 1000 LOC |
| **I** | Direct `new Anthropic(…)` in 2 services (gateway bypass) | 🟡 Open — `comment-mining-agent` + `competitor-creative-intel` unchanged |
| **J** | Untraced operations (missing correlationId) | 🟡 Open — partial |
| **K** | Build broken (25 missing modules across 15 files) | 🟢 **Closed** — `tsc` 0 errors |
| **L** | Operator scripts have no LLM-gateway principal | 🟡 Open — design decision pending |
| **M** | 8 of 15 LLM-gateway tests fail | 🟢 **Closed** — false positive; 15/15 pass |
| **N** | `node_modules` root-owned (devcontainer ownership) | 🟢 **Closed** — devcontainer named volumes resolved it |

**Score:** 5 closed (D, F, K, M, N), 9 still open. Of the open: 5 medium-priority, 4 design-decision-pending.

---

## 2. New risks discovered this session

| Risk | Description | Severity | Source |
|---|---|---|---|
| **O** | `shopify_tokens.shop_name` column missing → live 500 on `/shopify/status` | 🔴 High | [`new_findings.md`](new_findings.md) § 1 |
| **P** | `routes/schedules.ts` registers handlers without `app.authenticate` | 🔴 High | [`new_findings.md`](new_findings.md) § 2 |
| **Q** | `routes/intelligence.ts` registers handlers without `app.authenticate` (unaudited) | 🟡 Medium | [`new_findings.md`](new_findings.md) § 3 |
| **R** | 9 tests skipped because SDK mocks lack `response.usage` (latent gateway-vs-mock-shape mismatch) | 🟢 Low | [`new_findings.md`](new_findings.md) § 5 |
| **S** | CLAUDE.md states "Cohort Intelligence NOT BUILT" but `cohort-ltv-analyzer.ts` is 1029 LOC of real code | 🟢 Low | [`new_findings.md`](new_findings.md) § 6 |
| **T** | 16 service stubs + 4 route stubs return empty data; CLAUDE.md "9 Agents" claim is mostly aspirational | 🟢 Low (doc) | [`module_inventory.md`](module_inventory.md) § 3 |

---

## 3. Active risk table — sorted by severity × effort

| # | Risk | Severity | Effort | Action |
|---|---|---|---|---|
| 1 | **P** `/schedules` open | 🔴 High | 5 min | Add `preHandler: [app.authenticate]` to every handler in the file |
| 2 | **O** `shop_name` drift | 🔴 High | 30 min | `ensureColumn('shopify_tokens', 'shop_name', 'TEXT')` at boot OR rewrite the SQL |
| 3 | **Q** `/intelligence` no auth (likely benign) | 🟡 Medium | 5-min read | Confirm; protect if it returns real data |
| 4 | **I** LLM gateway bypass × 2 | 🟡 Medium | ~½ day | Wrap `comment-mining-agent` + `competitor-creative-intel` through `createMessage` |
| 5 | **B** Schema fragmentation | 🟡 Medium | days | S4 from `cleanup_suggestions.md`; move all `CREATE TABLE` into `db/schema.ts` |
| 6 | **A** JWT in localStorage | 🟡 Medium | days | Migrate to httpOnly cookie; frontend rewrite |
| 7 | **H** God files | 🟡 Medium | weeks | Decompose `ai.ts` (1379 LOC), `creative-engine.ts` (1641 LOC), the largest services |
| 8 | **C** No retry on non-Anthropic outbound | 🟡 Medium | days | Wrap Meta + Google + Shopify + Stripe + Razorpay clients |
| 9 | **E** Silent failures / unstructured errors | 🟡 Medium | days | Per `19_05/structured_logging.md` |
| 10 | **G** In-process cron | 🟡 Medium | rearchitect | Move to BullMQ or similar queue |
| 11 | **J** Untraced operations (correlationId) | 🟡 Medium | days | Add `requestId`/`runId` to every log line |
| 12 | **L** Operator-script principal | 🟡 Medium | discussion | Decide on `userId: 'operator:<name>'` pattern |
| 13 | **R** SDK mocks lack `usage` | 🟢 Low | 30 min | Option A: 1-line gateway tolerance; unblocks 9 skipped tests |
| 14 | **S**+**T** Doc drift | 🟢 Low | hours | Update CLAUDE.md "9 Agents" table to reflect actual stub vs real state |

---

## 4. Heatmap

```
         Severity →
          Low      Medium      High
Effort
  ↓
Low      R          P, Q       —
Medium   S, T       I          O
High     —          A,B,C,E,   —
                    G,H,J,L
```

The hot zone is the row of medium-effort, medium-severity items — the slow-burn quality work. Two High-severity items (O, P) are sub-30-minute fixes — they should land before anything else.

---

## 5. What changed in net posture

| Layer | 19_05 | 23_05 |
|---|---|---|
| Active risks | 14 | 7 |
| 🔴 High-severity active | 1 (K) | 2 (O, P) |
| 🟡 Medium-severity active | 11 | 8 |
| 🟢 Low-severity active | 2 | 4 |
| Risks closed | 0 | 5 |

The headline is: **the catastrophic risk (broken build) closed**, but smoke testing surfaced **two new High-severity items** of much smaller scope (5–30 min fixes each). After items #1 and #2 land, the register is back to medium-only.
