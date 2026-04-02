/**
 * Ad Accounts Route Tests
 *
 * Tests account listing, KPIs, top ads, video source, portfolio health, and pages.
 * External Meta API calls are mocked.
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

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string, params?: any) {
      // /me/adaccounts
      if (path === '/me/adaccounts') {
        return { data: [{ id: 'act_111', account_id: '111', name: 'Test Account', business_name: 'Test Biz', account_status: 1, currency: 'USD' }] };
      }
      // insights
      if (path.includes('/insights')) {
        return { data: [{ spend: '100.50', impressions: '5000', clicks: '200', ctr: '4.0', cpc: '0.50', actions: [{ action_type: 'purchase', value: '10' }], action_values: [{ action_type: 'purchase', value: '500' }], purchase_roas: [{ value: '4.97' }] }] };
      }
      // ads
      if (path.includes('/ads')) {
        return { data: [{ id: 'ad_1', name: 'Test Ad', creative: { thumbnail_url: 'https://img.test/1.jpg', object_type: 'IMAGE' }, insights: { data: [{ spend: '50', impressions: '2000', clicks: '100', ctr: '5.0', cpc: '0.50', actions: [{ action_type: 'purchase', value: '5' }], action_values: [{ action_type: 'purchase', value: '250' }], purchase_roas: [{ value: '5.0' }] }] }, campaign: { name: 'Camp A' }, adset: { name: 'Adset A' }, created_time: '2026-03-01T00:00:00Z' }] };
      }
      // video source
      if (path.match(/^\/\d+$/)) {
        return { source: 'https://video.test/v.mp4' };
      }
      // pages
      if (path === '/me/accounts') {
        return { data: [{ id: 'page_1', name: 'Test Page', category: 'Business', picture: { data: { url: 'https://img.test/page.jpg' } } }] };
      }
      return { data: [] };
    }
    async getAllPages(path: string) {
      if (path === '/me/adaccounts') {
        return [{ id: 'act_111', account_id: '111', name: 'Test Account', business_name: 'Test Biz', account_status: 1, currency: 'USD' }];
      }
      if (path.includes('/ads')) {
        return [{ id: 'ad_1', name: 'Test Ad', creative: { thumbnail_url: 'https://img.test/1.jpg', object_type: 'IMAGE' }, insights: { data: [{ spend: '50' }] }, campaign: { name: 'Camp A' }, adset: { name: 'Adset A' }, created_time: '2026-03-01T00:00:00Z' }];
      }
      if (path.includes('/campaigns')) {
        return [{ id: 'camp_1', name: 'Campaign One', status: 'ACTIVE' }];
      }
      return [];
    }
  },
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: (row: any) => ({
    spend: parseFloat(row?.spend || '0'),
    impressions: parseInt(row?.impressions || '0'),
    clicks: parseInt(row?.clicks || '0'),
    ctr: parseFloat(row?.ctr || '0'),
    cpc: parseFloat(row?.cpc || '0'),
    conversions: 10,
    revenue: 500,
    roas: 4.97,
    cpa: 10.05,
    aov: 50,
  }),
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0, label: 'Stable' }),
  assessConfidence: () => ({ level: 'high', shouldRecommendAction: true }),
  qualifyMetric: () => 'Good metric',
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { adAccountRoutes } = await import('../routes/ad-accounts.js');

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

  await app.register(adAccountRoutes, { prefix: '/ad-accounts' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@ad.com', hash, 'user', 'growth');

  // Insert a meta token so routes find it
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'enc-token', 'mu1', 'Meta User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@ad.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /ad-accounts/list', () => {
  it('returns ad accounts for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.accounts).toBeDefined();
    expect(body.accounts.length).toBeGreaterThan(0);
    expect(body.accounts[0].name).toBe('Test Account');
    expect(body.total).toBe(1);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/ad-accounts/list' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /ad-accounts/kpis', () => {
  it('returns KPIs for an account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.kpis).toBeDefined();
    expect(body.kpis.spend).toBeDefined();
    expect(body.kpis.roas).toBeDefined();
  });

  it('rejects when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /ad-accounts/top-ads', () => {
  it('returns top ads for an account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/top-ads?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.ads).toBeDefined();
    expect(body.ads.length).toBeGreaterThan(0);
    expect(body.ads[0].name).toBe('Test Ad');
  });

  it('rejects when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/top-ads',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /ad-accounts/video-source', () => {
  it('returns video source URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source?video_id=12345',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.video_url).toBe('https://video.test/v.mp4');
  });

  it('rejects when video_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /ad-accounts/portfolio-health', () => {
  it('returns portfolio health data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/portfolio-health',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.portfolio).toBeDefined();
    expect(body.accounts).toBeDefined();
  });
});

describe('GET /ad-accounts/pages', () => {
  it('returns Facebook pages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/pages',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.pages).toBeDefined();
    expect(body.pages.length).toBeGreaterThan(0);
    expect(body.pages[0].name).toBe('Test Page');
  });
});
