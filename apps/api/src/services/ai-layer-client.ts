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

const TIMEOUT_MS = 30_000;

/**
 * GET {aiLayerUrl}/insights/{accountId} -> the AiInsight cards.
 * `source=live` fetches fresh from Meta via the user's token; `store` reads the
 * ai-layer's accumulated store (it falls back to live if empty).
 */
export async function fetchAiLayerInsights(
  accountId: string,
  metaToken: string,
  opts: { source?: 'live' | 'store'; preset?: string } = {},
): Promise<AiLayerInsight[]> {
  const base = config.aiLayerUrl.replace(/\/+$/, '');
  const source = opts.source ?? 'live';
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
