# Lean devcontainer — command reference

All host-side commands run from the repo root. The `./dev` helper script is the
public surface; everything below is a verb you can pass to it. Raw
`docker compose` calls are documented at the bottom for emergencies.

> **Container name:** `cosmisk-dev`
> **Compose file:** `.devcontainer/docker-compose.dev.yml`
> **Service name:** `cosmisk-dev`
> **Default URL:** <http://localhost:3000>

---

## Lifecycle

### `./dev up`

First-time bootstrap **and** day-to-day start. Idempotent.

What it does, in order:
1. Bootstraps `server/.env` from `.env.example` if missing, generating random
   `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` via `openssl rand -hex 32`.
2. `docker compose ... up -d --build` — builds the image if needed, starts the
   container with `sleep infinity` as PID 1.
3. Installs root + server `npm` deps into the named volumes (only on first
   run, or if the volumes are wiped).
4. Calls `./dev rebuild` if either `server/dist/index.js` or
   `server/public/index.html` is missing.
5. Otherwise calls `./dev start`.
6. Calls `./dev run-migrations` (server must be up first so the `users` table
   exists).

```bash
./dev up
```

Cold first run: ~5–8 min (image build + npm installs + first compile).
Warm run: ~3 seconds (container already exists, server already built).

### `./dev down`

Stops and removes the container. **Keeps:**
- The named volumes (`root_node_modules`, `server_node_modules`)
- The bind-mounted `server/data/` directory (your SQLite DB)

```bash
./dev down
```

### `./dev rebuild`

Rebuild backend (`tsc`) + frontend (`ng build --configuration development`),
copy the Angular bundle into `server/public/`, then restart the server. This
is what you run after editing code (the whole reason the lean container
exists in this shape).

```bash
./dev rebuild
```

Typical duration: ~45 s (tsc ~5 s, ng build ~30 s, copy + restart ~10 s).
RAM during the build briefly spikes to ~1.2 GB, then drops back to ~80 MiB.

---

## Server process control

### `./dev start`

Restart the Node server inside the container. Kills any existing
`node dist/index.js` first. Detaches with `docker compose exec -d` (a plain
`nohup … &` would be SIGKILLed when the exec session ends). Polls
`http://localhost:3000/health` for up to 30 seconds before returning. On
timeout, prints the last 40 lines of `/tmp/cosmisk.log` from inside the
container so you can see why it didn't come up.

```bash
./dev start
```

### `./dev stop`

Stop the Node server **without** stopping the container. Useful when you want
the container alive (for `./dev shell`) but the port free.

```bash
./dev stop
```

### `./dev restart`

Alias for `./dev start`. Provided for muscle memory.

```bash
./dev restart
```

---

## Inspection

### `./dev status`

Three-section health check:
1. Container: `docker compose ps` output.
2. Server process: `pgrep -af` for the running Node PID (uses the
   `[n]ode dist/index.js` regex trick to avoid matching pgrep itself).
3. HTTP: `curl -sf http://localhost:3000/health` and prints the JSON body.

```bash
./dev status
```

Expected output when healthy:
```
==> Container:
NAME          ... STATUS         PORTS
cosmisk-dev   ... Up 5 minutes   0.0.0.0:3000->3000/tcp

==> Server process:
165 node dist/index.js

==> Health:
{"status":"ok","uptime":300,"db":"connected","env":"production",...}
```

### `./dev logs`

Tail `/tmp/cosmisk.log` inside the container. `Ctrl-C` to stop.

```bash
./dev logs
```

### `./dev shell`

Bash login shell inside the container, working directory `/workspace`. Use
this for ad-hoc poking — `npm test`, running a single migration script,
inspecting `node_modules`, etc.

```bash
./dev shell
```

Inside the shell, `/workspace/server/data/cosmisk.db` is the SQLite file.

---

## Maintenance

### `./dev run-migrations`

Runs the two out-of-tree schema scripts (idempotent):
- `server/scripts/add-audit-tables.ts` — creates `brands`, `brand_context`,
  `audits`; seeds three demo brands.
- `server/scripts/add-shopify-tables.ts` — creates `shopify_tokens`, adds
  `shopify_domain` column, populates demo Shopify domains.

The server **must already be running** when you call this — these scripts
reference the `users` table, which only exists after `createTables()` runs at
server boot.

```bash
./dev run-migrations
```

### `./dev reset-db`

Wipes `server/data/cosmisk.db*` (db, `-wal`, `-shm`). Prompts for
confirmation. After resetting, the server's next boot will recreate the
in-tree schema; you'll need to run `./dev run-migrations` again to recreate
the out-of-tree tables and re-seed the demo brands.

```bash
./dev reset-db
# y[Enter]
./dev start            # recreate in-tree schema
./dev run-migrations   # recreate audits/brands/shopify_tokens
```

### `./dev test`

Runs the server-side `vitest` suite inside the container.

```bash
./dev test
```

The frontend test suite (`npm test` at repo root → Karma) is **not** wired
into `./dev` because Karma needs a real browser; run it on the host if you
need it.

### `./dev help`

Print the help text. `./dev` with no arguments and `./dev -h` / `--help`
also print it.

```bash
./dev help
```

---

## Smoke-test flow (after a fresh `./dev up`)

```bash
# Health
curl -sf http://localhost:3000/health

# Frontend serves
curl -sI http://localhost:3000/ | head -1
# expect: HTTP/1.1 200 OK

# Sign up
curl -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.dev","password":"smoketest123","name":"Smoke"}'

# Or log in as the seeded reviewer
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@cosmisk.com","password":"MetaReview2026!"}'

# Use the JWT for an authenticated route
TOKEN='<paste from above>'
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/dashboard/summary
```

---

## Environment-variable changes

Edit `server/.env` on the host. Then restart the server inside the container:

```bash
./dev start
```

You don't need to rebuild the image or re-run `npm install` for env changes.

---

## Resource inspection (raw docker)

```bash
# Live RAM/CPU for the container
docker stats --no-stream cosmisk-dev

# Image size
docker images devcontainer-cosmisk-dev

# Volume sizes
docker system df -v | grep -E "root_node_modules|server_node_modules"

# Disk used by the SQLite DB
du -sh server/data/
```

Healthy idle baseline:
- Memory: ~80 MiB / 2 GiB cap
- CPU: <1%
- Image: ~850 MB
- Volumes: ~1.3 GB combined (root 1.06 GB, server 220 MB)
- DB: ~500 KB on a fresh seed

---

## Full reset (nuke everything)

When the container, deps, or DB are wedged and you want a truly clean slate:

```bash
./dev down
docker compose -f .devcontainer/docker-compose.dev.yml down -v   # drops named volumes
rm -rf server/data/cosmisk.db*                                    # drop SQLite
docker image rm devcontainer-cosmisk-dev                          # force image rebuild
./dev up                                                          # ~7 min to come back
```

---

## Raw `docker compose` escape hatches

If `./dev` itself is broken or you need to run something the script doesn't
expose, these are the commands the script is wrapping:

```bash
# Compose file shorthand
COMPOSE='docker compose -f .devcontainer/docker-compose.dev.yml'

# Up / down
$COMPOSE up -d --build
$COMPOSE down
$COMPOSE down -v   # also drops named volumes

# Run an arbitrary command in the container
$COMPOSE exec cosmisk-dev bash -lc 'whatever you want'

# Detached (survives the exec session — what ./dev start uses)
$COMPOSE exec -d cosmisk-dev bash -lc 'cd /workspace/server && exec node dist/index.js > /tmp/cosmisk.log 2>&1'

# Tail a file inside
$COMPOSE exec cosmisk-dev tail -F /tmp/cosmisk.log

# Inspect the SQLite DB from inside
$COMPOSE exec cosmisk-dev sqlite3 /workspace/server/data/cosmisk.db '.tables'
```

---

## Cheatsheet

| Goal | Command |
|---|---|
| Start everything | `./dev up` |
| Stop everything | `./dev down` |
| You changed code | `./dev rebuild` |
| You changed `.env` | `./dev start` |
| Is it running? | `./dev status` |
| Why isn't it running? | `./dev logs` |
| Poke around inside | `./dev shell` |
| Wipe SQLite | `./dev reset-db` |
| Run server tests | `./dev test` |
| Recreate audits/brands tables | `./dev run-migrations` |
| Full reset | see "Full reset" above |
