# Full-stack dev container — command reference

All host-side commands run from the repo root via the `./dev` helper.

> **Container:** `cosmisk-dev` · **Compose:** `.devcontainer/docker-compose.dev.yml`
> **UI:** <https://localhost:4200> · **API:** <http://localhost:3000> · **AI layer:** <http://localhost:8077/docs>

---

## Lifecycle

### `./dev up`
First-time bootstrap **and** day-to-day start. Idempotent.
1. `docker compose up -d --build` — build image if needed, start container (`sleep infinity`).
2. On first run only (deps/venv missing) runs `post-create.sh`: `npm install`
   (root + `apps/api`), create `/workspace/cos` venv, `pip install -e apps/ai-layer`
   (+ `apps/connectors` if present), seed `apps/api/.env`.
3. `./dev start` — launch all three services.

Cold first run: ~5–8 min. Warm: a few seconds.

### `./dev down`
Stop and remove the container. Named volumes (`root_node_modules`,
`web_node_modules`, `api_node_modules`, `py_venv`) persist.

---

## Service control

### `./dev start`
Starts (detached, inside the container):
- **ai-layer** — `uvicorn ai_layer.api:app --host 0.0.0.0 --port 8077 --reload` → `/tmp/ai-layer.log`
- **api** — `npx tsx watch src/index.ts` (listens `0.0.0.0:3000`) → `/tmp/api.log`
- **web** — `npx ng serve --host 0.0.0.0 --port 4200` → `/tmp/web.log`

Polls `:3000/health`, then `:4200` (ng compile can take ~60 s).

### `./dev stop`
Stops all three processes; container stays up (for `./dev shell`).

### `./dev restart`
`stop` then `start`. Run this after editing `apps/api/.env`.

---

## Database (Neon)

### `./dev migrate`
Runs `npm run db:migrate` (drizzle) in `apps/api` against your Neon DB. Opt-in —
**not** run automatically, so it never surprises a shared database. Requires
`MIGRATION_DATABASE_URL` / `DATABASE_URL` in `apps/api/.env`.

```bash
./dev migrate
./dev restart
```

---

## Inspection

### `./dev status`
Container `ps` + the three process checks + `/health` + a `:4200` HTTP probe.

Healthy:
```
==> Service processes:
  ... ng serve --host 0.0.0.0 --port 4200
  ... tsx watch src/index.ts
  ... uvicorn ai_layer.api:app --host 0.0.0.0 --port 8077 --reload
==> Health:
{"status":"ok",...}
  Web:  HTTP 200 on :4200
```

### `./dev logs [api|web|ai|all]`
Tail one service or all three (`all` is the default). Ctrl-C to stop.

### `./dev shell`
Bash shell inside the container at `/workspace`. The venv is `cos/bin/python`;
`psql "$DATABASE_URL"` works (postgresql-client is installed).

### `./dev test`
Runs the `apps/api` vitest suite inside the container.

---

## Smoke test (after `./dev up` + Neon configured + `./dev migrate`)

```bash
curl -sf http://localhost:3000/health
curl -skI https://localhost:4200/ | head -1         # HTTPS (self-signed); expect HTTP/1.1 200 OK
curl -sf http://localhost:8077/health              # ai-layer liveness

# Sign up via the API
curl -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@test.dev","password":"supersecret1","name":"You"}'
# -> returns { token, user }. Then in Neon:
#    UPDATE users SET onboarding_complete = 1, role = 'admin' WHERE email = 'you@test.dev';
# Log in at https://localhost:4200 and you land in /app/dashboard.
```

---

## Raw `docker compose` escape hatches

```bash
COMPOSE='docker compose -f .devcontainer/docker-compose.dev.yml'
$COMPOSE up -d --build
$COMPOSE down
$COMPOSE down -v                                   # also drops named volumes (deps + venv)
$COMPOSE exec cosmisk-dev bash -lc 'whatever'
$COMPOSE exec cosmisk-dev tail -F /tmp/api.log
```

---

## Cheatsheet

| Goal | Command |
|---|---|
| Start everything | `./dev up` |
| Stop services (keep container) | `./dev stop` |
| Stop + remove container | `./dev down` |
| You changed `.env` | `./dev restart` |
| Apply Neon migrations | `./dev migrate` |
| Is it running? | `./dev status` |
| Watch logs | `./dev logs all` (or `api`/`web`/`ai`) |
| Poke around inside | `./dev shell` |
| Run API tests | `./dev test` |
| Full dep reset | `docker compose -f .devcontainer/docker-compose.dev.yml down -v` |
