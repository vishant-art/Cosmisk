# Full-stack dev devcontainer — design

**Date:** 2026-06-29
**Author:** maintainer + Claude
**Status:** approved, implemented (kept as uncommitted working-tree edits per request)

## Goal

Replace the stale "lean" devcontainer (single Node process, SQLite, `server/`
layout) with one that runs the **whole current monorepo** so the platform's
features can be exercised from the UI with one command.

The three runnable services:

| Service | Path | Stack | Port |
|---|---|---|---|
| Web (UI) | `apps/web` | Angular 17 (`ng serve`) | 4200 |
| API | `apps/api` | Fastify (tsx watch) | 3000 |
| AI layer | `apps/ai-layer` | Python FastAPI (uvicorn) | 8077 |

`apps/connectors` (Python) is a library/funnel, not a long-running service. It
exists on `feat/data-connectors` but **not** on `feat/ai_analy`, so the
container treats it as optional (installed into the venv only if the dir
exists).

## Decisions (locked)

1. **Database = Neon (remote).** No local Postgres service. Only `apps/api`
   needs `DATABASE_URL`; it self-loads `apps/api/.env` via `dotenv/config`. The
   ai-layer keeps its own local SQLite store (`AI_LAYER_STORE_PATH`), so it
   needs no DB wiring.
2. **Run shape = full dev, hot reload.** All three services run with live
   reload (`ng serve`, `tsx watch`, `uvicorn --reload`).
3. **Where the edits live.** Only these tracked files change, and they are
   byte-identical across `feat/data-connectors` and `feat/ai_analy` today, so
   editing them uncommitted lets them ride cleanly through a branch switch /
   worktree without a merge conflict:
   `.devcontainer/{Dockerfile, docker-compose.dev.yml, devcontainer.json,
   post-create.sh, README.md, commands.md}` and root `./dev`.

## Architecture

- **One container** (`cosmisk-dev`, `sleep infinity` as PID 1). Neon is remote,
  so no DB service in compose.
- **Ports forwarded:** 4200 (the UI you open), 3000 (API), 8077 (ai-layer
  `/docs`). The API listens on `0.0.0.0:3000`; `ng serve` and `uvicorn` are
  started with `--host 0.0.0.0` so the forwarded ports are reachable from the
  host. `apps/web/proxy.conf.json` proxies `/api` → `localhost:3000` inside the
  container.
- **Volumes:** source bind-mounted at `/workspace`; named volumes for
  `node_modules` (root, `apps/web`, `apps/api`) and the **Python venv at
  `/workspace/cos`** — the exact path `apps/api/dev.mjs` expects
  (`cos/bin/python`). Keeping the venv in a named volume makes it fast and keeps
  it out of the host tree.
- **No `env_file` in compose.** The API self-loads `apps/api/.env`, so compose
  doesn't depend on that file existing at `up` time (removes a startup failure
  mode). `NODE_ENV`, `PORT`, `APP_URL` are set as container env; `dotenv` does
  not override already-set vars, so these win and `.env` fills the rest.
- **Resources:** 4 GB / 4 CPU — three hot-reloading watchers need headroom
  (`ng serve` + `tsx watch` + `uvicorn --reload` ≈ 1.5–2 GB resident).

## Bootstrap (`post-create.sh`, idempotent)

1. `npm install` at root (Angular workspace + `packages/*`).
2. `npm install` in `apps/api` (not an npm workspace).
3. Create venv at `/workspace/cos` if missing; `pip install -e apps/ai-layer`;
   `pip install -e apps/connectors` **only if the dir exists**.
4. Create `apps/api/.env` from `.env.example` if missing, generating
   `JWT_SECRET` + `TOKEN_ENCRYPTION_KEY`; repair the `.env.example` `R PORT=`
   typo in the copy.
5. Loudly warn if `DATABASE_URL` is empty (Neon required).
6. Does **not** auto-run migrations against the shared Neon DB — that's the
   explicit `./dev migrate`.

## `./dev` helper (3-service shape)

- `up` — build, first-run bootstrap, start all three.
- `start` / `stop` / `restart` — manage the three watchers (each logs to
  `/tmp/{ai-layer,api,web}.log`).
- `migrate` — opt-in `npm run db:migrate` against Neon.
- `logs [api|web|ai|all]`, `status` (container + 3 procs + `/health` + `:4200`),
  `shell`, `down`, `test`.

Removed from the old helper: `rebuild` (hot reload replaces it), `reset-db` /
SQLite `run-migrations` (no SQLite), the seeded-reviewer login (that was a
SQLite seed).

## Running `feat/ai_analy` with these edits (the workflow)

A plain `git checkout feat/ai_analy` would carry the uncommitted devcontainer
edits over fine, **but** an uncommitted `package-lock.json` (which differs
between branches) would block the checkout. So the clean path is a **git
worktree**:

```bash
git worktree add ../Cosmisk-ai feat/ai_analy
# copy the 8 edited files (7 + this spec optional) into ../Cosmisk-ai, then:
cd ../Cosmisk-ai && ./dev up
```

The current tree (and all its uncommitted changes) stays frozen. On
`feat/ai_analy`, `apps/connectors` is absent → bootstrap skips it gracefully.

## Login / first use

There is no separate admin dashboard. After `./dev up`, open
<http://localhost:4200>, sign up (creates `role: 'user'`), then to reach
`/app/dashboard` without doing Meta OAuth, flip the flag in Neon:

```sql
UPDATE users SET onboarding_complete = 1, role = 'admin' WHERE email = 'you@example.com';
```

## Out of scope

- Local Postgres service (chose Neon).
- Production single-bundle shape (chose hot-reload dev).
- Chromium/Puppeteer for PDF audits (still skipped to keep the image lean).
