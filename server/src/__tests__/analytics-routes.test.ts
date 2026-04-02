/**
 * Analytics Routes Tests
 *
 * Tests campaign-level metrics, ad-level metrics, and empty state handling.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Track Meta API calls to control responses per test
let metaApiResponses: Record<string, any> = {};

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string) {
      // Return custom response if set, otherwise empty
      for (const [key, val] of Object.entries(metaApiResponses)) {
        if (path.includes(key)) return val;
      }
      return { data: [] };
    }
  },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: (row: any) => ({
    spend: row?.spend ? parseFloat(row.spend) : 0,
    revenue: row?.revenue || 0,
    roas: row?.roas || 0,
    cpa: row?.cpa || 0,
    ctr: row?.ctr || 0,
    impressions: row?.impressions || 0,
    clicks: row?.clicks || 0,
    conversions: row?.conversions || 0,
  }),
  parseCampaignBreakdown: (data: any[]) => data.map((d: any) => ({
    label: d.campaign_name || 'Unknown',
    spend: parseFloat(d.spend || '0'),
    roas: parseFloat(d.purchase_roas?.[0]?.value || '0'),
    cpa: 0,
    ctr: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
  })),
  parseAudienceBreakdown: (data: any[]) => data.map((d: any) => ({
    label: `${d.age || '?'} ${d.gender || '?'}`,
    spend: parseFloat(d.spend || '0'),
    roas: 0,
  })),
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0 }),
  assessConfidence: () => ({ shouldRecommendAction: true }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { analyticsRoutes } = await import('../routes/analytics.js');

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
  await app.register(jwt.default, { secret: 'test-secret-only', sign: { expiresIn: '1h' } });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Analytics Tester', 'analytics@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'analytics@test.com', name: 'Analytics Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /analytics/full', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/analytics/full?account_id=act_123' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/full',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns meta_connected: false when no Meta token exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/full?account_id=act_123',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
    expect(body.campaignBreakdown).toEqual([]);
  });

  it('returns campaign and audience breakdown when Meta is connected', async () => {
    // Connect Meta token
    testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id) VALUES (?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta_user_1');

    metaApiResponses = {
      '/insights': { data: [{ campaign_name: 'Test Campaign', spend: '100', purchase_roas: [{ value: '3.5' }] }] },
    };

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/full?account_id=act_123&date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.campaignBreakdown).toBeDefined();
    expect(body.audienceBreakdown).toBeDefined();
  });

  it('returns empty arrays when Meta API returns no data', async () => {
    metaApiResponses = {
      '/insights': { data: [] },
    };

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/full?account_id=act_empty&date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.campaignBreakdown).toEqual([]);
    expect(body.audienceBreakdown).toEqual([]);
  });
});
