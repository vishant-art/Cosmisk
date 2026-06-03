> **Status: 📖 REFERENCE (2026-05-31)** — durable record of the decision to sacrifice the old Railway SQLite volume (clean cold-start, no data import).
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Railway Data — Recovery Decision

**Date:** 2026-05-25
**Status:** **DECIDED — sacrifice the data.** Do not pay to reactivate; do not attempt extraction.
**Decided by:** Sanskar (2026-05-25)
**Affects:** all of M1 (the Postgres + Drizzle migration step). No data-import scripts needed; M1 is a clean schema initialisation, not a migration.

---

## 1. TL;DR

The previous Railway deployment used a persistent volume at `/app/data` holding `cosmisk.db` (SQLite). The trial plan expired ~1 month ago. **All data on that volume was test/mock — no real client was ever onboarded to that deployment.** We are not reactivating the account or extracting the file. The new Railway account starts cold.

This removes a substantial item of work from M1 (no data-import step) at the cost of:
- Any test-account history is gone (acceptable).
- Any agent-learned context from test runs is gone (acceptable — it was test data anyway, low-signal).
- The new instance has to re-OAuth every connector when a real client first onboards (mandatory regardless of recovery).

---

## 2. The Railway situation

### Account state (as of 2026-05-25)

| Question | Answer |
|---|---|
| Old account log-in-able? | Yes (dashboard still loads despite billing lock) |
| Old plan | Trial (free) |
| When did trial expire? | ~1 month ago (more than 30 days) |
| Volume mount confirmed | Yes — `/app/data` was a Railway-managed persistent volume |
| Reactivating? | **No.** Moving to a new Railway account entirely. |
| Extraction attempted? | **No, and won't be.** See §3 below. |
| Old volume's fate | Retained on Railway side for some retention window post-cancellation, then wiped. Since we're not reactivating, it will be wiped on Railway's schedule. We have not asked Railway for an extraction window. |

### What the deployed code was

Whatever was running on Railway was built from a commit before the breakage we found yesterday (`tsc --noEmit` fails on current `main` — see `24_05/merge_readiness.md` §2). Best guess: a commit from before mid-May. Could have been running for weeks/months without restarts; the volume accumulated whatever data the cron jobs and the manual test sessions wrote.

### What was actually flowing through it

Per Sanskar (2026-05-25): **no real client.** All data on that volume was test/mock — internal accounts, internal brand entries, internal smoke-tests of the OAuth flows, agent runs against mock product catalogues.

This single fact made the recovery decision trivial.

---

## 3. Recovery decision — sacrifice

### Recovery cost (if we had wanted to do it)

| Step | Effort | Cost |
|---|---|---|
| Reactivate old Railway account with one month of paid plan | 10 min | ~$10-20 |
| `railway link` from local → `railway shell` → `sqlite3 .backup` to `/tmp` | 10 min | $0 |
| `railway run -- cat /tmp/backup.db > local-backup.db` (or scp equivalent) | 5 min | $0 |
| Store backup file in private bucket / encrypted drive | 5 min | $0 (existing storage) |
| Write import script for M1: legacy SQLite → PG+Drizzle | ~half day | $0 (engineering time) |
| Map `shopify_tokens.brand_id → user_id` via `brands.owner_id` join (see `shopify_tokens_fork.md`) | included | $0 |

**Total if we recovered: ~30 min + ~$10 today, ~half day of M1 time.**

### Why we're not doing it

The data isn't worth the half-day. Concretely:

| Tier | Tables | Value if recovered |
|---|---|---|
| A — Hard to recreate | `agent_core_memory`, `agent_episodes`, `agent_entities`, `creative_intelligence_context`, `prediction_accuracy`, `score_predictions`, `operator_behavior`, `operator_feedback` | **Test data has near-zero learning signal.** Agent memory built from mock runs is just noise. |
| B — Tedious to recreate | `service_clients`, `brands`, `brand_context`, `scheduled_audits`, `automations`, `subscriptions`, `team_members`, `users` | Test accounts only — re-entry is trivial. |
| C — Recoverable via re-OAuth | `meta_tokens`, `google_tokens`, `shopify_tokens`, `tiktok_tokens` | **Dead anyway.** Encrypted with old `ENCRYPTION_KEY` / `JWT_SECRET`. New deployment cannot decrypt them. |
| D — Reproducible | `audits`, `reports`, `client_reports`, `competitor_snapshots`, `competitor_movements`, `dna_cache`, `creative_assets`, `creative_jobs`, `comment_mining_reports`, `oos_agent_store`, `discount_agent_store`, `cost_ledger` | All reproducible from a fresh scan; not worth importing. |
| E — Throwaway | `sqlite_sequence`, `activity_log`, `password_reset_tokens`, `team_invitations`, `url_analysis_cache` | Transient bookkeeping. Doesn't matter. |

Tier A is what would justify retrieval *if* it held real-client signal. It doesn't.

---

## 4. What we're explicitly accepting

By choosing not to recover, we accept:

1. **Test history is gone.** Anything we logged during smoke-testing on the deployed instance is unrecoverable. Has not been needed in the last 30 days; unlikely to be needed now.
2. **Encryption-key continuity is broken.** Even if a future reader wanted to inspect the old DB (e.g., for a postmortem), the OAuth tokens are encrypted and the key is the old Railway instance's env var, which we will not retain.
3. **No "migration log" for what was on the previous deployment.** If someone in three months asks "what did we test with on the trial?", we won't have a tabular answer beyond what's in git history and `dev_reports/`.
4. **Schema fork on local dev DB remains.** Local dev DB has the legacy `brand_id`-keyed `shopify_tokens`. Production volume probably did too. Both are sacrificed when M1 runs because Drizzle initialises fresh from canonical schema. See [`shopify_tokens_fork.md`](shopify_tokens_fork.md).

We are NOT accepting any compliance/legal risk — no PII, no real PSP credentials, no real client OAuth on that volume.

---

## 5. Implication for M1 (Postgres + Drizzle migration)

The 24_05/next_steps.md plan for Tier 1.5a had this sub-step:

> "Migration script: SQLite → Postgres data dump + restore | ~half day"

**Drop that sub-step entirely.** M1 is now a *cold-start* migration:

| M1 sub-step | Status change |
|---|---|
| Provision Postgres (Neon free / Railway-managed) | Unchanged |
| Design canonical schema | Unchanged — but use `shopify_tokens` canonical shape (`user_id`-keyed, has `shop_name`). |
| Define every table in Drizzle | Unchanged — 71 tables. |
| Generate + run initial migration | Unchanged |
| ~~SQLite → Postgres data dump + restore~~ | **REMOVED — no source data.** |
| Update `db/index.ts` to open Postgres | Unchanged |
| Replace `db.prepare(...)` call sites with Drizzle queries | Unchanged — ~30 sites. |
| **NEW: Patch the two `brand_id`-keyed readers** (`cohort-ltv-analyzer.ts:184`, `unified-agent-runner.ts:178`) to canonical shape | New — see `shopify_tokens_fork.md` §7. |
| Test parity — every passing test still passes | Unchanged |
| **NEW: Seed mock service_clients / brands for dev smoke** | New — small (~30 min). Replaces the import-test-data step. |

**Net effect on M1 effort:** roughly cancels out. We lose half a day on data import and gain half a day on the `brand_id` reader patches + dev seed. Critical path is unchanged.

---

## 6. Implication for re-onboarding clients (future)

Independent of this decision, **any real client that connects to the new deployment will OAuth from scratch.** That was already going to be true (different encryption key, different DB host). What we're losing here is only test-flow OAuth — none of which was a real client integration. Net new onboarding flow:

1. Client signs up on `new-railway-instance.up.railway.app/scan/`.
2. Authorises Meta via OAuth callback (`/auth/meta/callback`).
3. Authorises Shopify via OAuth callback (`/auth/shopify/callback`).
4. New row in `meta_tokens` / `shopify_tokens` keyed by `user_id`.
5. Cron picks up the new token on next run.

Same flow as a brand-new install on any new infrastructure. No special handling required.

---

## 7. Cutover plan

### Today (2026-05-25)

- [x] Decision recorded in this doc.
- [ ] M1 plan (`next_steps.md`) updated to reflect no data import.
- [ ] Continue Tier 1 commits (4 → 5 → 6) on this branch.

### When M1 starts (likely 2026-05-26 after PR merges)

- [ ] Provision new Railway project on new account.
- [ ] Add Postgres add-on (Railway-managed) OR provision external Neon.
- [ ] Generate fresh `ENCRYPTION_KEY` and `JWT_SECRET`; store in Railway env.
- [ ] Configure `DATABASE_URL` env to point at new PG.
- [ ] Confirm new persistent volume at `/app/data` is mounted on the new account too — needed for any non-DB writes (`creative_assets/`, image uploads, etc.).
- [ ] Run Drizzle initial migration on cold PG. Verify 71 tables created.
- [ ] Smoke test `/health`. Smoke test a Meta OAuth round-trip.
- [ ] First deploy is the M1 milestone close.

### Beyond M1

No follow-up tasks associated with the sacrifice decision. The old Railway project will eventually be deleted by Railway on their retention timeline; we don't need to do anything to make that happen.

---

## 8. Reversal clause

If at any point in the next ~14 days someone realises real data DID live on that volume (e.g., a forgotten staging client), the decision is reversible **only while the old Railway account is still log-in-able and the volume hasn't been wiped on their side**. Railway's retention windows for trial volumes are not documented publicly; treat the data as "could be wiped at any time after today."

If reversal is needed: follow the recovery cost table in §3 within 48 hours of realisation. After that, assume gone.

---

## 9. Related docs

- [`shopify_tokens_fork.md`](shopify_tokens_fork.md) — the technical fork that motivated checking the Railway volume in the first place.
- [`next_steps.md`](next_steps.md) — the renumbered Tier 1 plan that reflects this decision.
- [`../24_05/next_steps.md`](../24_05/next_steps.md) — predecessor plan, superseded.
- [`../24_05/priority_db_vs_cleanup.md`](../24_05/priority_db_vs_cleanup.md) — earlier decision to prioritise DB; reinforced by this sacrifice (cold-start PG is easier than migrating).
