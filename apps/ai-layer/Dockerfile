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
# Default 0 for the demo ship (2026-07-25): Google Ads is blocked on OAuth consent + the
# login-customer-id + account-owner tasks (#39/#40/#41), so the connector could not ground
# on Google data even if the dep were present. funnel.py imports GoogleConnector lazily
# (funnel.py:135), so its absence is a graceful `skipped`, not a boot failure. Flip back to
# 1 once #39/#40/#41 land and Google grounding is wanted.
ARG INSTALL_GOOGLE=0

COPY apps/connectors/pyproject.toml apps/connectors/README.md ./apps/connectors/
COPY apps/connectors/connectors ./apps/connectors/connectors
COPY apps/ai-layer/pyproject.toml apps/ai-layer/README.md ./apps/ai-layer/
COPY apps/ai-layer/ai_layer ./apps/ai-layer/ai_layer

RUN if [ "$INSTALL_GOOGLE" = "1" ]; then \
        pip install "./apps/connectors[google]" ./apps/ai-layer; \
    else \
        pip install ./apps/connectors ./apps/ai-layer; \
    fi

# Scratch dir for transient creative output only. The facts store and cost ledger are
# durable in Neon (ai_layer schema) — the service is STATELESS, no volume required (#29).
# Owned by a non-root user; deps are installed system-wide above and stay world-readable.
RUN mkdir -p /app/data \
    && useradd -r -u 10001 appuser \
    && chown -R appuser /app/data
# The package installs into site-packages (root-owned, read-only for appuser). Point the
# creative scratch dir + the SQLite store fallback at the writable /app/data, else the
# non-root process hits PermissionError trying to mkdir under site-packages on boot.
ENV CREATIVE_OUTPUT_DIR=/app/data/creative_output \
    AI_LAYER_STORE_PATH=/app/data/store.sqlite
USER appuser

EXPOSE 8000
# slim base has no curl/wget; use stdlib urllib. Honors ${PORT} the same way CMD does.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://localhost:%s/health' % os.environ.get('PORT','8000'))" || exit 1
# Config via env: OPENROUTER_API_KEY, META_ACCESS_TOKEN (or per-request X-Meta-Token),
# AI_LAYER_API_KEY (caller auth), DATABASE_URL + MIGRATION_DATABASE_URL (REQUIRED — Neon
# pooled + direct; the facts store and cost ledger live in the ai_layer schema, no SQLite),
# connector creds per apps/connectors/.env.example, CONNECTOR_CACHE_TTL_S (default 3600).
# Apply migrations out-of-band before/at deploy: `python -m ai_layer.db.migrate` (never on boot).
# JSON exec-form + `exec` so ${PORT} still expands (Railway/PaaS inject $PORT; fall back to
# 8000 locally) AND uvicorn becomes PID 1 — SIGTERM from `docker stop` reaches it for a
# graceful shutdown instead of dying to the 10s SIGKILL timeout as a shell child.
# --host 0.0.0.0, NOT `::`. This env is DUAL-STACK: `.railway.internal` resolves to both
# A and AAAA records (measured 2026-07-28: getaddrinfo returned fd12:… AND 10.206.138.88),
# so the earlier "the private network is IPv6-only" premise was wrong. `::` binds IPv6-only
# inside the container, which Railway's IPv4 healthcheck cannot reach — the deploy fails as
# `service unavailable` while the app is actually up.
# Diagnostic that settles it: from inside the container,
#   python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
# ConnectionRefused there means an IPv6-only bind.
CMD ["sh", "-c", "exec uvicorn ai_layer.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
