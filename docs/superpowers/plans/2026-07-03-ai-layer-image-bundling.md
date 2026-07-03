# AI-layer Image Bundling (#30) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ai-layer Docker image self-contained by building from the repo root and installing `apps/connectors` alongside `apps/ai-layer`, so the `source="connectors"` seam and `/blended` route work in a deployed container.

**Architecture:** The Dockerfile stays at `apps/ai-layer/Dockerfile` but is rewritten for build context = repo root, copying and pip-installing both packages in one layer behind an `ARG INSTALL_GOOGLE=1` toggle. The root `.dockerignore` is hardened so the repo-root context stays small. A new `apps/ai-layer/railway.toml` carries config-as-code for the future Railway service (#32) so it never inherits the TS api's root `railway.toml`.

**Tech Stack:** Docker (python:3.12-slim, single-stage), pip, Railway config-as-code (TOML).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-ai-layer-image-bundling-design.md`.
- NO `cosmisk-connectors` entry may be added to `apps/ai-layer/pyproject.toml` (pip cannot resolve it by name; the Dockerfile installing both packages IS the bundling mechanism).
- No Python source changes anywhere — `apps/ai-layer/ai_layer/` and `apps/connectors/connectors/` must be byte-identical before and after this plan.
- Single-stage Dockerfile (all deps ship manylinux wheels on CPython 3.12; no compiler stage).
- `apps/ai-layer/railway.toml` must NOT contain a `startCommand` (the Dockerfile CMD is the single source of truth).
- Commit messages: plain conventional commits, no AI attribution of any kind.
- Run all commands from the repo root `/home/anantdluffy/workspace/Cosmisk` unless a step says otherwise.

---

### Task 1: Harden root `.dockerignore` + rewrite the ai-layer Dockerfile

**Files:**
- Modify: `.dockerignore` (repo root; currently 9 lines: node_modules, server/node_modules, server/data, server/dist, dist, .angular, .git, .env, *.log)
- Modify: `apps/ai-layer/Dockerfile` (full rewrite; currently 13 lines building from context `apps/ai-layer`)

**Interfaces:**
- Consumes: `apps/connectors/pyproject.toml` (package `cosmisk-connectors`, optional extra `google`), `apps/ai-layer/pyproject.toml` (package `cosmisk-ai-layer`).
- Produces: an image buildable with `docker build -f apps/ai-layer/Dockerfile .` from the repo root; build-arg `INSTALL_GOOGLE` (default `"1"`). Task 3 verifies it.

- [ ] **Step 1: Replace `.dockerignore` content**

Overwrite `.dockerignore` (repo root) with exactly:

```
node_modules
server/node_modules
server/data
server/dist
dist
.angular
.git
.env
*.log
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

(First 9 lines unchanged, 12 new exclusions appended. The TS api Dockerfile copies only `package*.json`, `apps/web`, `packages/types`, `apps/api` — none of the new paths — so its build is unaffected.)

- [ ] **Step 2: Rewrite `apps/ai-layer/Dockerfile`**

Replace the entire file with exactly:

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

- [ ] **Step 3: Sanity-check no Python sources changed**

Run: `git status --porcelain`
Expected output is exactly these two lines (order may vary):

```
 M .dockerignore
 M apps/ai-layer/Dockerfile
```

- [ ] **Step 4: Commit**

```bash
git add .dockerignore apps/ai-layer/Dockerfile
git commit -m "build(ai-layer): repo-root image context bundling apps/connectors (INSTALL_GOOGLE arg)"
```

---

### Task 2: Railway config-as-code + docs touch-ups

**Files:**
- Create: `apps/ai-layer/railway.toml`
- Modify: `apps/connectors/README.md:87-99` (section "## 6. Deploy (Railway)")
- Modify: `temp_docs/ai-eng-adapter-notes.md` (§B item 8 "Packaging:") — NOTE: this file is intentionally untracked/gitignored; edit it but do NOT git-add it.

**Interfaces:**
- Consumes: the Dockerfile contract from Task 1 (`docker build -f apps/ai-layer/Dockerfile .`, ARG `INSTALL_GOOGLE`).
- Produces: `apps/ai-layer/railway.toml` consumed by #32 when the Railway service is created.

- [ ] **Step 1: Create `apps/ai-layer/railway.toml`**

Exact content:

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

- [ ] **Step 2: Update `apps/connectors/README.md` deploy section**

Replace lines 89–99 (everything under `## 6. Deploy (Railway)`) — currently a paragraph saying bundling "requires building that service from the repo root" plus a 3-line dockerfile snippet — with:

```markdown
The connector is a **library inside the ai-layer service**, not a separate service.
`apps/ai-layer/Dockerfile` builds from the **repo root** and installs both packages
(`pip install ./apps/connectors[google] ./apps/ai-layer`); the `INSTALL_GOOGLE` build-arg
(default `1`) drops the heavy `google-ads` dep when set to `0` — the Google connector
lazy-imports it and degrades to `skipped`. Railway service settings live in
`apps/ai-layer/railway.toml` (root directory = repo root, config path = that file).

Prod credentials come from **Railway service variables** (no `.env` file) — `config.py` reads
`os.environ` either way.
```

- [ ] **Step 3: Update the AI-engineer notes**

In `temp_docs/ai-eng-adapter-notes.md`, §B item 8 currently reads:

```
8. **Packaging:** `apps/ai-layer/pyproject.toml` does not depend on `cosmisk-connectors`, and
   the ai-layer image build context (`apps/ai-layer`) cannot see the sibling package. The
   seam therefore lazy-imports and 503s with an install hint. The deploy fix (build from repo
   root, `pip install ./apps/connectors ./apps/ai-layer`) is a separate task — don't add the
   pyproject dependency until the build context moves, or the image build breaks.
```

Replace it with:

```
8. **Packaging — RESOLVED (#30):** the ai-layer image now builds from the **repo root**
   (`docker build -f apps/ai-layer/Dockerfile .`) and installs BOTH packages, so
   `source="connectors"` and `/blended` work in the container. `INSTALL_GOOGLE` build-arg
   (default 1) controls the heavy `google-ads` extra; without it Google degrades to
   `skipped`. There is still deliberately NO `cosmisk-connectors` entry in
   `apps/ai-layer/pyproject.toml` (pip can't resolve it by name) — the 503 hint now only
   applies to ad-hoc local runs without `pip install -e apps/connectors`.
```

- [ ] **Step 4: Verify tracked-file status**

Run: `git status --porcelain`
Expected (order may vary; `temp_docs/` must NOT appear — it is gitignored):

```
 M apps/connectors/README.md
?? apps/ai-layer/railway.toml
```

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/railway.toml apps/connectors/README.md
git commit -m "build(ai-layer): railway config-as-code + deploy docs for bundled image"
```

---

### Task 3: Build + runtime verification

**Files:**
- No file changes. Verification only (Docker 28.3.3 available locally).

**Interfaces:**
- Consumes: the image contract from Task 1 and this exact route behavior: `GET /health` → 200 always; `GET /blended/{account_id}` → 404 when no platform contributes, 503 only when the connectors package is missing; all data routes skip auth when `AI_LAYER_API_KEY` is unset.

- [ ] **Step 1: Build the default image (Google included)**

Run from the repo root:
```bash
docker build -f apps/ai-layer/Dockerfile -t cosmisk-ai-layer:test . 2>&1 | tail -5
```
Expected: exits 0, last lines include a `naming to docker.io/library/cosmisk-ai-layer:test` (or `exporting manifest`) success line. Also confirm the context upload line near the top of the full log (`transferring context:`) is well under 100MB — if it is hundreds of MB, `.dockerignore` is not being honored: STOP and report.

- [ ] **Step 2: Prove both packages import inside the image**

```bash
docker run --rm cosmisk-ai-layer:test python -c "from connectors import get_snapshot; import ai_layer.connector_source; from google.ads.googleads.client import GoogleAdsClient; print('bundled OK')"
```
Expected: prints `bundled OK`, exits 0.

- [ ] **Step 3: Boot the container and probe the routes**

```bash
docker run -d --rm --name ai-layer-smoke -p 8901:8000 cosmisk-ai-layer:test
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8901/health || true)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "health:$code"
curl -s -w "\nblended:%{http_code}\n" http://localhost:8901/blended/demo
docker stop ai-layer-smoke
```
Expected: `health:200`; the blended body mentions no platforms contributed and the status is `blended:404` (NOT 503 — a 503 means the connectors package is missing from the image, i.e. the bundling failed). No creds are configured, so all platforms are skipped/failed → 404 is correct.

- [ ] **Step 4: Build the lean variant and prove graceful Google degradation**

```bash
docker build -f apps/ai-layer/Dockerfile --build-arg INSTALL_GOOGLE=0 -t cosmisk-ai-layer:lean . 2>&1 | tail -3
docker run --rm cosmisk-ai-layer:lean python -c "
from connectors import get_snapshot
import ai_layer.connector_source
try:
    import google.ads
    raise SystemExit('google-ads unexpectedly present')
except ModuleNotFoundError:
    print('lean OK')
"
```
Expected: build exits 0; prints `lean OK`.

- [ ] **Step 5: Regression — both test suites untouched**

```bash
cd apps/ai-layer && ../../.venv/bin/python -m pytest tests -q 2>&1 | tail -2 && cd ../..
cd apps/connectors && ../../.venv/bin/python -m pytest tests -q 2>&1 | tail -2 && cd ../..
```
Expected: `180 passed, 7 skipped` and `47 passed`.

- [ ] **Step 6: Report image sizes (informational)**

```bash
docker images cosmisk-ai-layer --format "{{.Tag}} {{.Size}}"
```
Expected: two rows (`test`, `lean`); lean should be noticeably smaller. Record both numbers in the task report. No commit in this task.
