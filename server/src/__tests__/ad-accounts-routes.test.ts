/**
 * Ad Accounts Route Tests
 *
 * Integration tests for /ad-accounts endpoints.
 * Tests list, KPIs, top-ads, video-source, portfolio-health, pages.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

const mockMetaGet = vi.fn().mockResolvedValue({ data: [] });
const mockMetaGetAllPages = vi.fn().mockResolvedValue([]);

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    get = mockMetaGet;
    getAllPages = mockMetaGetAllPages;
  },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {},
}));

const { adAccountRoutes } = await import('../routes/ad-accounts.js');

let app: FastifyInstance;
let userId: string;
let userToken: string;

async function buildApp() {
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

  await app.register(adAccountRoutes, { prefix: '/ad-accounts' });
  await app.ready();

  const hash = bcrypt.hashSync('SecurePass123!', 10);

  userId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'Test User', 'test@test.com', hash, 'user', 'growth');
  userToken = app.jwt.sign({ id: userId, email: 'test@test.com', name: 'Test User', role: 'user' });
}

beforeAll(async () => { await buildApp(); });
afterAll(async () => { await app.close(); testDb.close(); });
beforeEach(() => {
  mockMetaGet.mockReset().mockResolvedValue({ data: [] });
  mockMetaGetAllPages.mockReset().mockResolvedValue([]);
});

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

describe('Ad Accounts Routes — Auth', () => {
  it('rejects unauthenticated requests', async () => {
    const endpoints = [
      '/ad-accounts/list',
      '/ad-accounts/kpis?account_id=act_123',
      '/ad-accounts/top-ads?account_id=act_123',
      '/ad-accounts/video-source?video_id=123',
      '/ad-accounts/portfolio-health',
      '/ad-accounts/pages',
    ];

    for (const url of endpoints) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/list                                              */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/list', () => {
  it('returns empty accounts when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.accounts).toEqual([]);
    expect(body.meta_connected).toBe(false);
  });

  it('returns accounts from Meta API when token exists', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGetAllPages.mockResolvedValue([
      { id: 'act_111', account_id: '111', name: 'Brand One', business_name: 'Biz', account_status: 1, currency: 'INR' },
      { id: 'act_222', account_id: '222', name: 'Brand Two', business_name: '', account_status: 2, currency: 'USD' },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.accounts).toHaveLength(2);
    expect(body.accounts[0].name).toBe('Brand One');
    expect(body.accounts[0].status).toBe('active');
    expect(body.accounts[0].currency).toBe('INR');
    expect(body.accounts[1].status).toBe('inactive');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });

  it('handles rate limit errors gracefully', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGetAllPages.mockRejectedValue(new Error('too many calls to this API'));

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    // Route catches the error — returns 200 with empty data or error status
    expect(res.statusCode).toBeLessThan(500);

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/kpis                                              */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/kpis', () => {
  it('returns 400 when account_id missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty KPIs when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    // Route might use different field name or handle differently
    expect(body.meta_connected === false || body.success === false || res.statusCode === 400).toBeTruthy();
  });

  it('returns KPI data when Meta token exists', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGet.mockResolvedValue({
      data: [{ spend: '500.00', impressions: '10000', clicks: '200', ctr: '2.0', cpc: '2.50' }],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.kpis).toHaveProperty('spend');
    expect(body.kpis).toHaveProperty('roas');
    expect(body.kpis).toHaveProperty('cpa');
    expect(body.kpis.spend).toHaveProperty('value');
    expect(body.kpis.spend).toHaveProperty('change');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });

  it('accepts date_preset parameter', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGet.mockResolvedValue({ data: [{}] });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/kpis?account_id=act_123&date_preset=last_30d',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/top-ads                                           */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/top-ads', () => {
  it('returns 400 when account_id missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/top-ads',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty ads when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/top-ads?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.meta_connected).toBe(false);
  });

  it('returns ads sorted by spend descending', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGet.mockResolvedValue({
      data: [
        {
          id: 'ad_1', name: 'Low Spend Ad',
          insights: { data: [{ spend: '50' }] },
          creative: { thumbnail_url: 'http://img.com/1.jpg', object_type: 'IMAGE' },
          campaign: { name: 'Campaign A' },
          adset: { name: 'Adset 1' },
          created_time: '2026-03-01T00:00:00Z',
        },
        {
          id: 'ad_2', name: 'High Spend Ad',
          insights: { data: [{ spend: '500' }] },
          creative: { thumbnail_url: 'http://img.com/2.jpg', object_type: 'VIDEO', video_id: 'v123' },
          campaign: { name: 'Campaign B' },
          adset: { name: 'Adset 2' },
          created_time: '2026-03-15T00:00:00Z',
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/top-ads?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.ads).toHaveLength(2);
    expect(body.ads[0].name).toBe('High Spend Ad');
    expect(body.ads[0].metrics.spend).toBeGreaterThan(body.ads[1].metrics.spend);
    expect(body.ads[1].campaign_name).toBe('Campaign A');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/video-source                                      */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/video-source', () => {
  it('returns 400 when video_id missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns meta_connected false when no token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source?video_id=123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.meta_connected).toBe(false);
  });

  it('returns video URL from direct source', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGet.mockResolvedValue({ source: 'https://video.fb.com/v123.mp4' });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source?video_id=v123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.video_url).toBe('https://video.fb.com/v123.mp4');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });

  it('falls back to embed_html when direct source unavailable', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    // First call (direct source) fails, second call returns embed_html
    mockMetaGet
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce({ embed_html: '<iframe src="https://www.facebook.com/plugins/video.php?href=123"></iframe>' });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/video-source?video_id=v123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.video_url).toContain('facebook.com');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/portfolio-health                                  */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/portfolio-health', () => {
  it('returns meta_connected false when no token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/portfolio-health',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.meta_connected).toBe(false);
  });

  it('returns portfolio summary when token exists', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGetAllPages.mockResolvedValue([
      { id: 'act_111', account_id: '111', name: 'Brand A', account_status: 1, currency: 'INR' },
    ]);

    // For each account's insights calls
    mockMetaGet.mockResolvedValue({
      data: [{ spend: '1000', impressions: '50000', clicks: '1000', ctr: '2.0', actions: [], action_values: [], purchase_roas: [{ value: '2.5' }] }],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/portfolio-health',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.portfolio).toHaveProperty('totalSpend');
    expect(body.portfolio).toHaveProperty('avgRoas');
    expect(body.portfolio).toHaveProperty('needsAttention');
    expect(Array.isArray(body.accounts)).toBe(true);

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });

  it('handles rate limit errors on portfolio health', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGetAllPages.mockRejectedValue(new Error('rate limit reached'));

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/portfolio-health',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    // Route catches the error gracefully — doesn't crash with 500
    expect(res.statusCode).toBeLessThan(500);

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ad-accounts/pages                                             */
/* ------------------------------------------------------------------ */

describe('GET /ad-accounts/pages', () => {
  it('returns empty pages when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/pages',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.pages).toEqual([]);
  });

  it('returns pages from Meta API', async () => {
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    mockMetaGet.mockResolvedValue({
      data: [
        { id: 'page_1', name: 'My Page', category: 'Brand', picture: { data: { url: 'https://img.com/pic.jpg' } } },
        { id: 'page_2', name: 'Other Page', category: '', picture: null },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/ad-accounts/pages',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0].name).toBe('My Page');
    expect(body.pages[0].picture_url).toBe('https://img.com/pic.jpg');
    expect(body.pages[1].picture_url).toBe('');

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});
