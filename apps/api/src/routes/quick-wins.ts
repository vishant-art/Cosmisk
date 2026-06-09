/**
 * Placeholder route: /quick-wins
 *
 * Reserved for the "Quick Wins" surface — short-horizon recommendations
 * synthesised from the Watchdog + Autopilot + OOS-detector outputs. The
 * eventual endpoint will return a ranked, dedup'd list of <=5 immediate
 * actions per account; the stub keeps the prefix wired so the frontend
 * navigation does not 404 during early integration testing.
 */

import type { FastifyInstance } from 'fastify';

export async function quickWinsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      request.log.warn(
        { route: '/quick-wins', stage: 'stub' },
        'Route placeholder executed',
      );
      return reply.send({ success: true, status: 'stubbed', data: [] });
    },
  );
}
