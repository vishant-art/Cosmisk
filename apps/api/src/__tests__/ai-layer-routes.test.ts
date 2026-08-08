import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Mock the boot-local token helper and the ai-layer HTTP client (no DB / no network).
const mockToken = vi.fn();
const mockFetch = vi.fn();
const mockChat = vi.fn();
const mockChatStream = vi.fn();
const mockIngest = vi.fn();

// Mock config so the demo fallback (config.metaAccessToken) is exercised
// deterministically without depending on the host env / .env.
vi.mock('../config.js', () => ({
  config: {
    nodeEnv: 'test',
    aiLayerUrl: '',
    aiLayerApiKey: '',
    metaAccessToken: 'dev-test-token',
    demoAccountId: 'act_demo',
  },
}));

vi.mock('../boot/meta-helpers.js', () => ({
  getMetaTokenForUser: (...args: unknown[]) => mockToken(...args),
}));
vi.mock('../services/ai-layer-client.js', () => ({
  fetchAiLayerInsights: (...args: unknown[]) => mockFetch(...args),
  fetchAiLayerChat: (...args: unknown[]) => mockChat(...args),
  fetchAiLayerChatStream: (...args: unknown[]) => mockChatStream(...args),
  ingestAiLayer: (...args: unknown[]) => mockIngest(...args),
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
  mockChat.mockReset();
  mockChatStream.mockReset();
  mockIngest.mockReset();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('GET /ai-layer/insights', () => {
  it('401 without auth', async () => {
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1' });
    expect(r.statusCode).toBe(401);
  });

  it('400 without account_id (when a real token is present)', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
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

  it('demo=1 falls back to the dev creds + demo account when no Meta token', async () => {
    mockToken.mockResolvedValueOnce(null); // user has no Meta connection
    mockFetch.mockResolvedValueOnce([
      { id: '1', priority: 'info', title: 'Overview', description: 'demo',
        actionLabel: '', actionRoute: '', createdAt: 'now' },
    ]);
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?demo=1', headers: auth() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toMatchObject({ success: true, demo: true });
    expect(body.insights).toHaveLength(1);
    // dev token + default demo account, no per-user token required
    expect(mockFetch).toHaveBeenCalledWith('act_demo', 'dev-test-token');
  });

  it('demo=1 respects an explicit account_id override', async () => {
    mockToken.mockResolvedValueOnce(null);
    mockFetch.mockResolvedValueOnce([]);
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?demo=1&account_id=act_override', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith('act_override', 'dev-test-token');
  });

  it('degrades gracefully when the ai-layer errors', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockFetch.mockRejectedValueOnce(new AiLayerError('boom', 502));
    const r = await app.inject({ method: 'GET', url: '/ai-layer/insights?account_id=act_1', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, insights: [], degraded: true });
  });
});

describe('POST /ai-layer/chat', () => {
  it('401 without auth', async () => {
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat',
      payload: { account_id: 'act_1', message: 'hi' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('400 without a message', async () => {
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('meta_connected:false when the user has no Meta token', async () => {
    mockToken.mockResolvedValueOnce(null);
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1', message: 'hi' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, answer: '', meta_connected: false });
  });

  it('returns the grounded answer with the per-user token (full mode by default)', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockChat.mockResolvedValueOnce({
      answer: 'ROAS is 3.2x', model: 'gemini', costUsd: 0.0001,
      sessionId: 's1', contextMode: 'full', cached: false,
    });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1', message: 'what is roas?', history: [] },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toMatchObject({ success: true, answer: 'ROAS is 3.2x', model: 'gemini', sessionId: 's1', contextMode: 'full' });
    // default mode is full (as before)
    expect(mockChat).toHaveBeenCalledWith('act_1', 'meta-tok', 'what is roas?', [],
      expect.objectContaining({ contextMode: 'full' }));
  });

  it('forwards summary mode + session id and echoes the cache fields', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockChat.mockResolvedValueOnce({
      answer: 'lean', model: 'gemini', costUsd: 0.00002,
      sessionId: 's-abc', contextMode: 'summary', cached: true,
    });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1', message: 'recap?', context_mode: 'summary', session_id: 's-abc' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, contextMode: 'summary', cached: true, sessionId: 's-abc' });
    expect(mockChat).toHaveBeenCalledWith('act_1', 'meta-tok', 'recap?', [],
      expect.objectContaining({ contextMode: 'summary', sessionId: 's-abc' }));
  });

  it('demo=true falls back to dev creds + demo account when no Meta token', async () => {
    mockToken.mockResolvedValueOnce(null);
    mockChat.mockResolvedValueOnce({
      answer: 'demo answer', model: 'gemini', costUsd: 0,
      sessionId: 's2', contextMode: 'full', cached: false,
    });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { message: 'hi', demo: true },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toMatchObject({ success: true, answer: 'demo answer', demo: true });
    expect(mockChat).toHaveBeenCalledWith('act_demo', 'dev-test-token', 'hi', [],
      expect.objectContaining({ contextMode: 'full' }));
  });

  it('degrades with a friendly error when the ai-layer errors', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockChat.mockRejectedValueOnce(new AiLayerError('no data', 404));
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1', message: 'hi' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('No data');
  });

  it('surfaces a Meta rate cap as a real 429, never "try again"', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockChat.mockRejectedValueOnce(new AiLayerError('meta rate limit', 429));
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat', headers: auth(),
      payload: { account_id: 'act_1', message: 'hi' },
    });
    expect(r.statusCode).toBe(429);
    const body = r.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('rate-limiting');
    expect(body.error).not.toContain('try again');
  });
});

describe('POST /ai-layer/chat/stream', () => {
  it('surfaces an upstream 429 as a real 429, never "try again"', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockChatStream.mockResolvedValueOnce({ ok: false, status: 429, body: null });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/chat/stream', headers: auth(),
      payload: { account_id: 'act_1', message: 'hi' },
    });
    expect(r.statusCode).toBe(429);
    const body = r.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('rate-limiting');
    expect(body.error).not.toContain('try again');
  });
});

describe('POST /ai-layer/refresh', () => {
  it('401 without auth', async () => {
    const r = await app.inject({ method: 'POST', url: '/ai-layer/refresh', payload: { account_id: 'act_1' } });
    expect(r.statusCode).toBe(401);
  });

  it('meta_connected:false when the user has no Meta token', async () => {
    mockToken.mockResolvedValueOnce(null);
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/refresh', headers: auth(), payload: { account_id: 'act_1' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, refreshed: false, meta_connected: false });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it('ingests a live pull and reports rows upserted', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockIngest.mockResolvedValueOnce({ rowsUpserted: 1193, since: '2026-05-14', until: '2026-06-12' });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/refresh', headers: auth(), payload: { account_id: 'act_1' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, refreshed: true, rowsUpserted: 1193 });
    expect(mockIngest).toHaveBeenCalledWith('act_1', 'meta-tok');
  });

  it('demo=true refreshes via the dev creds + demo account', async () => {
    mockToken.mockResolvedValueOnce(null);
    mockIngest.mockResolvedValueOnce({ rowsUpserted: 10, since: null, until: null });
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/refresh', headers: auth(), payload: { demo: true },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ success: true, refreshed: true, demo: true });
    expect(mockIngest).toHaveBeenCalledWith('act_demo', 'dev-test-token');
  });

  it('degrades with a friendly error when ingest fails', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockIngest.mockRejectedValueOnce(new AiLayerError('boom', 502));
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/refresh', headers: auth(), payload: { account_id: 'act_1' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('refresh');
  });

  it('surfaces a Meta rate cap as a real 429, never "try again"', async () => {
    mockToken.mockResolvedValueOnce('meta-tok');
    mockIngest.mockRejectedValueOnce(new AiLayerError('meta rate limit', 429));
    const r = await app.inject({
      method: 'POST', url: '/ai-layer/refresh', headers: auth(), payload: { account_id: 'act_1' },
    });
    expect(r.statusCode).toBe(429);
    const body = r.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('rate-limiting');
    expect(body.error).not.toContain('try again');
  });
});
