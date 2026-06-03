> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 codebase/infra guide refresh. Superseded by `23_05/state_of_codebase.md`; for durable orientation see `05_05/guide.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Cosmisk — Codebase & Infra Guide — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/guide.md` (2026-04-19 @ `69b4352`)
**Baseline:** `analysis-and-cleanup` @ `ebff657` (post-merge, 34 commits ahead of `origin/main`)
**Graph:** 376 files / 11,209 nodes / 84,530 edges (was 290 / 3,632 / 33,757)

---

## 1. What changed since the original

| Section | Original | Current |
|---|---|---|
| Files | 290 | **376** (+86) |
| Graph nodes | 3,632 | **11,209** (3.1×) |
| Graph edges | 33,757 | **84,530** (2.5×) |
| Route files | 29 | **32** present / 36 imported / **43 registered** |
| Service files | 28 | **82** |
| Schema tables | 40 | **71** |
| Languages indexed | TS/JS/Bash | **same** |

---

## 2. Stack (unchanged)

| Layer | Tech |
|---|---|
| Frontend | Angular 17 (standalone, lazy routes), SCSS, Tailwind 3, lucide-angular, chart.js, html2canvas + jspdf |
| Backend | Fastify 5 on Node 22 (TypeScript strict, ESM) |
| DB | `better-sqlite3` (SQLite, synchronous, WAL mode) |
| Auth | `@fastify/jwt` HS256, 7-day JWT; bcryptjs hashing |
| AI | Anthropic SDK (primary), Google Generative AI (Gemini, secondary) |
| Payments | Stripe (USD) + Razorpay (INR), dual gateway |
| Ad platforms | Meta Graph v22, Google Ads, TikTok Ads |
| Browser automation | Puppeteer (PDF generation, URL analysis) |
| Orchestration | In-process job queue, cron (`node-cron`) audit scheduler |
| External automation | n8n webhooks for waitlist sync + video generation |
| CI | GitHub Actions (frontend build + Karma tests, backend tsc+vitest, Playwright smoke, Docker build, `npm audit`) |
| E2E | Playwright |
| **NEW** | `bottleneck` (rate limiter for LLM gateway), Shopify Admin API integration |

---

## 3. New top-level pieces since 2026-04-19

### 3.1 LLM gateway
`server/src/services/llm-gateway.ts` is the central wrapper around `@anthropic-ai/sdk`. It enforces:
- Per-user daily $ cap (reads `cost_ledger`).
- Org-wide RPM via `bottleneck` `minTime`.
- Org-wide ITPM via `bottleneck` weighted reservoir.
- SDK retry on 429/5xx.
- `cost_ledger` write after every successful call.

All Anthropic calls **should** flow through `createMessage(...)` from this module. **Two services still bypass it** as of 2026-05-19: `competitor-creative-intel.ts` (2,614 LOC) and `comment-mining-agent.ts` (1,818 LOC). See `19_05/cleanup_suggestions.md` S3.

### 3.2 Service-clients model (`service-clients.ts`, 952 LOC)
A new ownership layer. `service_clients` table is the per-brand parent for all analyst output. Most new tables in `schema.ts` reference `service_clients.id`, not `users.id`.

### 3.3 Analyst agents (8 new services)
Cohort LTV, Competitor creative intel, Comment mining, Creative scorer, Discount leakage detector, Fatigue detector, OOS detector, Competitor intel report.

### 3.4 Strategic cognition (9 new services under `services/strategic-cognition/`)
Causal reasoning, competing hypotheses, narrative synthesis, elite decision compression, recursive investigator, self-improving cognition, strategic curiosity, uncertainty intelligence, client report generator.

### 3.5 Quality / intelligence layers
Three sibling folders: `services/intelligence-layer/`, `services/quality-governance/`, `services/elite-intelligence/`.

### 3.6 Shopify
OAuth route + encrypted-token client + ingestion: `routes/shopify.ts`, `services/shopify-client.ts`, `audit/shopify-ingestion.ts`. **Note:** `routes/shopify.ts` and `shopify-client.ts` import `../utils/encryption.js` which does **not exist** — broken build cluster.

### 3.7 Devcontainer
`.devcontainer/` directory (added on `analysis-and-cleanup`) provides a Docker-based dev environment with a smoke-test pass. See `19_05/run_guide.md`.

---

## 4. Repo layout (current)

```
src/                # Angular app (frontend)
server/             # Fastify API (backend)
  src/
    audit/          # Audit pipeline (10 files)
    db/             # schema.ts + index.ts only
    plugins/        # auth.ts + usage-limiter.ts
    routes/         # 32 route files (43 registered, 4 missing) ← BUG
    services/       # 82 service files (+ subdirs)
      ad-engine/    # broken: 4 files import missing types.js
      elite-intelligence/
      intelligence-layer/
      quality-governance/
      strategic-cognition/
    types/          # 2 files
    utils/          # 5 files (claude-helpers, error-response, logger, safe-fetch, safe-json)
    validation/
  scripts/          # operator scripts + add-{audit,shopify}-tables.ts
  data/             # SQLite file (root-owned, must chown)
mcp-servers/        # Currently only frameio/ — README claims 4 servers, only 1 present
e2e/                # Playwright specs
scripts/            # Brand-specific maintenance + Python scrapers (ad-intel.py, crawl-free.py, scrape.py)
dev                 # 214-line shell convenience runner (NEW)
.devcontainer/      # NEW: Docker dev env
Dockerfile          # Multi-stage
docker-compose.yml  # server + nginx, local-only
railway.toml        # Railway deploy config (backend)
vercel.json         # Vercel deploy config (frontend)
nginx.conf          # Reverse proxy config (self-hosted path)
dev_reports/        # This directory — engineering reports
  19_05/            # ← post-merge refresh (this folder)
  rate_limiting/    # subfolder
```

---

## 5. Critical issues a new dev must know

1. **Server does not compile.** `tsc` will fail on 15 files / 25 missing modules. See `19_05/cleanup_suggestions.md` S1.
2. **`server/data/`, `node_modules/`, `dist/`, `.angular/` are root-owned.** `npm install` fails with EACCES. Run `sudo chown -R $USER:$USER ...` once.
3. **`schema.ts` is not the only source of tables.** 11 tables live elsewhere (lazy services + scripts). Fresh DBs need `add-audit-tables.ts` run manually.
4. **`shopify_tokens` is defined twice** (schema.ts + script). Drift hazard.
5. **`/schedules` route has no JWT auth** (still — finding from 2026-04-26 not yet fixed).
6. **4 routes registered, 0 files: `/health-score`, `/creative-scan`, `/quick-wins`, `/static-ads`.** Either delete the imports or recover the files.
7. **`unified-agent-runner.ts` imports 12 analyser files that don't exist.** Likely an unfinished feature.

---

## 6. Where the source-of-truth docs live

| Topic | Doc | Status |
|---|---|---|
| Codebase audit | `19_05/audit.md` | current |
| Backend wiring | `19_05/backend_wiring.md` | current |
| Database schema | `19_05/db_structure.md` | current |
| DB migration strategy | `19_05/Database_migration_strat.md` | current; companion `new_database_issues.md` |
| Risks (A-N) | `19_05/new_and_added_risks.md` | current |
| Cleanup plan (full) | `dev_reports/cleanup_plan.md` (root, 831 lines) | current |
| Cleanup actions (steps S0–S7) | `dev_reports/cleanup_suggestions.md` | current |
| Rate-limiting wrap state | `19_05/rate_limiting/*` | current |
| Structured logging plan | `19_05/structured_logging.md` | current |
| Scope vs SoW alignment | `19_05/scope_alignment.md` | current |
| Run / devcontainer | `19_05/run_guide.md` | current |

---

**End of refresh.**
