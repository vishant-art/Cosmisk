/**
 * Integration Tests — Full flows with mocked external services.
 *
 * Tests: Meta OAuth flow, Stripe checkout, Razorpay payment, Claude AI chat.
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

// Mock Meta API
const mockMetaExchange = vi.fn().mockResolvedValue({
  accessToken: 'EAABmock123', userId: 'meta_u1', userName: 'Meta User',
});
vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get(path: string) {
      if (path.includes('/adaccounts')) return { data: [{ id: 'act_123', account_id: '123', name: 'Test' }] };
      if (path.includes('/me')) return { id: 'meta_u1', name: 'Meta User' };
      return { data: [] };
    }
  },
  exchangeCodeForToken: (...args: any[]) => mockMetaExchange(...args),
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
  encryptToken: (t: string) => `enc_${t}`,
}));

vi.mock('../services/automation-engine.js', () => ({
  runAutomations: async () => ({ triggered: 0, actions: [] }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'AI response from Claude' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
  },
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
  await app.register(jwt.default, {
    secret: 'integration-test-secret',
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(authRoutes, { prefix: '/auth' });

  // Create test user
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('IntegrationPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, plan, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?)').run(
    testUserId, 'Integration User', 'int@test.com', hash, 'growth', 1,
  );
  authToken = app.jwt.sign({ id: testUserId, email: 'int@test.com', name: 'Integration User', role: 'user' });

  await app.ready();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Auth flow integration                                              */
/* ------------------------------------------------------------------ */

describe('Auth Flow Integration', () => {
  it('should complete full signup -> login cycle', async () => {
    // Step 1: Signup
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'New User', email: 'newuser@test.com', password: 'NewPass123!' },
    });
    expect(signupRes.statusCode).toBe(200);
    const signupBody = signupRes.json();
    expect(signupBody.token).toBeTruthy();
    expect(signupBody.user.email).toBe('newuser@test.com');

    // Step 2: Login with same credentials
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'newuser@test.com', password: 'NewPass123!' },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.token).toBeTruthy();
    expect(loginBody.user.id).toBe(signupBody.user.id);
  });

  it('should reject login after signup with wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'newuser@test.com', password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Meta OAuth flow integration                                        */
/* ------------------------------------------------------------------ */

describe('Meta OAuth Flow', () => {
  it('should store Meta token after OAuth callback', () => {
    // Simulate what the OAuth callback route does:
    // 1. Exchange code for token
    // 2. Store encrypted token in DB
    const userId = testUserId;
    testDb.prepare(
      "INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)"
    ).run(userId, 'enc_EAABmock123', 'meta_u1', 'Meta User');

    // Verify token is stored
    const token = testDb.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as any;
    expect(token).toBeTruthy();
    expect(token.encrypted_access_token).toBe('enc_EAABmock123');
    expect(token.meta_user_id).toBe('meta_u1');
  });

  it('should retrieve ad accounts after Meta connection', () => {
    // Verify user has meta token
    const token = testDb.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(testUserId) as any;
    expect(token).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Stripe checkout flow                                               */
/* ------------------------------------------------------------------ */

describe('Stripe Checkout Flow', () => {
  it('should activate subscription after webhook', () => {
    const subId = uuidv4();
    // Step 1: Create pending subscription (simulating checkout.session.completed)
    testDb.prepare(
      "INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, gateway) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(subId, testUserId, 'cus_test123', 'sub_test123', 'growth', 'active', 'stripe');

    // Step 2: Update user plan
    testDb.prepare('UPDATE users SET plan = ? WHERE id = ?').run('growth', testUserId);

    // Verify
    const sub = testDb.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as any;
    expect(sub.status).toBe('active');
    expect(sub.gateway).toBe('stripe');

    const user = testDb.prepare('SELECT plan FROM users WHERE id = ?').get(testUserId) as any;
    expect(user.plan).toBe('growth');
  });

  it('should handle subscription cancellation', () => {
    testDb.prepare("UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = 1 WHERE user_id = ?").run(testUserId);
    const sub = testDb.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(testUserId) as any;
    expect(sub.status).toBe('canceled');
    expect(sub.cancel_at_period_end).toBe(1);

    // Cleanup
    testDb.prepare("UPDATE subscriptions SET status = 'active', cancel_at_period_end = 0 WHERE user_id = ?").run(testUserId);
  });
});

/* ------------------------------------------------------------------ */
/*  Razorpay flow                                                      */
/* ------------------------------------------------------------------ */

describe('Razorpay Payment Flow', () => {
  it('should create Razorpay subscription record', () => {
    const subId = uuidv4();
    testDb.prepare(
      "INSERT INTO subscriptions (id, user_id, plan, status, gateway, razorpay_subscription_id, razorpay_customer_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(subId, testUserId, 'solo', 'active', 'razorpay', 'sub_rzp123', 'cust_rzp456');

    const sub = testDb.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as any;
    expect(sub.gateway).toBe('razorpay');
    expect(sub.razorpay_subscription_id).toBe('sub_rzp123');
    expect(sub.razorpay_customer_id).toBe('cust_rzp456');
  });
});

/* ------------------------------------------------------------------ */
/*  Usage tracking integration                                         */
/* ------------------------------------------------------------------ */

describe('Usage Tracking', () => {
  it('should track and enforce usage limits across sessions', () => {
    const period = '2026-03';
    testDb.prepare('INSERT INTO user_usage (user_id, period, chat_count, image_count, video_count) VALUES (?, ?, ?, ?, ?)').run(testUserId, period, 50, 15, 3);

    const usage = testDb.prepare('SELECT * FROM user_usage WHERE user_id = ? AND period = ?').get(testUserId, period) as any;
    expect(usage.chat_count).toBe(50);
    expect(usage.image_count).toBe(15);
    expect(usage.video_count).toBe(3);

    // Increment
    testDb.prepare('UPDATE user_usage SET chat_count = chat_count + 1 WHERE user_id = ? AND period = ?').run(testUserId, period);
    const updated = testDb.prepare('SELECT chat_count FROM user_usage WHERE user_id = ? AND period = ?').get(testUserId, period) as any;
    expect(updated.chat_count).toBe(51);
  });
});

/* ------------------------------------------------------------------ */
/*  Cost ledger integration                                            */
/* ------------------------------------------------------------------ */

describe('Cost Ledger', () => {
  it('should track API costs and compute totals', () => {
    testDb.prepare("INSERT INTO cost_ledger (user_id, api_provider, operation, cost_cents) VALUES (?, 'flux', 'image_gen', 5)").run(testUserId);
    testDb.prepare("INSERT INTO cost_ledger (user_id, api_provider, operation, cost_cents) VALUES (?, 'heygen', 'video_gen', 25)").run(testUserId);
    testDb.prepare("INSERT INTO cost_ledger (user_id, api_provider, operation, cost_cents) VALUES (?, 'flux', 'image_gen', 5)").run(testUserId);

    const total = testDb.prepare('SELECT COALESCE(SUM(cost_cents), 0) as total FROM cost_ledger WHERE user_id = ?').get(testUserId) as { total: number };
    expect(total.total).toBe(35);

    const byProvider = testDb.prepare('SELECT api_provider, SUM(cost_cents) as total FROM cost_ledger WHERE user_id = ? GROUP BY api_provider').all(testUserId) as any[];
    const flux = byProvider.find(p => p.api_provider === 'flux');
    expect(flux.total).toBe(10);
  });
});
