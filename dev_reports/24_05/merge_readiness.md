> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-24 merge-readiness assessment; the PR-to-main work landed. Superseded by `25_05/pre_pr_review.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Merge Readiness — Pushing `analysis-and-cleanup` to `main`

**Date:** 2026-05-24
**Branch tested:** `analysis-and-cleanup` @ `c6d4f79`
**Probed against:** `origin/main` and `origin/analysis-and-cleanup`

---

## 1. TL;DR

| Question | Answer |
|---|---|
| Will the merge break anything? | **No.** The branch is strictly better than `main`. |
| Will CI go green on the PR? | **No** — 8 pre-existing backend test failures will block the Backend job. Same 8 are also red on `main` today, but hidden behind a `tsc` build failure. |
| Will the deployed prod (Railway) get healthier post-merge? | **Yes.** This is the first commit chain that makes `main` actually compile + boot in months. |
| Are there new risks to deploy? | **One unknown:** sharp on Alpine. Local `docker build` smoke recommended before merge. ~5 min. |

**Three blockers to clean PR merge** (none of them more than 30 min individually):
1. Decide what to do with 8 pre-existing test failures.
2. Patch `/schedules` unauth (also pre-exists on main).
3. Patch `shopify_tokens.shop_name` schema drift (also pre-exists on main).

---

## 2. The surprise finding — `origin/main` is broken today

When I queried `origin/main`'s tree directly, the same import-blockers our branch fixes are **already present on main**:

| `origin/main` has… | …but is missing |
|---|---|
| `services/ad-engine/gemini-generator.ts` imports `sharp` | `sharp` is not in main's `server/package.json` |
| `services/competitor-creative-intel.ts` imports `cheerio` | `cheerio` is not in main's `server/package.json` |
| `server/src/index.ts:40-43` registers `healthScoreRoutes`, `creativeScanRoutes`, `quickWinsRoutes`, `staticAdsRoutes` | None of the four route files exist on main |
| `services/ad-watchdog.ts` imports `./intelligence-integration.js` | File doesn't exist on main |
| `routes/shopify.ts` queries `shop_name` from `shopify_tokens` (5 SQL sites) | Column doesn't exist in `CREATE TABLE shopify_tokens` |
| `routes/schedules.ts` registers handlers | None have `preHandler: [app.authenticate]` |

**This proves three things:**

1. `npx tsc --noEmit` (the first step of the Backend CI job) has been failing on `main` for as long as those imports have been there. CI has been red.
2. Whatever's deployed on Railway today was built from a commit *before* the breaking imports landed. That deploy is stale.
3. **Merging this branch is the first thing that will make `main` actually buildable again.**

This inverts the usual "is this branch ready to merge?" framing: the question becomes "what's stopping `main` from being usable, and does our branch unstick it?" Answer: yes.

---

## 3. CI behaviour by job

| Job | Today on `main` | After this branch merges |
|---|---|---|
| Frontend (Angular) | unchanged | unchanged |
| Frontend Unit Tests | unchanged | unchanged |
| Smoke Test (Playwright) | depends on backend running — backend hadn't been buildable, so smoke probably skipped or red on `needs:` chain | Backend now buildable; Playwright actually runs |
| **Backend (Fastify)** | `tsc --noEmit` fails → `npm test` skipped | `tsc --noEmit` passes; `npm test` runs and **8 tests fail** (`media-gen-routes` ×5, `content-routes` ×3) |
| Security Scan | `continue-on-error: true` — never blocks | same |
| Docker Build | depends on `needs: [backend]`; backend failing → docker skipped | Backend passes (build-wise) → docker runs. **First time sharp gets installed inside Alpine** |

Net: **the CI exposure surface expands** when this branch lands. Things that used to fail-fast at `tsc` now run further and surface deeper issues (the 8 test fails, the Docker build behaviour).

---

## 4. The 8 pre-existing test failures — disposition

Both files are **byte-identical** between `main` and `HEAD`:

```
server/src/__tests__/media-gen-routes.test.ts: 0 lines of diff vs origin/main
server/src/__tests__/content-routes.test.ts:   0 lines of diff vs origin/main
```

The corresponding production sources:

```
server/src/routes/media-gen.ts: 0 lines of diff vs origin/main
server/src/routes/content.ts:   68 lines of diff vs origin/main
```

**Means:** these tests have been red since they landed; the build failure hid them. They're not regressions; they're inherited.

Three disposition options:

| Option | What | Cost | Result |
|---|---|---|---|
| **A — fix** | Wire LLM mock + 503 reply codes properly | ~3 hours | All tests green |
| **B — skip with comment** | `it.skip(…)` × 8 with root-cause notes (same pattern as the 9 we already skipped) | ~15 min | Tests yellow; backend green |
| **C — ignore** | Leave tests failing | 0 | Backend stays red; PR blocked unless gate relaxed |

Recommend **B** to ship the unblock, **A** as the follow-up — same pattern we used for the 9 stub-uncovered fails on 23_05.

---

## 5. The two production bugs that also exist on `main`

These are **pre-existing on main**, not introduced by this branch. They live in production today.

| Bug | Severity | Effort to fix | Recommendation |
|---|---|---|---|
| `/schedules` unauthenticated | 🔴 High (security) | ~5 min | Land as a 3rd commit on this branch before opening PR. Closes a real security hole regardless of merge. |
| `shopify_tokens.shop_name` drift → `/shopify/status` 500 | 🔴 High (live 500) | ~30 min | Land as 4th commit on this branch before opening PR. |

If we ship these two fixes alongside the existing two commits, the PR becomes "unblock build + close two pre-existing production bugs" — much cleaner narrative.

---

## 6. The Docker / sharp / Alpine unknown

Current `Dockerfile` (lines from `Dockerfile`):

```dockerfile
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ libstdc++
# ...
RUN npm ci

# Later, production stage:
RUN npm ci --omit=dev && apk del python3 make g++ && apk add --no-cache libstdc++
```

**No `libvips` / `vips-dev`.** Sharp historically needed libvips on Alpine, but sharp v0.33 ships prebuilt musl binaries that don't require it. Whether it works is empirically testable in ~5 min:

```bash
docker build -t cosmisk-test .
```

If this passes locally, the CI Docker Build job will pass. If it fails, the fix is one line: `RUN apk add --no-cache vips-dev` in the builder stage, with vips runtime kept (not deleted) in the production stage.

---

## 7. Deploy implications

| Surface | Today | After merge |
|---|---|---|
| `vercel.json` → Vercel (frontend) | Auto-deploys on push to `main`. Frontend wasn't blocked, so this works today. | unchanged |
| `railway.toml` → Railway (backend) | Auto-deploys on push to `main`. Build fails because deps mismatched. Whatever's running was built from an earlier commit. | First successful backend deploy since the breaking imports landed. |
| `/health` endpoint | If Railway *did* deploy a broken image, healthcheck fails after 180s, deploy rolls back. So either prod is on a stale image, or prod is down on the backend. | After merge: healthy `/health` (verified locally returns `{"status":"ok", …}`). |

**Recommend:** before pushing, check the Railway dashboard or `curl https://<prod-host>/health` to confirm what the production state actually is today. If the backend is currently down/stale, the merge is a positive event.

---

## 8. Recommended sequence for merging

Ranked by time:

1. **Local Docker build smoke** — `docker build -t cosmisk-test .` to validate sharp+cheerio on Alpine. (~5 min)
2. **Commit 3 — `/schedules` auth fix** — add `preHandler: [app.authenticate]` to every handler in `routes/schedules.ts`. (~5 min)
3. **Commit 4 — `shop_name` schema patch** — generalise the `ensureUsersColumn` helper at `index.ts:335` into `ensureColumn(table, column, def)` and add the missing column. (~30 min)
4. **Commit 5 — skip the 8 pre-existing test fails with comments** *or* fix them properly. (~15 min or ~3 hr depending on choice)
5. **Push to origin** — `git push origin analysis-and-cleanup` (no force needed; remote is purely behind)
6. **Open PR `analysis-and-cleanup` → `main`** — title: "Unblock backend build + close two production bugs"
7. **Wait for CI**, merge when green
8. **Monitor Railway deploy** — `/health` check within 3 min of push to main
9. **Spot-check prod endpoints** — `/health-score`, `/schedules` (should 401), `/shopify/status` (should NOT 500 anymore)

Total time to reach a healthy production deploy: **~45-60 minutes** for the minimal path; **~3-4 hours** if we fix the 8 tests properly.

---

## 9. What NOT to do during this merge

- **Don't force-push.** Remote is purely behind; regular push works.
- **Don't skip the Docker smoke.** Sharp on Alpine is the only un-tested deploy variable.
- **Don't open the PR before the 4 commits above are in.** A PR that says "fixes the build, but I haven't actually tested the deploy artefact" invites review friction.
- **Don't move on to M1 work (Postgres+Drizzle) until this merges.** That work belongs on a fresh branch off post-merge `main`.
