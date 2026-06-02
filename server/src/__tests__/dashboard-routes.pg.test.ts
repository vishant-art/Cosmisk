/**
 * Dashboard Routes Tests
 *
 * Tests /dashboard/kpis, /dashboard/chart, and /dashboard/insights endpoints.
 * Uses in-memory SQLite with mocked external services (Meta API, token-crypto).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';

let testDb: Database.Database;

// Mock DB module
vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Mock external services
vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string, params?: any) {
      // Return minimal valid data for insights endpoints
      if (path.includes('/insights')) {
        return { data: [] };
      }
      if (params?.fields === 'currency') {
        return { currency: 'INR' };
      }
      return { data: [] };
    }
    async getAllPages() { return []; }
  },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', userId: 'u1', userName: 'Mock' }),
  getMetaUser: async () => ({ id: 'u1', name: 'Mock User' }),
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

// Import route module after mocks
const { dashboardRoutes } = await import('../routes/dashboard.js');

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

  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.ready();

  // Create test user
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Dashboard Test', 'dashboard@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'dashboard@test.com', name: 'Dashboard Test', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  KPIs endpoint                                                      */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/kpis', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns zero counts for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects).toBeDefined();
    expect(body.projects.total).toBe(0);
    expect(body.concepts).toBeDefined();
    expect(body.concepts.total).toBe(0);
    expect(body.scripts).toBeDefined();
    expect(body.scripts.total).toBe(0);
    expect(body.recent_projects).toEqual([]);
  });

  it('returns correct counts after seeding UGC data', async () => {
    // Seed a UGC project
    const projectId = uuidv4();
    testDb.prepare(
      "INSERT INTO ugc_projects (id, user_id, name, brand_name, status) VALUES (?, ?, ?, ?, 'active')"
    ).run(projectId, testUserId, 'Test Project', 'Test Brand');

    // Seed concepts
    const conceptId = uuidv4();
    testDb.prepare(
      "INSERT INTO ugc_concepts (id, project_id, title, status) VALUES (?, ?, ?, 'approved')"
    ).run(conceptId, projectId, 'Test Concept');

    const conceptId2 = uuidv4();
    testDb.prepare(
      "INSERT INTO ugc_concepts (id, project_id, title, status) VALUES (?, ?, ?, 'pending')"
    ).run(conceptId2, projectId, 'Pending Concept');

    // Seed scripts
    const scriptId = uuidv4();
    testDb.prepare(
      "INSERT INTO ugc_scripts (id, project_id, concept_id, title, status) VALUES (?, ?, ?, ?, 'delivered')"
    ).run(scriptId, projectId, conceptId, 'Test Script');

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects.total).toBe(1);
    expect(body.projects.by_status).toHaveProperty('active', 1);
    expect(body.concepts.total).toBe(2);
    expect(body.concepts.approved).toBe(1);
    expect(body.concepts.pending).toBe(1);
    expect(body.scripts.total).toBe(1);
    expect(body.scripts.delivered).toBe(1);
  });

  it('does not leak data from another user', async () => {
    // Create a second user
    const otherUserId = uuidv4();
    const hash = bcrypt.hashSync('OtherPass123!', 10);
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(otherUserId, 'Other User', 'other@test.com', hash, 'user', 'growth');
    const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@test.com', name: 'Other User', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects.total).toBe(0);
    expect(body.concepts.total).toBe(0);
    expect(body.scripts.total).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Chart endpoint                                                     */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/chart', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart?account_id=act_123&date_preset=last_7d',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns meta_connected false when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart?account_id=act_123&date_preset=last_7d',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
  });

  it('returns chart data when Meta token exists', async () => {
    // Seed a meta token for the test user
    testDb.prepare(
      'INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)'
    ).run(testUserId, 'encrypted_mock_token', 'meta_u1', 'Meta User');

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart?account_id=act_123&date_preset=last_7d',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Chart comes from parseChartData on empty array, so expect array
    expect(Array.isArray(body.chart)).toBe(true);
  });

  it('returns 400 when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    // Validation or explicit 400 depending on schema
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Insights endpoint                                                  */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/insights', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights?account_id=act_123',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns meta_connected false when no Meta token for a new user', async () => {
    // Create a fresh user with no Meta token
    const freshUserId = uuidv4();
    const hash = bcrypt.hashSync('Fresh123!', 10);
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(freshUserId, 'Fresh User', 'fresh@test.com', hash, 'user', 'free');
    const freshToken = app.jwt.sign({ id: freshUserId, email: 'fresh@test.com', name: 'Fresh User', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights?account_id=act_123',
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
  });

  it('returns insights array when Meta token exists', async () => {
    // testUserId already has a meta token from chart test above
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights?account_id=act_123',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.insights)).toBe(true);
  });

  it('returns 400 when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
