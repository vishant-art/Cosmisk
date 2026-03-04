import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; name: string };
    user: { id: string; email: string; name: string };
  }
}

async function auth(app: FastifyInstance) {
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: '7d' },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ message: 'Unauthorized' });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(auth);
