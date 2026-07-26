# AI-layer Image Bundling (#30) — Design

**Date:** 2026-07-03 · **Branch:** `feat/ai-layer-adapter` · **Status:** approved (standing go)

## Goal

Make the ai-layer Docker image self-contained: bundle `cosmisk-connectors` into it so the
`source="connectors"` adapter seam (#27) and the `/blended` route (#28) work in a deployed
container, not just in the local venv. Today the image build context is `apps/ai-layer`, which
cannot see the sibling `apps/connectors` — the seam 503s in any built image.

## Decisions

1. **Build context moves to the repo root; the Dockerfile stays at `apps/ai-layer/Dockerfile`.**
   Rejected: a root-level `Dockerfile.ai-layer` (root already hosts the TS api Dockerfile;
   two service Dockerfiles in one directory invites mixups) and a wheel-artifact pipeline
   (CI machinery, no gain).
2. **Google dep via build-arg, default ON:** `ARG INSTALL_GOOGLE=1` →
   `pip install ./apps/connectors[google]`. `google-ads` is lazy-imported by the connector,
   so an image built with `INSTALL_GOOGLE=0` degrades Google to `skipped` — never crashes.
3. **Railway config-as-code ships now** (`apps/ai-layer/railway.toml`), even though the
   Railway service itself is created later (#32/I6). The root `railway.toml` belongs to the
   TS api (`startCommand = "node dist/index.js"`); the ai-layer service must point its
   config path at its own file or it would inherit the wrong start command.
4. **No `cosmisk-connectors` entry in `apps/ai-layer/pyproject.toml`.** pip cannot resolve
   the name (not on PyPI); a path dependency would break `pip install -e apps/ai-layer`
   outside this repo layout. The Dockerfile installing both packages IS the bundling
   mechanism; the lazy-import 503 seam remains the designed no-package behavior.

## 1. Dockerfile (`apps/ai-layer/Dockerfile`, context = repo root)

```dockerfile
# Cosmisk ai-layer service. BUILD CONTEXT = REPO ROOT (bundles apps/connectors).
#   docker build -f apps/ai-layer/Dockerfile .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 1 = include the Google Ads connector dep (google-ads, heavy gRPC).
# 0 = lean Meta+Shopify image; the Google connector lazy-imports and stays `skipped`.
ARG INSTALL_GOOGLE=1

COPY apps/connectors/pyproject.toml apps/connectors/README.md ./apps/connectors/
COPY apps/connectors/connectors ./apps/connectors/connectors
COPY apps/ai-layer/pyproject.toml apps/ai-layer/README.md ./apps/ai-layer/
COPY apps/ai-layer/ai_layer ./apps/ai-layer/ai_layer

RUN if [ "$INSTALL_GOOGLE" = "1" ]; then \
        pip install "./apps/connectors[google]" ./apps/ai-layer; \
    else \
        pip install ./apps/connectors ./apps/ai-layer; \
    fi

# Ephemeral working data (store.sqlite, cost ledger, creative output) — see #29
# for the durable-storage plan. Railway volume mount point when I3 lands.
RUN mkdir -p /app/data

EXPOSE 8000
# Config via env: OPENROUTER_API_KEY, META_ACCESS_TOKEN (or per-request X-Meta-Token),
# AI_LAYER_API_KEY (caller auth), AI_LAYER_STORE_PATH (defaults to ./data/store.sqlite),
# connector creds per apps/connectors/.env.example, CONNECTOR_CACHE_TTL_S (default 3600).
CMD ["uvicorn", "ai_layer.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

Optimization assessment (kept deliberately single-stage): every dependency (pandas,
matplotlib, pillow, grpcio via google-ads) ships manylinux wheels for CPython 3.12, so no
compiler is ever invoked — a builder stage would add complexity and save nothing. `slim`
base + `PIP_NO_CACHE_DIR` + hardened `.dockerignore` are where the size actually goes.
`scripts/` and `tests/` are not copied (not part of either installed package).

## 2. Root `.dockerignore` additions

The repo-root context must not drag in local working state. Append:

```
.venv
**/__pycache__
**/*.egg-info
apps/ai-layer/data
connector_assets
temp_docs
cosmisk-wiki
dev_reports
docs
.superpowers
.devcontainer
.claude
```

Safety: the TS api Dockerfile (root `Dockerfile`) copies only `package*.json`, `apps/web`,
`packages/types`, `apps/api` — none of the added paths — so its build is unaffected (its
context also shrinks). Existing entries (node_modules, dist, .git, .env, *.log) stay.

## 3. `apps/ai-layer/railway.toml` (consumed by #32, inert until then)

```toml
# Railway config for the ai-layer service (#32/I6 creates the service).
# Service settings must be: root directory = repo root, config file path = this file.
[build]
builder = "dockerfile"
dockerfilePath = "apps/ai-layer/Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 180
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

No `startCommand` — the Dockerfile CMD is the single source of truth for boot.

## 4. Documentation touch-ups

- `apps/connectors/README.md` §deploy/packaging note: the ai-layer image now bundles the
  package; the 503 hint only applies to ad-hoc local runs without `pip install -e`.
- `temp_docs/ai-eng-adapter-notes.md` §B.8: mark the packaging constraint RESOLVED
  (build context moved; both packages installed in the image; `INSTALL_GOOGLE` build-arg).

## 5. Verification (local, Docker 28.3.3 present)

1. `docker build -f apps/ai-layer/Dockerfile -t cosmisk-ai-layer:test .` succeeds from the
   repo root; context upload is small (≪100MB — proves `.dockerignore` works).
2. `docker run --rm cosmisk-ai-layer:test python -c "from connectors import get_snapshot;
   import ai_layer.connector_source"` → exits 0 (bundling proven at import level).
3. Boot the container (no creds, no API key env) → `GET /health` → 200;
   `GET /blended/demo` → **404** (all platforms skipped → `ok_platforms` empty). A 503
   here would mean the connectors package is missing — the exact failure this task fixes.
4. `INSTALL_GOOGLE=0` variant builds and passes check 2 (google-ads absent is fine —
   lazy import).
5. Regression: ai-layer 180 passed / 7 skipped, connectors 47 passed (no Python source
   changes expected; run to prove it).

## 6. Out of scope

Creating the Railway service / volume / vars (#32) · durable storage (#29) · devcontainer
demo wiring (#31) · publishing the image anywhere · TS api Dockerfile changes.
