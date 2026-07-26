# Work Log — 2026-06-04 (monorepo reshape, Steps 3–7)

Branch `monorepo-restructure`. Goal: finish the Gravity-inspired reshape ASAP, incremental commits, cheapest tooling (no expensive subagents), don't break the Test Invariant.

## Sequence
1. **Diagnosed code-review-graph slowness** (asked: why full rebuild > 50 min). Cause: full rebuild re-parses + re-postprocesses (communities/flows over 48k edges, embeddings, wiki regen over 5.3k nodes) on a 126 MB SQLite store on WSL2; plus new workspace symlinks risk double-traversal. Policy: rely on the cheap per-commit incremental hook; defer one full rebuild to idle time. (Details in SESSION_HANDOFF §5.)
2. **H3 `92314ca`** — gated `apps/web` production build green → committed the Angular→apps/web move + npm workspaces (177 files; pure renames, 0 import edits). Hook: 594 files, 0 changed fns, risk 0.00.
3. **H4 `0037582`** — added `turbo ^2.9.16`; root scripts → `turbo run`; `turbo run build` green (22.7s) then cache hit (88ms, FULL TURBO). `.turbo/` ignored. `turbo run test` intentionally not run locally (ng/karma needs a browser → CI).
4. **H5 `028ca51`** — wrote `web.yml`/`api.yml` (path-filtered + `web-ci`/`api-ci` sentinel gates), deleted monolithic `ci.yml`, moved `docker-compose.yml`+`nginx.conf` → `infra/` (compose context → `..`). YAML validated (python yaml.safe_load ×3). Per-app Dockerfile split deferred (deploy-model decision).
5. **H6 `21fe542`** — investigated genuine shared contract: frontend envelopes are inconsistent (flattened vs nested {success,data}) so `ApiResponse<T>` had no clean consumer; chose the scaffold's intended contract — intelligence `AiInsight`. Moved it to `packages/types`, `apps/web` re-exports (surface unchanged). Build green (resolves `@cosmisk/types` via workspace symlink). apps/api adoption deferred (needs TS project references; outside workspace).
6. **H7 `0cd1615`** — `/health` reads `version.ts` (`1.0.0`) not the stale date; `.gitignore` server/* → apps/api/*. Confirmed `tsconfig.base` extension would break apps/api tsc (+2 TS7030) → deferred. Gates: apps/api tsc baseline-only (billing.ts:4); madge 0 cycles (358 files); no test pins the version string.

## Net result
5 incremental, reversible commits `92314ca..0cd1615`. apps/api untouched at the type level (still isolated, still green). Frontend self-contained in `apps/web`. `turbo`, `packages/types`, per-app CI all now live (were inert). Nothing merged; deploy unchanged.

## Open items → SESSION_HANDOFF §3–4 (Dockerfile split, apps/api types, tsconfig.base 2 fixes, branch-protection update to web-ci/api-ci, Vercel Root Dir → apps/web, sudo rm server/).
