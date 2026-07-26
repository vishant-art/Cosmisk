FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

# Node 22 base + Python 3 (for apps/ai-layer FastAPI and apps/connectors) +
# build tooling for native npm/pip deps. postgresql-client lets you psql into
# Neon for debugging; sqlite3 inspects the ai-layer's local store.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        python3-pip \
        build-essential \
        git \
        curl \
        ca-certificates \
        postgresql-client \
        sqlite3 \
        procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["sleep", "infinity"]
