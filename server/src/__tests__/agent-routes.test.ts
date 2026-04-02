/**
 * Agent Route Tests
 *
 * Tests agent run history, decision history, approve/reject decisions, memory queries.
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

vi.mock('../services/ad-watchdog.js', () => ({
  runWatchdog: async () => ({ runs: 0, decisions: 0 }),
  executeDecision: async () => ({ success: true, message: 'Executed successfully' }),
  checkOutcomes: async () => 0,
}));

vi.mock('../services/slack-interactive.js', () => ({
  handleSlackAction: async () => ({ text: 'ok' }),
  verifySlackSignature: () => true,
}));

vi.mock('../services/agent-memory.js', () => ({
  buildContextWindow: (_userId: string, _agentType: string) => ({
    coreMemory: [],
    episodes: [],
    entities: [],
  }),
  runDecay: () => 0,
}));

vi.mock('../services/morning-briefing.js', () => ({
  runMorningBriefing: async () => 0,
}));

vi.mock('../config.js', () => ({
  config: { slackSigningSecret: '', graphApiBase: 'https://graph.facebook.com/v22.0' },
}));

vi.mock('../services/report-agent.js', () => ({
  runReportAgentAll: async () => 0,
  runReportAgent: async () => '',
}));

vi.mock('../services/content-agent.js', () => ({
  runContentAgentAll: async () => 0,
  runContentAgent: async () => '',
}));

vi.mock('../services/sales-agent.js', () => ({
  getSalesContext: async () => ({ summary: 'test context', highlights: [] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { agentRoutes } = await import('../routes/agent.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let adminToken: string;
let adminId: string;
let runId: string;
let decisionId: string;
let decisionId2: string;

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

  await app.register(agentRoutes, { prefix: '/agent' });
  await app.ready();

  testUserId = uuidv4();
  adminId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(adminId, 'Admin', 'admin@test.com', hash, 'admin', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
  adminToken = app.jwt.sign({ id: adminId, email: 'admin@test.com', name: 'Admin', role: 'admin' });

  // Seed agent_runs
  runId = uuidv4();
  testDb.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)").run(runId, 'watchdog', testUserId, 'completed', 'Analyzed 5 campaigns');

  // Seed agent_decisions
  decisionId = uuidv4();
  decisionId2 = uuidv4();
  testDb.prepare("INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name, reasoning, confidence, urgency, suggested_action, estimated_impact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(decisionId, runId, testUserId, 'act_1', 'pause', 'ad_123', 'Bad Ad', 'CPA too high', 'high', 'high', 'Pause this ad', 'Save $50/day', 'pending');
  testDb.prepare("INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name, reasoning, confidence, urgency, suggested_action, estimated_impact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(decisionId2, runId, testUserId, 'act_1', 'scale', 'ad_456', 'Good Ad', 'ROAS is great', 'high', 'medium', 'Scale budget', 'Earn $100 more', 'pending');
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /agent/runs', () => {
  it('returns run history for user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].agent_type).toBe('watchdog');
    expect(body.runs[0].summary).toBe('Analyzed 5 campaigns');
  });

  it('filters by agent_type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs?agent_type=briefing',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toHaveLength(0);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/agent/runs' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /agent/decisions', () => {
  it('returns decision history for user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.decisions).toHaveLength(2);
  });

  it('filters by status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions?status=approved',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().decisions).toHaveLength(0);
  });
});

describe('POST /agent/decisions/:id/approve', () => {
  it('approves a pending decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decisionId}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects approving a non-pending decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decisionId}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${uuidv4()}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /agent/decisions/:id/reject', () => {
  it('rejects a pending decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decisionId2}/reject`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify status updated
    const row = testDb.prepare('SELECT status FROM agent_decisions WHERE id = ?').get(decisionId2) as any;
    expect(row.status).toBe('rejected');
  });
});

describe('GET /agent/memory/:agentType', () => {
  it('returns memory context', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/memory/watchdog',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.context).toBeDefined();
  });
});

describe('GET /agent/briefing/latest', () => {
  it('returns null when no briefing exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/briefing/latest',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().briefing).toBeNull();
  });

  it('returns latest briefing when one exists', async () => {
    const briefingId = uuidv4();
    testDb.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary, raw_context) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)").run(briefingId, 'briefing', testUserId, 'completed', 'Morning summary', JSON.stringify({ key: 'value' }));

    const res = await app.inject({
      method: 'GET',
      url: '/agent/briefing/latest',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.briefing).not.toBeNull();
    expect(body.briefing.summary).toBe('Morning summary');
    expect(body.briefing.data).toEqual({ key: 'value' });
  });
});

describe('GET /agent/sales/context', () => {
  it('returns sales context', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/sales/context',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
