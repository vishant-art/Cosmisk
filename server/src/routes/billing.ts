import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { SubscriptionRow, UserRow, UserUsageRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Plan limits                                                       */
/* ------------------------------------------------------------------ */

export const PLAN_LIMITS = {
  free: { ad_accounts: 1, chats_per_day: 20, images_per_month: 0, videos_per_month: 0, creatives_per_month: 10 },
  pro: { ad_accounts: 5, chats_per_day: -1, images_per_month: 50, videos_per_month: 10, creatives_per_month: 500 },
  agency: { ad_accounts: -1, chats_per_day: -1, images_per_month: -1, videos_per_month: -1, creatives_per_month: -1 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

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
/*  Usage helpers (exported for use by middleware)                     */
/* ------------------------------------------------------------------ */

export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getUserPlan(userId: string): PlanName {
  const db = getDb();
  const sub = db.prepare(
    "SELECT plan FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as { plan: string } | undefined;
  if (sub) return sub.plan as PlanName;
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId) as { plan: string } | undefined;
  return (user?.plan as PlanName) || 'free';
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
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  const usage = getUsage(userId);

  const limitMap: Record<UsageField, number> = {
    chat_count: limits.chats_per_day,
    image_count: limits.images_per_month,
    video_count: limits.videos_per_month,
    creative_count: limits.creatives_per_month,
  };

  const limit = limitMap[field];
  if (limit === -1) return { allowed: true, current: usage[field], limit: -1 };

  // For chats, we check daily count (reset daily by counting today's messages)
  if (field === 'chat_count') {
    // Monthly count serves as approximate; for now use monthly as daily * 30 simplification
    // A proper daily counter would need a separate table; for MVP, use monthly / 30
    return { allowed: usage[field] < limit * 30, current: usage[field], limit: limit * 30 };
  }

  return { allowed: usage[field] < limit, current: usage[field], limit };
}

/* ------------------------------------------------------------------ */
/*  Price mapping helper                                              */
/* ------------------------------------------------------------------ */

function getPriceId(plan: string, interval: 'monthly' | 'annual'): string | null {
  const map: Record<string, Record<string, string>> = {
    pro: { monthly: config.stripePriceProMonthly, annual: config.stripePriceProAnnual },
    agency: { monthly: config.stripePriceAgencyMonthly, annual: config.stripePriceAgencyAnnual },
  };
  return map[plan]?.[interval] || null;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function billingRoutes(app: FastifyInstance) {

  // GET /billing/plans — return available plans with limits
  app.get('/plans', async () => {
    return {
      success: true,
      plans: [
        {
          id: 'free', name: 'Free', price_monthly: 0, price_annual: 0,
          limits: PLAN_LIMITS.free,
          features: ['1 ad account', '20 AI chats/day', 'Dashboard & Analytics', 'Basic Reports'],
        },
        {
          id: 'pro', name: 'Pro', price_monthly: 49, price_annual: 39,
          limits: PLAN_LIMITS.pro,
          features: ['5 ad accounts', 'Unlimited AI chat', '50 images/mo', '10 videos/mo', 'Autopilot Alerts', 'Competitor Spy', 'Weekly Strategy Reports', 'Priority Support'],
        },
        {
          id: 'agency', name: 'Agency', price_monthly: 149, price_annual: 119,
          limits: PLAN_LIMITS.agency,
          features: ['Unlimited ad accounts', 'Unlimited everything', 'Client reporting', 'White-label', 'Agency Command Center', 'Dedicated CSM', 'API Access'],
        },
      ],
    };
  });

  // GET /billing/status — current subscription status
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const plan = getUserPlan(request.user.id);
    const usage = getUsage(request.user.id);
    const limits = PLAN_LIMITS[plan];

    const sub = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).get(request.user.id) as SubscriptionRow | undefined;

    return {
      success: true,
      plan,
      limits,
      usage: { chat_count: usage.chat_count, image_count: usage.image_count, video_count: usage.video_count },
      subscription: sub ? {
        id: sub.id,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: !!sub.cancel_at_period_end,
      } : null,
    };
  });

  // POST /billing/create-checkout — create Stripe Checkout session
  app.post('/create-checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ success: false, error: 'Stripe not configured' });
    }

    const { plan, interval = 'monthly' } = request.body as { plan: string; interval?: 'monthly' | 'annual' };
    const priceId = getPriceId(plan, interval);
    if (!priceId) {
      return reply.status(400).send({ success: false, error: 'Invalid plan or interval' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as UserRow;

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

    return { success: true, url: session.url };
  });

  // POST /billing/create-portal — Stripe Customer Portal for managing subscription
  app.post('/create-portal', { preHandler: [app.authenticate] }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ success: false, error: 'Stripe not configured' });
    }

    const db = getDb();
    const sub = db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1')
      .get(request.user.id) as { stripe_customer_id: string } | undefined;

    if (!sub?.stripe_customer_id) {
      return reply.status(400).send({ success: false, error: 'No active subscription' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${config.appUrl}/app/settings?tab=billing`,
    });

    return { success: true, url: session.url };
  });

  // POST /billing/webhook — Stripe webhook handler
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
        const plan = session.metadata?.['plan'] || 'pro';
        if (!userId) break;

        const subId = session.subscription as string;
        const stripeSub = await stripe.subscriptions.retrieve(subId) as any;

        db.prepare(`
          INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            plan = excluded.plan, status = 'active',
            current_period_start = excluded.current_period_start,
            current_period_end = excluded.current_period_end,
            updated_at = datetime('now')
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

        // Downgrade user to free
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
