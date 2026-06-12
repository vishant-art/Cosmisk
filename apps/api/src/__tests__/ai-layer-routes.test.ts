import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Mock the boot-local token helper and the ai-layer HTTP client (no DB / no network).
const mockToken = vi.fn();
const mockFetch = vi.fn();

vi.mock('../boot/meta-helpers.js', () => ({
  getMetaTokenForUser: (...args: unknown[]) => mockToken(...args),
}));
vi.mock('../services/ai-layer-client.js', () => ({
  fetchAiLayerInsights: (...args: unknown[]) => mockFetch(...args),
  AiLayerError: class AiLayerError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'AiLayerError';
      this.status = status;
    }
  },
}));

const { defineAiLayerRoutes } = await import('../boot/ai-layer-routes.js');
const { AiLayerError } = await import('../services/ai-layer-client.js');

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'test-secret' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ message: 'Unauthorized' });
    }
  });
  defineAiLayerRoutes(app);
  await app.ready();
  token = app.jwt.sign({ id: 'user-1', email: 'a@b.c', name: 'T' });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockToken.mockReset();
  mockFetch.mockReset();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('GET /ai-layer/insights', () => {
  it('401 without auth', async () => {
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1' });
    expect(r.statusCode).toBe(401);
  });

  it('400 without account_id', async () => {
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights', headers: auth() });
    expect(r.statusCode).toBe(400);
  });

  it('meta_connected:false when the user has no Meta token', async () => {
    mockToken.mockResolvedValueOnce(null);
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, insights: [], meta_connected: false });
  });

  it('returns the ai-layer cards', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockFetch.mockResolvedValueOnce([
      { id: '1', priority: 'alert', title: 'X', description: 'Y',
        actionLabel: '', actionRoute: '', createdAt: 'now' },
    ]);
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1', headers: auth() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.success).toBe(true);
    expect(body.insights).toHaveLength(1);
    expect(body.insights[0].priority).toBe('alert');
    expect(mockFetch).toHaveBeenCalledWith('act_1', 'meta-tok');
  });

  it('degrades gracefully when the ai-layer errors', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockFetch.mockRejectedValueOnce(new AiLayerError('boom', 502));
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, insights: [], degraded: true });
  });
});
