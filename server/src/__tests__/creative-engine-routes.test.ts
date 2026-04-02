/**
 * Creative Engine Routes Tests
 *
 * Tests sprint creation, sprint listing, and job status polling.
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
    async get() { return { data: [] }; }
  },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: () => ({ spend: 0, revenue: 0, roas: 0, cpa: 0, ctr: 0, impressions: 0, clicks: 0, conversions: 0 }),
}));

vi.mock('../services/format-helpers.js', () => ({
  round: (v: number) => v,
  fmt: (v: number) => `$${v}`,
  fmtInt: (v: number) => String(v),
  setCurrency: () => {},
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0 }),
  assessConfidence: () => ({ shouldRecommendAction: true }),
}));

vi.mock('../services/sprint-planner.js', () => ({
  generateSprintPlan: async () => ({
    items: [
      { format: 'image', count: 5, estimated_cost_cents: 500, description: 'Test images' },
    ],
    totalCreatives: 5,
    totalEstimatedCents: 500,
  }),
  generateScript: async () => 'test script',
  generateScriptsForJobs: async () => [],
}));

vi.mock('../services/plan-scorer.js', () => ({
  scorePlanItems: (items: any[]) => ({
    scored: items.map((i: any) => ({ ...i, winProbability: 0.7, warnings: [] })),
    removed: [],
    summary: { total: items.length, removed: 0, survived: items.length },
  }),
  optimizeCounts: (items: any[]) => items,
}));

vi.mock('../services/job-queue.js', () => ({
  startSprintGeneration: async () => {},
  isSprintActive: () => false,
  stopSprintGeneration: () => {},
}));

vi.mock('../services/visual-analyzer.js', () => ({
  analyzeTopAdVisuals: async () => new Map(),
  buildVisualSummary: () => '',
  selectAdsForAnalysis: () => [],
}));

vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
  },
}));

vi.mock('../routes/billing.js', () => ({
  checkLimit: () => ({ allowed: true, current: 0, limit: 100 }),
  incrementUsage: () => {},
}));

vi.mock('../routes/competitor-spy.js', () => ({
  searchAdLibrary: async () => [],
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { creativeEngineRoutes } = await import('../routes/creative-engine.js');

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

  await app.register(creativeEngineRoutes, { prefix: '/creative-engine' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'CE Tester', 'ce@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'ce@test.com', name: 'CE Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /creative-engine/sprints', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/creative-engine/sprints' });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty sprints array initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/creative-engine/sprints',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sprints).toEqual([]);
  });
});

describe('Sprint creation and listing', () => {
  let sprintId: string;

  it('POST /creative-engine/plan creates a sprint with plan', async () => {
    // Connect Meta token for the analyze path
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id) VALUES (?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta_user_1');

    const res = await app.inject({
      method: 'POST',
      url: '/creative-engine/plan',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        snapshot: {
          topAds: [],
          benchmarks: { avgRoas: 2, avgCtr: 1.5, avgCpa: 10, avgSpend: 50, totalSpend: 500 },
          formatBreakdown: {},
          fatigueSignals: [],
          visualAnalysis: {},
          visualSummary: '',
        },
        sprint_name: 'Test Sprint',
        preferences: { currency: 'USD' },
      },
    });

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sprint_id).toBeDefined();
    expect(body.plan).toBeDefined();
    sprintId = body.sprint_id;
  });

  it('GET /creative-engine/sprints returns the created sprint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/creative-engine/sprints',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.sprints).toHaveLength(1);
    expect(body.sprints[0].name).toBe('Test Sprint');
    expect(body.sprints[0].status).toBe('planning');
  });

  it('GET /creative-engine/sprint/:id returns sprint detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/creative-engine/sprint/${sprintId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sprint.name).toBe('Test Sprint');
    expect(body.sprint.plan).toBeDefined();
    expect(body.jobs).toEqual([]);
    expect(body.assets).toEqual([]);
  });

  it('GET /creative-engine/sprint/:id returns 404 for non-existent sprint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/creative-engine/sprint/${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /creative-engine/analyze', () => {
  it('returns 400 when account_id is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/creative-engine/analyze',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when Meta is not connected', async () => {
    // Remove Meta token
    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(testUserId);

    const res = await app.inject({
      method: 'POST',
      url: '/creative-engine/analyze',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { account_id: 'act_123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Meta account not connected');
  });
});
