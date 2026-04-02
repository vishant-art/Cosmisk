/**
 * Automations Route Tests
 *
 * Tests CRUD operations, activation/deactivation for automation rules.
 * Uses in-memory SQLite, real Zod validation, real JWT auth.
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

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class { async get() { return { data: [] }; } async getAllPages() { return []; } },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/automation-engine.js', () => ({
  runAutomations: async () => ({ triggered: 0, actions: [] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: () => ({ spend: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }),
}));

vi.mock('../services/format-helpers.js', () => ({
  fmt: (v: number) => `$${v}`,
  setCurrency: () => {},
  getCurrency: () => 'USD',
  round: (v: number) => v,
  fmtNum: (v: number) => String(v),
  fmtInt: (v: number) => String(v),
  avgVal: () => 0,
  CURRENCY_SYMBOLS: { USD: '$' },
}));

vi.mock('../services/trend-analyzer.js', () => ({
  assessConfidence: () => ({ shouldRecommendAction: false, level: 'low', caveat: '' }),
  computeTrend: () => ({ direction: 'stable', label: 'stable' }),
  trendCaveat: () => '',
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

const { automationRoutes } = await import('../routes/automations.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let adminToken: string;

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

  await app.register(automationRoutes, { prefix: '/automations' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  const adminId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(adminId, 'Admin', 'admin@test.com', hash, 'admin', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
  adminToken = app.jwt.sign({ id: adminId, email: 'admin@test.com', name: 'Admin', role: 'admin' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('Automations CRUD', () => {
  let automationId: string;

  it('GET /automations/list returns empty array initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.automations).toEqual([]);
  });

  it('POST /automations/create creates a rule', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        account_id: 'act_123456',
        name: 'Pause high CPA',
        trigger_type: 'cpa_above',
        trigger_value: '100',
        action_type: 'pause',
        action_value: '',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.automation.name).toBe('Pause high CPA');
    expect(body.automation.triggerType).toBe('cpa_above');
    expect(body.automation.status).toBe('active');
    automationId = body.automation.id;
  });

  it('GET /automations/list returns the created automation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.automations).toHaveLength(1);
    expect(body.automations[0].name).toBe('Pause high CPA');
  });

  it('PUT /automations/update deactivates an automation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { id: automationId, is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.automation.status).toBe('paused');
  });

  it('PUT /automations/update reactivates an automation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { id: automationId, is_active: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().automation.status).toBe('active');
  });

  it('PUT /automations/update renames an automation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { id: automationId, name: 'Pause VERY high CPA' },
    });
    expect(res.statusCode).toBe(200);
    const rule = testDb.prepare('SELECT * FROM automations WHERE id = ?').get(automationId) as any;
    expect(rule.name).toBe('Pause VERY high CPA');
  });

  it('PUT /automations/update returns 404 for nonexistent rule', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { id: uuidv4(), name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /automations/update returns 400 without id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'No ID' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /automations/delete removes an automation', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/automations/delete?id=${automationId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const remaining = testDb.prepare('SELECT COUNT(*) as c FROM automations WHERE user_id = ?').get(testUserId) as any;
    expect(remaining.c).toBe(0);
  });

  it('DELETE /automations/delete returns 404 for nonexistent', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/automations/delete?id=${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /automations/delete returns 400 without id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/automations/delete',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects creating with missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { account_id: 'act_1', trigger_type: 'cpa_above', action_type: 'pause' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/automations/list' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Automations run (admin only)', () => {
  it('rejects non-admin users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/run',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows admin to trigger', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
