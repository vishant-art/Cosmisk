/**
 * Campaigns Route Tests
 *
 * Tests campaign CRUD (create, list, detail, update) and status updates.
 * Meta API calls for campaign launching are mocked.
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
    async get(path: string) {
      if (path.includes('/insights')) {
        return { data: [{ spend: '100', impressions: '5000', clicks: '200', ctr: '4.0', cpc: '0.50', actions: [{ action_type: 'purchase', value: '10' }], action_values: [{ action_type: 'purchase', value: '500' }], purchase_roas: [{ value: '5.0' }] }] };
      }
      if (path.match(/\/act_\d+$/)) {
        return { currency: 'INR' };
      }
      return { data: [] };
    }
    async getAllPages() { return []; }
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
    roas: 5.0,
    cpa: 10,
    aov: 50,
  }),
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0, label: 'Stable' }),
  assessConfidence: () => ({ level: 'high', shouldRecommendAction: true }),
  qualifyMetric: () => 'Good metric',
}));

vi.mock('../services/format-helpers.js', () => ({
  round: (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d),
  fmt: (v: number) => `$${v.toFixed(2)}`,
  setCurrency: () => {},
}));

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'meta_camp_1' }),
  }),
  safeJson: async (resp: any) => {
    if (typeof resp.json === 'function') return resp.json();
    return resp;
  },
}));

vi.mock('../config.js', () => ({
  config: {
    graphApiBase: 'https://graph.facebook.com/v22.0',
    anthropicApiKey: 'test-key',
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { campaignRoutes } = await import('../routes/campaigns.js');

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

  await app.register(campaignRoutes, { prefix: '/campaigns' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@campaigns.com', hash, 'user', 'growth');

  // Insert a meta token
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'enc-token', 'mu1', 'Meta User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@campaigns.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('Campaign CRUD', () => {
  let campaignId: string;

  it('GET /campaigns/list returns empty array initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.campaigns).toEqual([]);
  });

  it('POST /campaigns/create creates a new campaign', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Test Campaign',
        objective: 'Conversions',
        budget: '5000',
        account_id: 'act_111',
        status: 'draft',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.campaign_id).toBeDefined();
    campaignId = body.campaign_id;
  });

  it('GET /campaigns/list returns the created campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe('Test Campaign');
    expect(body.campaigns[0].objective).toBe('Conversions');
    expect(body.campaigns[0].status).toBe('draft');
  });

  it('GET /campaigns/list filters by account_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/list?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.campaigns).toHaveLength(1);

    // Different account ID returns empty
    const res2 = await app.inject({
      method: 'GET',
      url: '/campaigns/list?account_id=act_999',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res2.json().campaigns).toHaveLength(0);
  });

  it('GET /campaigns/detail returns single campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/campaigns/detail?campaign_id=${campaignId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.campaign.id).toBe(campaignId);
    expect(body.campaign.name).toBe('Test Campaign');
  });

  it('GET /campaigns/detail returns 404 for non-existent campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/detail?campaign_id=non-existent-id',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /campaigns/update updates campaign fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        campaign_id: campaignId,
        name: 'Updated Campaign',
        budget: '10000',
        status: 'active',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify in DB
    const row = testDb.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    expect(row.name).toBe('Updated Campaign');
    expect(row.budget).toBe('10000');
    expect(row.status).toBe('active');
  });

  it('POST /campaigns/update returns 404 for non-existent campaign', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { campaign_id: 'bad-id', name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /campaigns/update with nothing to update returns success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { campaign_id: campaignId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('POST /campaigns/create with audience and creative_ids', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Full Campaign',
        objective: 'Traffic',
        budget: '2000',
        schedule_start: '2026-04-01',
        schedule_end: '2026-04-30',
        audience: { age_min: 25, age_max: 45, gender: 'Female', location: 'India' },
        placements: 'automatic',
        creative_ids: ['cr_1', 'cr_2'],
        status: 'draft',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('Campaign launch', () => {
  let launchCampaignId: string;

  it('POST /campaigns/launch launches a campaign to Meta', async () => {
    // Create campaign to launch
    const createRes = await app.inject({
      method: 'POST',
      url: '/campaigns/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Launch Campaign',
        objective: 'Conversions',
        budget: '5000',
        account_id: 'act_111',
        audience: { age_min: 18, age_max: 65, gender: 'All', location: 'India' },
        status: 'draft',
      },
    });
    launchCampaignId = createRes.json().campaign_id;

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/launch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { campaign_id: launchCampaignId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.campaign_id).toBe('meta_camp_1');

    // Verify campaign is marked as launched
    const row = testDb.prepare('SELECT status FROM campaigns WHERE id = ?').get(launchCampaignId) as any;
    expect(row.status).toBe('launched');
  });

  it('POST /campaigns/launch rejects non-existent campaign', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/launch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { campaign_id: 'bad-id' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /campaigns/launch rejects campaign without account', async () => {
    // Create campaign without account_id
    const createRes = await app.inject({
      method: 'POST',
      url: '/campaigns/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'No Account Campaign', status: 'draft' },
    });
    const noAccountId = createRes.json().campaign_id;

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/launch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { campaign_id: noAccountId },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Campaign suggest', () => {
  it('GET /campaigns/suggest returns suggestion for account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/suggest?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.suggestion).toBeDefined();
    expect(typeof body.suggestion).toBe('string');
  });

  it('GET /campaigns/suggest returns default suggestion without account_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/suggest',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.suggestion).toBeDefined();
  });
});

describe('Authentication enforcement', () => {
  it('rejects unauthenticated requests to /campaigns/list', async () => {
    const res = await app.inject({ method: 'GET', url: '/campaigns/list' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated requests to /campaigns/create', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/create',
      payload: { name: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });
});
