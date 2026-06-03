/**
 * Performance Baseline Tests (Postgres integration)
 *
 * Benchmarks query performance and API response times against the migrated
 * Neon TEST BRANCH via the pg integration harness (DB_BACKEND=postgres).
 *
 * DB-2 E1: ported from in-memory SQLite to the Postgres integration harness.
 * Runs under vitest.pg.config.ts. Seeds via getDbAdapter() against the migrated
 * test branch; per-test isolation via pg.reset() (TRUNCATE).
 *
 * NOTE: the absolute latency thresholds are looser than the SQLite originals
 * because every query is now a network round-trip to a remote Neon branch
 * rather than an in-process SQLite call. The benchmarks still guard against
 * pathological regressions (e.g. a missing index turning a point lookup into a
 * seq scan), just at a network-appropriate scale.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMigratedTestPg, type MigratedTestPg } from '../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../db/adapter.js';

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

let pg: MigratedTestPg;
let app: FastifyInstance;
let testUserId: string;
let authToken: string;

async function buildApp() {
  app = Fastify({ logger: false });
  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'perf-test-secret', sign: { expiresIn: '1h' } });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
}

async function seedData() {
  // FK order: users (parent) first, then dependents.
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('PerfTest123!', 10);
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, plan, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?)',
    [testUserId, 'Perf User', 'perf@test.com', hash, 'growth', 1],
  );
  authToken = app.jwt.sign({ id: testUserId, email: 'perf@test.com', name: 'Perf User', role: 'user' });

  // Seed substantial test data (agent_runs FK -> users).
  // The day-offset is interpolated into the SQL literal (not a bound param) so
  // the SQLite->PG dialect shim can translate datetime('now','-N days').
  for (let i = 0; i < 100; i++) {
    const runId = uuidv4();
    await getDbAdapter().run(
      `INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary) VALUES (?, 'watchdog', ?, 'completed', datetime('now', '-${i} days'), datetime('now', '-${i} days'), ?)`,
      [runId, testUserId, `Run ${i}`],
    );
  }

  // automations FK -> users.
  for (let i = 0; i < 50; i++) {
    await getDbAdapter().run(
      "INSERT INTO automations (id, user_id, name, trigger_type, action_type, is_active) VALUES (?, ?, ?, 'cpa_above', 'pause', ?)",
      [uuidv4(), testUserId, `Auto ${i}`, i % 2],
    );
  }
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
  await seedData();
});

/* ------------------------------------------------------------------ */
/*  Query benchmarks                                                   */
/* ------------------------------------------------------------------ */

describe('Postgres Query Performance', () => {
  it('should query users by id quickly (indexed PK)', async () => {
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      await getDbAdapter().get('SELECT * FROM users WHERE id = ?', [testUserId]);
    }
    const elapsed = (performance.now() - start) / 20;
    expect(elapsed).toBeLessThan(1000); // generous: remote Neon round-trip
  });

  it('should query agent_runs by user_id quickly (indexed)', async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await getDbAdapter().all(
        'SELECT * FROM agent_runs WHERE user_id = ? AND agent_type = ? ORDER BY started_at DESC LIMIT 20',
        [testUserId, 'watchdog'],
      );
    }
    const elapsed = (performance.now() - start) / 10;
    expect(elapsed).toBeLessThan(1000);
  });

  it('should count automations quickly', async () => {
    const start = performance.now();
    let last: any;
    for (let i = 0; i < 20; i++) {
      last = await getDbAdapter().get(
        'SELECT COUNT(*) as c FROM automations WHERE user_id = ? AND is_active = 1',
        [testUserId],
      );
    }
    const elapsed = (performance.now() - start) / 20;
    // 25 of 50 automations have is_active = 1 (i % 2 for i in 0..49).
    expect(Number(last.c)).toBe(25);
    expect(elapsed).toBeLessThan(1000);
  });

  it('should insert new records quickly', async () => {
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      await getDbAdapter().run(
        "INSERT INTO agent_episodes (id, user_id, agent_type, event) VALUES (?, ?, 'watchdog', 'perf test')",
        [uuidv4(), testUserId],
      );
    }
    const elapsed = (performance.now() - start) / 20;
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ------------------------------------------------------------------ */
/*  API response time benchmarks                                       */
/* ------------------------------------------------------------------ */

describe('API Response Time', () => {
  it('should respond to /auth/login in < 2000ms', async () => {
    const start = performance.now();
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'perf@test.com', password: 'PerfTest123!' },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('should respond to auth/me in < 1000ms', async () => {
    const start = performance.now();
    await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ------------------------------------------------------------------ */
/*  Database write throughput                                          */
/* ------------------------------------------------------------------ */

describe('Write Throughput', () => {
  it('should handle a batch of inserts in a single transaction', async () => {
    // Sequential awaited inserts against the remote Neon branch are network
    // round-trip bound (~tens of ms each), so this is a throughput smoke test
    // rather than the in-process SQLite microbenchmark it replaced. The
    // load-bearing assertion is that the transaction commits all rows.
    const COUNT = 20;
    const start = performance.now();
    await getDbAdapter().transaction(async (tx) => {
      for (let i = 0; i < COUNT; i++) {
        await tx.run("INSERT INTO leads (email, source) VALUES (?, 'perf-test')", [`perf${i}@test.com`]);
      }
    });
    const elapsed = performance.now() - start;

    const row = await getDbAdapter().get<{ c: number }>(
      "SELECT COUNT(*) as c FROM leads WHERE source = 'perf-test'",
    );
    expect(Number(row!.c)).toBe(COUNT);
    expect(elapsed).toBeLessThan(30000);
  });
});
