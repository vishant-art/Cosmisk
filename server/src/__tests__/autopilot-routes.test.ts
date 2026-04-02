/**
 * Autopilot Route Tests
 *
 * Tests alert listing, mark-read, unread-count, alert deletion.
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

vi.mock('../services/autopilot-engine.js', () => ({
  runAutopilot: async () => 0,
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { autopilotRoutes } = await import('../routes/autopilot.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let adminToken: string;
let alertId1: string;
let alertId2: string;

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

  await app.register(autopilotRoutes, { prefix: '/autopilot' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  const adminId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(adminId, 'Admin', 'admin@test.com', hash, 'admin', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
  adminToken = app.jwt.sign({ id: adminId, email: 'admin@test.com', name: 'Admin', role: 'admin' });

  // Seed alerts
  alertId1 = uuidv4();
  alertId2 = uuidv4();
  testDb.prepare('INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(alertId1, testUserId, 'act_1', 'high_cpa', 'High CPA Alert', 'CPA exceeds threshold', 'warning', 0);
  testDb.prepare('INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(alertId2, testUserId, 'act_1', 'low_roas', 'Low ROAS Alert', 'ROAS below target', 'critical', 0);
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /autopilot/alerts', () => {
  it('returns all alerts for user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/autopilot/alerts',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts[0].read).toBe(false);
  });

  it('filters unread only', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/autopilot/alerts?unread_only=true',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().alerts).toHaveLength(2);
  });

  it('respects limit parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/autopilot/alerts?limit=1',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().alerts).toHaveLength(1);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/autopilot/alerts' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /autopilot/unread-count', () => {
  it('returns correct unread count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/autopilot/unread-count',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
  });
});

describe('POST /autopilot/mark-read', () => {
  it('marks specific alerts as read', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot/mark-read',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { alert_ids: [alertId1] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify
    const unread = await app.inject({
      method: 'GET',
      url: '/autopilot/unread-count',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(unread.json().count).toBe(1);
  });

  it('marks all alerts as read', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot/mark-read',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { mark_all: true },
    });
    expect(res.statusCode).toBe(200);

    const unread = await app.inject({
      method: 'GET',
      url: '/autopilot/unread-count',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(unread.json().count).toBe(0);
  });
});

describe('DELETE /autopilot/alerts/:id', () => {
  it('deletes a specific alert', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/autopilot/alerts/${alertId2}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 for nonexistent alert', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/autopilot/alerts/${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /autopilot/run (admin only)', () => {
  it('rejects non-admin users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot/run',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows admin to trigger', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
