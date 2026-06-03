> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 run-guide refresh tied to the build-broken devcontainer state. Superseded by `05_05/run_guide.md` for durable setup steps.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Cosmisk — Local Run Guide — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/run_guide.md` (2026-05-03)

> Major rewrite to reflect: (1) the devcontainer is now the supported path; (2) `node_modules/` is root-owned on this machine; (3) the server does not compile and a chown + cleanup is required before it will.

---

## 0. Current blockers (read this first)

| # | Blocker | Fix |
|---|---|---|
| 1 | `server/data/`, `server/node_modules/`, `node_modules/`, `.angular/`, `dist/` owned by **root** (a devcontainer ran as root once) | `sudo chown -R $USER:$USER server/data server/node_modules node_modules .angular dist server/dist` |
| 2 | `npm install` fails with `EACCES` because of (1) | Fix (1) first, then `npm --prefix server ci && npm ci` |
| 3 | Even after (1)+(2), `tsc` fails: 15 files reference 25 missing modules | See `cleanup_suggestions.md` S1 |

Until 1–3 are fixed, **the server cannot boot in a deterministic way**. The pre-built `server/dist/` from 2026-05-03 may run, but it does not reflect post-merge code.

---

## 1. The supported paths

| Path | When to use |
|---|---|
| **Devcontainer (`.devcontainer/`)** | Recommended. Docker-isolates the environment so root-owned dirs don't matter. |
| **Local Node 22** | OK once the chown is done. |
| **`./dev` shell script** | A 214-line orchestrator added on the cleanup branch. Inspect it before running; not all flags are documented yet. |

---

## 2. Devcontainer path (recommended)

```sh
# Open the repo in VS Code. With the Devcontainers extension installed:
> Dev Containers: Reopen in Container

# After build, inside the container:
npm --prefix server install
npm install
npm --prefix server run dev      # starts Fastify at :3000
npm run start                     # starts Angular dev server at :4200
```

See `.devcontainer/README.md` and `.devcontainer/commands.md` for the full devcontainer reference.

---

## 3. Local Node 22 path

### 3.1 System prerequisites (unchanged from 2026-05-03)

- Node 22 LTS (via nvm or installer).
- Native toolchain for `better-sqlite3`:
  - Debian/Ubuntu/WSL: `sudo apt install -y build-essential python3`
  - macOS: `xcode-select --install`
- Git.
- Chromium/Chrome for Playwright e2e.

### 3.2 First-time setup (current branch)

```sh
cd ~/workspace/Cosmisk

# Fix root-owned dirs from prior devcontainer run
sudo chown -R $USER:$USER server/data server/node_modules node_modules .angular dist server/dist 2>/dev/null || true

# Install root + server deps
npm ci
npm --prefix server ci

# Compile server (EXPECTED TO FAIL today — see § 0)
npm --prefix server run build
```

When the compile fails, expected output lists missing modules. Cross-reference with `19_05/new_and_added_risks.md` § N for the canonical list. **Do not try to run the server until S1 closes.**

### 3.3 Once the build passes

```sh
# Start backend (port 3000)
npm --prefix server run dev

# In a second terminal: start frontend (port 4200)
npm run start

# In a third terminal: run tests
npm --prefix server test
```

Frontend proxies `/api/*` → `http://localhost:3000/*` via `proxy.conf.json` (strips `/api`).

---

## 4. Environment variables

Copy from the example:

```sh
cp server/.env.example server/.env
```

Required at minimum:
- `JWT_SECRET` — any random ≥ 32-byte string. Boot refuses default value in production.
- `TOKEN_ENCRYPTION_KEY` — 32-byte base64 string for ad-token encryption.
- `ANTHROPIC_API_KEY` — for the LLM gateway.
- `GOOGLE_GENERATIVE_AI_API_KEY` (optional) — Gemini fallback.
- `DATABASE_PATH` — defaults to `./data/cosmisk.db`.

For OAuth integrations (Meta, Google, TikTok, Shopify), see the per-route documentation in `19_05/backend_wiring.md`.

---

## 5. Bootstrap scripts

After the schema is consolidated (cleanup S2), these will no longer be needed. **Today they are still required** for a fresh DB:

```sh
tsx server/scripts/add-audit-tables.ts        # creates brands, brand_context, audits
tsx server/scripts/add-shopify-tables.ts      # creates shopify_tokens (duplicate of schema.ts — known issue)
```

If you skip these, audit routes will throw `no such table: brands`.

---

## 6. Useful commands

| Command | Purpose |
|---|---|
| `npm --prefix server run dev` | Fastify with `tsx watch` |
| `npm --prefix server run build` | `tsc` to `server/dist/` |
| `npm --prefix server run start` | Run compiled JS |
| `npm --prefix server test` | `vitest run` |
| `npm --prefix server test:watch` | `vitest` watch mode |
| `npm run start` | Angular dev server (HTTPS, self-signed) |
| `npm run build` | Angular production build to `dist/cosmisk/` |
| `npm run watch` | Angular incremental build |
| `npm test` | Karma (frontend) |
| `npx playwright test` | E2E |
| `./dev` | Convenience script — inspect before use |

---

## 7. Daily loop (once cleanup is done)

```sh
cd ~/workspace/Cosmisk
git pull
npm --prefix server ci
npm --prefix server run dev    # backend on :3000
# new terminal:
npm run start                  # frontend on :4200
```

---

## 8. Docker path (unchanged)

`docker-compose.yml` brings up server + nginx for local production-ish testing. See `Dockerfile` for the multi-stage build (frontend → backend → production). Not the primary dev path.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EACCES: permission denied, mkdir 'node_modules/...'` | Root-owned dirs from prior devcontainer | `sudo chown -R $USER:$USER ...` (§ 0) |
| `tsc` reports `Cannot find module './intelligence-integration.js'` | Risk N: 15 files reference missing modules | See `cleanup_suggestions.md` S1 |
| `no such table: brands` | `add-audit-tables.ts` not run | Run the script (§ 5) |
| `JWT_SECRET cannot be the default` | Production boot guard | Set `JWT_SECRET` in `server/.env` |
| `connect ECONNREFUSED 127.0.0.1:3000` | Backend not running | Start `npm --prefix server run dev` |
| Frontend can't reach backend | HTTPS / proxy mismatch | Check `proxy.conf.json` and that backend is on :3000 |

---

**End of refresh.**
