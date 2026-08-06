# ai-layer v2 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `origin/new/creative_v2`'s ai-layer work on `main` with the 9 correctness/billing defects on the live path fixed, `rnd_mine/` excluded by construction.

**Architecture:** Merge `creative_v2` @ `17d8ea8` into a fresh branch off `main`, dropping `rnd_mine/` inside the merge commit. Then one commit per defect, ordered by tier: Batch 1 = wrong data on the live path (merge gate), Batch 2 = throttle/error handling (deploy gate), Batch 3 = cleanups. Every fix is made in the shared function all callers route through, never per-caller.

**Tech Stack:** Python 3.11 · FastAPI · SQLAlchemy 2.0 + psycopg3 (Neon Postgres) · pandas · pytest (Neon test branch, transactional rollback per test).

## Global Constraints

- **Source pin:** `origin/new/creative_v2` @ `17d8ea8`. Do not re-fetch or advance the pin mid-execution.
- **`rnd_mine/` is never merged, pushed, or updated.** It is removed inside the merge commit (Task 0). If it reappears in any diff, stop.
- **No push. No PR.** Every task commits locally only. Pushing requires fresh per-instance permission from the user.
- **Commits leave no trace of a coding agent** — no `Co-Authored-By`, no `Generated with`, no agent names in messages or code comments.
- **Never commit** `CLAUDE.md`, `.env.test`, or the untracked `railway` / `railway.pub` OpenSSH keypair at repo root. Never `git add -A` or `git add .` — stage explicit paths only.
- **No direct LLM calls** from TypeScript; `llmGateway` (`createMessage`) only. (No task here touches TS.)
- **Test Invariant before every commit:** default suite **400/9**, pg suite **388/10**, `tsc --noEmit` baseline-only (`billing.ts:4` stripe), `madge --circular` **0 cycles**. The ai-layer suite baseline from `creative_v2` is **624/7** — reconcile and record post-merge in Task 0.
- **pg test protocol:** run with a preflight `SELECT 1`; on a transient failure retry once; disambiguate any *single* pg failure by isolated rerun before calling it a regression.
- All ai-layer commands run from `apps/ai-layer/`.

---

## Reachability — why some defects are fixed and others are parked

Verified against `main` @ `a7385cd` with code-review-graph (`importers_of ai-layer-client.ts`) plus grep. **Five** ai-layer endpoints are reachable from the product; nothing else is, and ai-layer has **no public domain**.

| Reachable endpoint | Reached from | Defects exposed |
|---|---|---|
| `GET /insights/{id}` | `fetchAiLayerInsights` ← `ai-layer-routes.ts` | B2, B3 |
| `GET /insights/{id}?source=store` | `fetchAiLayerChartData` (`ai-layer-client.ts:241`) ← `/ai-layer/analytics` | B2, B3 |
| `POST /chat`, `/chat/stream` | `fetchAiLayerChat`, `fetchAiLayerChatStream` | A1, A2, D1, D3, D4, D5, D6, D7 |
| `POST /ingest/{id}` | `ingestAiLayer` | A1, A3, D2 |
| `POST /complete` | `createViaAiLayer` ← `competitor-spy.ts`, `autopilot-engine.ts`, `morning-briefing.ts` | *(none — passthrough to `chat.raw_complete`)* |

**No TS caller reaches `/competitors/*`** (grep of `apps/api/src` confirms zero call sites). That is why F1, F2, C2 and E4 are parked — see §Parked.

---

## File Structure

All paths relative to `apps/ai-layer/`. No new production modules; every change lands in a file that already owns that responsibility.

| File | Responsibility | Tasks |
|---|---|---|
| `ai_layer/fetch_cache.py` | settled/trailing-7d cache semantics, span marking | 1, 2, 8 |
| `ai_layer/brain.py` | deterministic analysis + statement rendering | 3, 10 |
| `ai_layer/history.py` | monthly rollups, backfill memoization | 4, 10 |
| `ai_layer/meta_live.py` | Meta Graph transport, error classification | 6, 11 |
| `ai_layer/api.py` | HTTP surface, error mapping, brand scoping, depth | 1, 5, 7b, 8, 10 |
| `ai_layer/chat.py` | context assembly, ad-level tools, CLI | 1, 7, 8, 10 |
| `ai_layer/store.py` | ingest entrypoint | 1, 11 |
| `ai_layer/db/repository.py` | Postgres reads/writes | 11 |
| `ai_layer/competitor/apify_ads.py` | competitor scrape record | 11 |
| `ai_layer/schemas.py` | response models | 1 |

Tests live beside their module in `tests/test_<module>.py` and use the `db_session` fixture (Neon test branch, per-test transactional rollback).

---

## Task 0: Create the integration branch

**Files:**
- Create: branch `integrate/ai-layer-v2`
- Modify: `.env.example` (conflict), `dev_reports/STATUS_INDEX.md` (conflict)
- Delete: `rnd_mine/` (entire directory)

**Interfaces:**
- Produces: a working tree containing `creative_v2`'s ai-layer at `17d8ea8` merged onto `main`, with no `rnd_mine/`, and a recorded post-merge test baseline every later task gates against.

A trial merge (`git merge-tree --write-tree origin/main origin/new/creative_v2`) proved exactly **two conflicts, both non-code**. Every ai-layer source file merges clean.

- [ ] **Step 1: Confirm the pin and the clean tree**

```bash
git rev-parse origin/new/creative_v2   # must print 17d8ea8...
git status --porcelain                 # dev_reports/ + railway keys untracked; nothing staged
```

Expected: the rev matches the pin. If it does not, **stop and report** — `dryayeet` has advanced the branch and the defect register no longer describes it.

- [ ] **Step 2: Branch and merge, stopping before the commit**

```bash
git checkout -b integrate/ai-layer-v2 main
git merge --no-commit origin/new/creative_v2
```

Expected: `Automatic merge failed; fix conflicts and then commit the result.` with conflicts in `.env.example` and `dev_reports/STATUS_INDEX.md` only. Any third conflicting file means the pin moved — stop.

- [ ] **Step 3: Resolve the two conflicts**

`.env.example` — take the **union** of both sides. Keep every key `main` has; add every ai-layer key `creative_v2` introduces. Remove the conflict markers. No key is dropped from either side.

`STATUS_INDEX.md` — take **ours** (`main`):

```bash
git checkout --ours dev_reports/STATUS_INDEX.md
git add dev_reports/STATUS_INDEX.md
```

- [ ] **Step 3b: Keep `CLAUDE.md` at `main`'s content — P1**

`creative_v2` edits the committed `CLAUDE.md` (one line, adding the ai-layer count to the Test Invariant). It is **not** one of the two conflicts, so the merge auto-stages it. Locally `CLAUDE.md` is `skip-worktree` with different content (the active-dev version), so leaving it staged either aborts the merge or **overwrites the local file with the public code-freeze version**.

**Decision: the public `CLAUDE.md` keeps `main`'s content; the local copy is never touched.**

```bash
git restore --staged --source=main -- CLAUDE.md   # index -> main's blob; merge carries no change
git ls-files -v CLAUDE.md                          # MUST still print "S" (skip-worktree intact)
```

If the merge **aborted** at Step 2 with "local changes would be overwritten":

```bash
cp CLAUDE.md /tmp/claude-md-local-backup
git update-index --no-skip-worktree CLAUDE.md
git checkout CLAUDE.md
# re-run Step 2, Step 3, then:
git restore --staged --source=main -- CLAUDE.md
cp /tmp/claude-md-local-backup CLAUDE.md
git update-index --skip-worktree CLAUDE.md
```

The only thing dropped is `creative_v2`'s one-line invariant edit — that number is recorded in Step 7 instead.

- [ ] **Step 4: Drop `rnd_mine/` inside the merge commit**

```bash
git rm -r --cached rnd_mine
rm -rf rnd_mine
```

Expected: `rnd_mine` is gone from both the index and the working tree, so it can never be part of this branch's history.

- [ ] **Step 5: Verify the staged merge carries no forbidden paths**

```bash
git diff --cached --name-only | grep -E '^(rnd_mine/|railway(\.pub)?$|CLAUDE\.md$|\.env\.test$)'
```

Expected: **no output**. Any output means stop and unstage that path before committing.

- [ ] **Step 6: Commit the merge**

```bash
git add .env.example
git commit -m "merge: ai-layer v2 from creative_v2 (rnd_mine excluded)"
```

- [ ] **Step 7: Record the post-merge test baseline**

```bash
cd apps/ai-layer && python -c "import sqlalchemy; print('db ok')" && pytest -q 2>&1 | tail -5
```

Write the observed pass/fail counts into `dev_reports/2026-08-06-ai-layer-v2-execution-log.md`.

**Expect ~626 passing with ~9 failing, not a clean 624/7.** `creative_v2`'s own CLAUDE.md qualifies its number: *"624/7 (+2 known `cost_ledger` baseline fails on shared demo DB; `connector_source` ignored)"*. Record the +2 as known, or the executor chases phantom regressions all the way through Task 12. A delta **beyond** that is a merge artifact and must be investigated *before* Task 1.

---

## Task 1: A1 + A3 — never mark a skipped day as fetched

**Files:**
- Modify: `ai_layer/fetch_cache.py:50-105` (`fetch_cached`)
- Modify: `ai_layer/api.py:172-176` (`_cached_dataset._fr`)
- Modify: `ai_layer/chat.py:400-408` (`_ensure_ad_level._fr`), `ai_layer/chat.py:640-648` (CLI `_fetch_range`)
- Modify: `ai_layer/store.py:26-46` (`ingest`), `ai_layer/schemas.py:129-133` (`IngestResult`)
- Test: `tests/test_fetch_cache.py`, `tests/test_store.py`

**The defect:** `fetch_cached` marks the **whole** span fetched, including days `_fetch_window_adaptive` gave up on. Those days are then permanently "cached" and never retried — silent, permanent data holes. `fetch_envelope` already records them in `meta["skipped"]`, but all three production closures return `envelope["data"]` and throw the meta away.

**Interfaces:**
- Consumes: `ml.fetch_envelope(...)["meta"]["skipped"]` — `list[tuple[str, str, str]]` of `(since_iso, until_iso, why)`.
- Produces: `fetch_range(lo, hi)` may now return **either** `list[dict]` (unchanged) **or** `tuple[list[dict], list[tuple[str, str, str]]]`. `fetch_cached`'s `stats` dict gains `"skipped_days": int`. `IngestResult` gains `skipped: list[list[str]] = []`.

> **Why the optional tuple and not a hard contract change:** the callback has 3 production call sites and **8 test call sites**. A required tuple breaks all 11. Optional keeps every existing test passing untouched and confines the diff to the 3 closures that actually have the data.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_fetch_cache.py`:

```python
def test_skipped_days_are_not_marked_fetched(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 1), date(2026, 7, 5)

    def fr_with_skip(lo, hi):
        # Meta refused 2026-07-03..2026-07-04; the rest came back.
        rows = [r for r in _rows_for(lo, hi)
                if not ("2026-07-03" <= r["date_start"] <= "2026-07-04")]
        return rows, [("2026-07-03", "2026-07-04", "reduce the amount of data")]

    _, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr_with_skip, today=today)
    assert stats["skipped_days"] == 2 and stats["fetched_days"] == 3

    # the skipped days must be retried on the next call, not served as cached holes
    calls = []
    def fr2(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi), []
    fetch_cache.fetch_cached(ACC, LVL, since, until, fr2, today=today)
    assert calls == [(date(2026, 7, 3), date(2026, 7, 4))]


def test_plain_list_fetcher_still_supported(db_session):
    today = date(2026, 7, 30)
    _, stats = fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 3),
                                        _rows_for, today=today)
    assert stats["fetched_days"] == 3 and stats["skipped_days"] == 0


def test_degraded_path_unwraps_tuple_fetcher(db_session, monkeypatch):
    """P2: the cache must never be a point of failure. With the store down AND a
    tuple-returning fetcher, callers must still get a flat row list -- not
    ((rows, skipped), stats)."""
    def boom(*a, **k):
        raise RuntimeError("simulated cache outage")

    monkeypatch.setattr(fetch_cache._repo, "insight_fetched_dates", boom)
    today = date(2026, 7, 30)
    rows, stats = fetch_cache.fetch_cached(
        ACC, LVL, date(2026, 7, 1), date(2026, 7, 3),
        lambda lo, hi: (_rows_for(lo, hi), []), today=today)
    assert isinstance(rows, list) and len(rows) == 3
    assert all(isinstance(r, dict) for r in rows), "a tuple leaked through as rows"
    assert stats["skipped_days"] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -k "skipped_days or plain_list" -v`
Expected: FAIL — `KeyError: 'skipped_days'`.

- [ ] **Step 3: Implement in `fetch_cache.py`**

Add after `_contiguous_runs`:

```python
def _skipped_dates(skipped) -> set[str]:
    """Dates inside spans the fetcher gave up on. These are never marked fetched
    and never span-replaced, so they stay retryable instead of becoming holes."""
    out: set[str] = set()
    for s, u, _why in skipped or []:
        out.update(_dates(date.fromisoformat(s), date.fromisoformat(u)))
    return out
```

Add the unwrapper next to it — **P2: this is the only place that inspects the callback's return shape.** `fetch_cached` invokes `fetch_range` in **three** places (the loop plus two degraded-path early returns); an inline `isinstance` in the loop alone leaves the other two returning `((rows, skipped), stats)` to callers, which crashes exactly when the store is down:

```python
def _call_fetch(fetch_range, lo, hi) -> tuple[list[dict], list]:
    """fetch_range may return rows, or (rows, skipped) when it knows what Meta refused.
    Single unwrap point -- all three call sites in fetch_cached route through here."""
    res = fetch_range(lo, hi)
    rows, skipped = res if isinstance(res, tuple) else (res, [])
    return (rows or []), (skipped or [])
```

In `fetch_cached`, change the `stats` initializer and the fetch loop body:

```python
    stats = {"cached_days": len(needed & final), "fetched_days": 0,
             "skipped_days": 0, "from_cache": not missing}
    fetched_fresh: list[dict] = []   # kept in memory so a failed cache write never loses them
    write_failed = False
    for lo, hi in (_contiguous_runs([date.fromisoformat(d) for d in missing]) if missing else []):
        new_rows, skipped = _call_fetch(fetch_range, lo, hi)
        skip = _skipped_dates(skipped)
        span = [d for d in _dates(lo, hi) if d not in skip]
        # drop stale rows in the re-fetched span, then insert the fresh ones so
        # revised recent days replace their prior values cleanly.
        try:
            _repo.replace_insight_span(
                account, level, span,
                [(r.get("date_start", ""), _key(r), r) for r in new_rows
                 if r.get("date_start")],
                brand_id=brand_id)
            _repo.mark_insight_fetched(account, level, span, brand_id=brand_id)
        except Exception:  # noqa: BLE001 -- store write failure never loses the fetch;
            # the fresh rows are kept in memory below and returned unpersisted.
            log.exception("insight cache write failed (continuing with fetched rows)")
            write_failed = True
            fetched_fresh.extend(r for r in new_rows if r.get("date_start"))
        stats["fetched_days"] += len(span)
        stats["skipped_days"] += len(skip)
```

> `span` is filtered **before** `replace_insight_span` as well as before `mark_insight_fetched` — otherwise a skipped day's previously-good rows would be deleted and not re-inserted.

Now the **two** degraded-path early returns. A non-empty tuple is truthy, so `or []` never fires and the caller receives `((rows, skipped), stats)`; `mt.normalize({"data": rows})` then iterates a 2-tuple of lists. The cache is supposed to never be a point of failure — unfixed, it becomes one exactly when the store is down.

Cache-read failure (`fetch_cache.py:64`) — needs the unwrap **and** the new stats key:

```python
        return _call_fetch(fetch_range, since, until)[0], \
            {"cached_days": 0, "fetched_days": (until - since).days + 1,
             "skipped_days": 0, "from_cache": False}
```

Read-back failure (`fetch_cache.py:98`) — returns the live `stats` dict, so only the unwrap:

```python
        return _call_fetch(fetch_range, since, until)[0], stats
```

Grep to confirm none are missed — there must be **zero** remaining bare calls:

```bash
cd apps/ai-layer && grep -n "fetch_range(" ai_layer/fetch_cache.py
```
Expected: only the three `_call_fetch(fetch_range, ...)` sites and `_call_fetch`'s own body.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -v`
Expected: PASS — all tests, including the 5 pre-existing ones (they pass plain-list fetchers and must be untouched).

- [ ] **Step 5: Opt the three production closures in**

`api.py` in `_cached_dataset`:

```python
    def _fr(lo, hi):
        env = ml.fetch_envelope(token, account=account_id, since=lo, until=hi,
                                level="campaign")
        return env["data"], env["meta"].get("skipped", [])
```

`chat.py` in `_ensure_ad_level`:

```python
    def _fr(lo, hi):
        env = ml.fetch_envelope(token, account=account, since=lo, until=hi, level="ad")
        return env["data"], env["meta"].get("skipped", [])
```

`chat.py` CLI `_fetch_range` — it already reads and prints `skipped`; just return it too:

```python
        def _fetch_range(lo, hi):
            envp = ml.fetch_envelope(token, account=account, since=lo, until=hi,
                                     level=args.level, progress=_progress)
            for s, u, why in envp["meta"].get("skipped", []):
                print(f"  skipped {s}..{u}: {why}")
            return envp["data"], envp["meta"].get("skipped", [])
```

- [ ] **Step 6: A3 — surface skipped spans in the ingest response**

`schemas.py`:

```python
class IngestResult(BaseModel):
    account_id: str
    rows_upserted: int
    since: Optional[str] = None
    until: Optional[str] = None
    skipped: list[tuple[str, str, str]] = []   # [(since, until, why), ...] Meta refused
```

> **Pydantic notes.** This is pydantic **v2** (`BaseModel`, no validators/`Field`/`model_config` anywhere in this file), pulled in transitively by `fastapi>=0.110` — it is *not* a declared dependency in `pyproject.toml`. The bare `= []` default is **safe**: pydantic v2 deep-copies field defaults per instance, so this is not the shared-mutable-default bug it resembles; do not "fix" it into a `default_factory`. Typing it as `tuple[str, str, str]` matches what `fetch_envelope` already produces, so no conversion is needed at either call site and it still serializes to a JSON array.

`store.py` `ingest` — `fetch_dataset_range` normalizes the envelope and discards its meta, so build the envelope here and normalize it locally:

```python
    days = ml.preset_days(preset)
    if days is not None:
        until = date.today() - timedelta(days=1)
        since = until - timedelta(days=days - 1)
        env = ml.fetch_envelope(token, account, since, until, level=level)
    else:
        env = ml.fetch_envelope_preset(token, account=account, preset=preset, level=level)
    ds = mt.normalize(env)
    n = upsert_dataset(ds)
    return {"account_id": account, "rows_upserted": n, "since": ds.since, "until": ds.until,
            "skipped": env["meta"].get("skipped", [])}
```

Add `from ai_layer import meta_transform as mt` to `store.py`'s imports if not already present (it is — line 10).

- [ ] **Step 6b: Retarget `test_ingest_non_day_preset_keeps_legacy_fetch` — P5, same commit**

`tests/test_store.py:101` patches `ml.fetch_dataset` and installs `range_should_not_run` on `fetch_dataset_range` to prove `this_month` keeps the legacy path. The rewrite above calls `ml.fetch_envelope_preset` instead, so **the fake is never hit and the real function makes a network call**. The invariant it encodes is still correct — it just has to move one level down, matching what `test_store.py:77` already does:

```python
def test_ingest_non_day_preset_keeps_legacy_fetch(monkeypatch):
    """Non-day-shaped presets (e.g. "this_month") keep the preset envelope path --
    there's no since/until to chunk against."""
    calls = {"legacy": 0}

    def fake_envelope_preset(token, account=None, preset="last_30d", level="campaign",
                             max_rows=5000):
        calls["legacy"] += 1
        return {"meta": {"account_id": account, "account_name": "T", "currency": "INR",
                         "level": level,
                         "date_range": {"since": "2026-05-01", "until": "2026-05-31"}},
                "data": [raw("A", "2026-05-01", 100, 2, 300)]}

    def range_should_not_run(*a, **k):
        raise AssertionError("the chunked range fetcher must not run for a non-day preset")

    monkeypatch.setattr(ml, "fetch_envelope_preset", fake_envelope_preset)
    monkeypatch.setattr(ml, "fetch_envelope", range_should_not_run)
    monkeypatch.setattr(store, "upsert_dataset", lambda ds: len(ds))
    store.ingest("tok", "act_1", preset="this_month")
    assert calls["legacy"] == 1
```

Match the file's existing `raw(...)` / `ds_of(...)` helpers and import style rather than inventing new ones.

- [ ] **Step 7: Write the ingest test**

Add to `tests/test_store.py`:

```python
def test_ingest_surfaces_skipped_spans(db_session, monkeypatch):
    from ai_layer import store, meta_live as ml

    def fake_envelope(token, account, since, until, level="campaign", progress=None):
        return {"meta": {"account_id": account, "account_name": "T", "currency": "INR",
                         "level": level, "date_range": {"since": since.isoformat(),
                                                        "until": until.isoformat()},
                         "skipped": [("2026-07-03", "2026-07-04", "reduce the amount of data")]},
                "data": []}

    monkeypatch.setattr(ml, "fetch_envelope", fake_envelope)
    out = store.ingest("tok", "act_1", preset="last_7d")
    assert out["skipped"] == [["2026-07-03", "2026-07-04", "reduce the amount of data"]]
```

- [ ] **Step 8: Run the full ai-layer suite**

Run: `cd apps/ai-layer && pytest -q`
Expected: PASS at or above the Task 0 baseline. Gate against the Test Invariant.

- [ ] **Step 9: Commit**

```bash
git add apps/ai-layer/ai_layer/fetch_cache.py apps/ai-layer/ai_layer/api.py \
        apps/ai-layer/ai_layer/chat.py apps/ai-layer/ai_layer/store.py \
        apps/ai-layer/ai_layer/schemas.py apps/ai-layer/tests/test_fetch_cache.py \
        apps/ai-layer/tests/test_store.py
git commit -m "fix(ai-layer): never mark Meta-skipped days as fetched; surface skipped spans on ingest"
```

---

## Task 2: A2 — ad-level cache key must include `ad_id`

**Files:**
- Modify: `ai_layer/fetch_cache.py:21-25` (`_key`)
- Test: `tests/test_fetch_cache.py`

**The defect:** `_key(row)` is `campaign_id|adset_name|ad_name`. Two different ads with the same name inside one adset collapse onto one key, so `replace_insight_span`'s dedupe keeps only the last — one ad's spend silently disappears. Duplicate ad names in a single adset are routine.

**Interfaces:**
- Consumes: raw Meta rows; at `level="ad"` they carry `ad_id`.
- Produces: `_key(row, level)` — **the `level` parameter is new**. Campaign-level keys are byte-identical to before, so no campaign row is orphaned.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_fetch_cache.py`:

```python
def test_ad_level_key_separates_same_named_ads(db_session):
    today = date(2026, 7, 30)
    day = date(2026, 7, 1)

    def fr(lo, hi):
        return [{"campaign_id": "c1", "adset_name": "as1", "ad_name": "Creative A",
                 "ad_id": "111", "date_start": day.isoformat(), "spend": "10"},
                {"campaign_id": "c1", "adset_name": "as1", "ad_name": "Creative A",
                 "ad_id": "222", "date_start": day.isoformat(), "spend": "20"}]

    rows, _ = fetch_cache.fetch_cached("act_a2", "ad", day, day, fr, today=today)
    assert len(rows) == 2, "same-named ads in one adset must not collapse"
    assert {r["ad_id"] for r in rows} == {"111", "222"}


def test_campaign_level_key_unchanged(db_session):
    row = {"campaign_id": "c1", "adset_name": "as1", "ad_name": "n", "ad_id": "999"}
    assert fetch_cache._key(row, "campaign") == "c1|as1|n"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -k "same_named or key_unchanged" -v`
Expected: FAIL — first with `assert 1 == 2`, second with `TypeError: _key() takes 1 positional argument but 2 were given`.

- [ ] **Step 3: Implement**

```python
def _key(row: dict, level: str = "campaign") -> str:
    """Identity of one raw Meta row within a level (dedupe / upsert key) -- the rnd
    cache._key tuple, joined (date lives in its own column). At ad level the name is
    not unique inside an adset, so the ad_id disambiguates; campaign keys are
    unchanged so existing cached campaign rows keep their identity."""
    base = (row.get("campaign_id", ""), row.get("adset_name", ""), row.get("ad_name", ""))
    if level == "ad":
        return "|".join(base + (row.get("ad_id", ""),))
    return "|".join(base)
```

> **P10:** no `or ad_name` fallback. `ad_id` is in `FIELDS` and always returned at `level="ad"`, and falling back to `ad_name` appends a value already present in `base` — two same-named ads missing `ad_id` would still collapse. A fallback that cannot disambiguate only documents a non-fix.

Update the three call sites inside `fetch_cached` to pass `level`:

```python
                [(r.get("date_start", ""), _key(r, level), r) for r in new_rows
                 if r.get("date_start")],
```

```python
        merged = {(r.get("date_start", ""), _key(r, level)): r for r in rows}
        for r in fetched_fresh:
            merged[(r.get("date_start", ""), _key(r, level))] = r
        since_s, until_s = since.isoformat(), until.isoformat()
        rows = sorted((r for r in merged.values()
                       if since_s <= r.get("date_start", "") <= until_s),
                      key=lambda r: (r.get("date_start", ""), _key(r, level)))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/fetch_cache.py apps/ai-layer/tests/test_fetch_cache.py
git commit -m "fix(ai-layer): include ad_id in the ad-level cache key so same-named ads never collapse"
```

- [ ] **Step 6: Record the required data purge — DO NOT RUN IT HERE**

Existing ad-level rows keep their **old** keys, and `load_insight_rows` selects by `(account, level, date range)` — not by key. So old rows stay marked fetched and **keep being served, collapsed and wrong**. The code fix alone does not heal stored data.

Required, as a **separately scheduled operation**:

```sql
DELETE FROM ai_layer.insight_rows WHERE level = 'ad';
DELETE FROM ai_layer.insight_fetch_log WHERE level = 'ad';
```

The delete is trivial; the **rebuild is a Meta refetch storm on a `development_access` app**. Stage it per-account or run it into a low-traffic Meta window. **Do not bundle it into this or any code commit.** Add it to the deploy runbook and stop here.

---

## Task 3: B2 + B3 — kill the fabricated 100% and state insufficient history

**Files:**
- Modify: `ai_layer/brain.py:128-129` (after `_deltas`), `ai_layer/brain.py:224-256` (`analyze`), `ai_layer/brain.py:352-360` (`statements`)
- Test: `tests/test_brain.py`

**B2 — the defect:** `_pct_change(recent, 0)` returns `100.0`. That is a **sentinel meaning "no comparable base"**, but it is emitted as a real percentage — into `_acct_line`, campaign headers, `_causes` strings ("efficient scaling — spend up 100% with ROAS up 100%"), and the `Trend` statement. A founder reads a fabricated figure as measured.

> **Why not fix it inside `_pct_change` or `_deltas`** (both rejected): `_flag` reads `pct["roas"]` to raise `SCALING`. Nulling at the source means a genuine 0→N campaign loses its SCALING flag — and **B1 (flagging zero-prior campaigns) is intentional and must survive**. Nulling must therefore happen *after* `_flag` and *before* `_causes`.
>
> **Why not fix it at the render layer** (rejected): `_pct_change(2.0, 1.0)` returns exactly `100.0` — byte-identical to the sentinel. No renderer can tell a fabricated 100 from a genuine doubling without also being handed `prior`.

**Interfaces:**
- Produces: `_drop_zero_prior(pct: dict, prior_agg: dict) -> dict` in `brain.py`. `analyze()`'s returned `pct` dicts now carry `None` wherever the prior aggregate was `0`. `_sign(None)` → `"n/a"` and `_direction(None)` → `"n/a"` already exist, so **no renderer changes are needed**.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_brain.py`:

```python
def test_zero_prior_yields_no_percentage_but_keeps_the_flag():
    # prior week: nothing. recent week: real spend and revenue -> a 0 -> N campaign.
    facts = []
    for i in range(14):
        d = date(2026, 7, 1) + timedelta(days=i)
        recent = i >= 7
        facts.append({"date": d.isoformat(), "campaign_name": "Launch",
                      "spend": 100.0 if recent else 0.0,
                      "revenue": 500.0 if recent else 0.0,
                      "impressions": 1000.0 if recent else 0.0,
                      "link_clicks": 50.0 if recent else 0.0,
                      "purchases": 5.0 if recent else 0.0,
                      "frequency": 1.2 if recent else 0.0})
    res = brain.analyze(facts)
    camp = next(c for c in res["campaigns"] if c["campaign"] == "Launch")
    assert camp["flag"] == "SCALING", "B1: a 0 -> N campaign must still flag"
    assert camp["pct"]["roas"] is None, "B2: no fabricated 100% for a zero prior"
    assert camp["pct"]["spend"] is None
    assert not any("100%" in c for c in camp["causes"]), "the fake figure must not reach _causes"


def test_genuine_doubling_still_reports_100_pct():
    facts = []
    for i in range(14):
        d = date(2026, 7, 1) + timedelta(days=i)
        mult = 2.0 if i >= 7 else 1.0
        facts.append({"date": d.isoformat(), "campaign_name": "Steady",
                      "spend": 100.0 * mult, "revenue": 200.0 * mult,
                      "impressions": 1000.0 * mult, "link_clicks": 50.0 * mult,
                      "purchases": 10.0 * mult, "frequency": 1.0})
    res = brain.analyze(facts)
    a = res["account"][0]
    assert a["pct"]["spend"] == 100.0, "a real doubling is still a real +100%"
```

Add `from datetime import date, timedelta` to the test file's imports if absent.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && pytest tests/test_brain.py -k "zero_prior or genuine_doubling" -v`
Expected: FAIL on the first test — `assert 100.0 is None`.

- [ ] **Step 3: Implement B2**

Add directly below `_deltas` in `brain.py`:

```python
def _drop_zero_prior(pct: dict, prior_agg: dict) -> dict:
    """A zero prior has no comparable base -- _pct_change's 100.0 there is a sentinel,
    not a measurement. Applied AFTER _flag (so a 0 -> N campaign still flags SCALING)
    and BEFORE _causes (so the fake figure never reaches a sentence)."""
    return {k: (None if prior_agg.get(k) == 0 else v) for k, v in pct.items()}
```

In `analyze()`, the account loop:

```python
        ra, pa = _aggregate(rec), _aggregate(pri)
        account.append({"period": label, "recent": ra, "prior": pa,
                        "pct": _drop_zero_prior(_deltas(ra, pa), pa)})
```

In `analyze()`, the campaign loop — **order is the fix**:

```python
            pct = _deltas(ra, pa)
            flag = _flag(pct)                      # flag on the raw deltas (B1 intentional)
            pct = _drop_zero_prior(pct, pa)        # then drop the uncomparable ones (B2)
            roas_move = abs(pct["roas"]) if pct["roas"] is not None else 0.0
            if not flag and roas_move < 15:               # not noteworthy
                continue
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_brain.py -v`
Expected: PASS.

- [ ] **Step 5: Write the failing test for B3**

**B3 — the defect:** `analyze()` only builds period comparisons when `span_days >= 14`. Below that, `statements()` silently omits the `Trend` statement — `/insights` and `/analytics` render an incomplete card set with no explanation of why. The chat path has a partial mitigation (`render_analysis_block`'s "too short" line); the statements path has none.

Add to `tests/test_brain.py`:

```python
def test_short_window_states_insufficient_history():
    import pandas as pd

    rows = [{"date": (date(2026, 7, 1) + timedelta(days=i)).isoformat(),
             "campaign_name": "c", "spend": 100.0, "revenue": 200.0,
             "impressions": 1000.0, "link_clicks": 50.0, "purchases": 10.0,
             "frequency": 1.0}
            for i in range(7)]                    # 7 days: under the 14-day WoW floor
    stmts = brain.statements(pd.DataFrame(rows))
    tags = {t for t, _ in stmts}
    assert "Trend" in tags, "a short window must still explain itself in the Trend slot"
    text = next(x for t, x in stmts if t == "Trend")
    assert "7 days" in text and "14" in text
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_brain.py -k short_window -v`
Expected: FAIL — `"Trend" in tags` is False.

- [ ] **Step 7: Implement B3**

In `statements()`, replace the bare `if res["account"]:` block with an `else` branch. `Trend` is already in `api._PRIORITY` (→ `"pattern"`), so the card keeps rendering:

```python
    if res["account"]:
        a = res["account"][0]                      # freshest period (WoW when available)
        p, ra, pa = a["pct"], a["recent"], a["prior"]
        out.append(("Trend",
            f"{a['period']}: blended ROAS moved {pa['roas']:.2f}x -> {ra['roas']:.2f}x "
            f"({_sign(p['roas'])}, {_direction(p['roas'])}); spend {_sign(p['spend'])}, "
            f"revenue {_sign(p['revenue'])}, purchases {_sign(p['purchases'])}."))
    elif res.get("span"):
        out.append(("Trend",
            f"Insufficient history for a trend: this window is {res['span']['days']} days "
            f"and week-over-week needs 14. The figures above are current-window totals "
            f"with nothing to compare them against."))
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_brain.py -v`
Expected: PASS.

- [ ] **Step 9: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/brain.py apps/ai-layer/tests/test_brain.py
git commit -m "fix(ai-layer): drop the fabricated 100% on a zero prior; state insufficient history explicitly"
```

---

## Task 4: D3 — memoize empty months so the backfill storm stops

**Files:**
- Modify: `ai_layer/history.py:145-172` (`ensure`)
- Test: `tests/test_history.py`

**The defect:** in `ensure()`, `months[ym] = rollup(facts)` is guarded by `if facts:`. A month where Meta legitimately returns nothing is never stored, so it is in `todo` on **every** subsequent call — a fresh Meta round-trip per empty month, per chat, forever. On a `development_access` app that is the dominant rate consumer.

`built += 1` only fires inside the same `if facts:`, and `if built: save(...)` gates persistence — so **an all-empty account never saves and the storm survives a naive `EMPTY_ROLLUP` assignment.** The counter must also increment for memoized empties.

> No `None`-guard is needed: `chat.py`'s `facts_for_month` (lines 524-531) returns a list in both branches and never returns `None`. The `except Exception: continue` above already diverts genuine failures, so an empty list here means Meta really returned nothing.

**Interfaces:**
- Produces: `history.EMPTY_ROLLUP` — a module constant with the same keys `rollup()` emits, all zero/None. `render_history_block` already filters `months[k]["spend"] > 0` for best/worst, so empty months never pollute the summary.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_history.py`:

```python
def test_empty_months_are_memoized_and_not_refetched(db_session):
    calls = []

    def ffm(first, last):
        calls.append(first.isoformat()[:7])
        return []                       # Meta has nothing for any month

    history.ensure(ACC, LVL, ffm, date(2026, 7, 15), months_back=4)
    first_pass = len(calls)
    assert first_pass > 0

    calls.clear()
    history.ensure(ACC, LVL, ffm, date(2026, 7, 15), months_back=4)
    # only the REBUILD_RECENT_MONTHS window may be refetched; settled empties are memoized
    assert len(calls) <= history.REBUILD_RECENT_MONTHS, \
        f"empty months refetched: {calls}"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_history.py -k empty_months -v`
Expected: FAIL — the second pass refetches every month (`len(calls) == first_pass`).

- [ ] **Step 3: Implement**

Add beside `RETENTION_MONTHS` in `history.py`:

```python
# A month Meta genuinely has no data for. Stored so it is never refetched; keys match
# rollup()'s so render_history_block reads it without special-casing.
EMPTY_ROLLUP = {
    "spend": 0.0, "revenue": 0.0, "purchases": 0, "roas": 0.0, "cpa": 0.0,
    "link_ctr": 0.0, "cpm": 0.0, "frequency": 0.0, "campaigns": 0,
    "best_campaign": None, "worst_campaign": None,
}
```

In `ensure()`, replace the `if facts:` block:

```python
        if facts is None:
            continue                     # caller declined this month; do not memoize
        months[ym] = rollup(facts) if facts else dict(EMPTY_ROLLUP)
        built += 1
```

> `dict(EMPTY_ROLLUP)` copies — `attach_deltas` writes a `"mom"` key into each month in place, and a shared constant would accumulate it.
>
> **P12 — the `None` guard is not optional.** `ensure`'s docstring defines three outcomes: a list of facts (roll up), an empty list (Meta has nothing), and `None` (*"month skipped"*). Without the guard, `if facts else EMPTY_ROLLUP` collapses the last two — and since D3's entire purpose is to make memoization **permanent**, a caller's "don't record this" would become a fake-empty month stored forever. Latent today (`chat.py:524-531` returns a list on both branches, never `None`), but this is the one place the escape hatch must not be quietly repurposed. The `except Exception: continue` above occupies the *failure* role; `None` is the *intent* role.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_history.py -v`
Expected: PASS — including the pre-existing `test_attach_deltas_math` and the `ensure` tests.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/history.py apps/ai-layer/tests/test_history.py
git commit -m "fix(ai-layer): memoize empty months so the historic backfill stops refetching them"
```

---

## Task 5: D1 — one app-wide `MetaError` handler

**Files:**
- Modify: `ai_layer/api.py:37` (after `app = FastAPI(...)`)
- Modify: `ai_layer/api.py:281-296` (`chat_endpoint` — remove the local try/except)
- Test: `tests/test_api.py`

**The defect:** `_chat_messages()` builds context **before** the try/except in `chat_endpoint`, so a `MetaError` raised while fetching context escapes as a bare 500. `/chat/stream` calls the same function and has **no** handler at all. `/ingest` and `/insights` have none either.

Both `/chat` and `/chat/stream` call `_chat_messages` **before** opening the stream, so an app-level handler can still set a status code — HTTP status cannot change once a `StreamingResponse` body has started.

**Interfaces:**
- Consumes: `ml.MetaError` with `.status`, `.code`, `.subcode`, `.message`.
- Produces: every endpoint maps an uncaught `MetaError` to **429** when rate-limited, **502** otherwise. The existing local handler in `chat_endpoint` is deleted — the app-level one subsumes it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api.py`:

```python
def test_meta_rate_limit_returns_429_on_chat_stream(client, monkeypatch):
    from ai_layer import api as api_mod, meta_live as ml

    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")

    def boom(*a, **k):
        raise ml.MetaError(400, 4, 1504039, "User request limit reached")

    monkeypatch.setattr(api_mod, "_chat_messages", boom)
    r = client.post("/chat/stream", json={"account_id": "act_1", "message": "hi"})
    assert r.status_code == 429


def test_meta_error_returns_502_on_ingest(client, monkeypatch):
    from ai_layer import api as api_mod, store, meta_live as ml

    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", "tok")

    def boom(*a, **k):
        raise ml.MetaError(400, 100, None, "Invalid parameter")

    monkeypatch.setattr(store, "ingest", boom)
    r = client.post("/ingest/act_1")
    assert r.status_code == 502
```

> **P8 — the env patches are load-bearing, not boilerplate.** Every existing test in this file opens with them (`test_api.py:85-86`, `:127`, `:147`). Without them the result depends on the developer's `.env`: with `AI_LAYER_API_KEY` set both tests **401**; `/chat/stream` **503**s because the `OPENROUTER_API_KEY` guard runs *before* the patched `_chat_messages`; `/ingest` **400**s at `_need_token`. Step 2's "Expected: FAIL with 500" would then be a false negative that looks like the fix already works.

`config` is already imported in `tests/test_api.py`. Match the file's existing `client` fixture and auth-header convention.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && pytest tests/test_api.py -k "429_on_chat_stream or 502_on_ingest" -v`
Expected: FAIL — both return 500.

- [ ] **Step 3: Implement**

Add immediately after `app = FastAPI(...)` in `api.py`:

```python
@app.exception_handler(ml.MetaError)
def _meta_error_handler(request, exc: ml.MetaError):
    """Every endpoint maps a Meta failure to a real status code. Context is built
    before any stream opens, so this still applies to /chat/stream."""
    limited = exc.code == 4 or exc.subcode in (1504039, 1504022) or \
        "request limit" in (exc.message or "").lower()
    return JSONResponse(status_code=429 if limited else 502,
                        content={"detail": f"Meta API error: {exc}"})
```

Add the import:

```python
from fastapi.responses import JSONResponse, StreamingResponse
```

Delete the now-redundant local handler in `chat_endpoint`:

```python
    else:
        answer, cost, tools_used = chat.run_tool_loop(client, messages, req.account_id,
                                                      token, brand_id=brand)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_api.py -v`
Expected: PASS. Any pre-existing test asserting the old inline 429/502 from `/chat` must still pass — the status codes are unchanged, only the location of the mapping moved.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_api.py
git commit -m "fix(ai-layer): map MetaError to 429/502 app-wide instead of only inside /chat"
```

---

## Task 6: D2 — a non-JSON Meta response must raise `MetaError`

**Files:**
- Modify: `ai_layer/meta_live.py:103-113` (`meta_get`), `ai_layer/meta_live.py:115-145` (`get_insights_paged`)
- Test: `tests/test_meta_live_fetch.py`

**The defect:** `get_insights_paged` calls `body = r.json()` **unguarded** (line 127). Meta returns HTML on gateway errors, so this raises a bare `ValueError` that no retry ladder can classify. `meta_get` guards it — but raises `RuntimeError`, which `is_too_much_data`/`is_beyond_retention` also cannot classify, so the adaptive window-halving never triggers.

**Interfaces:**
- Produces: `_json_or_fail(r) -> dict` in `meta_live.py`. Raises `MetaError(status, None, None, msg)` — **not** `RuntimeError` — so `is_too_much_data` can match on the message and `_fetch_window_adaptive` can split the window.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_meta_live_fetch.py`:

```python
def test_non_json_response_raises_meta_error(monkeypatch):
    import httpx
    from ai_layer import meta_live as ml

    class FakeResp:
        status_code = 502
        text = "<html>Bad Gateway</html>"
        def json(self):
            raise ValueError("no json")

    class FakeClient:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **k): return FakeResp()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(ml.MetaError) as ei:
        ml.get_insights_paged("act_1", {"access_token": "t"})
    assert ei.value.status == 502
    assert ml.is_too_much_data(ei.value), "a 502 must be retryable by window splitting"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_meta_live_fetch.py -k non_json -v`
Expected: FAIL — `ValueError: no json` escapes instead of `MetaError`.

- [ ] **Step 3: Implement**

Add above `meta_get` in `meta_live.py`:

```python
def _json_or_fail(r) -> dict:
    """Meta serves HTML on gateway errors. Raise a classifiable MetaError -- a bare
    ValueError/RuntimeError here defeats is_too_much_data and the window-splitting retry."""
    try:
        body = r.json()
    except ValueError:
        raise MetaError(r.status_code, None, None,
                        f"Non-JSON response: {r.text[:300]}")
    if isinstance(body, dict) and "error" in body:
        _meta_fail(r.status_code, body)
    return body
```

`meta_get` becomes:

```python
def meta_get(path: str, params: dict) -> dict:
    with httpx.Client(timeout=60) as client:
        r = client.get(f"{GRAPH_BASE}/{path}", params=params)
    return _json_or_fail(r)
```

Inside `get_insights_paged`'s loop, replace the unguarded pair:

```python
            r = client.get(url, params=p)
            body = _json_or_fail(r)
            rows.extend(body.get("data", []))
```

- [ ] **Step 4: Verify `is_too_much_data` matches a 502**

`is_too_much_data` returns True when `e.status == 500`. A 502 does **not** match. Widen it so gateway errors are retryable rather than fatal:

```python
    return (
        e.status >= 500
        or e.subcode in (99, 1504044)
        ...
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_meta_live_fetch.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/meta_live.py apps/ai-layer/tests/test_meta_live_fetch.py
git commit -m "fix(ai-layer): raise a classifiable MetaError on non-JSON Meta responses"
```

---

## Task 7: D4 + D5 — cap request-path fetch depth

**Files:**
- Modify: `ai_layer/chat.py` — constants beside `RAW_RETENTION_DAYS`, `build_history_block`'s `history.ensure` call (`:538`)
- Modify (**D5, P6**): `ai_layer/ad_tools.py` — six `"lookback window, default 30, max 60"` schema strings; `ai_layer/chat.py:463` (`_ads`), `:502` (`_placement_breakdown` call), `:504` (`_ads` call)
- Test: `tests/test_chat.py`

**The defect:** a cold account's first `/chat` eagerly backfills up to **37 months** of history and pulls **30 days** of ad-level rows inside the HTTP request. On a `development_access` app that both exhausts the rate budget and blows the HTTP timeout.

> **P6 — where the ad-level default actually lives.** The obvious edit (`_ensure_ad_level`'s `days or …`) is a **no-op**. Verified chain: `ad_tools.py` advertises `"lookback window, default 30, max 60"` in six tool schemas → the model emits `days` or omits it → `chat.py:504` `_ads(args.get("days", 30))` and `:502` `_placement_breakdown(..., args.get("days", 30))` substitute 30 → `chat.py:463` `d = max(1, min(int(days or 30), AD_TOOL_MAX_DAYS))`. By the time `_ensure_ad_level` runs, `days` is always a concrete integer ≥1, so its `or` fallback can never fire. The default is set in **the schema the model reads**, three layers up. (`AD_TOOL_MAX_DAYS = 60` is only the ceiling — the plan's earlier "60-day default" claim was wrong.)

**Interfaces:**
- Produces: `chat.REQUEST_HISTORY_MONTHS = 6` and `chat.AD_TOOL_FIRST_PULL_DAYS = 14`. `AD_TOOL_MAX_DAYS = 60` stays as the ceiling for an explicit deeper request; only the *default* narrows.

> Does **not** fall back to `warm=`. C1 (the `_brand` fallback partition) is unfixed, and the warm path writes to a different partition. C1 is latent — no client sends `X-Brand-Id` — but this task must not be closed out on the assumption that warming covers it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_chat.py`:

```python
def test_request_path_history_is_capped_at_six_months(db_session, monkeypatch):
    from ai_layer import chat, history

    seen = {}

    def fake_ensure(account, level, ffm, today, months_back=history.RETENTION_MONTHS,
                    progress=None, brand_id=None):
        seen["months_back"] = months_back
        return {}

    monkeypatch.setattr(chat.history, "ensure", fake_ensure)
    monkeypatch.setattr(chat.fetch_cache, "cached_rows", lambda *a, **k: [])
    monkeypatch.setattr(chat.fetch_cache, "prune_older_than", lambda *a, **k: 0)
    chat.build_history_block("tok", "act_1", "campaign",
                             date(2026, 1, 1), date(2026, 7, 1), "INR")
    assert seen["months_back"] == chat.REQUEST_HISTORY_MONTHS == 6
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_chat.py -k capped_at_six -v`
Expected: FAIL — `AttributeError: module 'ai_layer.chat' has no attribute 'REQUEST_HISTORY_MONTHS'`.

- [ ] **Step 3: Implement**

Beside `RAW_RETENTION_DAYS` in `chat.py`:

```python
# Request-path depth caps. The 37-month / 60-day ceilings still exist for an explicit
# deeper pull; these are what a cold account triggers inside one HTTP request.
REQUEST_HISTORY_MONTHS = 6
AD_TOOL_FIRST_PULL_DAYS = 14
```

In `build_history_block`, pass the cap:

```python
        months = history.ensure(account, level, facts_for_month, date.today(),
                                months_back=REQUEST_HISTORY_MONTHS,
                                progress=hprog, brand_id=brand_id)
```

- [ ] **Step 4: D5 — change the default where it is actually set (P6)**

All four edits ship together; **any subset is a no-op.**

`ad_tools.py` — all six occurrences:

```python
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
```

`chat.py:502` and `:504` — the substituted default:

```python
                result = _placement_breakdown(token, account, args.get("days", AD_TOOL_FIRST_PULL_DAYS))
            else:
                facts, win = _ads(args.get("days", AD_TOOL_FIRST_PULL_DAYS))
```

`chat.py:463` in `_ads`:

```python
        d = max(1, min(int(days or AD_TOOL_FIRST_PULL_DAYS), AD_TOOL_MAX_DAYS))
```

`_ensure_ad_level` — narrow its own fallback too, for direct callers:

```python
    days = max(1, min(int(days or AD_TOOL_FIRST_PULL_DAYS), AD_TOOL_MAX_DAYS))
```

- [ ] **Step 5: Write the D5 test — it must drive `run_tool_loop`, not `_ensure_ad_level`**

The Step 1 test covers D4 (`months_back`) only. Testing `_ensure_ad_level` directly would pass while production still pulls 30 days, which is exactly how P6 slipped through.

Add to `tests/test_tool_loop.py`, reusing that file's existing `_FakeClient` / `_Msg` / `_Call` doubles and the fact dict from `test_tool_round_then_final_answer`:

```python
def test_days_less_tool_call_defaults_to_fourteen(monkeypatch):
    """D5: the ad-level default is substituted at chat.py:504 from the ad_tools
    schema text -- NOT in _ensure_ad_level, whose `or` fallback can never fire
    because _ads always passes a concrete int. Drive the real run_tool_loop path
    or the fix is a silent no-op."""
    seen = {}

    def fake_ensure(token, account, days, brand_id=None, progress=None):
        seen["days"] = days
        return ([{"ad_id": "a1", "ad_name": "A", "adset_id": "s", "adset_name": "S",
                  "campaign_name": "C", "date": "2026-07-01", "spend": 600.0,
                  "revenue": 1800.0, "purchases": 4.0, "impressions": 10000.0,
                  "link_clicks": 200.0, "frequency": 1.5, "roas": 3.0,
                  "video_3s": 0.0, "thruplay": 0.0}], "2026-07-01..2026-07-14")

    monkeypatch.setattr(chat, "_ensure_ad_level", fake_ensure)
    monkeypatch.setattr(chat, "_record_cost",
                        lambda usage, account=None, op="chat": 0.001)
    client = _FakeClient([
        _Msg(tool_calls=[_Call("t1", "top_ads", json.dumps({"metric": "roas"}))]),
        _Msg(content="done"),
    ])
    messages = [{"role": "system", "content": "s"}, {"role": "user", "content": "top ads?"}]
    chat.run_tool_loop(client, messages, "act_1", "tok")
    assert seen["days"] == chat.AD_TOOL_FIRST_PULL_DAYS == 14
```

The tool call deliberately omits `days` — that is the path the model takes when it follows the schema description, and the only path that exercises the real default.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_chat.py tests/test_tool_loop.py -v`
Expected: PASS.

- [ ] **Step 7: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/chat.py apps/ai-layer/ai_layer/ad_tools.py \
        apps/ai-layer/tests/test_chat.py apps/ai-layer/tests/test_tool_loop.py
git commit -m "perf(ai-layer): cap request-path history at 6 months and default ad pulls to 14 days"
```

---

## Task 7b: C1 — `/ingest` writes to the wrong brand partition

**Files:**
- Modify: `ai_layer/api.py` (`ingest` endpoint signature and both warm calls)
- Test: `tests/test_api.py`

> **Scope note:** the register triaged C1 **✅ options 1 + 4** — *"Multi-tenancy work deferred; these two are not."* Rev 2 of the integration plan parked C1 wholesale; that was a drafting error, not a decision. The **multi-tenancy redesign (#34) stays deferred** — options 2 and 3 are explicitly not taken. Only the 4-line point fix and the ~10-line guard test are in scope here.

**The defect:** `/ingest` is the **only** endpoint whose signature lacks `brand: str | None = Depends(caller_brand)`. Its siblings all have it. So the warm calls fall through `repository._brand(None, account_id)` and write under `brand_id='act_123'`, while the follow-up `/chat` carrying `X-Brand-Id: brand_A` reads a **different partition**. The warm path cannot warm anything.

**Second, independent bug on the same lines:** `if "cache" in warm` is a **substring** test — `warm=nocache` triggers cache warming and `warm=skip-history` triggers history warming.

> This is latent today (no client sends `X-Brand-Id`), but it is confirmed and 4 lines. Note the register's J2 sequencing: Task 7's depth caps must **not** be closed out on the assumption that `warm=` covers them — Task 7 already states this.

**Interfaces:**
- Produces: `ingest` gains `brand: str | None = Depends(caller_brand)`, threaded into `_cached_dataset` and `build_history_block`. `warm` is parsed as comma-separated **membership**, not substring.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api.py`:

```python
def test_ingest_threads_brand_into_warm_calls(client, monkeypatch):
    from ai_layer import api as api_mod, store

    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", "tok")

    seen = {}
    monkeypatch.setattr(store, "ingest",
                        lambda *a, **k: {"account_id": "act_1", "rows_upserted": 0})
    monkeypatch.setattr(api_mod, "_cached_dataset",
                        lambda acct, days, tok, brand: seen.update(brand=brand) or (None, None))
    client.post("/ingest/act_1?warm=cache", headers={"X-Brand-Id": "brand_A"})
    assert seen["brand"] == "brand_A", "warm must write to the caller's partition"


def test_warm_target_is_membership_not_substring(client, monkeypatch):
    from ai_layer import api as api_mod, store

    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", "tok")

    called = []
    monkeypatch.setattr(store, "ingest",
                        lambda *a, **k: {"account_id": "act_1", "rows_upserted": 0})
    monkeypatch.setattr(api_mod, "_cached_dataset",
                        lambda *a, **k: called.append("cache") or (None, None))
    client.post("/ingest/act_1?warm=nocache")
    assert called == [], "'nocache' must not trigger cache warming"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && pytest tests/test_api.py -k "threads_brand or membership_not_substring" -v`
Expected: FAIL — the first with `KeyError: 'brand'` or `brand is None`, the second with `called == ['cache']`.

- [ ] **Step 3: Implement**

```python
@app.post("/ingest/{account_id}", response_model=IngestResult, dependencies=[Depends(require_api_key)])
def ingest(account_id: str, preset: str = Query("last_30d"),
          warm: str | None = Query(None,
                                   description="comma-separated warm targets: cache, history"),
          token: str | None = Depends(caller_token),
          brand: str | None = Depends(caller_brand)):
    result = IngestResult(**store.ingest(_need_token(token), account_id, preset=preset))
    targets = {w.strip() for w in (warm or "").split(",") if w.strip()}
    if targets:
        tok = _need_token(token)
        if "cache" in targets:
            _cached_dataset(account_id, 30, tok, brand)
        if "history" in targets:
            chat.build_history_block(tok, account_id, "campaign",
                                     date.today() - timedelta(days=30),
                                     date.today() - timedelta(days=1), "INR",
                                     brand_id=brand)
    return result
```

- [ ] **Step 4: Write the route-introspection guard test (option 4)**

This is the part that prevents the **next** endpoint from forgetting. Add to `tests/test_api.py`:

```python
# Endpoints that read or write brand-partitioned tables and MUST scope by caller.
BRAND_PARTITIONED = {
    "/ingest/{account_id}", "/chat", "/chat/stream", "/cost",
    "/competitors/{account_id}", "/competitors/{account_id}/refresh",
}
# Brand-partitioned but NOT yet scoped. Existing debt, owned by #34. Named here so
# the gap stays visible instead of passing by omission -- do not extend casually.
KNOWN_DEBT = {"/insights/{account_id}", "/blended/{account_id}"}


def test_brand_partitioned_endpoints_declare_caller_brand():
    """_brand(brand_id, account_id) falls back to account_id, so a forgotten
    Depends(caller_brand) never errors -- it silently writes to a different VALID
    partition. /ingest was the first endpoint to forget it; this catches the next."""
    import inspect
    from ai_layer import api as api_mod

    by_path = {r.path: r for r in api_mod.app.routes if hasattr(r, "path")}
    missing = []
    for path in BRAND_PARTITIONED:
        route = by_path.get(path)
        assert route is not None, f"{path} is no longer a registered route -- update this list"
        params = inspect.signature(route.endpoint).parameters
        if not any(getattr(p.default, "dependency", None) is api_mod.caller_brand
                   for p in params.values()):
            missing.append(path)
    assert not missing, f"endpoints missing Depends(caller_brand): {missing}"
    assert not (BRAND_PARTITIONED & KNOWN_DEBT), "an endpoint cannot be both scoped and debt"
```

> **P3 — why a watchlist and not a sweep over `app.routes`.** Iterating every registered route pulls in FastAPI's own `/docs`, `/docs/oauth2-redirect` and `/redoc`, plus `/blended/{account_id}` and the eight `/creative/*` router endpoints — ~13 paths, none of which declare `caller_brand`. A sweep fails immediately and the only way to green it is to exempt most of the app, which guts the check. The watchlist asserts on the surface that actually touches brand-partitioned tables, and the `assert route is not None` line means a renamed or deleted endpoint fails loudly rather than silently dropping out of coverage.
>
> **Tradeoff, stated plainly:** a *brand-new* endpoint is not caught until someone adds it to `BRAND_PARTITIONED`. The sweep would catch it automatically — at the cost of a blanket `/creative/*` exemption that hides the same class of bug in a less visible place. This encodes intent; it does not discover it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_api.py -v`
Expected: PASS. If the guard reports a path, **fix that endpoint** — do not move it into `KNOWN_DEBT` without an explicit decision.

- [ ] **Step 6: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_api.py
git commit -m "fix(ai-layer): scope /ingest warm calls to the caller's brand; match warm targets exactly"
```

---

## Task 8: D6 + D7 — bound the history read and prune on ingest

**Files:**
- Modify: `ai_layer/fetch_cache.py:111-118` (`cached_rows`)
- Modify: `ai_layer/chat.py:522` (call site), `ai_layer/api.py` (`ingest` endpoint)
- Test: `tests/test_fetch_cache.py`

**The defect (D6):** `build_history_block` calls `cached_rows(account, level)` with **no bound** — it loads every cached row for the account into memory to filter a few months out of it. `_repo.load_insight_rows` already accepts `since`; `cached_rows` just never passes one.

**The defect (D7):** `fetch_cache.prune_older_than(...)` runs unconditionally at the end of **every** `build_history_block`, so every uncached `POST /chat` issues two DELETEs (`insight_rows` + `insight_fetch_log`) even when nothing is older than the 183-day cutoff. Under concurrent chats for one account these contend with `replace_insight_span`'s delete-then-insert.

> **P7 — the register's chosen option A is "*Move* the prune to the ingest path. Pruning belongs with the writer."** Adding a prune to `/ingest` while leaving `chat.py:544` in place is a **copy**, not a move: the write amplification and lock contention survive untouched. An earlier draft of this plan restated D7 as "ingest-only accounts grow unbounded" — a real but *different* (and lesser) problem — and then solved only that one. Both halves ship here.

**Interfaces:**
- Produces: `cached_rows(account, level, brand_id=None, since=None)` — `since` is an ISO date string, passed straight through.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_fetch_cache.py`:

```python
def test_cached_rows_honours_since(db_session):
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 6, 1), date(2026, 6, 5), _rows_for, today=today)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 5), _rows_for, today=today)
    assert len(fetch_cache.cached_rows(ACC, LVL)) == 10
    assert len(fetch_cache.cached_rows(ACC, LVL, since="2026-07-01")) == 5
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -k honours_since -v`
Expected: FAIL — `TypeError: cached_rows() got an unexpected keyword argument 'since'`.

- [ ] **Step 3: Implement D6**

```python
def cached_rows(account: str, level: str, brand_id: str | None = None,
                since: str | None = None) -> list[dict]:
    """Cached raw rows for this account+level (no fetch). `since` bounds the read in
    SQL -- the history block needs months, not the whole account."""
    try:
        return _repo.load_insight_rows(account, level, since=since, brand_id=brand_id)
    except Exception:  # noqa: BLE001
        log.exception("insight cache read failed")
        return []
```

In `chat.py`'s `build_history_block`, pass the bound the function already knows:

```python
    cache_rows = fetch_cache.cached_rows(account, level, brand_id=brand_id,
                                         since=raw_since.isoformat())
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-layer && pytest tests/test_fetch_cache.py -k honours_since -v`
Expected: PASS.

- [ ] **Step 5: Implement D7 — remove the chat-path prune**

Delete the call at `chat.py:544-546`, at the end of `build_history_block`:

```python
    fetch_cache.prune_older_than(account, level,
                                 date.today() - timedelta(days=RAW_RETENTION_DAYS),
                                 brand_id=brand_id)
```

and amend that function's docstring, which still advertises the behaviour:

```python
    """Build/refresh monthly historic facts and render them
    (rnd chat.py 963-997; storage seam only). Pruning of raw rows beyond the recent
    tier belongs with the writer -- see the /ingest path."""
```

- [ ] **Step 5b: Add the prune to the ingest path**

In `api.py`'s `ingest` endpoint, prune after the upsert — same function the chat path calls, so the boundary is defined in exactly one place. **Task 7b already added the `brand` parameter**; pass it, or the prune runs against the wrong partition and deletes nothing:

```python
    result = IngestResult(**store.ingest(_need_token(token), account_id, preset=preset))
    # an account that ingests but never chats would otherwise grow raw rows unbounded
    fetch_cache.prune_older_than(account_id, "campaign",
                                 date.today() - timedelta(days=chat.RAW_RETENTION_DAYS),
                                 brand_id=brand)
    targets = {w.strip() for w in (warm or "").split(",") if w.strip()}
```

- [ ] **Step 5c: Test that the chat path no longer prunes**

Without this, a future refactor quietly restores the DELETEs. Add to `tests/test_chat.py`:

```python
def test_history_block_does_not_prune(db_session, monkeypatch):
    """D7: pruning belongs with the writer (/ingest). Every uncached /chat used to
    issue two DELETEs that contend with replace_insight_span."""
    from ai_layer import chat

    pruned = []
    monkeypatch.setattr(chat.fetch_cache, "prune_older_than",
                        lambda *a, **k: pruned.append(1) or 0)
    monkeypatch.setattr(chat.fetch_cache, "cached_rows", lambda *a, **k: [])
    monkeypatch.setattr(chat.history, "ensure", lambda *a, **k: {})
    chat.build_history_block("tok", "act_1", "campaign",
                             date(2026, 1, 1), date(2026, 7, 1), "INR")
    assert pruned == [], "the read path must not prune"
```

`tests/test_chat.py:218` already monkeypatches `prune_older_than` in another test; that patch becomes vestigial but harmless — leave it.

- [ ] **Step 6: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/fetch_cache.py apps/ai-layer/ai_layer/chat.py \
        apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_fetch_cache.py \
        apps/ai-layer/tests/test_chat.py
git commit -m "perf(ai-layer): bound the history cache read; move the prune from chat to ingest"
```

---

## Task 9: Batch 3a — `brain.py` and `history.py` cleanups (B4, H1)

**Files:**
- Modify: `ai_layer/brain.py:41-52` (delete `pct`, `direction`)
- Modify: `ai_layer/history.py:169` (`attach_deltas` at render, not at save)
- Test: `tests/test_brain.py`, `tests/test_history.py`

**B4:** module-level `pct()` and `direction()` are dead — nothing calls them, and `pct` is **shadowed** by `_direction`'s parameter and by `analyze`'s local, which is exactly the kind of name collision that produces a 3am bug.

**H1:** `ensure()` calls `attach_deltas(months)` before `save()`, so the `mom` key is **persisted**. It is derived data — recomputable from the stored rollups — and persisting it means a corrected earlier month leaves a stale `mom` on its successor forever.

- [ ] **Step 1: Verify B4's targets are genuinely dead**

```bash
cd apps/ai-layer && grep -rn "\bbrain\.pct\|\bbrain\.direction\|[^_]\bdirection(" --include=*.py . | grep -v "_direction"
```

Expected: **no output** outside `brain.py`'s own definitions. If anything appears, do not delete — report it.

- [ ] **Step 2: Delete the dead functions**

Remove from `brain.py`:

```python
def pct(x):
    return f"{x:+.1f}%"


def direction(x, up="rose", down="fell", flat="held steady"):
    if x > 1.5:
        return up
    if x < -1.5:
        return down
    return flat
```

- [ ] **Step 3: Run the suite**

Run: `cd apps/ai-layer && pytest -q`
Expected: PASS. A failure here means step 1's grep missed a caller — restore and report.

- [ ] **Step 4: Write the failing test for H1**

Add to `tests/test_history.py`:

```python
def test_mom_is_not_persisted(db_session):
    def ffm(first, last):
        return [{"date": first.isoformat(), "campaign_name": "c", "spend": 100.0,
                 "revenue": 200.0, "impressions": 1000.0, "link_clicks": 50.0,
                 "purchases": 10.0, "frequency": 1.0}]

    history.ensure(ACC, LVL, ffm, date(2026, 7, 15), months_back=4)
    stored = history.load(ACC, LVL)
    assert stored, "months must be stored"
    assert all("mom" not in m for m in stored.values()), \
        "mom is derived; persisting it strands a stale delta when a month is corrected"
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd apps/ai-layer && pytest tests/test_history.py -k mom_is_not_persisted -v`
Expected: FAIL — every stored month carries `mom`.

- [ ] **Step 6: Implement H1**

In `ensure()`, save first, then attach deltas to the in-memory copy that is returned:

```python
    if built:
        save(account, level, months, brand_id=brand_id)
    attach_deltas(months)          # derived at render time; never persisted
    return months
```

In `render_history_block`, attach for callers that load straight from the store:

```python
def render_history_block(months: dict, currency: str = "INR", tail: int = 24) -> str:
    if not months:
        return "(No historic monthly facts stored yet.)"
    attach_deltas(months)
    keys = sorted(months)
```

`attach_deltas` is idempotent — it overwrites `mom` wholesale — so calling it twice is harmless.

- [ ] **Step 6b: Strip legacy `mom` at the writer — P11**

Reordering `save` and `attach_deltas` stops *new* `mom` keys being persisted, but `load()` returns pre-fix rows that already contain one (`models.py:200`'s docstring even says *"incl. mom"*), and `ensure` re-persists those dicts unchanged — so the stale delta survives forever. The Task 9 test passes only because it uses a fresh account.

One line at the single writer, in `repository.save_monthly_facts`, covers every caller:

```python
            [{"brand_id": bid, "account_id": account_id, "level": level, "month": month,
              # mom is derived at render time; never persist it (legacy rows carry one)
              "rollup": {k: v for k, v in rollup.items() if k != "mom"}}
             for month, rollup in months.items()])
```

> If Task 10's E2 batching has already landed, apply this inside that `executemany` list comprehension; if not, apply it inside the current per-month loop's `values(...)`. Either way it is the same one-line filter at the same function.

Extend the Step 4 test to cover it:

```python
def test_legacy_mom_is_stripped_on_save(db_session):
    _repo.save_monthly_facts("act_h1", "campaign",
                             {"2026-05": {"spend": 1.0, "mom": {"roas": 5.0}}})
    assert "mom" not in _repo.load_monthly_facts("act_h1", "campaign")["2026-05"]
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/ai-layer && pytest tests/test_history.py -v`
Expected: PASS.

- [ ] **Step 8: Run the full suite and commit**

```bash
cd apps/ai-layer && pytest -q
git add apps/ai-layer/ai_layer/brain.py apps/ai-layer/ai_layer/history.py \
        apps/ai-layer/ai_layer/db/repository.py \
        apps/ai-layer/tests/test_history.py apps/ai-layer/tests/test_repository_facts.py
git commit -m "refactor(ai-layer): drop dead brain helpers; derive MoM at render instead of persisting it"
```

---

## Task 10: Batch 3b — repository batching and the duplicate preset path (E1, E2, G1)

**Files:**
- Modify: `ai_layer/db/repository.py:352-356` (`replace_insight_span`), `ai_layer/db/repository.py:399-411` (`save_monthly_facts`)
- Modify: `ai_layer/meta_live.py` (new `fetch_dataset_for_preset`), `ai_layer/api.py:100-111` (`_fetch_live`), `ai_layer/store.py:26-46` (`ingest`)
- Test: `tests/test_repository_facts.py`, `tests/test_store.py`

**E1:** `replace_insight_span` adds rows one at a time in a Python loop. A 60-day ad-level span is thousands of `s.add` calls.
**E2:** `save_monthly_facts` issues one `pg_insert` per month — up to 37 round trips where one `executemany` does.
**G1:** `api._fetch_live` and `store.ingest` contain the **same** day-preset branch. They have already drifted once (Task 1 changed one of them); the drift is between `/ingest` and `/insights?source=live`.

**Interfaces:**
- Produces: `ml.fetch_dataset_for_preset(token, account, preset, level="campaign") -> tuple[mt.Dataset, dict]` returning `(dataset, envelope_meta)`, so `store.ingest` keeps its access to `skipped` from Task 1.

- [ ] **Step 1: Implement E1**

In `replace_insight_span`, replace the per-row loop:

```python
        s.execute(delete(m.InsightRow).where(
            m.InsightRow.brand_id == bid, m.InsightRow.account_id == account_id,
            m.InsightRow.level == level, m.InsightRow.date.in_(span)))
        if dedup:
            s.bulk_insert_mappings(m.InsightRow, [
                {"brand_id": bid, "account_id": account_id, "level": level,
                 "date": dt.date.fromisoformat(date_iso), "row_key": row_key, "raw": raw}
                for date_iso, row_key, raw in dedup.values()])
        s.commit()
```

- [ ] **Step 2: Implement E2**

In `save_monthly_facts`, one statement for all months:

```python
    bid = _brand(brand_id, account_id)
    if not months:
        return
    with engine.get_session() as s:
        stmt = pg_insert(m.MonthlyFacts)
        s.execute(stmt.on_conflict_do_update(
            index_elements=[m.MonthlyFacts.brand_id, m.MonthlyFacts.account_id,
                            m.MonthlyFacts.level, m.MonthlyFacts.month],
            set_={"rollup": stmt.excluded.rollup, "updated_at": func.now()}),
            [{"brand_id": bid, "account_id": account_id, "level": level,
              "month": month, "rollup": rollup} for month, rollup in months.items()])
        s.commit()
```

> `set_` must use `stmt.excluded.rollup`, **not** the loop variable — with `executemany` there is no per-row Python value to close over. Getting this wrong writes the same rollup to every month.

- [ ] **Step 3: Write the E2 regression test — P9**

**The coverage claimed in an earlier draft does not exist.** `tests/test_repository_facts.py` has **no** monthly-facts test at all; `test_attach_deltas_math` is pure in-memory; and the `ensure` round-trip stores two months whose rollups are **identical by construction** (both built from `_fact(first.isoformat())`), so "the same rollup was written to every month" and "correct" produce indistinguishable output. The `stmt.excluded` trap is unverified without this:

```python
def test_save_monthly_facts_writes_distinct_rollups(db_session):
    """E2: with executemany, set_ must use stmt.excluded -- closing over a loop
    variable writes one month's rollup to every row."""
    _repo.save_monthly_facts("act_e2", "campaign",
                             {"2026-05": {"spend": 1.0}, "2026-06": {"spend": 2.0}})
    back = _repo.load_monthly_facts("act_e2", "campaign")
    assert back["2026-05"]["spend"] == 1.0 and back["2026-06"]["spend"] == 2.0

    # and the conflict path must update the targeted month only
    _repo.save_monthly_facts("act_e2", "campaign", {"2026-06": {"spend": 9.0}})
    back = _repo.load_monthly_facts("act_e2", "campaign")
    assert back["2026-06"]["spend"] == 9.0 and back["2026-05"]["spend"] == 1.0
```

- [ ] **Step 3b: Run the repository and history tests**

Run: `cd apps/ai-layer && pytest tests/test_repository_facts.py tests/test_history.py tests/test_fetch_cache.py -v`
Expected: PASS. If `test_save_monthly_facts_writes_distinct_rollups` reports both months with the same spend, Step 2 used the loop variable instead of `stmt.excluded`.

- [ ] **Step 4: Implement G1**

Add to `meta_live.py` beside `fetch_dataset_range`:

```python
def fetch_dataset_for_preset(token, account, preset="last_30d", level="campaign"):
    """Preset -> (Dataset, envelope meta). Day-shaped presets (last_Nd) route through
    the chunked range fetcher; Meta 500s (code=1 subcode=99) on the legacy unchunked
    pull past ~21 daily days. Single definition -- /ingest and /insights?source=live
    had drifted copies of this branch."""
    days = preset_days(preset)
    if days is not None:
        until = date.today() - timedelta(days=1)
        since = until - timedelta(days=days - 1)
        env = fetch_envelope(token, account=account, since=since, until=until, level=level)
    else:
        env = fetch_envelope_preset(token, account=account, preset=preset, level=level)
    return mt.normalize(env), env["meta"]
```

`api.py` — delete `_fetch_live` entirely and call through from `_dataset`:

```python
    return ml.fetch_dataset_for_preset(_need_token(token), account_id, preset)[0]
```

`store.py` `ingest` becomes:

```python
def ingest(token: str, account: str, preset: str = "last_30d", level: str = "campaign") -> dict:
    """Trailing-window pull -> upsert. Preset routing lives in meta_live."""
    ds, meta = ml.fetch_dataset_for_preset(token, account, preset=preset, level=level)
    n = upsert_dataset(ds)
    return {"account_id": account, "rows_upserted": n, "since": ds.since, "until": ds.until,
            "skipped": [list(s) for s in meta.get("skipped", [])]}
```

- [ ] **Step 4b: Retarget `test_insights_live_source_uses_chunked_range_fetcher` — P4, same commit**

`tests/test_api.py:81` patches `ml.fetch_dataset_range` and installs `legacy_should_not_run` on `fetch_dataset`, proving `/insights?source=live` takes the chunked path. G1 deletes `_fetch_live` and routes through `fetch_dataset_for_preset`, so **neither patched name is hit** — the real `fetch_envelope` runs, calls `list_accounts`, and issues a live Graph request with the fake token. The invariant is still worth asserting; it moves one level down:

```python
def test_insights_live_source_uses_chunked_range_fetcher(client, monkeypatch):
    """source=live with a day-shaped preset must route through the chunked, size-safe
    envelope fetcher -- the legacy unchunked pull 500s on big accounts past ~21 days."""
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", "tok")

    def fake_envelope(token, account, since, until, level="campaign", progress=None):
        return {"meta": {"account_id": account, "account_name": "Acme", "currency": "INR",
                         "level": level,
                         "date_range": {"since": since.isoformat(), "until": until.isoformat()}},
                "data": [raw("A", "2026-05-01", 100, 2, 300)]}

    def legacy_should_not_run(*a, **k):
        raise AssertionError("the legacy preset envelope must not run for a day-shaped preset")

    monkeypatch.setattr(ml, "fetch_envelope", fake_envelope)
    monkeypatch.setattr(ml, "fetch_envelope_preset", legacy_should_not_run)
    r = client.get("/insights/act_live?source=live&preset=last_7d")
    assert r.status_code == 200
```

Keep the file's existing `raw(...)` helper and assertion style.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/ai-layer && pytest -q`
Expected: PASS. Two Task 1 tests must still pass — `test_ingest_surfaces_skipped_spans` and the retargeted `test_ingest_non_day_preset_keeps_legacy_fetch` — since `fetch_dataset_for_preset` still calls `ml.fetch_envelope` / `ml.fetch_envelope_preset`, the names they patch.

- [ ] **Step 6: Commit**

```bash
git add apps/ai-layer/ai_layer/db/repository.py apps/ai-layer/ai_layer/meta_live.py \
        apps/ai-layer/ai_layer/api.py apps/ai-layer/ai_layer/store.py \
        apps/ai-layer/tests/test_repository_facts.py apps/ai-layer/tests/test_api.py
git commit -m "perf(ai-layer): batch insight and monthly-fact writes; single preset-routing path"
```

---

## Task 11: Batch 3c — Apify raw payloads, redundant account lookup, pagination warning (E3, E5, G4, G2)

**Files:**
- Modify: `ai_layer/competitor/apify_ads.py:213` (`keep_raw` default)
- Modify: `ai_layer/meta_live.py` (memoize `list_accounts`)
- Modify: `ai_layer/meta_live.py:134` (pagination warning)
- Test: `tests/test_competitor.py`, `tests/test_chat.py`

**E3:** `scrape(keep_raw=True)` stores `record["_raw_by_competitor"]` — the full unnormalized Apify payload — alongside the normalized ads. **Nothing ever reads it** (grep confirms zero readers), but `competitor_pipeline.stored_block` loads the whole record on **every** `/chat`. It is written once and re-read on every chat turn. Flip the default; keep the parameter as a scrape-time escape hatch.

**E5:** `_cached_dataset` calls `ml.list_accounts(token)` (api.py:181), and `ml.fetch_envelope` calls it **again** internally (meta_live.py:287) for every window. On a cold multi-window pull that is N+1 identical Graph calls against a `development_access` rate budget.

> **Deviation from the rev-2 plan, flagged:** rev 2 specified "read name/currency from the stored row". A short-TTL memo on `list_accounts` is smaller and fixes it at the single point **all** callers route through, rather than at one of them. Same defect, fewer lines, wider coverage.

**G4:** `get_insights_paged` breaks the loop when `paging.next` exists but `cursors.after` does not — silently truncating. Warn so production resolves the open question within days.

**G2:** `chat._daily_totals` (dict path) and `mt.daily_totals` (pandas path) compute the same aggregate twice. This is the only item that *adds* lines: a fixture test asserting they agree.

- [ ] **Step 1: Confirm `_raw_by_competitor` has no readers**

```bash
cd apps/ai-layer && grep -rn "_raw_by_competitor" --include=*.py .
```

Expected: only the write in `apify_ads.py`. Any read means stop — E3 changes behaviour, not just storage.

- [ ] **Step 2: Implement E3**

```python
def scrape(key: str, discovered: dict, max_competitors: int = MAX_COMPETITORS,
           ads_per: int = ADS_PER_COMPETITOR, country: str = DEFAULT_COUNTRY,
           keep_raw: bool = False, progress=None, brand_id: str | None = None) -> dict:
```

The parameter stays — pass `keep_raw=True` from a CLI run when debugging a normalization bug. The default no longer taxes every `/chat` read.

- [ ] **Step 3: Write the E3 test**

Add to `tests/test_competitor.py`:

```python
def test_scrape_does_not_store_raw_payloads_by_default(monkeypatch, db_session):
    from ai_layer.competitor import apify_ads

    monkeypatch.setattr(apify_ads.config, "APIFY_TOKEN", "t")
    monkeypatch.setattr(apify_ads, "scrape_competitor",
                        lambda *a, **k: ([{"id": "1", "snapshot": {}}], "handle"))
    monkeypatch.setattr(apify_ads, "normalize_ad", lambda r, n: {"id": r["id"], "brand": n})
    monkeypatch.setattr(apify_ads, "save_ads", lambda *a, **k: None)

    rec = apify_ads.scrape("act_1", {"competitors": [{"name": "Acme"}]})
    assert "_raw_by_competitor" not in rec
    assert rec["total_ads"] == 1, "normalized ads are still stored"
```

- [ ] **Step 4: Implement E5**

Add to `meta_live.py` above `list_accounts`:

```python
_ACCOUNTS_TTL_S = 300
_accounts_memo: dict[str, tuple[float, list[dict]]] = {}


def list_accounts(token: str) -> list[dict]:
    """All ad accounts the token can see (id, name, currency, status).

    Memoized for _ACCOUNTS_TTL_S: fetch_envelope calls this once per window and
    _cached_dataset calls it again, so a cold multi-window pull otherwise burns N+1
    identical Graph calls against a development-tier rate budget.
    ponytail: process-local dict, keyed by token so it never crosses tenants; swap for
    a shared cache only if this runs multi-process and the call count still matters.
    """
    hit = _accounts_memo.get(token)
    if hit and (time.monotonic() - hit[0]) < _ACCOUNTS_TTL_S:
        return hit[1]
    accts = meta_get("me/adaccounts", {
        "access_token": token,
        "fields": "account_id,name,currency,account_status",
        "limit": 100,
    }).get("data", [])
    _accounts_memo[token] = (time.monotonic(), accts)
    return accts
```

Add `import time` to `meta_live.py`'s imports.

**P13 — the memo must not leak across tests.** A module-level dict keyed by token survives between tests in one process, so any future test that monkeypatches `meta_get` and reuses a token string gets a 5-minute-stale hit from an earlier test. Add an autouse fixture to `tests/conftest.py`:

```python
@pytest.fixture(autouse=True)
def _clear_accounts_memo():
    """meta_live memoizes list_accounts for 5 min; a module-level dict would
    otherwise serve one test's mocked accounts to the next."""
    from ai_layer import meta_live
    meta_live._accounts_memo.clear()
    yield
    meta_live._accounts_memo.clear()
```

- [ ] **Step 5: Write the E5 test**

Add to `tests/test_meta_live_fetch.py`:

```python
def test_list_accounts_is_memoized(monkeypatch):
    from ai_layer import meta_live as ml

    calls = []
    monkeypatch.setattr(ml, "meta_get",
                        lambda p, params: calls.append(p) or {"data": [{"account_id": "1"}]})
    ml._accounts_memo.clear()
    ml.list_accounts("tok")
    ml.list_accounts("tok")
    assert len(calls) == 1, "the second call inside the TTL must not hit Graph"
    ml.list_accounts("other-tok")
    assert len(calls) == 2, "a different token must not read another token's accounts"
    ml._accounts_memo.clear()
```

- [ ] **Step 6: Implement G4**

In `get_insights_paged`'s loop:

```python
            paging = body.get("paging", {}) or {}
            after = (paging.get("cursors") or {}).get("after")
            if paging.get("next") and not after:
                log.warning("meta paging: next present without an after cursor "
                            "(account=%s pages=%d rows=%d) -- results may be truncated",
                            account, pages, len(rows))
            if not paging.get("next") or not after or len(rows) >= max_rows:
                break
```

If `meta_live.py` has no module `log`, add:

```python
log = logging.getLogger("ai_layer.meta_live")
```

with `import logging`.

- [ ] **Step 7: Implement G2 — the agreement fixture**

Add to `tests/test_chat.py`:

```python
def test_daily_totals_paths_agree():
    """chat._daily_totals (dicts) and mt.daily_totals (pandas) compute the same
    aggregate. They have drifted before; this is the tripwire."""
    import pandas as pd
    from ai_layer import chat, meta_transform as mt

    facts = []
    for i in range(5):
        d = (date(2026, 7, 1) + timedelta(days=i)).isoformat()
        for camp in ("a", "b"):
            facts.append({"date": d, "campaign_name": camp, "spend": 10.0 + i,
                          "revenue": 25.0 + i, "impressions": 100.0, "link_clicks": 5.0,
                          "purchases": 2.0, "frequency": 1.1})

    dicts = chat._daily_totals(facts)
    df = mt.daily_totals(pd.DataFrame(facts).assign(date=lambda x: pd.to_datetime(x.date)))

    assert len(dicts) == len(df)
    for row, (_, p) in zip(dicts, df.iterrows()):
        assert row["spend"] == pytest.approx(float(p.spend))
        assert row["revenue"] == pytest.approx(float(p.revenue))
        assert row["roas"] == pytest.approx(float(p.roas))
```

If `mt.daily_totals` expects different column names or dtypes, adapt the DataFrame construction to match — **do not** change `mt.daily_totals` to fit the test.

**P17:** `tests/test_chat.py` imports only `os`, `Path` and `pytest` — add `from datetime import date, timedelta` for this test and for Task 7's and Task 8's additions to the same file.

- [ ] **Step 8: Run the full suite**

Run: `cd apps/ai-layer && pytest -q`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/ai-layer/ai_layer/competitor/apify_ads.py apps/ai-layer/ai_layer/meta_live.py \
        apps/ai-layer/tests/conftest.py apps/ai-layer/tests/test_competitor.py \
        apps/ai-layer/tests/test_meta_live_fetch.py apps/ai-layer/tests/test_chat.py
git commit -m "perf(ai-layer): stop storing unread Apify payloads, memoize account lookup, warn on truncated paging"
```

---

## Task 12: Final gate

**Files:** none modified — verification only.

- [ ] **Step 1: Full Test Invariant**

```bash
cd apps/ai-layer && pytest -q
cd ../.. && npx tsc --noEmit 2>&1 | tail -20
npx madge --circular apps/api/src 2>&1 | tail -5
```

Expected: ai-layer at or above the Task 0 baseline · `tsc` baseline-only (`billing.ts:4` stripe) · madge **0 cycles**. Run the default (400/9) and pg (388/10) suites per CLAUDE.md, with the pg preflight `SELECT 1` and single-failure isolated rerun.

- [ ] **Step 2: Confirm nothing forbidden entered history**

```bash
git log --oneline main..integrate/ai-layer-v2
git diff --name-only main..integrate/ai-layer-v2 | grep -E '^(rnd_mine/|railway(\.pub)?$|CLAUDE\.md$|\.env\.test$)'
```

Expected: the second command prints **nothing**.

- [ ] **Step 3: Re-index `STATUS_INDEX.md`**

Add the three `creative_v2` dev_reports docs (register, integration plan, connector requirements) and this plan to `dev_reports/STATUS_INDEX.md`, then commit.

- [ ] **Step 4: Stop**

Report the baseline delta, the commit list, and the two outstanding operational items. **Do not push and do not open a PR** — both need fresh explicit permission from the user.

---

## Outstanding operational items (not code)

1. **A2's ad-level purge** (Task 2 Step 6) — `DELETE FROM ai_layer.insight_rows WHERE level='ad'` plus the fetch log. Trivial statement, but the rebuild is a Meta refetch storm on a `development_access` app. Schedule per-account or into a low window.
2. **`dryayeet` heads-up** — this branch diverges from `creative_v2` @ `17d8ea8`. User is handling this.
3. **gitignore the `railway` / `railway.pub` keypair** — untracked and unignored at repo root. Out of scope for this plan; do not fold it into an ai-layer commit.

## Parked — two different triggers

**Trigger A — ai-layer gains a public domain:** **F1** (competitor refresh double-bills, ~$0.50/sweep) · **F2** (discovery cost logged at an invented price) · **E4** (serial scrape, worst case ~64 min).

All three sit behind `/competitors/*`: no proxy route, no TS caller (verified by grep of `apps/api/src`), no public domain. Deferred on **deployment topology, not code**. Re-gate as a unit the day a domain is enabled.

**Trigger B — a second tenant is onboarded:** **C2** (`_shopify_context` is process-global).

C2 does **not** belong with the group above and must not be re-gated with it. `_shopify_context()` reads `SHOPIFY_STORE`/`SHOPIFY_TOKEN` from process env with no account argument — but **this deployment has only ever had one tenant**, so it reads the only store's credentials and returns correct context every time. The cross-tenant leak the register describes requires a second brand to confuse it with; the register itself notes *"Single-tenant deployments keep full behaviour."*

A second tenant can arrive **without** a public domain, which is why the trigger is separate. When it does, take the register's chosen option B (fail closed, ~5 lines) before onboarding, not after.

**C1's multi-tenancy redesign** (register options 2 and 3) parks with #34. Its point fix and guard test (options 1 + 4) are **in scope — Task 7b**; rev 2 parked C1 wholesale, which contradicted the triage decision.

**B1** is intentional and deliberately not fixed — Task 3 preserves it explicitly.

**Known debt this plan does not close:** `/insights/{account_id}` is brand-partitioned but does not declare `Depends(caller_brand)`. It is named explicitly in Task 7b's guard-test allowlist so it stays visible rather than silently passing. It belongs to #34.

## Out of scope

`rnd_mine/` entirely — dropped in Task 0, four recorded defects unaddressed by design. The connector service — all ten requirements in `connector_improvements/` are forward-looking; `source="connectors"` is opt-in and no task here touches it.
