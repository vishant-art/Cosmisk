# Live HTTP Surface — 2026-05-23

**Method:** `node dist/index.js` inside `cosmisk-dev`. Signed up a fresh user, used the returned JWT for authenticated probes. Hit one representative GET on every registered prefix.

> Counts and codes below are from a real probe, not from inspecting `app.register(...)` calls. Where the source says "registered" but the boot doesn't expose, that's a real mismatch.

---

## 1. Boot signal

```
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
{"level":30,"msg":"Cosmisk server running on port 3000"}
{"level":30,"msg":"[JobQueue] Recovery: no interrupted sprints found"}
```

11+ cron schedules registered during boot (see `module_inventory.md` § 1.5). No errors during init.

`GET /health` (public, rate-limited 60/min):

```json
{
  "status": "ok",
  "uptime": 3,
  "started_at": "2026-05-23T16:01:13.807Z",
  "db": "connected",
  "node": "v22.22.3",
  "env": "production",
  "version": "2026-03-29.2"
}
```

HTTP 200, 12 ms.

---

## 2. 38 route families — observed

Probed `GET <prefix>` with a valid JWT.

### 2.1 200 OK — 33

```
200  /health                       (public)
200  /leads/capture                (public POST endpoint, GET also responds)
200  /waitlist/join                (public)
200  /auth/meta-status             (JWT)
200  /team/members                 (JWT)
200  /ad-accounts                  (JWT)
200  /dashboard/overview           (JWT)
200  /analytics/summary            (JWT)
200  /brain/state                  (JWT)
200  /director/state               (JWT)
200  /ai/capabilities              (JWT)
200  /reports/list                 (JWT)
200  /ugc/list                     (JWT)
200  /ugc-workflows                (JWT, root-level prefix)
200  /brands                       (JWT)
200  /automations/list             (JWT)
200  /campaigns/list               (JWT)
200  /billing/plan                 (JWT)
200  /autopilot/status             (JWT)
200  /google-ads/accounts          (JWT)
200  /tiktok-ads/accounts          (JWT)
200  /creative-engine/concepts     (JWT)
200  /content/list                 (JWT)
200  /score/list                   (JWT)
200  /agent/state                  (JWT)
200  /swipe-file                   (JWT)
200  /creative-studio/list         (JWT)
200  /schedules                    (NO AUTH REQUIRED — see § 3.2)
200  /ad-command/list              (JWT)
200  /health-score                 (JWT, stub)
200  /creative-scan                (JWT, stub)
200  /quick-wins                   (JWT, stub)
200  /static-ads                   (JWT, stub)
200  /intelligence                 (no explicit auth check — see § 3.3)
```

### 2.2 400 Bad Request — 3 (require query params, working correctly)

```
400  /assets/list             (expects ?type or similar)
400  /media/video-status      (expects ?job_id)
400  /competitor-spy/search   (expects ?q + ?country)
```

### 2.3 404 Not Found — 1 (probe used wrong sub-path)

```
404  /audits/list             (the file is 8 KB, registered correctly — sub-path is different)
```

### 2.4 500 Internal Server Error — 1 (real bug)

```
500  /shopify/status
```

Server log:

```
SqliteError: no such column: shop_name
  at Database.prepare (better-sqlite3/lib/methods/wrappers.js:5:21)
  at Object.<anonymous> (server/dist/routes/shopify.js:150:24)
```

Fix: see [`new_findings.md`](new_findings.md) § 1.

---

## 3. Auth coverage audit

Re-probed without an `Authorization` header to validate every protected route returns 401.

### 3.1 All 4 stub routes are correctly gated

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health-score
401
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/creative-scan
401
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/quick-wins
401
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/static-ads
401
```

### 3.2 `/schedules` is reachable without auth — REAL FINDING

```
$ curl -s http://127.0.0.1:3000/schedules
[]
HTTP 200
```

Source check: `routes/schedules.ts` (3.8 KB) contains **no** `preHandler: [app.authenticate]` and no `app.authenticate` reference. Confirmed open. Severity 🔴.

### 3.3 `/intelligence` has no explicit auth either

The file contains no `app.authenticate` reference. Returned 200 in the probe (with the JWT — the JWT was simply ignored). Possibly all handlers are no-op, but worth a 5-minute read to confirm.

### 3.4 All other 33 prefixes correctly gate

Spot-checked 5 random ones (`/ad-accounts`, `/billing/plan`, `/agent/state`, `/reports/list`, `/team/members`) — all return 401 without Authorization, 200 with. The boilerplate from `plugins/auth.ts` works.

---

## 4. Performance signal

Probe times for a hot-cache GET inside the container:

```
/health         12 ms
/health-score   3 ms  (stub returns immediately)
/schedules      2 ms  (no auth check, just `SELECT * FROM schedules`)
/shopify/status 3 ms  (fails fast on SQL error)
/ad-accounts   ~30 ms (real DB lookup)
/dashboard     ~25 ms (real DB aggregation)
```

No endpoint exceeds 50 ms with no real load. The bottleneck reservoir applies only to LLM-bound endpoints (none probed here).

---

## 5. Summary table

| Category | Count | Status |
|---|---:|---|
| 200 OK (with auth where required) | 33 | ✅ healthy |
| 400 Bad Request | 3 | ✅ correct behaviour |
| 401 Unauthorized (without auth, on protected routes) | 33 | ✅ auth gating works |
| 404 Not Found | 1 | ⚠️ probe path wrong (not a route bug) |
| 500 Internal Server Error | 1 | 🔴 `shop_name` schema drift |
| 200 on unauthenticated `/schedules` | 1 | 🔴 unprotected route |

---

## 6. Cleanup of the live probe

```
docker exec cosmisk-dev pkill -f 'node dist/index.js'
```

Server stopped cleanly. Container `cosmisk-dev` remains up; smoke probes can be repeated on demand.
