/**
 * Google Ads Route Tests
 *
 * Tests OAuth URL, code exchange, connection status, account listing, KPIs, campaigns.
 * External Google Ads API calls are mocked.
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

vi.mock('../config.js', () => ({
  config: {
    googleAdsClientId: 'test-client-id',
    googleAdsClientSecret: 'test-client-secret',
    googleAdsDeveloperToken: 'test-dev-token',
    googleAdsRedirectUri: 'http://localhost:4200/callback',
    anthropicApiKey: 'test-key',
    appUrl: 'http://localhost:4200',
    tiktokAppId: '',
    tiktokAppSecret: '',
  },
}));

vi.mock('../services/google-ads-api.js', () => ({
  getGoogleOAuthUrl: (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeGoogleCode: async () => ({ accessToken: 'mock-access', refreshToken: 'mock-refresh', expiresIn: 3600 }),
  refreshGoogleToken: async () => ({ accessToken: 'refreshed-access', expiresIn: 3600 }),
  GoogleAdsApiService: class {
    async getAccessibleCustomers() { return ['1234567890', '0987654321']; }
    async getAccountPerformance() { return { spend: 100, clicks: 500, impressions: 10000, conversions: 20, ctr: 5.0, cpc: 0.2, roas: 3.5 }; }
    async getCampaignPerformance() { return [{ name: 'Campaign 1', spend: 50, clicks: 250 }]; }
  },
  saveGoogleToken: (userId: string, at: string, rt: string, exp: string, cids: string[]) => {
    testDb.prepare(`INSERT INTO google_tokens (user_id, encrypted_access_token, encrypted_refresh_token, customer_ids, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET encrypted_access_token = excluded.encrypted_access_token, encrypted_refresh_token = excluded.encrypted_refresh_token, customer_ids = excluded.customer_ids, expires_at = excluded.expires_at`).run(userId, at, rt, JSON.stringify(cids), exp);
  },
  getGoogleToken: (userId: string) => {
    const row = testDb.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return { accessToken: 'mock-access', refreshToken: 'mock-refresh', customerIds: JSON.parse(row.customer_ids || '[]'), expiresAt: row.expires_at };
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: 'Mock analysis' }] }),
    };
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: () => 'Mock analysis text',
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { googleAdsRoutes } = await import('../routes/google-ads.js');

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

  await app.register(googleAdsRoutes, { prefix: '/google-ads' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@google.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@google.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /google-ads/oauth-url', () => {
  it('returns OAuth URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/oauth-url',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.url).toContain('accounts.google.com');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/google-ads/oauth-url' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /google-ads/oauth/exchange', () => {
  it('exchanges code for tokens and returns customer IDs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/google-ads/oauth/exchange',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { code: 'test-auth-code' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.customer_ids).toBeDefined();
    expect(body.customer_ids.length).toBeGreaterThan(0);
  });

  it('rejects missing code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/google-ads/oauth/exchange',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /google-ads/status', () => {
  it('returns connected status after token exchange', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.customer_ids).toBeDefined();
  });
});

describe('GET /google-ads/accounts', () => {
  it('returns list of accessible accounts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/accounts',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.accounts).toBeDefined();
    expect(body.accounts.length).toBe(2);
  });
});

describe('GET /google-ads/kpis', () => {
  it('returns KPIs for a customer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/kpis?customer_id=1234567890',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('google');
    expect(body.kpis).toBeDefined();
    expect(body.kpis.spend).toBe(100);
  });

  it('rejects when customer_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/kpis',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /google-ads/campaigns', () => {
  it('returns campaign performance data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/google-ads/campaigns?customer_id=1234567890',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('google');
    expect(body.campaigns).toBeDefined();
    expect(body.campaigns.length).toBe(1);
  });
});

describe('POST /google-ads/disconnect', () => {
  it('disconnects Google Ads account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/google-ads/disconnect',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    // Verify token is removed
    const row = testDb.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(testUserId);
    expect(row).toBeUndefined();
  });
});
