/**
 * Performance Baseline Tests
 *
 * Benchmarks SQLite query performance and API response times.
 * These tests establish baselines and will flag regressions.
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
  MetaApiService: class { async get() { return { data: [] }; } },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', userId: 'u1', userName: 'Mock' }),
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/automation-engine.js', () => ({
  runAutomations: async () => ({ triggered: 0, actions: [] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { authRoutes } = await import('../routes/auth.js');

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
  await app.register(jwt.default, { secret: 'perf-test-secret', sign: { expiresIn: '1h' } });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(authRoutes, { prefix: '/auth' });

  // Create test user with some data
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('PerfTest123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, plan, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?)').run(
    testUserId, 'Perf User', 'perf@test.com', hash, 'growth', 1,
  );
  authToken = app.jwt.sign({ id: testUserId, email: 'perf@test.com', name: 'Perf User', role: 'user' });

  // Seed substantial test data
  for (let i = 0; i < 100; i++) {
    const runId = uuidv4();
    testDb.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary) VALUES (?, 'watchdog', ?, 'completed', datetime('now', ?), datetime('now', ?), ?)").run(
      runId, testUserId, `-${i} days`, `-${i} days`, `Run ${i}`,
    );
  }

  for (let i = 0; i < 50; i++) {
    testDb.prepare("INSERT INTO automations (id, user_id, name, trigger_type, action_type, is_active) VALUES (?, ?, ?, 'cpa_above', 'pause', ?)").run(
      uuidv4(), testUserId, `Auto ${i}`, i % 2,
    );
  }

  await app.ready();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  SQLite query benchmarks                                            */
/* ------------------------------------------------------------------ */

describe('SQLite Query Performance', () => {
  it('should query users by id in < 5ms (indexed)', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      testDb.prepare('SELECT * FROM users WHERE id = ?').get(testUserId);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(5); // < 5ms per query
  });

  it('should query agent_runs by user_id in < 10ms (indexed)', () => {
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      testDb.prepare('SELECT * FROM agent_runs WHERE user_id = ? AND agent_type = ? ORDER BY started_at DESC LIMIT 20').all(testUserId, 'watchdog');
    }
    const elapsed = (performance.now() - start) / 50;
    expect(elapsed).toBeLessThan(10);
  });

  it('should count automations in < 5ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      testDb.prepare('SELECT COUNT(*) as c FROM automations WHERE user_id = ? AND is_active = 1').get(testUserId);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(5);
  });

  it('should insert new records in < 5ms', () => {
    const start = performance.now();
    const stmt = testDb.prepare("INSERT INTO agent_episodes (id, user_id, agent_type, event) VALUES (?, ?, 'watchdog', 'perf test')");
    for (let i = 0; i < 100; i++) {
      stmt.run(uuidv4(), testUserId);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(5);
  });
});

/* ------------------------------------------------------------------ */
/*  API response time benchmarks                                       */
/* ------------------------------------------------------------------ */

describe('API Response Time', () => {
  it('should respond to /auth/login in < 500ms', async () => {
    const start = performance.now();
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'perf@test.com', password: 'PerfTest123!' },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('should respond to auth/me in < 50ms', async () => {
    const start = performance.now();
    await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

/* ------------------------------------------------------------------ */
/*  Database write throughput                                          */
/* ------------------------------------------------------------------ */

describe('Write Throughput', () => {
  it('should handle 100 inserts in < 200ms using transactions', () => {
    const start = performance.now();
    const insertMany = testDb.transaction(() => {
      const stmt = testDb.prepare("INSERT INTO leads (email, source) VALUES (?, 'perf-test')");
      for (let i = 0; i < 100; i++) {
        stmt.run(`perf${i}@test.com`);
      }
    });
    insertMany();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
