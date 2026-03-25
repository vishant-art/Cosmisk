import { config } from '../config.js';
import { logger } from './logger.js';
import type { FastifyReply } from 'fastify';

/** Log error and send safe 500 response (hides internals in production) */
export function internalError(reply: FastifyReply, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err: message }, context);
  reply.status(500).send({
    success: false,
    error: config.nodeEnv === 'production' ? 'Internal server error' : message,
  });
}
