import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDbAdapter } from '../db/adapter.js';

/**
 * POST /feedback — thumbs (+ optional comment) on an AI output. Upserts on
 * (user_id, kind, ref_id) so a re-vote overwrites. Study data only; kept SEPARATE
 * from Meta performance and never blended into the intelligence graph.
 */
export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.post('/feedback', { preHandler: [app.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const b = request.body as {
      kind?: string; ref_id?: string; rating?: number;
      comment?: string; prompt_text?: string; response_text?: string;
    };
    if ((b.kind !== 'chat' && b.kind !== 'creative') || !b.ref_id || ![-1, 0, 1].includes(b.rating as number)) {
      return reply.status(400).send({ success: false, error: 'kind, ref_id and rating (-1|0|1) are required' });
    }
    await getDbAdapter().run(
      `INSERT INTO ai_feedback (id, user_id, kind, ref_id, rating, comment, prompt_text, response_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, kind, ref_id)
       DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
                     prompt_text = EXCLUDED.prompt_text, response_text = EXCLUDED.response_text`,
      [randomUUID(), request.user.id, b.kind, b.ref_id, b.rating,
       b.comment ?? null, b.prompt_text ?? null, b.response_text ?? null],
    );
    return { success: true };
  });
}
