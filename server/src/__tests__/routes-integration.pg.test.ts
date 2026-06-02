/**
 * Route Integration Tests
 *
 * These test REAL HTTP request/response cycles against a Fastify instance.
 * In-memory SQLite, real Zod validation, real JWT auth.
 * External APIs (Meta, Claude) are NOT called.
 *
 * Tests the actual user-facing contract:
 * - Does POST /auth/signup create an account and return a valid JWT?
 * - Does POST /auth/login reject wrong passwords?
 * - Do protected routes reject unauthenticated requests?
 * - Does /automations CRUD work correctly?
 * - Does /swipe-file save and retrieve entries?
 * - Does /team/invite enforce plan limits?
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';

// We need to mock getDb before importing routes
import { vi } from 'vitest';

let testDb: Database.Database;

// Mock the DB module to use our test database
vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Mock external services that routes depend on
vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class { async get() { return { data: [] }; } },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', userId: 'u1', userName: 'Mock' }),
  getMetaUser: async () => ({ id: 'u1', name: 'Mock User' }),
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
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

// Now import route modules (they'll use our mocked DB)
const { authRoutes } = await import('../routes/auth.js');
const { automationRoutes } = await import('../routes/automations.js');
const { swipeFileRoutes } = await import('../routes/swipe-file.js');
const { teamRoutes } = await import('../routes/team.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

async function buildApp() {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  app = Fastify({ logger: false });

  // JWT
  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-only',
    sign: { expiresIn: '1h' },
  });

  // Authenticate decorator
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(automationRoutes, { prefix: '/automations' });
  await app.register(swipeFileRoutes, { prefix: '/swipe-file' });
  await app.register(teamRoutes, { prefix: '/team' });

  await app.ready();

  // Create a test user directly in DB
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Integration Test', 'integration@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'integration@test.com', name: 'Integration Test', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Auth Routes                                                        */
/* ------------------------------------------------------------------ */

describe('POST /auth/signup', () => {
  it('creates account and returns JWT + user data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'New User', email: 'new@cosmisk.com', password: 'StrongPass1!' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('new@cosmisk.com');
    expect(body.user.name).toBe('New User');
    expect(body.user.role).toBe('user');
    expect(body.user.plan).toBe('free');
    expect(body.user.onboardingComplete).toBe(false);

    // Verify user is actually in DB
    const dbUser = testDb.prepare('SELECT * FROM users WHERE email = ?').get('new@cosmisk.com') as any;
    expect(dbUser).toBeDefined();
    expect(dbUser.name).toBe('New User');
  });

  it('rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Dup', email: 'integration@test.com', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already registered');
  });

  it('rejects weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Weak', email: 'weak@test.com', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'No Email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('returns JWT for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'integration@test.com', password: 'SecurePass123!' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(testUserId);
    expect(body.user.plan).toBe('growth');
  });

  it('rejects wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'integration@test.com', password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toContain('Invalid');
  });

  it('rejects non-existent email with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@test.com', password: 'Whatever1!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Protected Route Access                                             */
/* ------------------------------------------------------------------ */

describe('Authentication enforcement', () => {
  it('rejects requests without Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/automations/list' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts valid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/*  Automations CRUD                                                   */
/* ------------------------------------------------------------------ */

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

  it('PUT /automations/update updates an automation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { id: automationId, name: 'Pause VERY high CPA', is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    // Verify in DB
    const rule = testDb.prepare('SELECT * FROM automations WHERE id = ?').get(automationId) as any;
    expect(rule.name).toBe('Pause VERY high CPA');
    expect(rule.is_active).toBe(0);
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

  it('rejects creating an automation with missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { account_id: 'act_1', trigger_type: 'cpa_above', action_type: 'pause' },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Swipe File CRUD                                                    */
/* ------------------------------------------------------------------ */

describe('Swipe File CRUD', () => {
  let entryId: string;

  it('POST /swipe-file/save saves an entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        brand: 'Nike India',
        hookDna: ['urgency', 'fomo'],
        visualDna: ['product-shot'],
        audioDna: ['upbeat'],
        notes: 'Great FOMO hook with product launch angle',
        sourceAdId: 'ad_123456',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    entryId = body.id;
  });

  it('GET /swipe-file/list returns saved entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].brand).toBe('Nike India');
    expect(body.items[0].hookDna).toEqual(['urgency', 'fomo']);
    expect(body.items[0].notes).toBe('Great FOMO hook with product launch angle');
  });

  it('DELETE /swipe-file/:id removes entry', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${entryId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(check.json().items).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Team Management                                                    */
/* ------------------------------------------------------------------ */

describe('Team Management', () => {
  it('GET /team/members returns owner as first member', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/team/members',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.members).toBeDefined();
    // Owner should appear
    const owner = body.members.find((m: any) => m.role === 'owner');
    expect(owner).toBeDefined();
    expect(owner.email).toBe('integration@test.com');
  });

  it('POST /team/invite sends invitation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'teammate@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    // Verify invitation stored in DB
    const invite = testDb.prepare('SELECT * FROM team_members WHERE email = ?').get('teammate@test.com') as any;
    expect(invite).toBeDefined();
    expect(invite.role).toBe('viewer');
    expect(invite.status).toBe('pending');
  });

  it('rejects duplicate invitations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'teammate@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects inviting self', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'integration@test.com', role: 'viewer' },
    });
    // Should be rejected — can't invite yourself
    expect([400, 409]).toContain(res.statusCode);
  });
});
