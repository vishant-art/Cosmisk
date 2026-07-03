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
