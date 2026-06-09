/**
 * Placeholder route: /health-score
 *
 * Registered from index.ts so the server can boot. The real implementation
 * (account-level health scoring across ad spend, OOS, leakage, fatigue) is
 * tracked under the Bridge Service milestone — see dev_reports/19_05/INDEX.md.
 * Until then this stub answers the prefix with a structural response so
 * smoke tests, monitoring, and client-side feature flags can probe it
 * without crashing the server.
 */

import type { FastifyInstance } from 'fastify';

export async function healthScoreRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      request.log.warn(
        { route: '/health-score', stage: 'stub' },
        'Route placeholder executed',
      );
      return reply.send({ success: true, status: 'stubbed', data: [] });
    },
  );
}
