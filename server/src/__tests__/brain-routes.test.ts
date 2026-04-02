/**
 * Brain Route Tests
 *
 * Tests pattern detection and analysis endpoints.
 * Uses in-memory SQLite, real Zod validation, real JWT auth.
 * Meta API is mocked.
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

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string) {
      if (path.includes('/insights')) {
        return { data: [{ spend: '100', impressions: '5000', clicks: '75', ctr: '1.5', actions: [], action_values: [] }] };
      }
      if (path.includes('currency')) {
        return { currency: 'USD' };
      }
      return { data: [] };
    }
    async getAllPages() {
      return [{ id: 'act_123', name: 'Test Account', account_id: '123', business_name: 'TestBrand', account_status: 1 }];
    }
  },
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: () => ({ spend: 100, ctr: 1.5, cpc: 2, cpa: 25, roas: 3.5, revenue: 350, conversions: 4, impressions: 5000, clicks: 75 }),
}));

vi.mock('../services/format-helpers.js', () => ({
  fmt: (v: number) => `$${v}`,
  setCurrency: () => {},
  round: (v: number, d: number) => Number(v.toFixed(d)),
}));

vi.mock('../services/trend-analyzer.js', () => ({
  assessConfidence: () => ({ shouldRecommendAction: true, level: 'high', caveat: '' }),
  computeTrend: () => ({ direction: 'stable', label: 'stable' }),
}));

const { brainRoutes } = await import('../routes/brain.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let noMetaToken: string;

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

  await app.register(brainRoutes, { prefix: '/brain' });
  await app.ready();

  testUserId = uuidv4();
  const noMetaUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(noMetaUserId, 'No Meta', 'nometa@test.com', hash, 'user', 'growth');

  // Seed meta token
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'encrypted-token', 'u1', 'Test User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
  noMetaToken = app.jwt.sign({ id: noMetaUserId, email: 'nometa@test.com', name: 'No Meta', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /brain/patterns', () => {
  it('returns patterns for connected user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brain/patterns?account_id=act_123',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.patterns).toBeDefined();
    expect(body.brands).toBeDefined();
    expect(body.brandMetrics).toBeDefined();
  });

  it('returns meta_connected=false for user without Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brain/patterns',
      headers: { authorization: `Bearer ${noMetaToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta_connected).toBe(false);
    expect(body.patterns).toEqual([]);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/brain/patterns' });
    expect(res.statusCode).toBe(401);
  });

  it('works without account_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brain/patterns',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
