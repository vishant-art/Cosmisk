/**
 * Thin HTTP client for the apps/ai-layer service (Phase 5 integration).
 *
 * Calls the Python ai-layer over HTTP and returns its AiInsight cards. Feature-gated
 * by config.aiLayerUrl (empty = OFF). apps/api is outside the npm workspace so it
 * cannot import `@cosmisk/types`; the card shape is mirrored locally below.
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/** Mirrors @cosmisk/types AiInsight (the ai-layer returns this exact shape). */
export interface AiLayerInsight {
  id: string;
  priority: 'alert' | 'positive' | 'pattern' | 'info';
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  actionType?: string;
  actionPayload?: Record<string, unknown>;
  creativeId?: string;
  createdAt: string;
}

export class AiLayerError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiLayerError';
    this.status = status;
  }
}

const TIMEOUT_MS = 45_000;

/**
 * GET {aiLayerUrl}/insights/{accountId} -> the AiInsight cards.
 * Defaults to `source=store` (the warm accumulated store — fast; the ai-layer's
 * background ingest keeps it current and it falls back to live if empty). Pass
 * `source: 'live'` to force a fresh Meta pull (slow; only on explicit refresh).
 */
export async function fetchAiLayerInsights(
  accountId: string,
  metaToken: string,
  opts: { source?: 'live' | 'store'; preset?: string } = {},
): Promise<AiLayerInsight[]> {
  const base = config.aiLayerUrl.replace(/\/+$/, '');
  const source = opts.source ?? 'store';
  const preset = opts.preset ?? 'last_30d';
  const url = `${base}/insights/${encodeURIComponent(accountId)}?source=${source}&preset=${preset}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': config.aiLayerApiKey,
        'X-Meta-Token': metaToken,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, '[ai-layer] request failed');
    throw new AiLayerError('ai-layer request failed', 502);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiLayerError(body?.detail || `ai-layer error ${res.status}`, res.status);
  }

  const data = (await res.json().catch(() => ({}))) as { cards?: AiLayerInsight[] };
  return data.cards ?? [];
}

/** One turn in a chat history (matches the ai-layer's expected shape). */
export interface AiLayerChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** The ai-layer /chat reply (grounded analytical answer + cost + session/cache info). */
export interface AiLayerChatReply {
  answer: string;
  model: string;
  costUsd: number;
  sessionId: string;
  contextMode: string;
  cached: boolean;
}

// Chat is an LLM round-trip (slower than a store read) — allow more headroom.
const CHAT_TIMEOUT_MS = 60_000;

/**
 * POST {aiLayerUrl}/chat -> the RAG answer grounded in the account's data.
 * Reads from the warm store by default (full-data context). `metaToken` is the
 * per-request Meta token (or the dev token in demo mode); the ai-layer never
 * touches the encrypted token DB.
 */
export async function fetchAiLayerChat(
  accountId: string,
  metaToken: string,
  message: string,
  history: AiLayerChatTurn[],
  opts: {
    source?: 'live' | 'store';
    contextMode?: 'full' | 'summary';
    sessionId?: string;
  } = {},
): Promise<AiLayerChatReply> {
  const base = config.aiLayerUrl.replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    account_id: accountId,
    message,
    history,
    source: opts.source ?? 'store',
    context_mode: opts.contextMode ?? 'full', // full by default (as before)
  };
  if (opts.sessionId) body['session_id'] = opts.sessionId;

  let res: Response;
  try {
    res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.aiLayerApiKey,
        'X-Meta-Token': metaToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, '[ai-layer] chat request failed');
    throw new AiLayerError('ai-layer chat request failed', 502);
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiLayerError(errBody?.detail || `ai-layer error ${res.status}`, res.status);
  }

  const data = (await res.json().catch(() => ({}))) as {
    answer?: string;
    model?: string;
    cost_usd?: number;
    session_id?: string;
    context_mode?: string;
    cached?: boolean;
  };
  return {
    answer: data.answer ?? '',
    model: data.model ?? '',
    costUsd: data.cost_usd ?? 0,
    sessionId: data.session_id ?? '',
    contextMode: data.context_mode ?? '',
    cached: data.cached ?? false,
  };
}

/** Result of refreshing the store (a live Meta pull upserted into the ai-layer store). */
export interface AiLayerIngestResult {
  rowsUpserted: number;
  since: string | null;
  until: string | null;
}

// Ingest does a live Meta pull (slow) before upserting — allow generous headroom.
const INGEST_TIMEOUT_MS = 90_000;

/**
 * POST {aiLayerUrl}/ingest/{accountId} — pull fresh Meta data and UPSERT it into the
 * ai-layer store (the warm cache that /insights and /chat read). This is the "refresh"
 * action: after it returns, the store holds the latest numbers, so subsequent cached
 * reads are fresh. Until it's called, the existing cached data is used.
 */
export async function ingestAiLayer(
  accountId: string,
  metaToken: string,
  opts: { preset?: string } = {},
): Promise<AiLayerIngestResult> {
  const base = config.aiLayerUrl.replace(/\/+$/, '');
  const preset = opts.preset ?? 'last_30d';
  const url = `${base}/ingest/${encodeURIComponent(accountId)}?preset=${preset}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-Key': config.aiLayerApiKey, 'X-Meta-Token': metaToken },
      signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, '[ai-layer] ingest request failed');
    throw new AiLayerError('ai-layer ingest request failed', 502);
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiLayerError(errBody?.detail || `ai-layer error ${res.status}`, res.status);
  }

  const data = (await res.json().catch(() => ({}))) as {
    rows_upserted?: number;
    since?: string;
    until?: string;
  };
  return {
    rowsUpserted: data.rows_upserted ?? 0,
    since: data.since ?? null,
    until: data.until ?? null,
  };
}
