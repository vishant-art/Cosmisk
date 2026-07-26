> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 run-guide refresh tied to the build-broken devcontainer state. Superseded by `05_05/run_guide.md` for durable setup steps.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk — Local Run Guide — Refresh (2026-05-19/20)

## Unique essence preserved
- This refresh documents a build-BROKEN devcontainer state; durable setup/run steps live in `05_05/run_guide.md`. Supersedes the older 2026-05-03 `dev_reports/run_guide.md`.
- **Blocker 1:** `server/data/`, `server/node_modules/`, `node_modules/`, `.angular/`, `dist/`, `server/dist` owned by **root** (a devcontainer ran as root once). Fix: `sudo chown -R $USER:$USER server/data server/node_modules node_modules .angular dist server/dist`.
- **Blocker 2:** `npm install` fails `EACCES` because of Blocker 1. Fix Blocker 1 first, then `npm --prefix server ci && npm ci`.
- **Blocker 3:** Even after 1+2, `tsc` fails — **15 files reference 25 missing modules**. Fix in `cleanup_suggestions.md` S1; canonical missing-module list in `19_05/new_and_added_risks.md` §N (Risk N).
- Until 1–3 are fixed the server **cannot boot deterministically**. Pre-built `server/dist/` from 2026-05-03 may run but does not reflect post-merge code.
- `./dev` = 214-line orchestrator added on cleanup branch; flags not all documented — inspect before use.
- Bootstrap scripts still required for a fresh DB until schema consolidated (cleanup S2): `tsx server/scripts/add-audit-tables.ts` (creates brands, brand_context, audits) and `tsx server/scripts/add-shopify-tables.ts` (creates shopify_tokens — **duplicate of schema.ts, known issue**). Skipping → `no such table: brands`.
- OAuth per-route docs (Meta/Google/TikTok/Shopify) in `19_05/backend_wiring.md`.

## Pointer
- SUPERSEDED -> see: `05_05/run_guide.md` (durable setup/run steps)
