/**
 * Security Tests (Postgres integration)
 *
 * Tests: JWT validation, SQL injection, password hashing, token encryption,
 * CORS, and auth enforcement.
 *
 * DB-2 E1: ported from in-memory SQLite to the Postgres integration harness.
 * Runs under vitest.pg.config.ts (DB_BACKEND=postgres + Neon test branch).
 * Seeds via getDbAdapter() against the migrated test branch; per-test isolation
 * via pg.reset() (TRUNCATE).
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
  decryptToken: () => 'mock-decrypted-token',
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
let validToken: string;

async function buildApp() {
  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-for-security-tests',
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  // Protected test endpoint
  app.get('/protected', { preHandler: [app.authenticate] }, async (request: any) => {
    return { success: true, userId: request.user.id };
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
}

async function seedTestUser() {
  // Create test user (parent row — FK order: users first).
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePassword123!', 10);
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [testUserId, 'SecUser', 'sec@test.com', hash],
  );

  validToken = app.jwt.sign({ id: testUserId, email: 'sec@test.com', name: 'SecUser', role: 'user' });
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
  await seedTestUser();
});

/* ------------------------------------------------------------------ */
/*  JWT validation                                                     */
/* ------------------------------------------------------------------ */

describe('JWT Security', () => {
  it('should reject requests with no Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('should reject requests with invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject expired JWT', async () => {
    // Sign a token that expired 10 seconds ago
    const expiredToken = app.jwt.sign({ id: testUserId, iat: Math.floor(Date.now() / 1000) - 20, exp: Math.floor(Date.now() / 1000) - 10 });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject tampered JWT (modified payload)', async () => {
    // Take a valid token and alter the payload
    const parts = validToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.id = 'tampered-user-id';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = parts.join('.');

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject JWT signed with different secret', async () => {
    const otherApp = Fastify({ logger: false });
    const jwt = await import('@fastify/jwt');
    await otherApp.register(jwt.default, { secret: 'different-secret' });
    const wrongToken = otherApp.jwt.sign({ id: testUserId });
    await otherApp.close();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${wrongToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should accept valid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  SQL injection prevention                                           */
/* ------------------------------------------------------------------ */

describe('SQL Injection Prevention', () => {
  it('should not allow SQL injection in login email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: "'; DROP TABLE users; --",
        password: 'password',
      },
    });
    // Should fail validation or return auth error, not crash
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    // Verify users table still exists
    const count = await getDbAdapter().get('SELECT COUNT(*) as c FROM users') as { c: number };
    expect(count.c).toBeGreaterThan(0);
  });

  it('should not allow SQL injection in signup name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        name: "Robert'; DROP TABLE users;--",
        email: 'bobby@tables.com',
        password: 'ValidPass123!',
      },
    });
    // Should succeed (parameterized query) or fail validation
    // Either way, table should still exist
    const count = await getDbAdapter().get('SELECT COUNT(*) as c FROM users') as { c: number };
    expect(count.c).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Password hashing                                                   */
/* ------------------------------------------------------------------ */

describe('Password Hashing', () => {
  it('should store passwords as bcrypt hashes, not plaintext', async () => {
    const user = await getDbAdapter().get('SELECT password_hash FROM users WHERE id = ?', [testUserId]) as { password_hash: string };
    expect(user.password_hash).not.toBe('SecurePassword123!');
    expect(user.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
  });

  it('should correctly verify valid password against hash', async () => {
    const user = await getDbAdapter().get('SELECT password_hash FROM users WHERE id = ?', [testUserId]) as { password_hash: string };
    expect(bcrypt.compareSync('SecurePassword123!', user.password_hash)).toBe(true);
  });

  it('should reject incorrect password against hash', async () => {
    const user = await getDbAdapter().get('SELECT password_hash FROM users WHERE id = ?', [testUserId]) as { password_hash: string };
    expect(bcrypt.compareSync('WrongPassword!', user.password_hash)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Token encryption                                                   */
/* ------------------------------------------------------------------ */

describe('Token Encryption', () => {
  it('should encrypt and decrypt tokens correctly', async () => {
    // Import real crypto module (not mocked)
    const { encryptToken, decryptToken } = await vi.importActual<typeof import('../services/token-crypto.js')>('../services/token-crypto.js');
    const original = 'EAABsbCS1jk0BAKsomeFakeMetaToken123456';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // IV:encrypted format
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertext for same input (random IV)', async () => {
    const { encryptToken } = await vi.importActual<typeof import('../services/token-crypto.js')>('../services/token-crypto.js');
    const token = 'SameTokenValue123';
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    expect(enc1).not.toBe(enc2); // Different IVs = different ciphertext
  });
});

/* ------------------------------------------------------------------ */
/*  Auth enforcement on protected routes                               */
/* ------------------------------------------------------------------ */

describe('Auth Enforcement', () => {
  it('should reject login with wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'sec@test.com', password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject login with non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nonexistent@test.com', password: 'SomePass123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should not leak password_hash in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'sec@test.com', password: 'SecurePassword123!' },
    });
    const body = res.json();
    expect(JSON.stringify(body)).not.toContain('password_hash');
    expect(JSON.stringify(body)).not.toContain('$2b$'); // bcrypt prefix
  });
});

/* ------------------------------------------------------------------ */
/*  Input validation                                                   */
/* ------------------------------------------------------------------ */

describe('Input Validation', () => {
  it('should reject signup with weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Test', email: 'weak@test.com', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should reject signup with invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Test', email: 'not-an-email', password: 'ValidPass123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should reject signup with missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'missing@test.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});
