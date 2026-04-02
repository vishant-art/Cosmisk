/**
 * Auth Routes Tests
 *
 * Tests signup validation, login success/failure, password reset flow, JWT generation.
 * Uses in-memory SQLite and real Zod validation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class { async get() { return { data: [] }; } },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', expiresIn: 3600, userId: 'u1', userName: 'Mock' }),
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

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { authRoutes } = await import('../routes/auth.js');

let app: FastifyInstance;
let testUserId: string;

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

  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();

  // Create a test user directly
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Test User', 'test@cosmisk.com', hash, 'user', 'growth');
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Signup                                                             */
/* ------------------------------------------------------------------ */

describe('POST /auth/signup', () => {
  it('creates account and returns JWT + user data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Alice', email: 'alice@cosmisk.com', password: 'StrongPass1!' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('alice@cosmisk.com');
    expect(body.user.name).toBe('Alice');
    expect(body.user.role).toBe('user');
    expect(body.user.plan).toBe('free');
    expect(body.user.onboardingComplete).toBe(false);
  });

  it('rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Dup', email: 'test@cosmisk.com', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already registered');
  });

  it('rejects weak password (too short)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Weak', email: 'weak@cosmisk.com', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'noname@cosmisk.com', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'No Email', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Bad', email: 'not-an-email', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('JWT can be verified', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'JWTTest', email: 'jwttest@cosmisk.com', password: 'StrongPass1!' },
    });
    const body = res.json();
    expect(body.token).toBeDefined();

    // Verify the JWT contains correct claims
    const decoded = app.jwt.verify(body.token) as { id: string; email: string; name: string; role: string };
    expect(decoded.email).toBe('jwttest@cosmisk.com');
    expect(decoded.name).toBe('JWTTest');
    expect(decoded.role).toBe('user');
    expect(decoded.id).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */

describe('POST /auth/login', () => {
  it('returns JWT for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@cosmisk.com', password: 'SecurePass123!' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(testUserId);
    expect(body.user.email).toBe('test@cosmisk.com');
    expect(body.user.plan).toBe('growth');
  });

  it('rejects wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@cosmisk.com', password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toContain('Invalid');
  });

  it('rejects non-existent email with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@cosmisk.com', password: 'Whatever1!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects missing password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@cosmisk.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns onboardingComplete=true when user has Meta token', async () => {
    // Insert a meta token for the test user
    testDb.prepare('INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)')
      .run(testUserId, 'encrypted-token', 'meta-u1', 'Meta User');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@cosmisk.com', password: 'SecurePass123!' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.user.onboardingComplete).toBe(true);

    // Cleanup
    testDb.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(testUserId);
  });
});

/* ------------------------------------------------------------------ */
/*  Password Reset Flow                                                */
/* ------------------------------------------------------------------ */

describe('POST /auth/forgot-password', () => {
  it('returns success for existing email (does not reveal existence)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'test@cosmisk.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify token was created in DB
    const token = testDb.prepare('SELECT * FROM password_reset_tokens WHERE user_id = ?').get(testUserId) as any;
    expect(token).toBeDefined();
    expect(token.used).toBe(0);
  });

  it('returns success for non-existent email (prevents enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'nonexistent@cosmisk.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/reset-password', () => {
  let resetToken: string;

  it('resets password with valid token', async () => {
    // Create a reset token manually
    resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    testDb.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), testUserId, tokenHash, expiresAt);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: resetToken, password: 'NewSecurePass456!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify new password works
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@cosmisk.com', password: 'NewSecurePass456!' },
    });
    expect(loginRes.statusCode).toBe(200);

    // Restore original password for other tests
    const hash = bcrypt.hashSync('SecurePass123!', 10);
    testDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, testUserId);
  });

  it('rejects invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'invalid-token-value', password: 'NewSecurePass456!' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid');
  });

  it('rejects already-used token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    testDb.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used) VALUES (?, ?, ?, ?, 1)')
      .run(uuidv4(), testUserId, tokenHash, expiresAt);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, password: 'NewSecurePass456!' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('already been used');
  });

  it('rejects expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() - 3600000).toISOString(); // expired 1h ago

    testDb.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), testUserId, tokenHash, expiresAt);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, password: 'NewSecurePass456!' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('expired');
  });

  it('rejects weak new password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'some-token', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });
});
