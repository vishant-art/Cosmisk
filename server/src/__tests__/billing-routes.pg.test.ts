/**
 * Billing Routes Tests (Postgres integration)
 *
 * Tests /billing/plans, /billing/status, /billing/start-trial, /billing/cancel endpoints.
 * Runs against the migrated Neon TEST BRANCH via the pg integration harness
 * (DB_BACKEND=postgres). Stripe/Razorpay and other external services are mocked.
 *
 * DB-2 E1: ported from in-memory SQLite to the Postgres integration harness.
 * Seeds via getDbAdapter() against the migrated test branch; per-test isolation
 * via pg.reset() (TRUNCATE), so every test seeds its own rows (FK parent→child:
 * users first, then subscriptions).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { vi } from 'vitest';
import { getMigratedTestPg, type MigratedTestPg } from '../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../db/adapter.js';

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = { create: async () => ({ id: 'cus_mock' }) };
      checkout = { sessions: { create: async () => ({ url: 'https://checkout.stripe.com/mock' }) } };
      subscriptions = { update: async () => ({}) };
      billingPortal = { sessions: { create: async () => ({ url: 'https://portal.stripe.com/mock' }) } };
      webhooks = { constructEvent: () => ({}) };
    },
  };
});

// Mock Razorpay
vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      subscriptions = {
        create: async () => ({ id: 'sub_mock_rzp' }),
        cancel: async () => ({}),
      };
    },
  };
});

// Mock config: spread the REAL env-driven config (preserving dbBackend ===
// 'postgres' so the adapter routes to the pg test branch) and override only the
// billing-gateway fields. Stripe/Razorpay keys are blank so getStripe()/
// getRazorpay() return null (for the "not configured" tests).
vi.mock('../config.js', async (orig) => {
  const actual = (await orig()) as { config: Record<string, any> };
  return {
    config: {
      ...actual.config,
      stripeSecretKey: '',
      stripeWebhookSecret: '',
      razorpayKeyId: '',
      razorpayKeySecret: '',
      razorpayWebhookSecret: '',
      appUrl: 'http://localhost:4200',
      stripePriceSoloMonthly: 'price_solo_m',
      stripePriceSoloAnnual: 'price_solo_a',
      stripePriceGrowthMonthly: 'price_growth_m',
      stripePriceGrowthAnnual: 'price_growth_a',
      stripePriceAgencyMonthly: 'price_agency_m',
      stripePriceAgencyAnnual: 'price_agency_a',
      razorpayPlanSoloMonthly: 'plan_solo_m',
      razorpayPlanSoloAnnual: 'plan_solo_a',
      razorpayPlanGrowthMonthly: 'plan_growth_m',
      razorpayPlanGrowthAnnual: 'plan_growth_a',
      razorpayPlanAgencyMonthly: 'plan_agency_m',
      razorpayPlanAgencyAnnual: 'plan_agency_a',
    },
  };
});

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class { async get() { return { data: [] }; } },
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
const { billingRoutes, PLAN_LIMITS, PLAN_PRICING } = await import('../routes/billing.js');

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

  await app.register(billingRoutes, { prefix: '/billing' });
  await app.ready();
}

async function seedBaseUser() {
  // Create test user on free plan (parent row — FK order: users first).
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [testUserId, 'Billing Test', 'billing@test.com', hash, 'user', 'free'],
  );

  authToken = app.jwt.sign({ id: testUserId, email: 'billing@test.com', name: 'Billing Test', role: 'user' });
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
  await seedBaseUser();
});

/* ------------------------------------------------------------------ */
/*  GET /billing/plans                                                 */
/* ------------------------------------------------------------------ */

describe('GET /billing/plans', () => {
  it('returns all plan tiers (no auth required)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.plans).toHaveLength(4);

    const planIds = body.plans.map((p: any) => p.id);
    expect(planIds).toEqual(['free', 'solo', 'growth', 'agency']);
  });

  it('returns INR pricing by default', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    const body = res.json();
    expect(body.currency).toBe('INR');

    const soloPlan = body.plans.find((p: any) => p.id === 'solo');
    expect(soloPlan.price_monthly).toBe(PLAN_PRICING.solo.inr_monthly);
    expect(soloPlan.price_annual).toBe(PLAN_PRICING.solo.inr_annual);
  });

  it('returns USD pricing when requested', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans?currency=USD',
    });
    const body = res.json();
    expect(body.currency).toBe('USD');

    const growthPlan = body.plans.find((p: any) => p.id === 'growth');
    expect(growthPlan.price_monthly).toBe(PLAN_PRICING.growth.usd_monthly);
    expect(growthPlan.price_annual).toBe(PLAN_PRICING.growth.usd_annual);
  });

  it('free plan has zero pricing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    const body = res.json();
    const freePlan = body.plans.find((p: any) => p.id === 'free');
    expect(freePlan.price_monthly).toBe(0);
    expect(freePlan.price_annual).toBe(0);
  });

  it('includes plan limits for each tier', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    const body = res.json();
    const freePlan = body.plans.find((p: any) => p.id === 'free');
    expect(freePlan.limits).toEqual(PLAN_LIMITS.free);

    const agencyPlan = body.plans.find((p: any) => p.id === 'agency');
    expect(agencyPlan.limits).toEqual(PLAN_LIMITS.agency);
  });

  it('includes credit topups', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    const body = res.json();
    expect(body.credit_topups).toBeDefined();
    expect(body.credit_topups.length).toBeGreaterThan(0);
    expect(body.credit_topups[0]).toHaveProperty('credits');
    expect(body.credit_topups[0]).toHaveProperty('price');
  });

  it('paid plans include trial info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/plans',
    });
    const body = res.json();
    const soloPlan = body.plans.find((p: any) => p.id === 'solo');
    expect(soloPlan.trial_days).toBe(14);
    expect(soloPlan.trial_limits).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  GET /billing/status                                                */
/* ------------------------------------------------------------------ */

describe('GET /billing/status', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns free plan status for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.plan).toBe('free');
    expect(body.is_trial).toBe(false);
    expect(body.limits).toEqual(PLAN_LIMITS.free);
    expect(body.subscription).toBeNull();
  });

  it('returns usage counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.usage).toBeDefined();
    expect(body.usage).toHaveProperty('chat_count');
    expect(body.usage).toHaveProperty('image_count');
    expect(body.usage).toHaveProperty('video_count');
  });

  it('returns subscription details when active subscription exists', async () => {
    // Seed an active subscription (FK: user already seeded in beforeEach).
    const subId = uuidv4();
    await getDbAdapter().run(
      `INSERT INTO subscriptions (id, user_id, plan, status, gateway, current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, 'growth', 'active', 'stripe', datetime('now'), datetime('now', '+30 days'), datetime('now'), datetime('now'))`,
      [subId, testUserId],
    );
    await getDbAdapter().run("UPDATE users SET plan = 'growth' WHERE id = ?", [testUserId]);

    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.plan).toBe('growth');
    expect(body.subscription).not.toBeNull();
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.gateway).toBe('stripe');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /billing/start-trial                                          */
/* ------------------------------------------------------------------ */

describe('POST /billing/start-trial', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/start-trial',
      payload: { plan: 'growth' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('starts a 14-day trial for free user', async () => {
    // User is on free plan with no subscriptions (from beforeEach seed).
    const res = await app.inject({
      method: 'POST',
      url: '/billing/start-trial',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { plan: 'growth' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.plan).toBe('growth');
    expect(body.trial_ends_at).toBeDefined();

    // Verify trial end is ~14 days from now
    const trialEnd = new Date(body.trial_ends_at);
    const now = new Date();
    const diffDays = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThanOrEqual(15);
  });

  it('rejects trial if user already on paid plan', async () => {
    // Seed self-contained state: user is on a paid plan.
    await getDbAdapter().run("UPDATE users SET plan = 'growth' WHERE id = ?", [testUserId]);

    const res = await app.inject({
      method: 'POST',
      url: '/billing/start-trial',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { plan: 'agency' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Already on a paid plan');
  });

  it('rejects second trial after first trial used', async () => {
    // Seed self-contained state: user is free but has a prior trial sub
    // (trial_ends_at IS NOT NULL marks the trial as already used).
    const subId = uuidv4();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    await getDbAdapter().run(
      `INSERT INTO subscriptions (id, user_id, plan, status, trial_ends_at, gateway, created_at, updated_at)
       VALUES (?, ?, 'growth', 'expired', ?, 'none', datetime('now'), datetime('now'))`,
      [subId, testUserId, trialEnd.toISOString()],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/billing/start-trial',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { plan: 'solo' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('Trial already used');
  });

  it('rejects invalid plan body', async () => {
    // User is free with no subscriptions (from beforeEach seed).
    const res = await app.inject({
      method: 'POST',
      url: '/billing/start-trial',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {},
    });
    // Should fail validation (plan is required)
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /billing/cancel                                               */
/* ------------------------------------------------------------------ */

describe('POST /billing/cancel', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/cancel',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no active subscription exists', async () => {
    // User is free with no subscriptions (from beforeEach seed).
    const res = await app.inject({
      method: 'POST',
      url: '/billing/cancel',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('No active subscription');
  });

  it('cancels a trialing subscription immediately', async () => {
    // Seed a trialing subscription (FK: user already seeded in beforeEach).
    const subId = uuidv4();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    await getDbAdapter().run(
      `INSERT INTO subscriptions (id, user_id, plan, status, trial_ends_at, gateway, created_at, updated_at)
       VALUES (?, ?, 'growth', 'trialing', ?, 'none', datetime('now'), datetime('now'))`,
      [subId, testUserId, trialEnd.toISOString()],
    );
    await getDbAdapter().run("UPDATE users SET plan = 'growth' WHERE id = ?", [testUserId]);

    const res = await app.inject({
      method: 'POST',
      url: '/billing/cancel',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.cancelled).toBe(true);

    // Verify user is back to free
    const user = await getDbAdapter().get('SELECT plan FROM users WHERE id = ?', [testUserId]) as { plan: string };
    expect(user.plan).toBe('free');

    // Verify subscription is cancelled
    const sub = await getDbAdapter().get('SELECT status FROM subscriptions WHERE id = ?', [subId]) as { status: string };
    expect(sub.status).toBe('cancelled');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /billing/create-checkout                                      */
/* ------------------------------------------------------------------ */

describe('POST /billing/create-checkout', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-checkout',
      payload: { plan: 'growth', interval: 'monthly', gateway: 'stripe' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 503 when Stripe is not configured', async () => {
    // Config mock has empty stripeSecretKey, so getStripe() returns null.
    // User is free with no subscriptions (from beforeEach seed).
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-checkout',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { plan: 'growth', interval: 'monthly', gateway: 'stripe' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toContain('Stripe not configured');
  });

  it('returns 503 when Razorpay is not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-checkout',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { plan: 'growth', interval: 'monthly', gateway: 'razorpay' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toContain('Razorpay not configured');
  });

  it('rejects missing plan in body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-checkout',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { interval: 'monthly' },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /billing/create-portal                                        */
/* ------------------------------------------------------------------ */

describe('POST /billing/create-portal', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-portal',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no active subscription', async () => {
    // User is free with no subscriptions (from beforeEach seed).
    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-portal',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('No active subscription');
  });

  it('returns manage_url null for razorpay subscriptions', async () => {
    // Seed an active razorpay subscription (FK: user already seeded in beforeEach).
    const subId = uuidv4();
    await getDbAdapter().run(
      `INSERT INTO subscriptions (id, user_id, plan, status, gateway, created_at, updated_at)
       VALUES (?, ?, 'growth', 'active', 'razorpay', datetime('now'), datetime('now'))`,
      [subId, testUserId],
    );
    await getDbAdapter().run("UPDATE users SET plan = 'growth' WHERE id = ?", [testUserId]);

    const res = await app.inject({
      method: 'POST',
      url: '/billing/create-portal',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.gateway).toBe('razorpay');
    expect(body.manage_url).toBeNull();
  });
});
