# SCRAP LIST — features to be removed

Durable list of shipped-but-superseded features slated for removal. Nothing here is
deleted yet; entries stay until the removal PR lands, then move to "Removed".

**Governing rule:** all AI/intelligence work is served by the **Python ai-layer**
(`apps/ai-layer`). TypeScript duplicates of ai-layer capability are legacy and get
scrapped. See also #48 (dispose/coordinate duplicate TS ai-layer modules).

---

## Pending removal

### 1. `ai-studio` — TS-native chat, duplicate of `ai-chat`
**Status:** pending · **Identified:** 2026-07-12 · **Supersedes:** `ai-chat` (Python ai-layer)

`ai-studio` and `ai-chat` are the same feature — chat grounded in the account's ad data —
built twice against two different engines. `ai-chat` is the Python path we are keeping.

| | `ai-studio` (SCRAP) | `ai-chat` (KEEP) |
|---|---|---|
| Route | `/app/ai-studio` | `/app/ai-chat` |
| Angular service | `AiService` (`core/services/ai.service.ts`) | raw `fetch` + `ApiService` |
| Endpoint | `ai/chat`, `ai/briefing` | `ai-layer/chat/stream` |
| Backend | `apps/api/src/routes/ai.ts` (+ `routes/ai/*`) | `apps/api/src/boot/ai-layer-routes.ts` (proxy) |
| Engine | **TypeScript** — `detectIntentWithClaude`, `MetaApiService`, Anthropic via llm-gateway | **Python ai-layer** — FastAPI RAG |
| Data | per-user Meta OAuth token, live Graph API calls | ai-layer store (Neon `ai_layer.*`) |

`apps/web/src/app/features/ai-chat/ai-chat.component.ts:22` documents the Python path in
its own header comment.

**Removal scope (do NOT do during demo prep — schedule after):**
- `apps/web/src/app/features/ai-studio/` (component)
- `apps/web/src/app/app.routes.ts:89` (route registration)
- nav/menu entry pointing at `/app/ai-studio`
- `apps/web/src/app/core/services/ai.service.ts` (only consumer is ai-studio — verify first)
- `apps/api/src/routes/ai.ts` + `apps/api/src/routes/ai/` (`helpers.ts`, `intent.ts`, `types.ts`, …)
- endpoint constants `AI_CHAT`, `AI_BRIEFING` in `apps/web/src/environments/env*.ts`

**Blocking check before removal:** confirm no other component imports `AiService` or hits
`ai/chat` / `ai/briefing`. `routes/ai.ts` may also be reachable from agent/briefing services.

**⚠ Removing ai-studio does NOT remove the Meta gate.** `ai-chat` also injects
`AdAccountService` (`ai-chat.component.ts:16`) to pick `account_id`, so it too depends on
`GET /ad-accounts/list` → per-user `meta_tokens` row. That gate is a separate workstream.

---

## Related (tracked under #48)

Already-identified TS duplicates of ai-layer capability, listed here for one-place visibility:
- `processGeneration` legacy creative path (TS-native Flux + `createMessage`) — superseded by
  Python `creative/service.py` when `AI_LAYER_URL` is set.
- `job-queue.ts` + `creative_sprints` / `creative_jobs` / `creative_assets` tables.
- Orphan facts tables: `daily_metrics`, `creative_returns`, `ltv_by_creative`.
- Duplicate writers to coordinate (not delete): cost aggregation, `dna_cache` /
  `creative_analysis`, ad-watchdog / report-agent insight generation.

---

## Removed

_(none yet)_
