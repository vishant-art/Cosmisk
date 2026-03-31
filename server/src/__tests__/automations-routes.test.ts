/**
 * Automations Route Tests
 *
 * Expanded integration tests for /automations endpoints.
 * Tests CRUD operations, admin-only endpoints, validation, and ownership checks.
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
    async getAllPages() { return []; }
  },
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
  runAutomations: async () => ({ triggered: 2, actions: ['pause', 'notify'] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {},
}));

const { automationRoutes } = await import('../routes/automations.js');

let app: FastifyInstance;
let userToken: string;
let userId: string;
let adminToken: string;
let adminId: string;
let otherUserToken: string;
let otherUserId: string;

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

  await app.register(automationRoutes, { prefix: '/automations' });
  await app.ready();

  // Create test users
  userId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'Test User', 'test@test.com', hash, 'user', 'growth');
  userToken = app.jwt.sign({ id: userId, email: 'test@test.com', name: 'Test User', role: 'user' });

  adminId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(adminId, 'Admin', 'admin@test.com', hash, 'admin', 'agency');
  adminToken = app.jwt.sign({ id: adminId, email: 'admin@test.com', name: 'Admin', role: 'admin' });

  otherUserId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(otherUserId, 'Other User', 'other@test.com', hash, 'user', 'growth');
  otherUserToken = app.jwt.sign({ id: otherUserId, email: 'other@test.com', name: 'Other User', role: 'user' });
}

beforeAll(async () => { await buildApp(); });
afterAll(async () => { await app.close(); testDb.close(); });

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function createAutomation(overrides: Record<string, any> = {}) {
  const id = uuidv4();
  testDb.prepare(
    'INSERT INTO automations (id, user_id, account_id, name, trigger_type, trigger_value, action_type, action_value, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    overrides.user_id || userId,
    overrides.account_id || 'act_123',
    overrides.name || 'Test Automation',
    overrides.trigger_type || 'cpa_above',
    overrides.trigger_value || '{"operator":"gt","value":"50"}',
    overrides.action_type || 'pause',
    overrides.action_value || '{}',
    overrides.is_active ?? 1,
  );
  return id;
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

describe('Automations Routes — Auth', () => {
  it('rejects unauthenticated requests on all CRUD endpoints', async () => {
    const endpoints = [
      { method: 'GET' as const, url: '/automations/list' },
      { method: 'POST' as const, url: '/automations/create' },
      { method: 'PUT' as const, url: '/automations/update' },
      { method: 'DELETE' as const, url: '/automations/delete?id=abc' },
      { method: 'POST' as const, url: '/automations/run' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      expect(res.statusCode).toBe(401);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GET /automations/list                                              */
/* ------------------------------------------------------------------ */

describe('GET /automations/list', () => {
  it('returns empty array when user has no automations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.automations)).toBe(true);
  });

  it('returns only the authenticated user automations', async () => {
    const myId = createAutomation({ name: 'My Rule' });
    const otherId = createAutomation({ user_id: otherUserId, name: 'Other Rule' });

    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    const names = body.automations.map((a: any) => a.name);
    expect(names).toContain('My Rule');
    expect(names).not.toContain('Other Rule');

    // Cleanup
    testDb.prepare('DELETE FROM automations WHERE id IN (?, ?)').run(myId, otherId);
  });

  it('formats condition and action display strings', async () => {
    const id = createAutomation({
      trigger_type: 'cpa_above',
      trigger_value: '{"operator":"gt","value":"100"}',
      action_type: 'reduce_budget',
      action_value: '{"percentage":30}',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    const auto = body.automations.find((a: any) => a.id === id);
    expect(auto).toBeDefined();
    expect(auto.condition).toContain('CPA_ABOVE');
    expect(auto.action).toContain('Reduce budget');

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });

  it('returns automations sorted by created_at DESC', async () => {
    const id1 = createAutomation({ name: 'First' });
    // Force different timestamps for deterministic sort order
    testDb.prepare("UPDATE automations SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);
    const id2 = createAutomation({ name: 'Second' });

    const res = await app.inject({
      method: 'GET',
      url: '/automations/list',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    const names = body.automations.map((a: any) => a.name);
    // Most recent first
    expect(names.indexOf('Second')).toBeLessThan(names.indexOf('First'));

    testDb.prepare('DELETE FROM automations WHERE id IN (?, ?)').run(id1, id2);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /automations/create                                           */
/* ------------------------------------------------------------------ */

describe('POST /automations/create', () => {
  it('creates automation with valid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        account_id: 'act_999',
        name: 'New CPA Rule',
        trigger_type: 'cpa_above',
        action_type: 'pause',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.automation.name).toBe('New CPA Rule');
    expect(body.automation.status).toBe('active');
    expect(body.automation.accountId).toBe('act_999');

    // Cleanup
    testDb.prepare('DELETE FROM automations WHERE id = ?').run(body.automation.id);
  });

  it('rejects invalid trigger_type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        account_id: 'act_999',
        name: 'Bad Rule',
        trigger_type: 'invalid_trigger',
        action_type: 'pause',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid action_type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        account_id: 'act_999',
        name: 'Bad Rule',
        trigger_type: 'cpa_above',
        action_type: 'delete_everything',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { name: 'Incomplete' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        account_id: 'act_999',
        name: '',
        trigger_type: 'cpa_above',
        action_type: 'pause',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores trigger_value and action_value as JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/create',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        account_id: 'act_999',
        name: 'With Values',
        trigger_type: 'roas_below',
        trigger_value: '{"operator":"lt","value":"2"}',
        action_type: 'notify',
        action_value: '{"channel":"slack"}',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.automation.triggerType).toBe('roas_below');
    expect(body.automation.actionType).toBe('notify');

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(body.automation.id);
  });
});

/* ------------------------------------------------------------------ */
/*  PUT /automations/update                                            */
/* ------------------------------------------------------------------ */

describe('PUT /automations/update', () => {
  it('updates automation name', async () => {
    const id = createAutomation({ name: 'Original Name' });
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { id, name: 'Updated Name' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.automation.name).toBe('Updated Name');

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });

  it('updates is_active to toggle pause', async () => {
    const id = createAutomation({ is_active: 1 });
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { id, is_active: false },
    });
    const body = res.json();
    expect(body.automation.status).toBe('paused');

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });

  it('returns 404 for non-existent automation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { id: uuidv4(), name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when updating another user automation', async () => {
    const id = createAutomation({ user_id: otherUserId, name: 'Not Mine' });
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { id, name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });

  it('returns 400 when no id provided', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { name: 'No ID' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when no fields to update', async () => {
    const id = createAutomation();
    const res = await app.inject({
      method: 'PUT',
      url: '/automations/update',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { id },
    });
    expect(res.statusCode).toBe(400);

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /automations/delete                                         */
/* ------------------------------------------------------------------ */

describe('DELETE /automations/delete', () => {
  it('deletes own automation', async () => {
    const id = createAutomation({ name: 'To Delete' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/automations/delete?id=${id}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify deleted
    const row = testDb.prepare('SELECT * FROM automations WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('returns 404 when deleting another user automation', async () => {
    const id = createAutomation({ user_id: otherUserId });
    const res = await app.inject({
      method: 'DELETE',
      url: `/automations/delete?id=${id}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);

    testDb.prepare('DELETE FROM automations WHERE id = ?').run(id);
  });

  it('returns 400 when no id provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/automations/delete',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/automations/delete?id=${uuidv4()}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /automations/activity                                          */
/* ------------------------------------------------------------------ */

describe('GET /automations/activity', () => {
  it('returns 400 when account_id missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/activity',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty activity when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/automations/activity?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
  });

  it('returns activity array when Meta token exists', async () => {
    // Seed meta token
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(userId, 'enc_token', 'meta_123', 'Meta User');

    const res = await app.inject({
      method: 'GET',
      url: '/automations/activity?account_id=act_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.activity)).toBe(true);

    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(userId);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /automations/execute-action                                   */
/* ------------------------------------------------------------------ */

describe('POST /automations/execute-action', () => {
  it('returns 400 when account_id missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/execute-action',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { action_type: 'pause' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when action_type missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/execute-action',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { account_id: 'act_123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when no Meta token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/execute-action',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { account_id: 'act_123', action_type: 'pause', ad_id: '123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('No Meta token');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /automations/run — admin only                                 */
/* ------------------------------------------------------------------ */

describe('POST /automations/run', () => {
  it('rejects non-admin user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/run',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows admin to trigger manual run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/run',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('automation actions executed');
  });
});
