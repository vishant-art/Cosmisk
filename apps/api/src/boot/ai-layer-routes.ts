/**
 * /ai-layer routes (Phase 5) — proxy the apps/ai-layer service's AiInsight cards.
 *
 * Flag-gated: `registerAiLayerRoutes` is a NO-OP unless AI_LAYER_URL is configured,
 * so existing deployments are unaffected. On error the endpoint degrades gracefully
 * (returns empty insights) so the dashboard never breaks.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getMetaTokenForUser } from './meta-helpers.js';
import { fetchAiLayerInsights, AiLayerError } from '../services/ai-layer-client.js';
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

/** Route definitions (separated so tests can register without the flag gate). */
export function defineAiLayerRoutes(app: FastifyInstance): void {
  // GET /ai-layer/insights?account_id=act_123 — deterministic-brain AiInsight cards
  app.get('/ai-layer/insights', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id } = request.query as { account_id?: string };
    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }
    try {
      const token = await getMetaTokenForUser(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, insights: [], meta_connected: false });
      }
      const insights = await fetchAiLayerInsights(account_id, token);
      return reply.status(200).send({ success: true, insights });
    } catch (err) {
      if (err instanceof AiLayerError) {
        // Degrade gracefully — the dashboard should still render without these cards.
        logger.warn({ status: err.status, msg: err.message }, '[ai-layer] insights degraded');
        return reply.status(200).send({ success: true, insights: [], degraded: true });
      }
      return internalError(reply, err, 'ai-layer/insights failed');
    }
  });
}
