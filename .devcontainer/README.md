# Full-stack dev devcontainer

Runs the **whole monorepo** with hot reload inside one container, backed by your
remote **Neon** database:

| Service | Path | Port | URL |
|---|---|---|---|
| Web (Angular `ng serve`) | `apps/web` | 4200 | <https://localhost:4200> ← open this |
| API (Fastify, `tsx watch`) | `apps/api` | 3000 | <http://localhost:3000> |
| AI layer (FastAPI, `uvicorn --reload`) | `apps/ai-layer` | 8077 | <http://localhost:8077/docs> |

`apps/connectors` is a Python library (no port); it's installed into the venv
only if present on the branch.

**Resource budget:** three hot-reload watchers ≈ 1.5–2 GB RAM. Hard cap: 4 GB / 4 CPU.

## What's where

| File | Purpose |
|---|---|
| `Dockerfile` | `node:22-bookworm-slim` + `python3`/venv + build tooling, `postgresql-client` |
| `docker-compose.dev.yml` | One container; ports 4200/3000/8077; named-volume `node_modules` + `cos` venv |
| `devcontainer.json` | VS Code Dev Containers metadata (optional — works without VS Code) |
| `post-create.sh` | First-time bootstrap: install Node + Python deps, make `cos` venv, seed `apps/api/.env` |
| `../dev` | Host-side helper (`./dev up`, `./dev logs`, `./dev status`, …) |

## Quick start (without VS Code)

```bash
./dev up          # first run: ~5-8 min (image + npm + pip); warm: a few sec
./dev status      # container + 3 procs + health
./dev logs all    # tail api + web + ai-layer logs (Ctrl-C to stop)
./dev down        # stop
```

Then open <https://localhost:4200> (HTTPS with a self-signed cert — accept the
browser warning once).

## Database (Neon — required)

The app is Postgres-only; only the API needs it. On first `./dev up`,
`post-create.sh` creates `apps/api/.env` from `.env.example` (generating
`JWT_SECRET` + `TOKEN_ENCRYPTION_KEY`) and **warns if `DATABASE_URL` is empty**.
Add your Neon strings to `apps/api/.env`:

```
DATABASE_URL=<neon pooled connection>
MIGRATION_DATABASE_URL=<neon direct connection>
```

Then apply the schema and restart the API:

```bash
./dev migrate
./dev restart
```

For AI features (chat/insights) also set `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`.
The ai-layer keeps its own local SQLite store, so it needs no DB wiring.

## Logging in / reaching the dashboard

There is **no separate admin dashboard** and no seeded credentials — auth is a
role-based JWT. At <https://localhost:4200>, sign up (creates `role: 'user'`).
A fresh user is sent to `/onboarding` until onboarding completes (connecting
Meta). To jump straight into `/app/dashboard` locally, flip the flag in Neon:

```sql
UPDATE users SET onboarding_complete = 1, role = 'admin' WHERE email = 'you@example.com';
```

Log in again and you land in the dashboard with the full feature set.

## Running `feat/ai_analy` with this container

These devcontainer files are kept as **uncommitted** edits and are byte-identical
across branches, so they carry across a branch switch without conflict. But your
uncommitted `package-lock.json` differs between branches and would block a plain
`git checkout feat/ai_analy`. Cleanest path — a **git worktree** (leaves your
current tree and its uncommitted changes completely frozen):

```bash
git worktree add ../Cosmisk-ai feat/ai_analy
cp -r .devcontainer ../Cosmisk-ai/ && cp dev ../Cosmisk-ai/
cd ../Cosmisk-ai
./dev up
```

On `feat/ai_analy` there's no `apps/connectors`, so bootstrap skips it.

## Use with VS Code

Open the repo → F1 → "Dev Containers: Reopen in Container". VS Code runs
`docker-compose.dev.yml`, attaches, and runs `post-create.sh` once. Then start
the services from the integrated terminal with `./dev start` (or `./dev up` the
first time).

## Caveats

- **Hot reload is on for all three** (`ng serve`, `tsx watch`, `uvicorn --reload`).
  That's the RAM cost; if you want it lighter, run only the services you need.
- **First `ng serve` compile** can take ~60 s — `./dev status` will show the UI
  as not-ready until it finishes; watch `./dev logs web`.
- **Puppeteer Chromium is skipped** (`PUPPETEER_SKIP_DOWNLOAD=true`). PDF-generation
  paths in audits fail until you `apt-get install -y chromium` inside the
  container and set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
- **No Playwright browsers.** For e2e: `./dev shell` then `npx playwright install chromium`.
- **`node_modules` and the `cos` venv live in named Docker volumes**, not the
  bind mount. Full dep reset: `docker compose -f .devcontainer/docker-compose.dev.yml down -v`.

See `commands.md` for the full command reference.
