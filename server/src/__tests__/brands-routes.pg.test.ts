/**
 * Brands Routes Tests (Postgres integration)
 *
 * Tests /brands/list endpoint against the migrated Neon TEST BRANCH
 * (DB_BACKEND=postgres). Ported from the in-memory SQLite suite to the pg
 * harness (vitest.pg.config.ts + getMigratedTestPg()). Meta API and
 * token-crypto remain mocked; the DB is real pg via getDbAdapter().
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { vi } from 'vitest';
import { getMigratedTestPg, type MigratedTestPg } from '../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../db/adapter.js';

// Mock Meta API with configurable responses
let mockMetaAccounts: any[] = [];

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
    async getAllPages() { return mockMetaAccounts; }
  },
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

// Import after mocks
const { brandRoutes } = await import('../routes/brands.js');

let pg: MigratedTestPg;
let app: FastifyInstance;
let testUserId: string;
let authToken: string;

async function buildApp() {
  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-only',
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(brandRoutes, { prefix: '/brands' });
  await app.ready();
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

  // Seed base test user (parent row before any meta_tokens child rows).
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [testUserId, 'Brands Test', 'brands@test.com', hash, 'user', 'growth'],
  );

  authToken = app.jwt.sign({ id: testUserId, email: 'brands@test.com', name: 'Brands Test', role: 'user' });
});

/* ------------------------------------------------------------------ */
/*  GET /brands/list                                                   */
/* ------------------------------------------------------------------ */

describe('GET /brands/list', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty brands array when no Meta token exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toEqual([]);
  });

  it('returns brands grouped by business_name from Meta', async () => {
    // Seed Meta token for the user (parent user already seeded in beforeEach)
    await getDbAdapter().run(
      'INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)',
      [testUserId, 'encrypted_mock_token', 'meta_u1', 'Meta User'],
    );

    // Set up mock Meta API response
    mockMetaAccounts = [
      { business_name: 'Brand Alpha', account_status: 1 },
      { business_name: 'Brand Alpha', account_status: 1 },
      { business_name: 'Brand Beta', account_status: 2 },
    ];

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toHaveLength(2);

    const alpha = body.brands.find((b: any) => b.brand_name === 'Brand Alpha');
    expect(alpha).toBeDefined();
    expect(alpha.project_count).toBe(2);
    expect(alpha.latest_status).toBe('active');

    const beta = body.brands.find((b: any) => b.brand_name === 'Brand Beta');
    expect(beta).toBeDefined();
    expect(beta.project_count).toBe(1);
    expect(beta.latest_status).toBe('inactive');
  });

  it('uses user name as fallback when business_name is missing', async () => {
    mockMetaAccounts = [
      { business_name: null, account_status: 1 },
      { business_name: '', account_status: 1 },
    ];

    // Create a fresh user so cache does not interfere
    const freshUserId = uuidv4();
    const hash = bcrypt.hashSync('Fresh123!', 10);
    await getDbAdapter().run(
      'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
      [freshUserId, 'John Smith', 'john@test.com', hash, 'user', 'growth'],
    );
    await getDbAdapter().run(
      'INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)',
      [freshUserId, 'encrypted_mock_token', 'meta_u2', 'Meta User 2'],
    );

    const freshToken = app.jwt.sign({ id: freshUserId, email: 'john@test.com', name: 'John Smith', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // null business_name falls back to user name; empty string is falsy so also falls back
    // Both map to "John Smith" so grouped into one brand
    expect(body.brands.length).toBeGreaterThanOrEqual(1);
    const fallbackBrand = body.brands.find((b: any) => b.brand_name === 'John Smith');
    expect(fallbackBrand).toBeDefined();
  });

  it('does not leak brands from another user', async () => {
    mockMetaAccounts = [];

    // Create second user with no Meta token
    const otherUserId = uuidv4();
    const hash = bcrypt.hashSync('OtherPass123!', 10);
    await getDbAdapter().run(
      'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
      [otherUserId, 'Other User', 'other-brands@test.com', hash, 'user', 'growth'],
    );
    const otherToken = app.jwt.sign({ id: otherUserId, email: 'other-brands@test.com', name: 'Other User', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toEqual([]);
  });

  it('returns correct structure for each brand', async () => {
    mockMetaAccounts = [
      { business_name: 'Structured Brand', account_status: 1 },
    ];

    // Use a fresh user to avoid cache
    const structUserId = uuidv4();
    const hash = bcrypt.hashSync('Struct123!', 10);
    await getDbAdapter().run(
      'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
      [structUserId, 'Struct User', 'struct@test.com', hash, 'user', 'growth'],
    );
    await getDbAdapter().run(
      'INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)',
      [structUserId, 'encrypted_mock_token', 'meta_u3', 'Meta User 3'],
    );
    const structToken = app.jwt.sign({ id: structUserId, email: 'struct@test.com', name: 'Struct User', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${structToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toHaveLength(1);

    const brand = body.brands[0];
    expect(brand).toHaveProperty('brand_name', 'Structured Brand');
    expect(brand).toHaveProperty('project_count', 1);
    expect(brand).toHaveProperty('client_codes');
    expect(Array.isArray(brand.client_codes)).toBe(true);
    expect(brand).toHaveProperty('latest_status', 'active');
  });

  it('handles mixed active and inactive accounts for same brand', async () => {
    mockMetaAccounts = [
      { business_name: 'Mixed Corp', account_status: 1 },
      { business_name: 'Mixed Corp', account_status: 2 },
      { business_name: 'Mixed Corp', account_status: 3 },
    ];

    const mixedUserId = uuidv4();
    const hash = bcrypt.hashSync('Mixed123!', 10);
    await getDbAdapter().run(
      'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
      [mixedUserId, 'Mixed User', 'mixed@test.com', hash, 'user', 'growth'],
    );
    await getDbAdapter().run(
      'INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)',
      [mixedUserId, 'encrypted_mock_token', 'meta_u4', 'Meta User 4'],
    );
    const mixedToken = app.jwt.sign({ id: mixedUserId, email: 'mixed@test.com', name: 'Mixed User', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${mixedToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const mixedBrand = body.brands.find((b: any) => b.brand_name === 'Mixed Corp');
    expect(mixedBrand).toBeDefined();
    expect(mixedBrand.project_count).toBe(3);
    // If any account is active (status 1), latest_status should be active
    expect(mixedBrand.latest_status).toBe('active');
  });
});
