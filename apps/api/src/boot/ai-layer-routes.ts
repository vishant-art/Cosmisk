/**
 * /ai-layer routes (Phase 5) — proxy the apps/ai-layer service's AiInsight cards
 * and the RAG chat.
 *
 * Flag-gated: `registerAiLayerRoutes` is a NO-OP unless AI_LAYER_URL is configured,
 * so existing deployments are unaffected. On error the endpoints degrade gracefully
 * so the dashboard never breaks.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getMetaTokenForUser } from './meta-helpers.js';
import {
  fetchAiLayerInsights,
  fetchAiLayerChat,
  ingestAiLayer,
  AiLayerError,
  type AiLayerChatTurn,
} from '../services/ai-layer-client.js';
import { internalError } from '../utils/error-response.js';
import { logger } from '../utils/logger.js';

/** Conditional entrypoint called from index.ts. */
export function registerAiLayerRoutes(app: FastifyInstance): void {
  if (!config.aiLayerUrl) {
    app.log.info('[ai-layer] AI_LAYER_URL not set — ai-layer routes disabled');
    return;
  }
  defineAiLayerRoutes(app);
  app.log.info('[ai-layer] ai-layer routes enabled');
}

/**
 * Resolve the Meta token to use for a request.
 * - real per-user token when connected
 * - dev/testing token ("continue without Meta login") when `demoMode` and
 *   config.metaAccessToken is set (dev only — empty in prod = demo OFF)
 * Returns null when the user has no token and demo is not available, so callers
 * can report meta_connected:false.
 */
async function resolveMetaToken(
  userId: string,
  demoMode: boolean,
): Promise<{ token: string; usingDemo: boolean } | null> {
  const token = await getMetaTokenForUser(userId);
  if (token) return { token, usingDemo: false };
  if (demoMode && config.metaAccessToken) {
    return { token: config.metaAccessToken, usingDemo: true };
  }
  return null;
}

function isDemo(v: unknown): boolean {
  return v === '1' || v === 'true' || v === true;
}

/** Route definitions (separated so tests can register without the flag gate). */
export function defineAiLayerRoutes(app: FastifyInstance): void {
  // GET /ai-layer/insights?account_id=act_123[&demo=1] — deterministic-brain AiInsight cards.
  // demo=1 = "continue without Meta login": fall back to the shared dev/testing token.
  app.get('/ai-layer/insights', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, demo } = request.query as { account_id?: string; demo?: string };
    try {
      const resolved = await resolveMetaToken(request.user.id, isDemo(demo));
      if (!resolved) {
        return reply.status(200).send({ success: true, insights: [], meta_connected: false });
      }
      // account_id is required for a real connection; in demo mode default it.
      const account = account_id || (resolved.usingDemo ? config.demoAccountId : undefined);
      if (!account) {
        return reply.status(400).send({ success: false, error: 'account_id required' });
      }
      const insights = await fetchAiLayerInsights(account, resolved.token);
      return reply.status(200).send({ success: true, insights, demo: resolved.usingDemo });
    } catch (err) {
      if (err instanceof AiLayerError) {
        logger.warn({ status: err.status, msg: err.message }, '[ai-layer] insights degraded');
        return reply.status(200).send({ success: true, insights: [], degraded: true });
      }
      return internalError(reply, err, 'ai-layer/insights failed');
    }
  });

  // POST /ai-layer/chat — RAG chat grounded in the account's data (your Python ai-layer).
  // Body: { account_id?, message, history?, demo? }. demo=true uses the dev creds when
  // the user hasn't connected Meta (same "continue without Meta login" path as insights).
  app.post('/ai-layer/chat', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      account_id?: string;
      message?: string;
      history?: AiLayerChatTurn[];
      demo?: boolean | string;
      session_id?: string;
      context_mode?: 'full' | 'summary';
    };
    const message = (body.message ?? '').trim();
    if (!message) {
      return reply.status(400).send({ success: false, error: 'message required' });
    }
    try {
      const resolved = await resolveMetaToken(request.user.id, isDemo(body.demo));
      if (!resolved) {
        return reply.status(200).send({ success: true, answer: '', meta_connected: false });
      }
      const account = body.account_id || (resolved.usingDemo ? config.demoAccountId : undefined);
      if (!account) {
        return reply.status(400).send({ success: false, error: 'account_id required' });
      }
      const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
      const reply_ = await fetchAiLayerChat(account, resolved.token, message, history, {
        contextMode: body.context_mode === 'summary' ? 'summary' : 'full',
        sessionId: body.session_id,
      });
      return reply.status(200).send({
        success: true,
        answer: reply_.answer,
        model: reply_.model,
        costUsd: reply_.costUsd,
        sessionId: reply_.sessionId,
        contextMode: reply_.contextMode,
        cached: reply_.cached,
        demo: resolved.usingDemo,
      });
    } catch (err) {
      if (err instanceof AiLayerError) {
        logger.warn({ status: err.status, msg: err.message }, '[ai-layer] chat degraded');
        return reply.status(200).send({
          success: false,
          error:
            err.status === 404
              ? 'No data available for this account yet.'
              : 'The AI layer is unavailable right now. Please try again.',
        });
      }
      return internalError(reply, err, 'ai-layer/chat failed');
    }
  });

  // POST /ai-layer/refresh — pull fresh live Meta data into the store cache. This is
  // the explicit "refresh" button: normal /insights + /chat read the cached store, and
  // only this endpoint pulls live. Body: { account_id?, demo? }.
  app.post('/ai-layer/refresh', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = (request.body ?? {}) as { account_id?: string; demo?: boolean | string };
    try {
      const resolved = await resolveMetaToken(request.user.id, isDemo(body.demo));
      if (!resolved) {
        return reply.status(200).send({ success: true, refreshed: false, meta_connected: false });
      }
      const account = body.account_id || (resolved.usingDemo ? config.demoAccountId : undefined);
      if (!account) {
        return reply.status(400).send({ success: false, error: 'account_id required' });
      }
      const result = await ingestAiLayer(account, resolved.token);
      return reply.status(200).send({
        success: true,
        refreshed: true,
        rowsUpserted: result.rowsUpserted,
        since: result.since,
        until: result.until,
        demo: resolved.usingDemo,
      });
    } catch (err) {
      if (err instanceof AiLayerError) {
        logger.warn({ status: err.status, msg: err.message }, '[ai-layer] refresh degraded');
        return reply.status(200).send({
          success: false,
          error: 'Could not refresh live data right now. Please try again.',
        });
      }
      return internalError(reply, err, 'ai-layer/refresh failed');
    }
  });
}
