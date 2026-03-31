/**
 * Reports Routes Tests
 *
 * Tests for /reports endpoints: templates, list, generate, generate-weekly.
 * Meta API and Claude are mocked. In-memory SQLite with real Zod validation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
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
    async get(path: string, params?: any) {
      // Return realistic mock data based on endpoint
      if (path.includes('/insights')) {
        return {
          data: [{
            spend: '1500.00',
            impressions: '50000',
            clicks: '2500',
            ctr: '5.0',
            cpc: '0.60',
            actions: [{ action_type: 'purchase', value: '30' }],
            action_values: [{ action_type: 'purchase', value: '6000.00' }],
            purchase_roas: [{ value: '4.0' }],
            campaign_name: 'Test Campaign',
            date_start: '2026-03-24',
          }],
        };
      }
      if (path.includes('/ads')) {
        return {
          data: [{
            id: 'ad_1',
            name: 'Test Ad',
            creative: { thumbnail_url: 'https://example.com/thumb.jpg', object_type: 'IMAGE' },
            insights: {
              data: [{
                spend: '500',
                impressions: '10000',
                clicks: '500',
                ctr: '5.0',
                actions: [{ action_type: 'purchase', value: '10' }],
                action_values: [{ action_type: 'purchase', value: '2000' }],
                purchase_roas: [{ value: '4.0' }],
              }],
            },
          }],
        };
      }
      if (path.includes('/adaccounts') || path.includes('/me/adaccounts')) {
        return { data: [{ id: 'act_123', name: 'Test Account' }] };
      }
      if (path.match(/\/act_\w+$/)) {
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

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/automation-engine.js', () => ({
  runAutomations: async () => ({ triggered: 0, actions: [] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: '## Weekly Strategy Report\n\nThis week performance was strong with 4.0x ROAS.' }],
      }),
    };
  },
}));

const { reportRoutes } = await import('../routes/reports.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

async function buildApp() {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-only',
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(reportRoutes, { prefix: '/reports' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Report Test User', 'reports@test.com', hash, 'user', 'growth', 1);

  authToken = app.jwt.sign({ id: testUserId, email: 'reports@test.com', name: 'Report Test User', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

/* ------------------------------------------------------------------ */
/*  GET /reports/templates                                             */
/* ------------------------------------------------------------------ */
describe('GET /reports/templates', () => {
  it('returns all report templates', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBe(5);
  });

  it('templates have required fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
      headers: authHeaders(),
    });
    const body = res.json();
    for (const template of body.templates) {
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('type');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('sections');
      expect(Array.isArray(template.sections)).toBe(true);
    }
  });

  it('includes expected template types', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
      headers: authHeaders(),
    });
    const body = res.json();
    const ids = body.templates.map((t: any) => t.id);
    expect(ids).toContain('weekly-performance');
    expect(ids).toContain('creative-analysis');
    expect(ids).toContain('audience-insights');
    expect(ids).toContain('monthly-client');
    expect(ids).toContain('roas-deep-dive');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /reports/list                                                  */
/* ------------------------------------------------------------------ */
describe('GET /reports/list', () => {
  beforeAll(() => {
    // Seed some reports
    for (let i = 0; i < 3; i++) {
      testDb.prepare(
        'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        uuidv4(), testUserId,
        `Test Report ${i}`, 'performance',
        'act_123', 'last_7d', 'Ready',
        JSON.stringify({ type: 'performance', kpis: { spend: 100 + i * 50 } }),
      );
    }
  });

  it('returns reports for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.reports)).toBe(true);
    expect(body.reports.length).toBeGreaterThanOrEqual(3);
  });

  it('returns properly formatted report items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
      headers: authHeaders(),
    });
    const body = res.json();
    const report = body.reports[0];
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('name');
    expect(report).toHaveProperty('type');
    expect(report).toHaveProperty('dateRange');
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('createdAt');
    expect(report).toHaveProperty('size');
    expect(report).toHaveProperty('data');
  });

  it('does not return other users reports', async () => {
    const otherUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(otherUserId, 'Other Report', 'other-report@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'free');
    testDb.prepare(
      'INSERT INTO reports (id, user_id, title, type, status, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), otherUserId, 'Secret Report', 'performance', 'Ready', '{}');

    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
      headers: authHeaders(),
    });
    const body = res.json();
    const names = body.reports.map((r: any) => r.name);
    expect(names).not.toContain('Secret Report');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/list',
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /reports/generate                                             */
/* ------------------------------------------------------------------ */
describe('POST /reports/generate', () => {
  beforeAll(() => {
    // User needs a Meta token for report generation
    testDb.prepare(
      'INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)'
    ).run(testUserId, 'encrypted_mock_token', 'meta_u1', 'Meta User');
  });

  it('generates a performance report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
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
      headers: authHeaders(),
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
      headers: authHeaders(),
      payload: {
        type: 'audience',
        date_range: 'last_14d',
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
      headers: authHeaders(),
      payload: {
        type: 'full',
        date_range: 'last_7d',
        account_id: 'act_123',
        name: 'Monthly Client Report - March',
        include_branding: true,
        include_ai_summary: true,
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('generates with optional name and brand', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
        name: 'Custom Report Name',
        brand: 'Cosmisk',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects missing account_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
      payload: {
        type: 'performance',
        date_range: 'last_7d',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid report type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
      payload: {
        type: 'invalid_type',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid date_range', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
      payload: {
        type: 'performance',
        date_range: 'last_999d',
        account_id: 'act_123',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns error when Meta not connected', async () => {
    // Create user without meta token
    const noMetaUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(noMetaUserId, 'No Meta', 'nometa@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'growth');
    const noMetaToken = app.jwt.sign({ id: noMetaUserId, email: 'nometa@test.com', name: 'No Meta', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: { Authorization: `Bearer ${noMetaToken}` },
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Meta account not connected');
  });

  it('report is persisted to DB after generation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      headers: authHeaders(),
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    const body = res.json();
    const reportId = body.report_id;

    const row = testDb.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('performance');
    expect(row.status).toBe('Ready');
    expect(row.account_id).toBe('act_123');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      payload: {
        type: 'performance',
        date_range: 'last_7d',
        account_id: 'act_123',
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /reports/generate-weekly                                      */
/* ------------------------------------------------------------------ */
describe('POST /reports/generate-weekly', () => {
  it('generates a weekly strategy report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: authHeaders(),
      payload: {
        account_id: 'act_123',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report_id).toBeDefined();
    expect(body.strategy_report).toBeDefined();
    expect(typeof body.strategy_report).toBe('string');
  });

  it('rejects missing account_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns error when Meta not connected', async () => {
    const noMetaUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(noMetaUserId, 'No Meta 2', 'nometa2@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'growth');
    const noMetaToken = app.jwt.sign({ id: noMetaUserId, email: 'nometa2@test.com', name: 'No Meta 2', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: { Authorization: `Bearer ${noMetaToken}` },
      payload: { account_id: 'act_123' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Meta account not connected');
  });

  it('persists weekly report to DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      headers: authHeaders(),
      payload: { account_id: 'act_123' },
    });
    const body = res.json();

    const row = testDb.prepare('SELECT * FROM reports WHERE id = ?').get(body.report_id) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('weekly-strategy');
    expect(row.status).toBe('Ready');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate-weekly',
      payload: { account_id: 'act_123' },
    });
    expect(res.statusCode).toBe(401);
  });
});
