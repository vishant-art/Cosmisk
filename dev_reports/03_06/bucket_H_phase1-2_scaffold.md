# Bucket H — Phase 1-2 Scaffold (execution-ready detail)

> Detailed, execute-after-merge spec for **Phase 1 (workspace scaffold)** + **Phase 2 (server → apps/api)**. Each step additive/reversible, gated against the invariant (default 400/9 · pg 388/10 · tsc baseline · madge 0) + a build/deploy smoke. Do on a dedicated branch, AFTER `repo-cleanup` merges + freeze clears.

## Deploy reality discovered (drives the plan)
- **`railway.toml`** → single `Dockerfile` build, `startCommand = node dist/index.js`, healthcheck `/health`.
- **The root `Dockerfile` is multi-stage and builds BOTH apps into ONE image:** `frontend-builder` (copies `src/`, `angular.json`, `tsconfig*.json`, `tailwind.config.js` → `ng build`) + `builder` (copies `server/` → `npm run build`) + `production` (runs the server, which can serve the built Angular). So **web + api currently deploy as one Railway container.**
- **`.github/workflows/ci.yml`** → server job uses `working-directory: server`, caches `server/package-lock.json`, runs `cd server && npm audit`, and `docker build -t cosmisk-server .`.
- Root `package.json` = the Angular app (name `cosmisk`, scripts `ng/build/test`), **no workspaces** field.

### Two cleanups surfaced (note, fix during the move)
- 🧹 Dockerfile still installs `python3 make g++` "for better-sqlite3" in builder AND production stages — **stale since DB-2 removed sqlite**. Drop on the Phase 2 Dockerfile edit.
- 🧹 `index.ts:1280` says "Frontend is served by Vercel — no static file serving needed here", yet the Dockerfile still builds+bundles Angular into the Railway image. Confirm whether the Railway frontend stage is vestigial (Vercel is the real web host). If so, the api image can drop the frontend stage entirely (Phase 3 decision).

---

## PHASE 1 — Workspace scaffold (ADDITIVE — zero moves, zero breakage)
Goal: lay the monorepo skeleton without moving any app, so nothing breaks and it's trivially reversible.

1. `mkdir -p apps packages` + `.gitkeep` in each.
2. **`tsconfig.base.json`** at root — extract the common `compilerOptions` (strict, module, target, etc.) shared by `tsconfig.json` + `server/tsconfig.json`. Nothing extends it yet → non-breaking.
3. **`turbo.json`** — define pipelines (`build`, `test`, `typecheck`, `lint`) with `dependsOn`/`outputs`. Not yet invoked by CI → non-breaking. Add `turbo` as a root devDependency.
4. **`packages/types/`** skeleton — `package.json` (`@cosmisk/types`, private), empty `src/index.ts`, its own `tsconfig.json` extending base. No consumers yet.
5. **Do NOT add `workspaces` to root package.json yet** — that couples to the api move (Phase 2) and the web move (Phase 3). Keep root as the Angular app for now.

**Gate:** `npm install` still works; `npm run build` (Angular) + `cd server && npm run build` unchanged; suites unchanged. Commit: `chore(H1): workspace scaffold (apps/ packages/ turbo tsconfig.base — additive)`.

---

## PHASE 2 — Move `server/` → `apps/api/` (the safest first real move)
`server/` is self-contained (own `package.json`/lockfile/tsconfig) and only 3 things reference its path: the Dockerfile backend stage, ci.yml, and (none in app code). This is the lowest-coupling app to relocate.

### Steps
1. **`git mv server apps/api`** (preserves history). The api keeps its own `package.json` (`cosmisk-server`), lockfile, `drizzle/`, `vitest*.config.ts`, `.env*`.
2. **Root `package.json`** — add `"workspaces": ["apps/*", "packages/*"]`. (Root stays the Angular app AND becomes the workspace root — npm allows this; Angular CLI ignores the `workspaces` field. Full root→apps/web extraction is Phase 3.) Run `npm install` to relink.
3. **Dockerfile — backend stage only** (frontend stage untouched until Phase 3):
   - `COPY server/package.json server/package-lock.json* ./` → `COPY apps/api/package.json apps/api/package-lock.json* ./`
   - `COPY server/ ./` → `COPY apps/api/ ./`
   - 🧹 remove `apk add --no-cache python3 make g++` from `builder` + `production` (sqlite gone). Keep `libstdc++` only if still needed (verify the image boots without the toolchain).
4. **`railway.toml`** — unchanged (still `dockerfilePath = Dockerfile`, `startCommand = node dist/index.js`); the build context is the repo root, only the Dockerfile's internal COPY paths changed.
5. **`.github/workflows/ci.yml`** — `working-directory: server` → `apps/api`; `cache-dependency-path: server/package-lock.json` → `apps/api/package-lock.json`; `cd server && npm audit` → `cd apps/api && npm audit`; `docker build` context stays root (`.`).
6. **`docker-compose.yml`** — update any `server/` build context/volume paths → `apps/api/`.
7. Grep sweep for stray `server/` path refs: `grep -rn "server/" --include="*.json" --include="*.yml" --include="*.toml" --include="Dockerfile*" . | grep -v node_modules` → fix any deploy/script references (NOT app-internal relative imports, which are unaffected by the dir move).

### Gate (must all pass)
- `cd apps/api && npx tsc --noEmit` → baseline-only (billing.ts:4).
- `cd apps/api && npx vitest run` → 400/9 identical.
- `cd apps/api && npm run test:pg` → 388/10 (preflight Neon).
- `npx madge --circular --extensions ts apps/api/src/` → 0 cycles.
- `docker build -t cosmisk-server .` succeeds; run it, hit `/health` → `200 db:connected` (the real deploy smoke).
- Railway: deploy the branch to a preview env (or confirm the build) before merging.

Commit: `refactor(H2): move server/ → apps/api/ (+ workspaces, Dockerfile/ci paths, drop stale sqlite toolchain)`.

### Why this is safe
- App-internal imports are all relative (`./`, `../`) → unaffected by relocating the whole dir.
- The api's own `package.json`/tsconfig/vitest configs move WITH it → build/test behavior identical.
- Only deploy-config path strings change, each verified by a real build + `/health` smoke.
- Web is untouched → its Vercel/Railway-frontend path keeps working until Phase 3.

---

## PENDING ANSWERS (needed at Phase 5 — apps/ai-service; parked until then)
Recorded so they're not lost; do NOT block Phase 1-2 on these:
1. **What is the Python ai-service & where does it live now** (separate repo to fold in with history, or a folder)?
2. **Shared Postgres with apps/api?** If yes, migration ownership (rec: api owns DDL; ai-service read-mostly or own schema) — avoid `migrate.py` vs Drizzle fighting one schema.
3. **Agent source of truth:** `seed_agents.py` vs Node `agent-registry.ts` — pick one.
4. **Typesense:** already provisioned (managed/Railway) or stand up in `infra/docker-compose.yml`?
> Also resolve at Phase 3: is the Railway Dockerfile frontend stage vestigial (Vercel = real web host)? If so, drop it from the api image.
