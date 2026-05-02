# Lean devcontainer

Runs Cosmisk in the **production shape** (single Node process serving the pre-built
Angular bundle on `:3000`) inside a container — but with source bind-mounted so
you can edit from the host. Optimised for occasional swaps, not active dev.

**Resource budget:** ~300 MB RAM idle, ~1.2 GB during a rebuild, ~2 GB total
disk (image + node_modules volumes). Hard cap: 2 GB / 2 CPU.

## What's where

| File | Purpose |
|---|---|
| `Dockerfile` | `node:22-bookworm-slim` + `python3` / `build-essential` for `better-sqlite3` |
| `docker-compose.dev.yml` | Container definition: bind mounts, named-volume `node_modules`, port 3000 |
| `devcontainer.json` | VS Code Dev Containers metadata (optional — works without VS Code) |
| `post-create.sh` | First-time bootstrap: install deps, generate secrets, build, run migrations |
| `../dev` | Host-side helper script (`./dev up`, `./dev rebuild`, …) |

## Use without VS Code

```bash
./dev up         # first run: ~5 min (image build + deps + first build)
./dev status     # verify it's healthy
./dev logs       # tail server logs
./dev rebuild    # after editing code (~45 s)
./dev down       # stop
```

Open <http://localhost:3000>. The seeded reviewer login is
`reviewer@cosmisk.com` / `MetaReview2026!`.

## Use with VS Code

Open the repo, press F1 → "Dev Containers: Reopen in Container". VS Code runs
`docker-compose.dev.yml`, attaches to the container, and runs `post-create.sh`
once. After that, use the `./dev` script from the integrated terminal as above.

## Env vars

`server/.env` is mounted into the container. If it doesn't exist, `./dev up`
copies `server/.env.example` and generates random `JWT_SECRET` and
`TOKEN_ENCRYPTION_KEY`. All other API keys (Anthropic, Meta, Stripe, …) stay
as placeholders — features that need them will error at request time. Edit
`server/.env` on the host and `./dev rebuild` (or just `./dev start`) to pick
up changes.

## Why no hot reload

`tsx watch` and `ng serve` together hold ~1.2 GB resident. With <2 swaps/week,
that's a bad trade. We pay one explicit `./dev rebuild` (~45 s) per change and
live at ~300 MB the rest of the time. If you start doing daily dev, switch to
the bare-metal flow in `dev_reports/run_guide.md` or extend the compose file
to run `npm run dev` + `ng serve`.

## Caveats

- **Puppeteer Chromium download is skipped** (`PUPPETEER_SKIP_DOWNLOAD=true`)
  to keep the image lean. PDF-generation paths in audits will fail until you
  install Chromium inside the container (`apt-get install -y chromium`) and
  set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
- **Frontend on `:3000`, not `:4200`.** The dev-mode HTTPS self-signed cert
  doesn't apply here — it's plain HTTP because Fastify serves the static
  bundle directly.
- **No Playwright browsers.** If you ever need e2e: `./dev shell` then
  `npx playwright install chromium`.
- **`node_modules` lives in named Docker volumes**, not the bind mount. To
  fully reset deps: `docker compose -f .devcontainer/docker-compose.dev.yml down -v`.
