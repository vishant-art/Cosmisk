import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { SubscriptionRow, UserRow, UserUsageRow } from '../types/index.js';
import { validate, checkoutSchema, verifyPaymentSchema } from '../validation/schemas.js';

/* ------------------------------------------------------------------ */
/*  Plan limits — 4 tiers                                             */
/* ------------------------------------------------------------------ */

export const PLAN_LIMITS = {
  free:   { ad_accounts: 1,  chats_per_day: 10,  images_per_month: 0,   videos_per_month: 0,  creatives_per_month: 10,  autopilot_rules: 1,  competitors: 1,  team_members: 1  },
  solo:   { ad_accounts: 3,  chats_per_day: -1,  images_per_month: 30,  videos_per_month: 5,  creatives_per_month: 100, autopilot_rules: 10, competitors: 5,  team_members: 1  },
  growth: { ad_accounts: 10, chats_per_day: -1,  images_per_month: 100, videos_per_month: 20, creatives_per_month: 500, autopilot_rules: -1, competitors: 15, team_members: 5  },
  agency: { ad_accounts: -1, chats_per_day: -1,  images_per_month: -1,  videos_per_month: -1, creatives_per_month: -1,  autopilot_rules: -1, competitors: -1, team_members: -1 },
} as const;

// Trial limits: ~50% of paid tier — enough to experience the workflow, not enough to freeload
export const TRIAL_LIMITS = {
  solo:   { ad_accounts: 2,  chats_per_day: -1, images_per_month: 15,  videos_per_month: 2,  creatives_per_month: 50,  autopilot_rules: 3,  competitors: 2,  team_members: 1  },
  growth: { ad_accounts: 5,  chats_per_day: -1, images_per_month: 50,  videos_per_month: 10, creatives_per_month: 250, autopilot_rules: 5,  competitors: 5,  team_members: 3  },
  agency: { ad_accounts: 10, chats_per_day: -1, images_per_month: 100, videos_per_month: 20, creatives_per_month: 500, autopilot_rules: 10, competitors: 10, team_members: 5  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

/* ------------------------------------------------------------------ */
/*  Plan pricing                                                      */
/* ------------------------------------------------------------------ */

export const PLAN_PRICING = {
  solo:   { inr_monthly: 2499,  inr_annual: 1899,  usd_monthly: 29,  usd_annual: 22  },
  growth: { inr_monthly: 5999,  inr_annual: 4499,  usd_monthly: 69,  usd_annual: 52  },
  agency: { inr_monthly: 12999, inr_annual: 9999,  usd_monthly: 149, usd_annual: 119 },
} as const;

export const CREDIT_TOPUPS = [
  { credits: 50,  inr: 999,  usd: 12 },
  { credits: 200, inr: 2999, usd: 35 },
  { credits: 500, inr: 5999, usd: 69 },
] as const;

/* ------------------------------------------------------------------ */
/*  Stripe client (lazy)                                              */
/* ------------------------------------------------------------------ */

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!config.stripeSecretKey) return null;
  if (!_stripe) {
    _stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2025-04-30.basil' as any });
  }
  return _stripe;
}

/* ------------------------------------------------------------------ */
/*  Razorpay client (lazy)                                            */
/* ------------------------------------------------------------------ */

let _razorpay: InstanceType<typeof Razorpay> | null = null;
function getRazorpay(): InstanceType<typeof Razorpay> | null {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) return null;
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  }
  return _razorpay;
}

/* ------------------------------------------------------------------ */
/*  Usage helpers (exported for use by middleware)                     */
/* ------------------------------------------------------------------ */

export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getUserPlan(userId: string): PlanName {
  return getUserPlanInfo(userId).plan;
}

export function getUserPlanInfo(userId: string): { plan: PlanName; isTrial: boolean } {
  const db = getDb();

  const sub = db.prepare(
    "SELECT plan, trial_ends_at, status FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as { plan: string; trial_ends_at: string | null; status: string } | undefined;

  if (sub) {
    if (sub.trial_ends_at) {
      const trialEnd = new Date(sub.trial_ends_at);
      if (trialEnd > new Date()) {
        return { plan: sub.plan as PlanName, isTrial: true };
      }
      // Trial expired — auto-downgrade
      db.prepare("UPDATE subscriptions SET status = 'expired', updated_at = datetime('now') WHERE user_id = ? AND status = 'trialing'")
        .run(userId);
      db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(userId);
      return { plan: 'free', isTrial: false };
    }
    return { plan: sub.plan as PlanName, isTrial: false };
  }

  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId) as { plan: string } | undefined;
  return { plan: (user?.plan as PlanName) || 'free', isTrial: false };
}

type PlanLimitsShape = { ad_accounts: number; chats_per_day: number; images_per_month: number; videos_per_month: number; creatives_per_month: number; autopilot_rules: number; competitors: number; team_members: number };

export function getUserEffectiveLimits(userId: string): PlanLimitsShape {
  const { plan, isTrial } = getUserPlanInfo(userId);
  if (isTrial && plan !== 'free' && plan in TRIAL_LIMITS) {
    return TRIAL_LIMITS[plan as keyof typeof TRIAL_LIMITS];
  }
  return PLAN_LIMITS[plan];
}

export function getUsage(userId: string): UserUsageRow {
  const db = getDb();
  const period = getCurrentPeriod();
  let row = db.prepare('SELECT * FROM user_usage WHERE user_id = ? AND period = ?').get(userId, period) as UserUsageRow | undefined;
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO user_usage (user_id, period) VALUES (?, ?)').run(userId, period);
    row = db.prepare('SELECT * FROM user_usage WHERE user_id = ? AND period = ?').get(userId, period) as UserUsageRow;
  }
  return row;
}

export type UsageField = 'chat_count' | 'image_count' | 'video_count' | 'creative_count';

export function incrementUsage(userId: string, field: UsageField, amount = 1): void {
  const db = getDb();
  const period = getCurrentPeriod();
  db.prepare('INSERT OR IGNORE INTO user_usage (user_id, period) VALUES (?, ?)').run(userId, period);
  db.prepare(`UPDATE user_usage SET ${field} = ${field} + ? WHERE user_id = ? AND period = ?`).run(amount, userId, period);
}

export function checkLimit(userId: string, field: UsageField): { allowed: boolean; current: number; limit: number } {
  const limits = getUserEffectiveLimits(userId);
  const usage = getUsage(userId);

  const limitMap: Record<UsageField, number> = {
    chat_count: limits.chats_per_day,
    image_count: limits.images_per_month,
    video_count: limits.videos_per_month,
    creative_count: limits.creatives_per_month,
  };

  const limit = limitMap[field];
  if (limit === -1) return { allowed: true, current: usage[field], limit: -1 };

  if (field === 'chat_count') {
    return { allowed: usage[field] < limit * 30, current: usage[field], limit: limit * 30 };
  }

  return { allowed: usage[field] < limit, current: usage[field], limit };
}

/* ------------------------------------------------------------------ */
/*  Price mapping helpers                                             */
/* ------------------------------------------------------------------ */

function getStripePriceId(plan: string, interval: 'monthly' | 'annual'): string | null {
  const map: Record<string, Record<string, string>> = {
    solo:   { monthly: config.stripePriceSoloMonthly,   annual: config.stripePriceSoloAnnual },
    growth: { monthly: config.stripePriceGrowthMonthly, annual: config.stripePriceGrowthAnnual },
    agency: { monthly: config.stripePriceAgencyMonthly, annual: config.stripePriceAgencyAnnual },
  };
  return map[plan]?.[interval] || null;
}

function getRazorpayPlanId(plan: string, interval: 'monthly' | 'annual'): string | null {
  const map: Record<string, Record<string, string>> = {
    solo:   { monthly: config.razorpayPlanSoloMonthly,   annual: config.razorpayPlanSoloAnnual },
    growth: { monthly: config.razorpayPlanGrowthMonthly, annual: config.razorpayPlanGrowthAnnual },
    agency: { monthly: config.razorpayPlanAgencyMonthly, annual: config.razorpayPlanAgencyAnnual },
  };
  return map[plan]?.[interval] || null;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function billingRoutes(app: FastifyInstance) {

  // GET /billing/plans — return available plans with limits + pricing
  app.get('/plans', async (request) => {
    const { currency = 'INR' } = request.query as { currency?: string };
    const cur = currency.toUpperCase() === 'USD' ? 'usd' : 'inr';
    const sym = cur === 'inr' ? '\u20B9' : '$';

    return {
      success: true,
      currency: cur.toUpperCase(),
      plans: [
        {
          id: 'free', name: 'Free',
          price_monthly: 0, price_annual: 0,
          limits: PLAN_LIMITS.free,
          features: ['1 ad account', '10 AI chats/day', 'Dashboard & Analytics', 'Basic Reports', 'No image/video generation'],
          cta: 'Get Started',
        },
        {
          id: 'solo', name: 'Solo',
          price_monthly: PLAN_PRICING.solo[`${cur}_monthly`],
          price_annual: PLAN_PRICING.solo[`${cur}_annual`],
          limits: PLAN_LIMITS.solo,
          features: [
            '3 ad accounts', 'Unlimited AI chat', '30 images/mo', '5 videos/mo',
            '100 creatives/mo', '10 autopilot rules', '5 competitors', 'PDF reports',
          ],
          cta: 'Start 14-Day Free Trial',
          trial_days: 14,
          trial_limits: TRIAL_LIMITS.solo,
        },
        {
          id: 'growth', name: 'Growth',
          price_monthly: PLAN_PRICING.growth[`${cur}_monthly`],
          price_annual: PLAN_PRICING.growth[`${cur}_annual`],
          limits: PLAN_LIMITS.growth,
          features: [
            '10 ad accounts', 'Unlimited AI chat', '100 images/mo', '20 videos/mo',
            '500 creatives/mo', 'Unlimited autopilot rules', '15 competitors',
            'Branded reports', 'Priority support',
          ],
          cta: 'Start 14-Day Free Trial',
          trial_days: 14,
          trial_limits: TRIAL_LIMITS.growth,
          featured: true,
        },
        {
          id: 'agency', name: 'Agency',
          price_monthly: PLAN_PRICING.agency[`${cur}_monthly`],
          price_annual: PLAN_PRICING.agency[`${cur}_annual`],
          limits: PLAN_LIMITS.agency,
          features: [
            'Unlimited ad accounts', 'Unlimited everything',
            'White-label reports', 'Agency Command Center',
            'Dedicated CSM', 'API Access',
          ],
          cta: 'Start 14-Day Free Trial',
          trial_days: 14,
          trial_limits: TRIAL_LIMITS.agency,
        },
      ],
      credit_topups: CREDIT_TOPUPS.map(t => ({
        credits: t.credits,
        price: cur === 'inr' ? t.inr : t.usd,
        formatted: `${sym}${(cur === 'inr' ? t.inr : t.usd).toLocaleString()}`,
      })),
    };
  });

  // GET /billing/status — current subscription status
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const { plan, isTrial } = getUserPlanInfo(request.user.id);
    const usage = getUsage(request.user.id);
    const limits = getUserEffectiveLimits(request.user.id);

    const sub = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
    ).get(request.user.id) as SubscriptionRow | undefined;

    return {
      success: true,
      plan,
      is_trial: isTrial,
      limits,
      full_plan_limits: isTrial ? PLAN_LIMITS[plan] : undefined,
      usage: { chat_count: usage.chat_count, image_count: usage.image_count, video_count: usage.video_count },
      subscription: sub ? {
        id: sub.id,
        status: sub.status,
        gateway: sub.gateway || 'stripe',
        current_period_end: sub.current_period_end,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        trial_ends_at: sub.trial_ends_at,
      } : null,
    };
  });

  // POST /billing/start-trial — start 14-day free trial
  app.post('/start-trial', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(checkoutSchema, request.body, reply);
    if (!parsed) return;
    const { plan } = parsed;

    const db = getDb();
    const currentPlan = getUserPlan(request.user.id);
    if (currentPlan !== 'free') {
      return reply.status(400).send({ success: false, error: 'Already on a paid plan or trial' });
    }

    // Check if user already had a trial
    const hadTrial = db.prepare(
      "SELECT id FROM subscriptions WHERE user_id = ? AND trial_ends_at IS NOT NULL LIMIT 1"
    ).get(request.user.id);
    if (hadTrial) {
      return reply.status(400).send({ success: false, error: 'Trial already used. Please subscribe to upgrade.' });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const subId = uuidv4();
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan, status, trial_ends_at, gateway, created_at, updated_at)
      VALUES (?, ?, ?, 'trialing', ?, 'none', datetime('now'), datetime('now'))
    `).run(subId, request.user.id, plan, trialEnd.toISOString());

    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, request.user.id);

    return { success: true, plan, trial_ends_at: trialEnd.toISOString() };
  });

  // POST /billing/create-checkout — create checkout for Stripe or Razorpay
  app.post('/create-checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(checkoutSchema, request.body, reply);
    if (!parsed) return;
    const { plan, interval, gateway } = parsed;

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as UserRow;

    // --- Razorpay flow ---
    if (gateway === 'razorpay') {
      const rzp = getRazorpay();
      if (!rzp) {
        return reply.status(503).send({ success: false, error: 'Razorpay not configured' });
      }

      const razorpayPlanId = getRazorpayPlanId(plan, interval);
      if (!razorpayPlanId) {
        return reply.status(400).send({ success: false, error: 'Razorpay plan not configured for this tier/interval' });
      }

      const subscription = await rzp.subscriptions.create({
        plan_id: razorpayPlanId,
        total_count: interval === 'annual' ? 12 : 60, // max billing cycles
        customer_notify: 0,
        notes: { user_id: request.user.id, plan, interval },
      } as any);

      return {
        success: true,
        gateway: 'razorpay',
        subscription_id: subscription.id,
        razorpay_key: config.razorpayKeyId,
        plan,
        interval,
      };
    }

    // --- Stripe flow ---
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ success: false, error: 'Stripe not configured' });
    }

    const priceId = getStripePriceId(plan, interval);
    if (!priceId) {
      return reply.status(400).send({ success: false, error: 'Invalid plan or interval' });
    }

    // Get or create Stripe customer
    let customerId: string;
    const existingSub = db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1')
      .get(request.user.id) as { stripe_customer_id: string } | undefined;

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { user_id: request.user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appUrl}/app/settings?tab=billing&checkout=success`,
      cancel_url: `${config.appUrl}/app/settings?tab=billing&checkout=cancelled`,
      metadata: { user_id: request.user.id, plan },
    });

    return { success: true, gateway: 'stripe', url: session.url };
  });

  // POST /billing/verify-payment — Razorpay payment verification
  app.post('/verify-payment', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(verifyPaymentSchema, request.body, reply);
    if (!parsed) return;
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan, interval } = parsed;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpayKeySecret)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return reply.status(400).send({ success: false, error: 'Invalid payment signature' });
    }

    const db = getDb();
    const validPlan = plan;

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (interval === 'annual' ? 12 : 1));

    // Deactivate any existing active subscription
    db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE user_id = ? AND status IN ('active', 'trialing')")
      .run(request.user.id);

    // Create new subscription
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, razorpay_subscription_id, razorpay_customer_id, gateway, plan, status, current_period_start, current_period_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'razorpay', ?, 'active', ?, ?, datetime('now'), datetime('now'))
    `).run(
      uuidv4(), request.user.id, razorpay_subscription_id, razorpay_payment_id,
      validPlan, now.toISOString(), periodEnd.toISOString()
    );

    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(validPlan, request.user.id);

    return { success: true, plan: validPlan, gateway: 'razorpay' };
  });

  // POST /billing/cancel — cancel subscription on either gateway
  app.post('/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const sub = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
    ).get(request.user.id) as SubscriptionRow | undefined;

    if (!sub) {
      return reply.status(400).send({ success: false, error: 'No active subscription' });
    }

    const gateway = sub.gateway || 'stripe';

    if (gateway === 'razorpay' && sub.razorpay_subscription_id) {
      const rzp = getRazorpay();
      if (rzp) {
        try {
          await rzp.subscriptions.cancel(sub.razorpay_subscription_id);
        } catch (err: any) {
          app.log.error({ err }, 'Razorpay cancel failed');
        }
      }
    } else if (gateway === 'stripe' && sub.stripe_subscription_id) {
      const stripe = getStripe();
      if (stripe) {
        try {
          await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
        } catch (err: any) {
          app.log.error({ err }, 'Stripe cancel failed');
        }
      }
    }

    // For trials or razorpay: immediate cancel
    if (sub.status === 'trialing' || gateway === 'razorpay') {
      db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(sub.id);
      db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(request.user.id);
    } else {
      // Stripe: cancel at period end
      db.prepare("UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = datetime('now') WHERE id = ?").run(sub.id);
    }

    return { success: true, cancelled: true };
  });

  // POST /billing/create-portal — Stripe Customer Portal (or razorpay info)
  app.post('/create-portal', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const sub = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
    ).get(request.user.id) as SubscriptionRow | undefined;

    if (!sub) {
      return reply.status(400).send({ success: false, error: 'No active subscription' });
    }

    const gateway = sub.gateway || 'stripe';

    if (gateway === 'razorpay') {
      // Razorpay has no customer portal — manage in-app
      return { success: true, gateway: 'razorpay', manage_url: null };
    }

    const stripe = getStripe();
    if (!stripe || !sub.stripe_customer_id) {
      return reply.status(503).send({ success: false, error: 'Stripe not configured' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${config.appUrl}/app/settings?tab=billing`,
    });

    return { success: true, gateway: 'stripe', url: session.url };
  });

  // POST /billing/razorpay-webhook — Razorpay webhook handler
  app.post('/razorpay-webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string;
    if (!signature || !config.razorpayWebhookSecret) {
      return reply.status(400).send({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const body = (request as any).rawBody as string || JSON.stringify(request.body);
    const expectedSig = crypto
      .createHmac('sha256', config.razorpayWebhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSig !== signature) {
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    const event = request.body as any;
    const db = getDb();
    const eventType = event.event;
    const payload = event.payload?.subscription?.entity;

    if (!payload) {
      return { received: true };
    }

    const rzpSubId = payload.id;

    switch (eventType) {
      case 'subscription.activated': {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE razorpay_subscription_id = ?').get(rzpSubId) as SubscriptionRow | undefined;
        if (sub) {
          db.prepare("UPDATE subscriptions SET status = 'active', updated_at = datetime('now') WHERE razorpay_subscription_id = ?")
            .run(rzpSubId);
          db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(sub.plan, sub.user_id);
        }
        break;
      }

      case 'subscription.charged': {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE razorpay_subscription_id = ?').get(rzpSubId) as SubscriptionRow | undefined;
        if (sub) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          db.prepare(`
            UPDATE subscriptions SET
              status = 'active', current_period_start = ?, current_period_end = ?,
              updated_at = datetime('now')
            WHERE razorpay_subscription_id = ?
          `).run(now.toISOString(), periodEnd.toISOString(), rzpSubId);
        }
        break;
      }

      case 'subscription.cancelled': {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE razorpay_subscription_id = ?').get(rzpSubId) as SubscriptionRow | undefined;
        if (sub) {
          db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE razorpay_subscription_id = ?")
            .run(rzpSubId);
          db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(sub.user_id);
        }
        break;
      }

      case 'subscription.halted':
      case 'subscription.pending': {
        db.prepare("UPDATE subscriptions SET status = 'inactive', updated_at = datetime('now') WHERE razorpay_subscription_id = ?")
          .run(rzpSubId);
        break;
      }
    }

    return { received: true };
  });

  // POST /billing/webhook — Stripe webhook handler (kept as-is)
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe not configured' });
    }

    const sig = request.headers['stripe-signature'] as string;
    if (!sig || !config.stripeWebhookSecret) {
      return reply.status(400).send({ error: 'Missing signature' });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (request as any).rawBody as string || JSON.stringify(request.body),
        sig,
        config.stripeWebhookSecret,
      );
    } catch (err: any) {
      return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
    }

    const db = getDb();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.['user_id'];
        const plan = session.metadata?.['plan'] || 'solo';
        if (!userId) break;

        const subId = session.subscription as string;
        const stripeSub = await stripe.subscriptions.retrieve(subId) as any;

        // Deactivate any existing active subscription
        db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE user_id = ? AND status IN ('active', 'trialing')")
          .run(userId);

        db.prepare(`
          INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, gateway, plan, status, current_period_start, current_period_end)
          VALUES (?, ?, ?, ?, 'stripe', ?, 'active', ?, ?)
        `).run(
          uuidv4(), userId, session.customer as string, subId, plan,
          new Date(stripeSub.current_period_start * 1000).toISOString(),
          new Date(stripeSub.current_period_end * 1000).toISOString(),
        );

        db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        db.prepare(`
          UPDATE subscriptions SET
            status = ?, cancel_at_period_end = ?,
            current_period_start = ?, current_period_end = ?,
            updated_at = datetime('now')
          WHERE stripe_subscription_id = ?
        `).run(
          sub.status, sub.cancel_at_period_end ? 1 : 0,
          new Date(sub.current_period_start * 1000).toISOString(),
          new Date(sub.current_period_end * 1000).toISOString(),
          sub.id,
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE stripe_subscription_id = ?")
          .run(sub.id);

        const subRow = db.prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?')
          .get(sub.id) as { user_id: string } | undefined;
        if (subRow) {
          db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(subRow.user_id);
        }
        break;
      }
    }

    return { received: true };
  });
}
