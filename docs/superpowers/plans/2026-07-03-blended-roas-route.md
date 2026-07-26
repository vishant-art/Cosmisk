# Blended-ROAS Route + Snapshot Cache (#28) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the connector's blended truth as `GET /blended/{account_id}` and add a shared TTL + single-flight snapshot cache so repetitive/concurrent connector requests cost one platform sweep.

**Architecture:** The cache (`get_cached_snapshot`) lives in `ai_layer/connector_source.py` next to the #27 adapter; `fetch_connector_dataset` is refactored through it so `/insights?source=connectors`, `/chat`, and the new `/blended` route all share entries. New pydantic models in `schemas.py`; one new route in `api.py` using the same lazy-import/503 pattern as #27. Spec: `docs/superpowers/specs/2026-07-03-blended-roas-route-design.md`.

**Tech Stack:** Python 3.12, threading (module-level cache + per-key locks), pydantic, FastAPI + TestClient, pytest.

## Global Constraints

- Branch: `feat/ai-layer-adapter`. Never commit `CLAUDE.md` or `.env.test`; never print `.env` secret values.
- Commit messages: plain conventional commits, **no AI attribution of any kind** (no Co-Authored-By trailers, no tool mentions).
- Run tests from `apps/ai-layer` with `../../.venv/bin/python -m pytest tests -q`. Baseline: **168 passed, 7 skipped**. Connector suite (from `apps/connectors`): **47 passed** — this plan must not modify `apps/connectors`.
- Cache TTL default **3600** seconds via env `CONNECTOR_CACHE_TTL_S`; max **100** entries; key `(account_id, preset, tuple(platforms or ()))`.
- The cache-key comment MUST carry the I10 invariant verbatim: "when per-brand credentials (I10) land, the credential identity MUST join this key".
- No writes to the SQLite store; no changes to existing endpoints' behavior.
- `ai_layer/connector_source.py` remains the only ai_layer module importing `connectors`.

## File Structure

- Modify: `apps/ai-layer/ai_layer/connector_source.py` — add cache; refactor `fetch_connector_dataset`.
- Modify: `apps/ai-layer/ai_layer/schemas.py` — append `PlatformStatus`, `BlendedBlock`, `BlendedResponse`.
- Modify: `apps/ai-layer/ai_layer/api.py` — add the `/blended` route (after the `/cost` endpoint) + import the new schemas.
- Test: `apps/ai-layer/tests/test_connector_source.py` — append all new tests (helpers `fact()`/`snap()`, the `client` fixture, and mid-file `sys`/`pytest`/`TestClient`/`api` imports already exist from #27).

---

### Task 1: The snapshot cache — TTL, refresh, key isolation, entry cap

**Files:**
- Modify: `apps/ai-layer/ai_layer/connector_source.py`
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: existing module globals `get_snapshot`, `BrandRef`, `DateWindow`, `_PRESET_DAYS`, `snapshot_to_dataset`; test helpers `fact()`/`snap()`.
- Produces: `get_cached_snapshot(account_id: str, preset: str = "last_30d", platforms: list[str] | None = None, refresh: bool = False) -> tuple[UnifiedSnapshot, str]` (snapshot, fetched_at ISO string); `_cache_clear() -> None`; module attrs `_CACHE_MAX` (int) and `_now_s()` (monkeypatch seams). Tasks 2–3 rely on these exact names. The single-flight lock structure is implemented HERE; Task 2 adds the concurrency test for it.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
# ---- Task: snapshot cache (#28) ----

@pytest.fixture(autouse=True)
def _fresh_cache():
    # Cache is module-level; isolate every test in this file (incl. the earlier
    # #27 fetch tests, which now populate it via fetch_connector_dataset).
    cs._cache_clear()
    yield
    cs._cache_clear()


def _counting_fetcher(calls):
    def fake(brand, window, platforms=None):
        calls.append(brand.brand_id)
        return snap([fact()])
    return fake


def test_cache_miss_fetches_then_hit_reuses(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    s1, at1 = cs.get_cached_snapshot("acme")
    s2, at2 = cs.get_cached_snapshot("acme")
    assert calls == ["acme"]                 # one fetch, second call served from cache
    assert s1 is s2 and at1 == at2
    assert isinstance(at1, str) and "T" in at1   # ISO timestamp present


def test_cache_expires_after_ttl(monkeypatch):
    monkeypatch.delenv("CONNECTOR_CACHE_TTL_S", raising=False)   # default 3600
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    t = [1000.0]
    monkeypatch.setattr(cs, "_now_s", lambda: t[0])
    cs.get_cached_snapshot("acme")
    t[0] += 3599.0
    cs.get_cached_snapshot("acme")           # still fresh
    t[0] += 2.0
    cs.get_cached_snapshot("acme")           # expired -> refetch
    assert len(calls) == 2


def test_refresh_bypasses_fresh_entry(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("acme")
    cs.get_cached_snapshot("acme", refresh=True)
    assert len(calls) == 2


def test_cache_keys_isolate_customers_and_presets(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("acme")
    cs.get_cached_snapshot("globex")                     # other customer -> own entry
    cs.get_cached_snapshot("acme", preset="last_7d")     # other window -> own entry
    cs.get_cached_snapshot("acme")                       # original still cached
    assert calls == ["acme", "globex", "acme"]


def test_cache_caps_entries_evicting_oldest(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    monkeypatch.setattr(cs, "_CACHE_MAX", 2)
    cs.get_cached_snapshot("a")
    cs.get_cached_snapshot("b")
    cs.get_cached_snapshot("c")   # cap hit -> evicts oldest ("a")
    cs.get_cached_snapshot("b")   # still cached
    cs.get_cached_snapshot("a")   # was evicted -> refetch
    assert calls == ["a", "b", "c", "a"]
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: ALL tests in the file error at setup — the new autouse `_fresh_cache` fixture applies file-wide and `cs._cache_clear` does not exist yet (`AttributeError`). That blanket error is the expected red state for this step.

- [ ] **Step 3: Implement the cache** (edit `apps/ai-layer/ai_layer/connector_source.py`)

Add to the imports at the top of the file (after the existing `from __future__ import annotations`):

```python
import os
import threading
import time
from datetime import datetime, timezone
```

Append at the end of the file:

```python
# ---- snapshot cache (#28) ---------------------------------------------------
# Shared by /insights?source=connectors, /chat, and /blended. TTL sized to the
# platforms' own reporting latency (Meta finalizes over ~24h, Google lags ~3h),
# so an hour-old snapshot is fresher than the sources guarantee. Single-flight:
# concurrent callers for one key share a single platform sweep.
#
# Key is (account_id, preset, platforms). Single-tenant .env credentials make
# account_id sufficient today; when per-brand credentials (I10) land, the
# credential identity MUST join this key.

_CACHE_MAX = 100
_cache: dict[tuple, tuple[float, UnifiedSnapshot, str]] = {}   # key -> (at, snap, fetched_at)
_cache_guard = threading.Lock()
_key_locks: dict[tuple, threading.Lock] = {}


def _now_s() -> float:
    return time.time()


def _ttl_s() -> float:
    return float(os.getenv("CONNECTOR_CACHE_TTL_S", "3600"))


def _cache_clear() -> None:
    with _cache_guard:
        _cache.clear()
        _key_locks.clear()


def _fresh(entry: tuple | None, refresh: bool) -> bool:
    return bool(entry) and not refresh and (_now_s() - entry[0]) < _ttl_s()


def get_cached_snapshot(account_id: str, preset: str = "last_30d",
                        platforms: list[str] | None = None,
                        refresh: bool = False) -> tuple[UnifiedSnapshot, str]:
    """Cached cross-platform snapshot -> (snapshot, fetched_at ISO). One fetch
    per key per TTL window; concurrent requests for the same key block on the
    fetching thread and share its result (bounded by the connector deadline)."""
    key = (account_id, preset, tuple(platforms or ()))
    with _cache_guard:
        entry = _cache.get(key)
        if _fresh(entry, refresh):
            return entry[1], entry[2]
        lock = _key_locks.setdefault(key, threading.Lock())
    with lock:                                   # single-flight per key
        with _cache_guard:                       # double-check after the wait
            entry = _cache.get(key)
            if _fresh(entry, refresh):
                return entry[1], entry[2]
        window = DateWindow.last_n_days(_PRESET_DAYS.get(preset, 30))
        brand = BrandRef(
            brand_id=account_id,
            meta_account_id=account_id if account_id.startswith("act_") else None,
        )
        snapshot = get_snapshot(brand, window, platforms)
        fetched_at = datetime.now(timezone.utc).isoformat()
        with _cache_guard:
            if len(_cache) >= _CACHE_MAX:
                oldest = min(_cache, key=lambda k: _cache[k][0])
                _cache.pop(oldest, None)
            _cache[key] = (_now_s(), snapshot, fetched_at)
        return snapshot, fetched_at
```

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): TTL snapshot cache for connector pulls (1h default, per-key)"
```

---

### Task 2: Single-flight under concurrency + route everything through the cache

**Files:**
- Modify: `apps/ai-layer/ai_layer/connector_source.py` (refactor `fetch_connector_dataset` only)
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: Task 1's `get_cached_snapshot` / `_counting_fetcher` / autouse `_fresh_cache`.
- Produces: `fetch_connector_dataset` with an UNCHANGED public signature, now backed by the cache — so `/insights?source=connectors` and `/chat` share entries with `/blended`.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
def test_single_flight_concurrent_requests_share_one_fetch(monkeypatch):
    import threading as th
    calls = []
    gate = th.Event()

    def slow_fetch(brand, window, platforms=None):
        calls.append(1)
        gate.wait(timeout=5)          # hold the fetch open while callers pile up
        return snap([fact()])

    monkeypatch.setattr(cs, "get_snapshot", slow_fetch)
    results = []

    def worker():
        results.append(cs.get_cached_snapshot("acme"))

    threads = [th.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    import time as _t
    _t.sleep(0.2)                     # let every thread reach the key lock
    gate.set()
    for t in threads:
        t.join(timeout=10)
    assert len(calls) == 1            # exactly one platform sweep
    assert len(results) == 5
    assert all(r[0] is results[0][0] for r in results)   # all share the snapshot


def test_fetch_connector_dataset_shares_the_cache(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("act_9", "last_30d")           # warm the entry
    ds = cs.fetch_connector_dataset("act_9", "last_30d")  # must reuse it
    assert len(calls) == 1
    assert ds.source == "connectors" and ds.account_id == "act_9"
```

- [ ] **Step 2: Run to verify status**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: `test_single_flight_...` PASSES already (Task 1 implemented the lock structure — that is fine, it is the concurrency regression guard). `test_fetch_connector_dataset_shares_the_cache` FAILS with `len(calls) == 2` (fetch_connector_dataset still fetches directly).

- [ ] **Step 3: Refactor `fetch_connector_dataset`** — replace the whole function in `connector_source.py` with:

```python
def fetch_connector_dataset(account_id: str, preset: str = "last_30d",
                            platforms: list[str] | None = None) -> mt.Dataset:
    """Adapt the (cached) cross-platform snapshot. Repeat calls within
    CONNECTOR_CACHE_TTL_S share one platform sweep -- see get_cached_snapshot."""
    snapshot, _ = get_cached_snapshot(account_id, preset, platforms)
    return snapshot_to_dataset(snapshot, account_id)
```

(The `window`/`brand` construction now lives only in `get_cached_snapshot`; the #27 test `test_fetch_maps_preset_to_window_and_act_ids_to_meta_account` keeps passing because it monkeypatches `cs.get_snapshot`, which the cache calls.)

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): single-flight verified; adapter fetches ride the shared cache"
```

---

### Task 3: Schemas + the GET /blended/{account_id} route

**Files:**
- Modify: `apps/ai-layer/ai_layer/schemas.py` (append three models at the end)
- Modify: `apps/ai-layer/ai_layer/api.py` (extend the schemas import; add the route after the `/cost` endpoint, before the Creative Studio section)
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: Task 1's `get_cached_snapshot(account_id, preset, platforms=None, refresh=False) -> (UnifiedSnapshot, str)`; existing `client` fixture, `snap()` helper, `require_api_key`, `HTTPException`, `Query`, `Depends`.
- Produces: `GET /blended/{account_id}?preset&refresh` returning `BlendedResponse`; 404 when `snapshot.ok_platforms` is empty; 503 when the connectors package is absent.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
# ---- Task: /blended route (#28) ----

def _rich_snapshot(mismatch=False):
    cur = "MIXED" if mismatch else "INR"
    return UnifiedSnapshot(
        brand_id="acme", since="2026-06-03", until="2026-07-02", currency=cur,
        facts=[],
        blended=Blended(spend=1000.0, revenue_meta_pixel=2500.0,
                        revenue_shopify=3000.0, blended_roas=3.0,
                        revenue_gap_pct=16.67, currency=cur,
                        currency_mismatch=mismatch),
        statuses=[ConnectorStatus(platform="meta", state="ok", fact_count=42,
                                  elapsed_ms=77000, currency="INR"),
                  ConnectorStatus(platform="shopify", state="ok", fact_count=30,
                                  elapsed_ms=3000,
                                  currency="USD" if mismatch else "INR"),
                  ConnectorStatus(platform="google", state="skipped",
                                  detail="no creds")])


def test_blended_route_happy_path(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda account_id, preset="last_30d", platforms=None, refresh=False:
                        (_rich_snapshot(), "2026-07-03T10:00:00+00:00"))
    r = client.get("/blended/acme")
    assert r.status_code == 200
    body = r.json()
    assert body["account_id"] == "acme"
    assert body["fetched_at"] == "2026-07-03T10:00:00+00:00"
    assert body["window"] == {"since": "2026-06-03", "until": "2026-07-02"}
    assert body["blended"]["blended_roas"] == 3.0
    assert body["blended"]["revenue_shopify"] == 3000.0
    assert body["blended"]["currency_mismatch"] is False
    assert body["ok_platforms"] == ["meta", "shopify"]
    states = {s["platform"]: s["state"] for s in body["statuses"]}
    assert states == {"meta": "ok", "shopify": "ok", "google": "skipped"}


def test_blended_route_mixed_currency_flag_passes_through(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda *a, **k: (_rich_snapshot(mismatch=True),
                                         "2026-07-03T10:00:00+00:00"))
    body = client.get("/blended/acme").json()
    assert body["blended"]["currency_mismatch"] is True
    assert body["blended"]["currency"] == "MIXED"


def test_blended_route_refresh_and_preset_reach_the_cache(client, monkeypatch):
    seen = {}

    def capture(account_id, preset="last_30d", platforms=None, refresh=False):
        seen.update(account_id=account_id, preset=preset, refresh=refresh)
        return _rich_snapshot(), "2026-07-03T10:00:00+00:00"

    monkeypatch.setattr(cs, "get_cached_snapshot", capture)
    client.get("/blended/acme?preset=last_7d&refresh=true")
    assert seen == {"account_id": "acme", "preset": "last_7d", "refresh": True}


def test_blended_route_404_when_no_platform_contributed(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda *a, **k: (snap([], ok=()), "2026-07-03T10:00:00+00:00"))
    assert client.get("/blended/acme").status_code == 404


def test_blended_route_503_when_connectors_missing(client, monkeypatch):
    import ai_layer
    monkeypatch.delattr(ai_layer, "connector_source", raising=False)
    monkeypatch.setitem(sys.modules, "ai_layer.connector_source", None)
    r = client.get("/blended/acme")
    assert r.status_code == 503
    assert "connectors package" in r.json()["detail"]
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 18 passed, 5 failed — every `/blended` request returns 404 (route does not exist; FastAPI's default not-found), so the happy-path/MIXED/refresh/503 tests fail on status-code asserts. (`test_blended_route_404_...` may pass vacuously — that is acceptable at this step.)

- [ ] **Step 3a: Append the models to `apps/ai-layer/ai_layer/schemas.py`**

```python
class PlatformStatus(BaseModel):
    """Per-connector outcome for a snapshot pull (mirrors connectors.ConnectorStatus)."""
    platform: str
    state: str                       # ok | degraded | skipped | failed
    detail: Optional[str] = None
    fact_count: int = 0
    elapsed_ms: int = 0
    currency: Optional[str] = None


class BlendedBlock(BaseModel):
    """Cross-platform truth: Meta+Google spend vs Shopify revenue."""
    spend: float
    revenue_meta_pixel: float
    revenue_shopify: float
    blended_roas: float
    revenue_gap_pct: float
    currency: str
    currency_mismatch: bool          # True -> do NOT render blended_roas as a plain number


class BlendedResponse(BaseModel):
    account_id: str
    window: dict[str, Optional[str]]
    fetched_at: str                  # ISO UTC -- when the snapshot was pulled (cache-aware)
    blended: BlendedBlock
    statuses: list[PlatformStatus]
    ok_platforms: list[str]
```

- [ ] **Step 3b: Wire the route in `apps/ai-layer/ai_layer/api.py`**

Extend the existing `from ai_layer.schemas import (...)` list with `BlendedBlock, BlendedResponse, PlatformStatus` (keep alphabetical position).

Add after the `cost` endpoint (after the `def cost(...)` function, before the `# ---- Creative Studio` section):

```python
@app.get("/blended/{account_id}", response_model=BlendedResponse,
         dependencies=[Depends(require_api_key)])
def blended(account_id: str, preset: str = Query("last_30d"),
            refresh: bool = Query(False)):
    """Cross-platform blended ROAS (Meta+Google spend vs Shopify revenue truth).
    Served from the shared snapshot cache (CONNECTOR_CACHE_TTL_S, default 1h);
    refresh=true forces a live pull. fetched_at tells the caller the data age."""
    try:
        from ai_layer import connector_source
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="connectors package not installed — pip install -e apps/connectors",
        ) from exc
    snapshot, fetched_at = connector_source.get_cached_snapshot(
        account_id, preset, refresh=refresh)
    if not snapshot.ok_platforms:
        raise HTTPException(status_code=404, detail="no platform contributed data")
    b = snapshot.blended
    return BlendedResponse(
        account_id=account_id,
        window={"since": snapshot.since, "until": snapshot.until},
        fetched_at=fetched_at,
        blended=BlendedBlock(spend=b.spend, revenue_meta_pixel=b.revenue_meta_pixel,
                             revenue_shopify=b.revenue_shopify,
                             blended_roas=b.blended_roas,
                             revenue_gap_pct=b.revenue_gap_pct,
                             currency=b.currency,
                             currency_mismatch=b.currency_mismatch),
        statuses=[PlatformStatus(platform=s.platform, state=s.state, detail=s.detail,
                                 fact_count=s.fact_count, elapsed_ms=s.elapsed_ms,
                                 currency=s.currency) for s in snapshot.statuses],
        ok_platforms=snapshot.ok_platforms,
    )
```

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 23 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/schemas.py apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): GET /blended/{account_id} — cross-platform blended ROAS route"
```

---

### Task 4: Full regression + push

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: green suites, pushed branch.

- [ ] **Step 1: Full ai-layer suite**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests -q`
Expected: **180 passed, 7 skipped** (168 baseline + 12 new). Any pre-existing failure = stop and investigate.

- [ ] **Step 2: Connector suite untouched**

Run: `cd apps/connectors && ../../.venv/bin/python -m pytest tests -q`
Expected: **47 passed**.

- [ ] **Step 3: Isolation check**

Run: `grep -rn "import connectors\|from connectors" apps/ai-layer/ai_layer --include="*.py" | grep -v connector_source.py`
Expected: no output.

- [ ] **Step 4: Push**

```bash
git push origin feat/ai-layer-adapter
```

- [ ] **Step 5: Report**

State final counts and that `/blended` + the shared 1h cache are live, ready for #30 (image bundling) / #31 (local demo).
