# Cosmisk ai-layer service (Phase 2). Build context = apps/ai-layer.
FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY ai_layer ./ai_layer

RUN pip install --no-cache-dir .

EXPOSE 8000
# Config via env: OPENROUTER_API_KEY, META_ACCESS_TOKEN (or per-request X-Meta-Token),
# AI_LAYER_API_KEY (caller auth), AI_LAYER_STORE_PATH (defaults to ./data/store.sqlite).
CMD ["uvicorn", "ai_layer.api:app", "--host", "0.0.0.0", "--port", "8000"]
