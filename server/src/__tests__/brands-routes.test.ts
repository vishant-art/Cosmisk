/**
 * Brands Routes Tests
 *
 * Tests brand listing, caching, and validation.
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

const mockAccounts = [
  { id: 'act_1', business_name: 'Nike India', account_status: 1 },
  { id: 'act_2', business_name: 'Nike India', account_status: 1 },
  { id: 'act_3', business_name: 'Adidas Global', account_status: 1 },
  { id: 'act_4', business_name: 'Adidas Global', account_status: 2 },
  { id: 'act_5', business_name: null, account_status: 1 },
];

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
    async getAllPages() { return mockAccounts; }
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

const { brandRoutes } = await import('../routes/brands.js');

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

  await app.register(brandRoutes, { prefix: '/brands' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Brand Test', 'brand@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'brand@test.com', name: 'Brand Test', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Brand List                                                         */
/* ------------------------------------------------------------------ */

describe('GET /brands/list', () => {
  it('returns empty brands when no Meta token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toEqual([]);
  });

  it('returns grouped brands when Meta token exists', async () => {
    // Add a meta token for this user
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id) VALUES (?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta-u1');

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toBeDefined();
    expect(body.brands.length).toBeGreaterThanOrEqual(2);

    // Check Nike India grouped
    const nike = body.brands.find((b: any) => b.brand_name === 'Nike India');
    expect(nike).toBeDefined();
    expect(nike.project_count).toBe(2);
    expect(nike.latest_status).toBe('active');

    // Check Adidas Global grouped
    const adidas = body.brands.find((b: any) => b.brand_name === 'Adidas Global');
    expect(adidas).toBeDefined();
    expect(adidas.project_count).toBe(2);
    expect(adidas.latest_status).toBe('active'); // has at least one active

    // Check fallback name for null business_name
    const fallback = body.brands.find((b: any) => b.brand_name === 'Brand Test');
    expect(fallback).toBeDefined();
    expect(fallback.project_count).toBe(1);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('isolates brands per user', async () => {
    // Create another user without Meta token
    const otherUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(otherUserId, 'Other', 'other-brand@test.com', 'hash');
    const otherToken = app.jwt.sign({ id: otherUserId, email: 'other-brand@test.com', name: 'Other', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().brands).toEqual([]);
  });
});
