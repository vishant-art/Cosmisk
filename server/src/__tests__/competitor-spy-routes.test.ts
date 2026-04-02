/**
 * Competitor Spy Route Tests
 *
 * Tests competitor search and ad library analysis.
 * Uses in-memory SQLite, real Zod validation, real JWT auth.
 * Meta Ad Library API and Claude AI are mocked.
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

vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-app-secret',
    graphApiBase: 'https://graph.facebook.com/v22.0',
  },
}));

const mockAds = [
  {
    id: 'ad_1',
    ad_creation_time: '2025-01-01T00:00:00Z',
    ad_creative_bodies: ['Buy our amazing product now!'],
    ad_creative_link_captions: ['Shop now'],
    ad_creative_link_titles: ['Amazing Product'],
    ad_delivery_start_time: '2025-01-01T00:00:00Z',
    ad_snapshot_url: 'https://fb.com/ads/archive/ad_1',
    page_id: 'page_1',
    page_name: 'Test Brand',
    publisher_platforms: ['facebook', 'instagram'],
    spend: { lower_bound: '100', upper_bound: '500' },
    impressions: { lower_bound: '10000', upper_bound: '50000' },
    currency: 'USD',
  },
  {
    id: 'ad_2',
    ad_creation_time: '2025-02-01T00:00:00Z',
    ad_creative_bodies: ['Limited time offer!'],
    ad_creative_link_titles: ['Sale Event'],
    ad_delivery_start_time: '2025-02-01T00:00:00Z',
    ad_snapshot_url: 'https://fb.com/ads/archive/ad_2',
    page_id: 'page_1',
    page_name: 'Test Brand',
    publisher_platforms: ['facebook'],
  },
];

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: async () => ({
    ok: true,
    json: async () => ({ data: mockAds }),
    text: async () => '',
  }),
  safeJson: async (resp: any) => resp.json(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: 'Competitor analysis: Strong messaging patterns detected.' }],
      }),
    };
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: (response: any, fallback?: string) => {
    try {
      return response.content[0].text;
    } catch {
      return fallback || '';
    }
  },
}));

const { competitorSpyRoutes } = await import('../routes/competitor-spy.js');

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

  await app.register(competitorSpyRoutes, { prefix: '/competitor-spy' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /competitor-spy/search', () => {
  it('searches Ad Library and returns results grouped by page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/search?query=skincare',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.total_ads).toBe(2);
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0].page_name).toBe('Test Brand');
    expect(body.pages[0].ads).toHaveLength(2);
  });

  it('supports country parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/search?query=fashion&country=US',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('supports limit parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/search?query=shoes&limit=5',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/search',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/search?query=test',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /competitor-spy/analyze', () => {
  it('returns analysis with stats and sample ads', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/analyze?query=Nike',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.query).toBe('Nike');
    expect(body.stats).toBeDefined();
    expect(body.stats.total_ads).toBe(2);
    expect(body.stats.unique_pages).toBe(1);
    expect(body.stats.platforms).toBeDefined();
    expect(body.analysis).toBeDefined();
    expect(body.sample_ads).toBeDefined();
    expect(body.sample_ads.length).toBeGreaterThan(0);
  });

  it('supports country parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/analyze?query=Adidas&country=IN',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects missing query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/analyze',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/competitor-spy/analyze?query=test',
    });
    expect(res.statusCode).toBe(401);
  });
});
