/**
 * Dashboard Routes Tests
 *
 * Tests KPI aggregation with/without data, date range filtering.
 * Uses in-memory SQLite, mocked Meta API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string) {
      if (path.includes('/insights')) {
        return { data: [] };
      }
      if (path.includes('/me/adaccounts')) {
        return { data: [] };
      }
      return { currency: 'USD' };
    }
    async getAllPages() { return []; }
  },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', expiresIn: 3600 }),
  getMetaUser: async () => ({ id: 'u1', name: 'Mock' }),
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

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

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

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Dashboard Test', 'dash@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'dash@test.com', name: 'Dashboard Test', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  KPIs                                                               */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/kpis', () => {
  it('returns zeros when no UGC data exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects.total).toBe(0);
    expect(body.concepts.total).toBe(0);
    expect(body.scripts.total).toBe(0);
    expect(body.recent_projects).toEqual([]);
  });

  it('returns correct counts with UGC data', async () => {
    // Create a UGC project
    const projectId = uuidv4();
    testDb.prepare('INSERT INTO ugc_projects (id, user_id, name, status) VALUES (?, ?, ?, ?)')
      .run(projectId, testUserId, 'Test Project', 'active');

    // Create concepts
    const conceptId = uuidv4();
    testDb.prepare('INSERT INTO ugc_concepts (id, project_id, title, status) VALUES (?, ?, ?, ?)')
      .run(conceptId, projectId, 'Concept 1', 'approved');
    testDb.prepare('INSERT INTO ugc_concepts (id, project_id, title, status) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), projectId, 'Concept 2', 'pending');

    // Create scripts
    testDb.prepare('INSERT INTO ugc_scripts (id, concept_id, project_id, title, status) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), conceptId, projectId, 'Script 1', 'delivered');
    testDb.prepare('INSERT INTO ugc_scripts (id, concept_id, project_id, title, status) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), conceptId, projectId, 'Script 2', 'draft');

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects.total).toBe(1);
    expect(body.projects.by_status.active).toBe(1);
    expect(body.concepts.total).toBe(2);
    expect(body.concepts.approved).toBe(1);
    expect(body.concepts.pending).toBe(1);
    expect(body.scripts.total).toBe(2);
    expect(body.scripts.delivered).toBe(1);
    expect(body.scripts.draft).toBe(1);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not return other users data', async () => {
    // Create another user with a project
    const otherUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(otherUserId, 'Other', 'other@test.com', 'hash');
    testDb.prepare('INSERT INTO ugc_projects (id, user_id, name, status) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), otherUserId, 'Other Project', 'draft');

    const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@test.com', name: 'Other', role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/kpis',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    const body = res.json();
    // Other user should see only their 1 project, not the first user's
    expect(body.projects.total).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Chart                                                              */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/chart', () => {
  it('returns empty chart when no Meta token exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart?account_id=act_123&date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
  });

  it('returns chart data when Meta token exists', async () => {
    // Add Meta token
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id) VALUES (?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta-u1');

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart?account_id=act_123&date_preset=last_7d',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.chart).toBeDefined();

    // Cleanup
    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(testUserId);
  });

  it('rejects request without account_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/chart',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Insights                                                           */
/* ------------------------------------------------------------------ */

describe('GET /dashboard/insights', () => {
  it('returns empty insights when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights?account_id=act_123',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
  });

  it('rejects request without account_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/insights',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
