/**
 * Director Route Tests
 *
 * Tests brief generation and direction management.
 * Uses in-memory SQLite, real Zod validation, real JWT auth.
 * Meta API is mocked.
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
}));

vi.mock('../config.js', () => ({
  config: {
    graphApiBase: 'https://graph.facebook.com/v22.0',
    anthropicApiKey: 'test-key',
  },
}));

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: async () => ({
    ok: true,
    json: async () => ({ id: 'mock_campaign_123' }),
    text: async () => '',
  }),
  safeJson: async () => ({ id: 'mock_campaign_123' }),
}));

const { directorRoutes } = await import('../routes/director.js');

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

  await app.register(directorRoutes, { prefix: '/director' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  // Seed meta token
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'encrypted-token', 'u1', 'Test User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('POST /director/generate-brief', () => {
  it('generates a brief with minimal params', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/generate-brief',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.brief).toBeDefined();
    expect(body.brief.conceptName).toBeDefined();
    expect(body.brief.hookDna).toBeDefined();
    expect(body.brief.visualDna).toBeDefined();
    expect(body.brief.hookScript).toBeDefined();
    expect(body.brief.scenes).toBeDefined();
    expect(body.brief.cta).toBeDefined();
    expect(body.variations).toBeDefined();
    expect(body.variations.length).toBeGreaterThan(0);
  });

  it('generates a brief with full params', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/generate-brief',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        format: 'video',
        target_audience: 'Women 25-34',
        product_focus: 'Skincare Serum',
        tones: ['Aspirational', 'Premium'],
        account_id: 'act_123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.brief.conceptName).toContain('Skincare Serum');
    expect(body.brief.scenes.length).toBeGreaterThan(0);
  });

  it('generates static creative brief', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/generate-brief',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        format: 'static image',
        product_focus: 'Running Shoes',
        tones: ['Bold'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Static brief should have different scene structure
    expect(body.brief.scenes.some((s: any) => s.time === 'Hero Frame')).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/generate-brief',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /director/auto-publish', () => {
  it('rejects without page_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/auto-publish',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        account_id: 'act_123',
        campaign_name: 'Test Campaign',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('page_id');
  });

  it('publishes campaign with valid params', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/auto-publish',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        account_id: 'act_123',
        campaign_name: 'Test Campaign',
        page_id: 'page_456',
        creative: {
          title: 'Test Ad',
          body: 'Buy now!',
          link_url: 'https://example.com',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.published).toBeDefined();
    expect(body.published.campaign_id).toBe('mock_campaign_123');
  });
});

describe('POST /director/update-status', () => {
  it('updates campaign status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/update-status',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        campaign_id: 'campaign_123',
        status: 'PAUSED',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().status).toBe('PAUSED');
  });

  it('rejects invalid status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/update-status',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        campaign_id: 'campaign_123',
        status: 'INVALID',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing campaign_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/director/update-status',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { status: 'ACTIVE' },
    });
    expect(res.statusCode).toBe(400);
  });
});
