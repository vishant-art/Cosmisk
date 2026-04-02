/**
 * TikTok Ads Route Tests
 *
 * Tests OAuth URL, code exchange, connection status, KPIs, campaigns, disconnect.
 * External TikTok API calls are mocked.
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
    tiktokAppId: 'test-tiktok-app-id',
    tiktokAppSecret: 'test-tiktok-secret',
    appUrl: 'http://localhost:4200',
    anthropicApiKey: 'test-key',
    googleAdsClientId: '',
  },
}));

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: async (url: string, opts?: any) => {
    // OAuth token exchange
    if (url.includes('oauth2/access_token')) {
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { access_token: 'tiktok-token', advertiser_ids: ['adv_123'] } }) };
    }
    // Report API
    if (url.includes('report/integrated')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          code: 0,
          data: {
            list: [{
              dimensions: { campaign_id: 'camp_1', advertiser_id: 'adv_123' },
              metrics: { campaign_name: 'TikTok Campaign 1', spend: '200.00', impressions: '10000', clicks: '500', ctr: '5.0', cpc: '0.40', conversion: '25', cost_per_conversion: '8.00', total_complete_payment_rate: '0.5' },
            }],
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ code: 0, data: {} }) };
  },
  safeJson: async (resp: any) => {
    if (typeof resp.json === 'function') return resp.json();
    return resp;
  },
  ExternalApiError: class extends Error {
    constructor(service: string, status: number, message: string) {
      super(`${service}: ${message}`);
    }
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: 'Mock TikTok analysis' }] }),
    };
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: () => 'Mock TikTok analysis text',
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { tiktokAdsRoutes } = await import('../routes/tiktok-ads.js');

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

  await app.register(tiktokAdsRoutes, { prefix: '/tiktok-ads' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@tiktok.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@tiktok.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /tiktok-ads/oauth-url', () => {
  it('returns OAuth URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tiktok-ads/oauth-url',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.url).toContain('tiktok.com');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/tiktok-ads/oauth-url' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /tiktok-ads/oauth/exchange', () => {
  it('exchanges code for token and returns advertiser ID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tiktok-ads/oauth/exchange',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { code: 'tiktok-auth-code' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.advertiser_id).toBeDefined();
  });

  it('rejects missing code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tiktok-ads/oauth/exchange',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /tiktok-ads/status', () => {
  it('returns connected status after token exchange', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tiktok-ads/status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.advertiser_id).toBeDefined();
  });
});

describe('GET /tiktok-ads/kpis', () => {
  it('returns KPIs for connected account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tiktok-ads/kpis?date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('tiktok');
    expect(body.kpis).toBeDefined();
    expect(body.kpis.spend).toBe(200);
    expect(body.kpis.conversions).toBe(25);
  });
});

describe('GET /tiktok-ads/campaigns', () => {
  it('returns campaign performance data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tiktok-ads/campaigns?date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('tiktok');
    expect(body.campaigns).toBeDefined();
    expect(body.campaigns.length).toBe(1);
    expect(body.campaigns[0].name).toBe('TikTok Campaign 1');
  });
});

describe('POST /tiktok-ads/disconnect', () => {
  it('disconnects TikTok Ads account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tiktok-ads/disconnect',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    // Verify token is removed
    const row = testDb.prepare('SELECT * FROM tiktok_tokens WHERE user_id = ?').get(testUserId);
    expect(row).toBeUndefined();
  });

  it('returns not connected after disconnect', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tiktok-ads/status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.connected).toBe(false);
  });
});
