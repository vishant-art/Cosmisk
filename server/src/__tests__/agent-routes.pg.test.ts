/**
 * Agent Route Tests (Postgres integration)
 *
 * Integration tests for /agent endpoints.
 * Tests runs, decisions, approve/reject, admin-only triggers,
 * memory, briefing, and sales context.
 * Runs against the migrated Neon TEST BRANCH via the pg integration harness
 * (DB_BACKEND=postgres). External services are mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMigratedTestPg, type MigratedTestPg } from '../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../db/adapter.js';

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
    async getAllPages() { return []; }
  },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/ad-watchdog.js', () => ({
  runWatchdog: async () => ({ runs: 3, decisions: 5 }),
  executeDecision: async (id: string) => ({ success: true, message: `Executed ${id}` }),
  checkOutcomes: async () => 2,
}));

vi.mock('../services/slack-interactive.js', () => ({
  handleSlackAction: async () => ({ ok: true }),
  verifySlackSignature: () => true,
}));

vi.mock('../services/agent-memory.js', () => ({
  buildContextWindow: (userId: string, agentType: string) => ({
    core: [{ key: 'brand_style', value: 'minimalist' }],
    episodes: [],
    entities: [],
  }),
  runDecay: () => 5,
}));

vi.mock('../services/morning-briefing.js', () => ({
  runMorningBriefing: async () => 1,
}));

vi.mock('../services/report-agent.js', () => ({
  runReportAgentAll: async () => 3,
  runReportAgent: async () => ({ success: true }),
}));

vi.mock('../services/content-agent.js', () => ({
  runContentAgentAll: async () => 2,
  runContentAgent: async () => ({ success: true }),
}));

vi.mock('../services/sales-agent.js', () => ({
  runSalesAgentAll: async () => 4,
  getSalesContext: async (userId: string) => ({
    plan: 'growth',
    usage: { chat_count: 10 },
    recommendations: ['Upgrade to agency'],
  }),
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {},
}));

const { agentRoutes } = await import('../routes/agent.js');

let pg: MigratedTestPg;
let app: FastifyInstance;
let userId: string;
let userToken: string;
let adminId: string;
let adminToken: string;
let otherUserId: string;
let otherUserToken: string;

async function buildApp() {
  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'test-secret-only', sign: { expiresIn: '1h' } });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(agentRoutes, { prefix: '/agent' });
  await app.ready();
}

async function seedUsers() {
  // FK order: users are parents — seed before any agent_runs / agent_decisions.
  const hash = bcrypt.hashSync('SecurePass123!', 10);

  userId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, 'Test User', 'test@test.com', hash, 'user', 'growth'],
  );
  userToken = app.jwt.sign({ id: userId, email: 'test@test.com', name: 'Test User', role: 'user' });

  adminId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [adminId, 'Admin', 'admin@test.com', hash, 'admin', 'agency'],
  );
  adminToken = app.jwt.sign({ id: adminId, email: 'admin@test.com', name: 'Admin', role: 'admin' });

  otherUserId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [otherUserId, 'Other', 'other@test.com', hash, 'user', 'growth'],
  );
  otherUserToken = app.jwt.sign({ id: otherUserId, email: 'other@test.com', name: 'Other', role: 'user' });
}

beforeAll(async () => {
  pg = await getMigratedTestPg();
  await buildApp();
});

afterAll(async () => {
  await app.close();
  await pg.teardown();
});

beforeEach(async () => {
  await pg.reset();
  await seedUsers();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function seedAgentRun(overrides: Record<string, any> = {}) {
  // FK: agent_runs.user_id -> users (already seeded in beforeEach).
  const id = uuidv4();
  await getDbAdapter().run(
    "INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary, raw_context) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)",
    [
      id,
      overrides.agent_type || 'watchdog',
      overrides.user_id || userId,
      overrides.status || 'completed',
      overrides.summary || 'Test run summary',
      overrides.raw_context || null,
    ],
  );
  return id;
}

async function seedAgentDecision(runId: string, overrides: Record<string, any> = {}) {
  // FK: agent_decisions.run_id -> agent_runs, agent_decisions.user_id -> users.
  const id = uuidv4();
  await getDbAdapter().run(
    `INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name, reasoning, confidence, urgency, suggested_action, estimated_impact, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      runId,
      overrides.user_id || userId,
      overrides.account_id || 'act_123',
      overrides.type || 'pause',
      overrides.target_id || 'ad_456',
      overrides.target_name || 'Test Ad',
      overrides.reasoning || 'CPA too high',
      overrides.confidence || 'high',
      overrides.urgency || 'medium',
      overrides.suggested_action || 'Pause this ad',
      overrides.estimated_impact || 'Save $50/day',
      overrides.status || 'pending',
    ],
  );
  return id;
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

describe('Agent Routes — Auth', () => {
  it('rejects unauthenticated requests', async () => {
    const endpoints = [
      { method: 'GET' as const, url: '/agent/runs' },
      { method: 'GET' as const, url: '/agent/decisions' },
      { method: 'POST' as const, url: '/agent/watchdog/run' },
      { method: 'GET' as const, url: '/agent/memory/watchdog' },
      { method: 'GET' as const, url: '/agent/briefing/latest' },
      { method: 'GET' as const, url: '/agent/sales/context' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      expect(res.statusCode).toBe(401);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GET /agent/runs                                                    */
/* ------------------------------------------------------------------ */

describe('GET /agent/runs', () => {
  it('returns runs for authenticated user', async () => {
    await seedAgentRun();

    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.runs.length).toBeGreaterThanOrEqual(1);
    expect(body.runs[0]).toHaveProperty('id');
    expect(body.runs[0]).toHaveProperty('agent_type');
    expect(body.runs[0]).toHaveProperty('status');
  });

  it('filters by agent_type', async () => {
    await seedAgentRun({ agent_type: 'watchdog' });
    await seedAgentRun({ agent_type: 'briefing' });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs?agent_type=watchdog',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.runs.every((r: any) => r.agent_type === 'watchdog')).toBe(true);
  });

  it('respects limit parameter', async () => {
    await seedAgentRun();
    await seedAgentRun();
    await seedAgentRun();

    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs?limit=2',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.runs.length).toBeLessThanOrEqual(2);
  });

  it('does not return other user runs', async () => {
    const otherId = await seedAgentRun({ user_id: otherUserId });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    const ids = body.runs.map((r: any) => r.id);
    expect(ids).not.toContain(otherId);
  });

  it('rejects invalid agent_type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/runs?agent_type=invalid_type',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /agent/decisions                                               */
/* ------------------------------------------------------------------ */

describe('GET /agent/decisions', () => {
  it('returns decisions for authenticated user', async () => {
    const runId = await seedAgentRun();
    const decId = await seedAgentDecision(runId);

    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.decisions.length).toBeGreaterThanOrEqual(1);

    const decision = body.decisions.find((d: any) => d.id === decId);
    expect(decision).toBeDefined();
    expect(decision).toHaveProperty('reasoning');
    expect(decision).toHaveProperty('confidence');
    expect(decision).toHaveProperty('suggested_action');
  });

  it('filters by status', async () => {
    const runId = await seedAgentRun();
    await seedAgentDecision(runId, { status: 'pending' });
    await seedAgentDecision(runId, { status: 'approved' });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions?status=pending',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.decisions.every((d: any) => d.status === 'pending')).toBe(true);
  });

  it('respects limit parameter', async () => {
    const runId = await seedAgentRun();
    await seedAgentDecision(runId);
    await seedAgentDecision(runId);
    await seedAgentDecision(runId);

    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions?limit=2',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.decisions.length).toBeLessThanOrEqual(2);
  });

  it('does not return other user decisions', async () => {
    const runId = await seedAgentRun({ user_id: otherUserId });
    const decId = await seedAgentDecision(runId, { user_id: otherUserId });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/decisions',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    const ids = body.decisions.map((d: any) => d.id);
    expect(ids).not.toContain(decId);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /agent/decisions/:id/approve                                  */
/* ------------------------------------------------------------------ */

describe('POST /agent/decisions/:id/approve', () => {
  it('approves a pending decision', async () => {
    const runId = await seedAgentRun();
    const decId = await seedAgentDecision(runId, { status: 'pending' });

    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decId}/approve`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Verify DB state
    const row = await getDbAdapter().get('SELECT status, approved_at FROM agent_decisions WHERE id = ?', [decId]) as any;
    expect(row.status).toBe('approved');
    expect(row.approved_at).not.toBeNull();
  });

  it('returns 404 for non-existent decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${uuidv4()}/approve`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for already approved decision', async () => {
    const runId = await seedAgentRun();
    const decId = await seedAgentDecision(runId, { status: 'approved' });

    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decId}/approve`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('not pending');
  });

  it('returns 404 when approving another user decision', async () => {
    const runId = await seedAgentRun({ user_id: otherUserId });
    const decId = await seedAgentDecision(runId, { user_id: otherUserId });

    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decId}/approve`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /agent/decisions/:id/reject                                   */
/* ------------------------------------------------------------------ */

describe('POST /agent/decisions/:id/reject', () => {
  it('rejects a pending decision', async () => {
    const runId = await seedAgentRun();
    const decId = await seedAgentDecision(runId, { status: 'pending' });

    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decId}/reject`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('Rejected');

    const row = await getDbAdapter().get('SELECT status FROM agent_decisions WHERE id = ?', [decId]) as any;
    expect(row.status).toBe('rejected');
  });

  it('returns 404 for non-existent decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${uuidv4()}/reject`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for already rejected decision', async () => {
    const runId = await seedAgentRun();
    const decId = await seedAgentDecision(runId, { status: 'rejected' });

    const res = await app.inject({
      method: 'POST',
      url: `/agent/decisions/${decId}/reject`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Admin-only agent triggers                                          */
/* ------------------------------------------------------------------ */

describe('Admin-only agent triggers', () => {
  const adminEndpoints = [
    { url: '/agent/watchdog/run', key: null },
    { url: '/agent/report/run', key: 'reports' },
    { url: '/agent/content/run', key: 'briefs' },
    { url: '/agent/sales/run', key: 'contexts' },
  ];

  for (const ep of adminEndpoints) {
    it(`POST ${ep.url} rejects non-admin`, async () => {
      const res = await app.inject({
        method: 'POST',
        url: ep.url,
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it(`POST ${ep.url} allows admin`, async () => {
      const res = await app.inject({
        method: 'POST',
        url: ep.url,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = res.json();
      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /agent/sales/context                                           */
/* ------------------------------------------------------------------ */

describe('GET /agent/sales/context', () => {
  it('returns sales context for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/sales/context',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('plan');
    expect(body).toHaveProperty('recommendations');
  });
});

/* ------------------------------------------------------------------ */
/*  GET /agent/memory/:agentType                                       */
/* ------------------------------------------------------------------ */

describe('GET /agent/memory/:agentType', () => {
  it('returns context window for watchdog', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/memory/watchdog',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.context).toHaveProperty('core');
    expect(body.context).toHaveProperty('episodes');
    expect(body.context).toHaveProperty('entities');
  });

  it('returns context window for briefing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/memory/briefing',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /agent/briefing/latest                                         */
/* ------------------------------------------------------------------ */

describe('GET /agent/briefing/latest', () => {
  it('returns null when no briefing exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agent/briefing/latest',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.briefing).toBeNull();
  });

  it('returns latest briefing when one exists', async () => {
    await seedAgentRun({
      agent_type: 'briefing',
      summary: 'Morning briefing: 3 accounts reviewed',
      raw_context: JSON.stringify({ accounts: 3, alerts: 1 }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/briefing/latest',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.briefing).not.toBeNull();
    expect(body.briefing.summary).toContain('Morning briefing');
    expect(body.briefing.data).toHaveProperty('accounts');
  });

  it('returns only the user own briefing', async () => {
    await seedAgentRun({
      agent_type: 'briefing',
      user_id: otherUserId,
      summary: 'Other user briefing',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/briefing/latest',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    // Should not see other user's briefing
    if (body.briefing) {
      expect(body.briefing.summary).not.toContain('Other user');
    }
  });
});
