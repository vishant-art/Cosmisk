# ai-layer v2 Integration — Execution Log

**Started:** 2026-08-06 · **Plan:** [`docs/superpowers/plans/2026-08-05-ai-layer-v2-integration.md`](../docs/superpowers/plans/2026-08-05-ai-layer-v2-integration.md)
**Register:** [`2026-08-04-creative-v2-diff-review.md`](./2026-08-04-creative-v2-diff-review.md)
**Source pin:** `origin/new/creative_v2` @ `17d8ea8` · **Target:** `main` @ `632abd6`

Append-only. Newest entry at the bottom.

---

## Phase 0 — Plan corrections (Fable 5 adversarial review)

A Fable 5 reviewer with ponytail + code-review-graph found **5 blockers, 4 majors** in the rev-1
plan. All findings independently re-verified against `17d8ea8` before acceptance. User ruled on each.

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| P1 | BLOCKER | `creative_v2` edits committed `CLAUDE.md`; local copy is `skip-worktree` → merge aborts or clobbers the local active-dev file | **Keep public `CLAUDE.md` at `main`; local unchanged** |
| P2 | BLOCKER | Both degraded-path returns pass the `(rows, skipped)` tuple through as rows → crash when the store is down | Single `_call_fetch()` unwrapper, 3 call sites |
| P3 | BLOCKER | Guard test iterates `/docs`, `/redoc`, `/blended`, 8 `/creative/*`; Step 5 forbade the only fix | Explicit `BRAND_PARTITIONED` watchlist + named `KNOWN_DEBT` |
| P4 | BLOCKER | G1 breaks `test_api.py:81` (patches `ml.fetch_dataset_range`) | Retarget to `ml.fetch_envelope`, same commit |
| P5 | BLOCKER | Task 1 breaks `test_store.py:101` (patches `ml.fetch_dataset`) | Retarget to `ml.fetch_envelope_preset`, same commit |
| P6 | MAJOR | D5 fix was a no-op — default lives in `ad_tools.py` schemas, not `_ensure_ad_level` | Fix `ad_tools.py` ×6 + `chat.py:463/502/504` |
| P7 | MAJOR | D7 copied the prune to ingest instead of **moving** it; chat-path DELETEs survive | Delete `chat.py:544-546` |
| P8 | MAJOR | 4 new API tests skip the env monkeypatches every existing test uses | Add `AI_LAYER_API_KEY`/`OPENROUTER_API_KEY`/`META_ACCESS_TOKEN` patches |
| P9 | MAJOR | Claimed E2 coverage doesn't exist; existing months are identical by construction | Add distinct-rollup round-trip test |
| P10 | MINOR | `ad_id or ad_name` fallback doesn't disambiguate | Drop the fallback |
| P11 | MINOR | H1 leaves legacy persisted `mom` in place forever | Strip in `save_monthly_facts` |
| P12 | MINOR | `if facts else EMPTY_ROLLUP` collapses `None` (skip-intent) into a memoized empty | `if facts is None: continue` |
| P13 | MINOR | Module-level `_accounts_memo` can serve cross-test staleness | `clear()` in conftest |
| P16 | NIT | Baseline is ~626 with +2 known `cost_ledger` fails, not a clean 624/7 | Record as known |
| P17 | NIT | `test_chat.py` lacks `date`/`timedelta` imports | Add |

**Verified sound (challenged, held):** Task 3 ordering + None-safety · Task 4 zero-safety ·
Task 5 (`MetaError` extends `RuntimeError`, pre-stream confirmed) · Task 6 retry bounding ·
Task 10 SQLAlchemy 2.0 patterns · A2 purge SQL vs real schema · 5-endpoint reachability table ·
merge shape (pin, 2 conflicts, no secrets in diff).

### Scope decisions

- **C1** restored to scope (Task 7b) — register §0 triaged it ✅ options 1+4; rev 2 parked it by
  drafting error. #34 redesign stays parked.
- **C2 parks** — needs a **second tenant** to produce wrong data, and we have only ever had one.
  Recorded with a trigger **distinct from** the F1/F2/E4 public-domain trigger, since a second tenant
  can arrive without a domain.
- **E5** implemented as a `list_accounts` memo rather than rev 2's "read the stored row" — smaller,
  and fixes the point all callers route through.
- **A1** uses an optional-tuple callback rather than a hard contract change — avoids churning 8
  existing test call sites.

### Pydantic

In use (`schemas.py`, `creative/schemas.py`), plain v2 `BaseModel`, no validators/`Field`/`model_config`.
**Not a declared dependency** — arrives transitively via `fastapi>=0.110`. Pre-existing; noted, not
changed here. `IngestResult.skipped` typed as `list[tuple[str, str, str]]` so envelope values pass
through with no conversion.

### Plan updated — 2026-08-06

All 17 corrections folded into `docs/superpowers/plans/2026-08-05-ai-layer-v2-integration.md`
(1943 lines, 100 checkbox steps, placeholder scan clean). Notable structural changes:

- **Task 0** gained Step 3b (CLAUDE.md) and a corrected Step 7 baseline expectation (~626, +2 known).
- **Task 1** gained `_call_fetch()` as the single unwrap point, a degraded-path regression test, and
  Step 6b retargeting `test_ingest_non_day_preset_keeps_legacy_fetch`.
- **Task 7** grew from 5 to 7 steps — D5 now edits `ad_tools.py` ×6 + `chat.py:463/502/504`, tested
  through `run_tool_loop` rather than `_ensure_ad_level`.
- **Task 7b's** guard test inverted from a route sweep to a `BRAND_PARTITIONED` watchlist with a
  named `KNOWN_DEBT` set (`/insights`, `/blended`).
- **Task 8** gained Step 5 (delete the chat-path prune) and Step 5c (regression test); D7 is now a
  move, not a copy.
- **Task 9** gained Step 6b stripping legacy `mom` at the writer.
- **Task 10** gained Step 3 (real E2 distinct-rollup test) and Step 4b (retarget the routing test).
- **Parked group split into two triggers** — public domain (F1/F2/E4) vs second tenant (C2).

---

## Phase 1 — Execution

### Task 0 — integration branch · ✅ COMMITTED (2 commits)

Branch `integrate/ai-layer-v2` off `main` @ `632abd6`. Pin verified `17d8ea85c3aa…`;
`main == origin/main`.

**P1 fired exactly as predicted.** `git merge --no-commit` aborted with
*"Your local changes to the following files would be overwritten by merge: CLAUDE.md"*.
Recovery path from Step 3b executed:

1. Local `CLAUDE.md` backed up, checksum verified `26357645868d74b5…`
2. `git update-index --no-skip-worktree CLAUDE.md` + `git checkout CLAUDE.md`
3. Merge re-run → **exactly the two predicted conflicts**, both non-code
   (`.env.example`, `dev_reports/STATUS_INDEX.md`); `api.py` and `creative/service.py` auto-merged
4. `git restore --staged --source=main -- CLAUDE.md`
5. Local file restored (checksum re-verified identical) + `skip-worktree` bit re-set

Post-state: committed `CLAUDE.md` byte-identical to `main`; local maintainer copy untouched.

**Conflict resolutions.** `STATUS_INDEX.md` → ours. `.env.example` → `main`'s structured header.
Key-level diff of the two blobs found four keys present only on the `creative_v2` side; only one is
live:

| Key | Disposition |
|---|---|
| `APIFY_TOKEN` | **Added** to the ai-layer section — live at `config.py:36` + competitor pipeline |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Dropped — superseded by `main`'s vendor-neutral `STORAGE_*` block; zero code references |
| `DATABASE_PATH` | Dropped — retired SQLite (DB-2); zero code references |

**`rnd_mine/`** removed from index and worktree inside the merge commit. Forbidden-path tripwire
(`rnd_mine/`, `railway`, `railway.pub`, `CLAUDE.md`, `.env.test`) returned **no output**. 49 files
staged, 0 unmerged. `railway`/`railway.pub` remain untracked and unstaged.

**New merge artifact found by Step 7's gate — not in the plan.** Collection aborted with
`import file mismatch` on `test_brain`. Root cause: **neither file existed at merge-base**
(`56db2f1`) — `main` added `tests/creative/test_brain.py`, `creative_v2` independently added
`tests/test_brain.py`. Git merges both without conflict; pytest cannot import two same-named modules
from `__init__.py`-less directories. `--import-mode=importlib` was tried and **rejected** — it breaks
`tests/creative/test_verifier.py`'s `from conftest import FakeClient`. Resolved by renaming `main`'s
file to `tests/creative/test_creative_brain.py` (the directory already scopes the name).

Commits: `86860fd` (merge), `fdb8f57` (rename).

### 🔴 BLOCKED — Neon test-branch credentials absent

**Baseline could not be established.** Full run: **493 passed · 6 skipped · 165 errors** in 161s.

All 165 errors have a single cause — `KeyError: 'PGUSER_POOL'`, counted and confirmed uniform.
`tests/conftest.py::_migrate_once` builds the test-branch URL from `PGUSER/PGPASSWORD/PGHOST/
PGDATABASE` (+`_POOL`); the repo-root `.env` contains **zero** `PG*` keys and **no `.env.test`
exists** anywhere on this machine.

Consequence: every DB-backed test — `test_fetch_cache`, `test_history`, `test_repository_*`,
`test_api`, `test_store`, `test_chat`, `test_tool_loop`, `test_transform` — cannot run. Those are
precisely the suites gating Tasks 1, 2, 4, 5, 7b, 8, 9, 10 and 11. The Test Invariant cannot be
satisfied, so no further task may be committed on a "tests pass" claim.

**Execution paused pending the `PG*` test-branch variables.**

### 🟢 UNBLOCKED — env resolved, baseline established

User repointed the DB keys at the **demo branch** (`ep-flat-fire-aktc87fh`) and refreshed `APIFY_TOKEN`.
Three things had to be untangled before the suite would run:

1. **Wrong file was authoritative.** `ai_layer.config._find_env()` walks up from `config.py` and
   returns the **first** `.env` it finds — `apps/ai-layer/.env` at `parents[1]`, never reaching the
   repo root. The root `.env` and `apps/api/.env` had the working credential (identical md5);
   `apps/ai-layer/.env` held a **stale password** and silently shadowed both.
2. **`conftest` ignores `DATABASE_URL`.** `_testbranch_url()` composes its URL from decomposed
   `PGUSER/PGPASSWORD/PGHOST/PGDATABASE` (+`_POOL`) and *overwrites* `DATABASE_URL`. Setting the URL
   form alone could never satisfy it.
3. **IPv6 / Happy-Eyeballs.** Direct `create_engine` against the pooler failed on every IPv6 address
   (*"server closed the connection unexpectedly"*); pinning an IPv4 `hostaddr` reached the server and
   surfaced the real error (auth). The pytest run itself did **not** hit this.

Resolution (config only, no code touched): backed up `apps/ai-layer/.env`, synced its
`DATABASE_URL`/`MIGRATION_DATABASE_URL` from the working root `.env`, and appended the 12 derived
`PG*`/`PG*_POOL` vars. All three `.env` files confirmed gitignored and untracked before editing.

**BASELINE: `657 passed · 7 skipped · 0 failed` (377s).** Higher than `creative_v2`'s reported 624/7,
and the "+2 known cost_ledger fails" noted in its CLAUDE.md did **not** occur. This is the number
every subsequent task gates against.

### Task 1 — A1 + A3 · ✅ COMMITTED `7f7691c`

**Gate: `661 passed · 7 skipped · 0 failed` (524s) = baseline 657 + 4 new.**

TDD order held: all 3 new `test_fetch_cache` tests were confirmed failing (`KeyError: 'skipped_days'`,
tuple-leak) before implementing.

Implementation notes:

- **`_call_fetch()` is the single unwrap point.** `fetch_cached` calls `fetch_range` in *three*
  places. P2's blocker was that an inline `isinstance` check in the loop leaves both degraded-path
  early returns (cache-read failure `:64`, read-back failure `:98`) handing
  `((rows, skipped), stats)` to callers — crashing exactly when the store is down, the one case the
  cache exists to survive. Verified post-change: the only remaining `fetch_range(` in the file is
  inside `_call_fetch`.
- **Skipped days are excluded from `replace_insight_span` too**, not just `mark_insight_fetched` —
  otherwise a skipped day's previously-good rows get deleted and not re-inserted.
- **Optional tuple, not a contract change** — kept all 8 pre-existing `fetch_cached` test call sites
  working untouched.
- **A3**: `store.ingest` normalizes the envelope itself; `fetch_dataset*` discards the meta.
  `IngestResult.skipped` typed `list[tuple[str, str, str]]` (pydantic v2 deep-copies the `= []`
  default per instance — safe, do not "fix" to `default_factory`).

**P5 handled in the same commit:** `test_ingest_non_day_preset_keeps_legacy_fetch` retargeted from
`ml.fetch_dataset` to `ml.fetch_envelope_preset`. Checked for other orphaned monkeypatches on the
moved seam — only `test_api.py:81` touches it, and that one is Task 10's problem (P4), not affected
here.

**Timing note:** a run was killed at 900s before this one. Cause was Neon latency variance, not a
regression — the same 8 `fetch_cache` tests took 69.5s then 86s across runs, and `--durations`
confirms the slowest 20 are all DB round-trip bound (up to 21s for one test). Suite wall-clock now
~525s; budget ≥900s for future gates.

### Task 2 — A2 · ✅ COMMITTED `0dc7554`

**Gate: `663 passed · 7 skipped · 0 failed` (530s) = 661 + 2 new.**

`_key(row, level)` appends `ad_id` at ad level only. Campaign keys asserted byte-identical both with
and without the new argument, so existing cached campaign rows keep their identity.

- **Four call sites, not three.** The plan listed the replace-span and merge sites; grepping found a
  third `_key` use in the read-back sort key. All four now thread `level`.
- **P10 applied** — no `or ad_name` fallback. It appends a value already in the key prefix, so it
  cannot disambiguate; it would only document a non-fix.

**⚠️ Does not heal stored data.** Existing ad-level rows keep old keys, and `load_insight_rows`
selects by `(account, level, date range)` — not by key — so they stay marked fetched and keep being
served collapsed. Purge remains a scheduled op (see Outstanding).

### Task 3 — B2 + B3 · ✅ COMMITTED `53ca7fa`

**Gate: `666 passed · 7 skipped · 0 failed` (565s) = 663 + 3 new.**

**B2 was fixed by ordering, not by changing `_pct_change` or `_deltas`:**

```
pct  = _deltas(ra, pa)
flag = _flag(pct)                 # raw deltas -> 0 -> N still flags SCALING (B1 intentional)
pct  = _drop_zero_prior(pct, pa)  # then null the uncomparable
... _causes(pct)                  # reads the cleaned dict
```

Nulling at the source would have been a smaller diff that silently killed the SCALING flag. Fixing
at the render layer is impossible: `_pct_change(2.0, 1.0)` returns exactly `100.0`, byte-identical to
the sentinel — a guard test asserts a genuine doubling still reports `+100%`, and it passed before
and after. No renderer changes needed (`_sign(None)` / `_direction`'s `"n/a"` already exist).

**B3** adds the explicit "insufficient history — N days, need 14" statement under the same `Trend`
tag, so the card still renders instead of silently vanishing. Both defects are live on `/insights`
**and** `/analytics`.

### Task 4 — D3 · gate running

`EMPTY_ROLLUP` memoizes months Meta genuinely has nothing for; `built += 1` counts them so an
all-empty account still reaches `save()` (without that, the storm survives the fix).

**P12 applied** — `if facts is None: continue` before the memoization. `ensure`'s docstring defines
three outcomes (facts / empty / `None` = *"month skipped"*); collapsing the last two would turn a
caller's "don't record this" into a permanent fake-empty month. A regression test locks it in; it
passed before the change too, which is the point — the guard preserves existing behaviour rather
than adding it.

---

### Tasks 5–11 · ✅ ALL COMMITTED

| Commit | Task | Defects | Gate |
|---|---|---|---|
| `b210f2f` | 5 | D1 | 670 |
| `7639163` | 6 | D2 | 672 |
| `ba0b00d` | 7 | D4, D5 | 675 |
| `6121420` | 7b | C1 | 678 |
| `c9a478a` | 8 | D6, D7 | 680 |
| `9220bf9` | 9 | B4, H1 | 683 |
| `27f7d83` | 10 | E1, E2, G1 | 684 |
| `f25f940` | 11 | E3, E5, G4, G2 | 688 |

**One real regression caught by a gate (Task 9).** The P11 `mom` strip was first placed in
`repository.save_monthly_facts`, breaking `test_monthly_facts_roundtrip`, which asserts the store
persists whatever rollup dict it is handed. **The test was right:** the repository is a generic store
and has no business knowing which keys are derived. Moved to `history.save()` — the only caller of
`save_monthly_facts` — so nothing lost coverage and the layering stayed honest. This is the case that
justifies gating per commit rather than per batch.

**One transient (Task 10).** A `test_cost_ledger` ERROR during a 15:40 run (vs the usual ~8:00);
all 3 cost_ledger tests pass on isolated rerun in 18s, and the run after it was clean at 386s.
Environmental, per the pg-failure disambiguation protocol.

---

## Phase 2 — Task 12, final gate

| Gate | Result | Verdict |
|---|---|---|
| ai-layer pytest | **688 passed · 7 skipped · 0 failed** | ✅ from a 657 baseline; +31 tests, no regressions |
| `tsc --noEmit` | one error: `billing.ts:4` stripe | ✅ exactly the documented baseline |
| `madge --circular --extensions ts` | 330 files, 0 cycles | ✅ |
| default suite (`vitest run`) | **441 passed · 2 skipped · 0 failed** | ✅ zero failures |
| pg suite (`vitest run -c vitest.pg.config.ts`) | 11 failed · 323 passed · 67 skipped | ⚠️ **pre-existing, worse on main** |

### Two defects found in the invariant itself

**`madge` was silently vacuous.** The documented command `madge --circular apps/api/src` reports
*"Processed 0 files ✔ No circular dependency found!"* — a meaningless green. It needs
`--extensions ts`, after which it processes 330 files and genuinely passes. Anyone running the
invariant as written has been getting no signal.

**The documented counts are stale.** CLAUDE.md records default **400/9** and pg **388/10**. The
default suite actually reports 441 passed / 2 skipped / 0 failed. `main` advanced through PR #10 and
#11 since those numbers were written.

### pg suite — measured against `main`, not assumed

| Branch | Result | Duration |
|---|---|---|
| `main` | **18 files failed** · 38 passed · 363 skipped | 970s |
| `integrate/ai-layer-v2` | 8 files failed · **323 passed** · 67 skipped | 577s |

The pg suite is **already broken on `main`, and worse there** — main completes 38 tests, this branch
323. Causation by this branch is impossible anyway: `git diff --name-only main..HEAD` shows **zero**
files under `apps/api/` or `apps/web/`. `security.pg.test.ts` passes 19/19 in isolation but fails in
the full run — the contention signature `vitest.pg.config.ts` documents (all pg files share one Neon
branch behind a session advisory lock, `TRUNCATE` between tests).

`TEST_DATABASE_URL` lives in `apps/api/.env.test` and targets `ep-plain-breeze-akrkpqmf` — a
**different** endpoint from the demo branch, so the TRUNCATEs never touched demo data.

---

## Outstanding — not code

1. **A2 ad-level purge** — `DELETE FROM ai_layer.insight_rows WHERE level='ad'` + `insight_fetch_log`.
   Existing rows keep old keys and are still served collapsed; `load_insight_rows` selects by
   (account, level, date range), not by key. The delete is trivial; the **rebuild is a Meta refetch
   storm on a development_access app** — stage per-account or into a low window. In no commit by design.
2. **Nothing pushed.** 14 commits local; push and PR need explicit per-instance permission.
3. **`dryayeet` heads-up** — this branch diverges from `creative_v2` @ `17d8ea8`.
4. **CLAUDE.md invariant needs correcting** — the madge flag and the stale counts above.
5. **`railway` / `railway.pub`** (OpenSSH keypair) remain untracked **and ungitignored** at repo root.
   The per-commit tripwire kept them out of all 14 commits, but one `git add -A` commits a private key.
6. **ai-layer tests run against the demo DB**, not an isolated branch (`apps/api` has a proper one).
   `db_session` rolls back per test, but escaped writes would land on demo data.

## Parked — unchanged

**Trigger: public domain** — F1, F2, E4. **Trigger: a second tenant** — C2 (single-tenant today, so it
cannot produce wrong data yet). **With #34** — C1's multi-tenancy redesign. **Out of scope** — `rnd_mine/`.

---

## Phase 3 — post-PR follow-ups (2026-08-07/08)

PR **#12** opened and under review at `e332a35`. Two commits land **after** it and are **not** in that
PR. Decide whether to append them to #12 or ship a follow-up PR.

| Commit | Item | Gate |
|---|---|---|
| `011b255` | **C2** — fail closed on Shopify tenant mismatch | 690 |
| `a7867fb` | **F1** — refresh dedupe + tunable Apify sweep cost | 692 |

### C2 — why it shipped despite being deferred

Deferred on the trigger *"a second tenant"*, not on the public-domain trigger the other competitor
items wait on — a second brand can be onboarded without a domain. `SHOPIFY_ACCOUNT_ID` names the one
Meta account the credentials belong to; any other account, **and an unset owner**, get `None`.
Discovery degrades to Meta-only. Guard test makes `httpx.get` raise so a leak cannot pass silently.

**Action required:** set `SHOPIFY_ACCOUNT_ID`, or competitor discovery silently loses Shopify context.

### F1 — deviation from the register's recommendation, recorded

The register recommended a **Postgres advisory lock**. Not built. A session-scoped lock must be held
for the whole scrape — up to ~64 min while E4 is unfixed — which pins a pooled connection that long.

Shipped instead: a **cooldown** (`COMPETITOR_REFRESH_COOLDOWN_S`, 900s) in `pipeline.build()` so the
CLI path is covered too, plus a process-local **in-flight set** for the simultaneity race the cooldown
cannot see. `ponytail:` comment names the ceiling — a multi-replica deploy still needs the advisory
lock or a `refresh_started_at` column.

`MAX_COMPETITORS` / `ADS_PER_COMPETITOR` are now `COMPETITOR_MAX` / `COMPETITOR_ADS_PER`. Apify bills
per actor run **and** per result, so those two numbers are the whole sweep cost.

### Corrections to earlier claims in this log

**The pg suite is NOT broken.** Run alone: **391 passed / 10 skipped / 0 failed** — the documented
baseline. The earlier "worse on main" reading was contention: all pg files share one Neon branch, take
a session advisory lock and `TRUNCATE` between tests, so concurrent Neon work times the lock out.
Measured: alone 0 failed · under contention 11 failed (this branch) and 18 failed files (`main`).
**Re-run alone before calling any pg failure a regression.** Corrected in `CLAUDE.md` and
`local-ops/README.md`.

**F1's domain gate does not cover local testing.** Apify bills on the first
`/competitors/{id}/refresh` from anywhere, including a local container. "No public domain" protects
against unsolicited traffic only.

### Chat integration — one variable

UI, proxy and service are all complete: `/app/ai-chat` is routed, in the sidebar with `live: true`,
and linked from the dashboard. `apps/api` proxies `/ai-layer/chat` and `/chat/stream`.

**The only gap is `AI_LAYER_URL` on the deployed `apps/api`.** Empty means `index.ts:259` skips
registering every `/ai-layer/*` route and the UI 404s. Not needed for the container sim —
`docker-compose.sim.yml:42` sets the in-network name and overrides any `env_file` value. Now
documented in `.env.example`; use the Railway **private** address so no public domain is needed and
`/competitors/*` stays unreachable.

Verify: `railway variables --service <apps/api> | grep AI_LAYER`

### Environment note

Docker is **not reachable from this WSL distro** ("could not be found in this WSL 2 distro" — enable
WSL integration in Docker Desktop). No service was ever started from this session, which is why Apify
shows zero usage. The suite never calls Apify: the fixtures replace `scrape_competitor`, and F1's test
makes `scrape` raise.
