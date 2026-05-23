/**
 * Placeholder route: /creative-scan
 *
 * Reserved for the Creative-DNA scanning pipeline (hook/visual/audio analysis
 * + per-creative scoring). See server/src/services/creative-strategist.ts and
 * server/src/services/creative-scorer.ts for the production analysers that
 * will eventually be exposed through this prefix.
 */

import type { FastifyInstance } from 'fastify';

export async function creativeScanRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      request.log.warn(
        { route: '/creative-scan', stage: 'stub' },
        'Route placeholder executed',
      );
      return reply.send({ success: true, status: 'stubbed', data: [] });
    },
  );
}
