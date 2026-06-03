/**
 * Placeholder route: /static-ads
 *
 * Reserved for the static-ad generator (Gemini MCP + Shopify product feed
 * + style brief). See CLAUDE.md → "Static Ad Generator (BUILT - May 2026)"
 * for the design contract. The stub answers the prefix so smoke checks and
 * client-side feature-flag probes can proceed without 500s.
 */

import type { FastifyInstance } from 'fastify';

export async function staticAdsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      request.log.warn(
        { route: '/static-ads', stage: 'stub' },
        'Route placeholder executed',
      );
      return reply.send({ success: true, status: 'stubbed', data: [] });
    },
  );
}
