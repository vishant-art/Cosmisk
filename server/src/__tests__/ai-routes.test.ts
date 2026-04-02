/**
 * AI Route Tests
 *
 * Tests chat message handling, help intent, missing account handling.
 * Uses in-memory SQLite, real Zod validation, real JWT auth.
 * Claude AI and Meta API are mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';
import bcrypt from 'bcryptjs';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
    async getAllPages() { return []; }
  },
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: () => ({ spend: 100, ctr: 1.5, cpc: 2, cpa: 25, roas: 3.5, revenue: 350, conversions: 4, impressions: 5000, clicks: 75 }),
  parseCampaignBreakdown: () => [],
  parseAudienceBreakdown: () => [],
}));

vi.mock('../services/format-helpers.js', () => ({
  fmt: (v: number) => `$${v}`,
  setCurrency: () => {},
  getCurrency: () => 'USD',
  round: (v: number, d: number) => Number(v.toFixed(d)),
  fmtNum: (v: number) => String(v),
  fmtInt: (v: number) => String(v),
  avgVal: () => 0,
  CURRENCY_SYMBOLS: { USD: '$', INR: '\u20B9' },
}));

vi.mock('../services/trend-analyzer.js', () => ({
  assessConfidence: () => ({ shouldRecommendAction: false, level: 'low', caveat: '' }),
  computeTrend: () => ({ direction: 'stable', label: 'stable' }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: '{"intent": "overview", "params": {}}' }],
      }),
    };
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: () => '{"intent": "overview", "params": {}}',
}));

vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    jwtSecret: 'test-secret',
    graphApiBase: 'https://graph.facebook.com/v22.0',
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { aiRoutes } = await import('../routes/ai.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

beforeAll(async () => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'test-secret', sign: { expiresIn: '1h' } });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(aiRoutes, { prefix: '/ai' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  // Seed meta token so the user has a connected account
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'encrypted-token', 'u1', 'Test User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('POST /ai/chat', () => {
  it('handles help intent without account_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { message: 'help' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toBeDefined();
    expect(body.content).toContain('Meta Ads strategist');
  });

  it('requests account_id when not provided for data queries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { message: 'How is my ROAS?' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toBeDefined();
    // Should ask to select an ad account
    expect(body.content).toContain('ad account');
  });

  it('handles chat with account_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        message: 'overview',
        account_id: 'act_123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toBeDefined();
  });

  it('rejects missing message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { message: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('supports conversation history', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        message: 'help',
        history: [
          { role: 'user', content: 'How is my account?' },
          { role: 'ai', content: 'Your account is doing well.' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBeDefined();
  });
});

describe('GET /ai/briefing', () => {
  it('returns empty briefing when none exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ai/briefing',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.briefing).toBeNull();
    expect(body.pendingDecisions).toEqual([]);
  });

  it('returns briefing when one exists', async () => {
    const briefingId = uuidv4();
    testDb.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary, raw_context) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)").run(briefingId, 'morning_briefing', testUserId, 'completed', 'Your daily summary', '{}');

    const res = await app.inject({
      method: 'GET',
      url: '/ai/briefing',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.briefing).toBeDefined();
  });
});
