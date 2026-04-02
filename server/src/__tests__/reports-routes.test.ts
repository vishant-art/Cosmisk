/**
 * Reports Routes Tests
 *
 * Tests report generation, report listing, and templates.
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

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string) {
      if (path.includes('/insights')) {
        return {
          data: [{
            spend: '500',
            impressions: '10000',
            clicks: '200',
            ctr: '2.0',
            cpc: '2.50',
            actions: [{ action_type: 'purchase', value: '10' }],
            action_values: [{ action_type: 'purchase', value: '2000' }],
            purchase_roas: [{ value: '4.0' }],
            campaign_name: 'Test Campaign',
          }],
        };
      }
      if (path.includes('/ads')) {
        return {
          data: [{
            id: 'ad_1',
            name: 'Test Ad',
            creative: { object_type: 'IMAGE', thumbnail_url: '' },
            insights: { data: [{ spend: '100', impressions: '5000', clicks: '100', ctr: '2.0', actions: [], action_values: [], purchase_roas: [{ value: '3.0' }] }] },
          }],
        };
      }
      if (path.includes('fields=currency')) {
        return { currency: 'USD' };
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
    spend: parseFloat(row?.spend || '0'),
    revenue: parseFloat(row?.action_values?.[0]?.value || '0'),
    roas: parseFloat(row?.purchase_roas?.[0]?.value || '0'),
    cpa: 0,
    ctr: parseFloat(row?.ctr || '0'),
    impressions: parseInt(row?.impressions || '0'),
    clicks: parseInt(row?.clicks || '0'),
    conversions: parseInt(row?.actions?.[0]?.value || '0'),
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

vi.mock('../services/format-helpers.js', () => ({
  round: (v: number) => Math.round(v * 100) / 100,
  fmt: (v: number) => `$${v.toFixed(2)}`,
  fmtInt: (v: number) => String(v),
  setCurrency: () => {},
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0 }),
  assessConfidence: () => ({ shouldRecommendAction: true }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: 'Mock weekly strategy report content.' }],
      }),
    };
  },
}));

vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: (resp: any) => resp?.content?.[0]?.text || '',
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { reportRoutes } = await import('../routes/reports.js');

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

  await app.register(reportRoutes, { prefix: '/reports' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Report Tester', 'reports@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'reports@test.com', name: 'Report Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Templates                                                           */
/* ------------------------------------------------------------------ */

describe('GET /reports/templates', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('returns report templates', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.templates).toBeDefined();
    expect(body.templates.length).toBeGreaterThan(0);
    expect(body.templates[0].id).toBeDefined();
    expect(body.templates[0].name).toBeDefined();
    expect(body.templates[0].type).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Report Listing                                                      */
/* ------------------------------------------------------------------ */

describe('GET /reports/list', () => {
  it('returns empty reports list initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reports).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Report Generation                                                   */
/* ------------------------------------------------------------------ */

describe('POST /reports/generate', () => {
  it('returns error when Meta is not connected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.meta_connected).toBe(false);
  });

  it('generates a performance report when Meta is connected', async () => {
    testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id) VALUES (?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta_user_1');

    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report_id).toBeDefined();
    expect(body.size).toBeDefined();
  });

  it('generates a creative report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        type: 'creative',
        date_range: 'last_30d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report_id).toBeDefined();
  });

  it('generates an audience report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        type: 'audience',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('generates a full report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        type: 'full',
        date_range: 'last_30d',
        account_id: 'act_123',
        name: 'Monthly Client Report',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('GET /reports/list returns generated reports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.reports.length).toBeGreaterThanOrEqual(4);
    expect(body.reports[0].status).toBe('Ready');
    expect(body.reports[0].data).toBeDefined();
    expect(body.reports[0].createdAt).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Weekly Strategy Report                                              */
/* ------------------------------------------------------------------ */

describe('POST /reports/generate-weekly', () => {
  it('generates a weekly strategy report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { account_id: 'act_123' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report_id).toBeDefined();
    expect(body.strategy_report).toBeDefined();
  });

  it('returns error when Meta is not connected', async () => {
    // Remove Meta token
    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(testUserId);

    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { account_id: 'act_123' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Meta account not connected');
  });
});
