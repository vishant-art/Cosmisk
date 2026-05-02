FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        git \
        curl \
        ca-certificates \
        sqlite3 \
        procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["sleep", "infinity"]
