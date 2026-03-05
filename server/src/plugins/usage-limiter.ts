import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkLimit, incrementUsage } from '../routes/billing.js';

declare module 'fastify' {
  interface FastifyInstance {
    checkChatLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkImageLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkVideoLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    trackChatUsage: (request: FastifyRequest, reply: FastifyReply) => void;
    trackImageUsage: (request: FastifyRequest, reply: FastifyReply) => void;
    trackVideoUsage: (request: FastifyRequest, reply: FastifyReply) => void;
  }
}

async function usageLimiter(app: FastifyInstance) {
  app.decorate('checkChatLimit', async (request: FastifyRequest, reply: FastifyReply) => {
    const { allowed, current, limit } = checkLimit(request.user.id, 'chat_count');
    if (!allowed) {
      reply.status(429).send({
        success: false,
        error: 'Chat limit reached',
        usage: { current, limit },
        upgrade_url: '/app/settings?tab=billing',
      });
    }
  });

  app.decorate('checkImageLimit', async (request: FastifyRequest, reply: FastifyReply) => {
    const { allowed, current, limit } = checkLimit(request.user.id, 'image_count');
    if (!allowed) {
      reply.status(429).send({
        success: false,
        error: 'Image generation limit reached',
        usage: { current, limit },
        upgrade_url: '/app/settings?tab=billing',
      });
    }
  });

  app.decorate('checkVideoLimit', async (request: FastifyRequest, reply: FastifyReply) => {
    const { allowed, current, limit } = checkLimit(request.user.id, 'video_count');
    if (!allowed) {
      reply.status(429).send({
        success: false,
        error: 'Video generation limit reached',
        usage: { current, limit },
        upgrade_url: '/app/settings?tab=billing',
      });
    }
  });

  // Track usage hooks (call after successful response)
  app.decorate('trackChatUsage', (request: FastifyRequest) => {
    incrementUsage(request.user.id, 'chat_count');
  });

  app.decorate('trackImageUsage', (request: FastifyRequest) => {
    incrementUsage(request.user.id, 'image_count');
  });

  app.decorate('trackVideoUsage', (request: FastifyRequest) => {
    incrementUsage(request.user.id, 'video_count');
  });
}

export const usageLimiterPlugin = fp(usageLimiter);
