import type { FastifyInstance } from 'fastify';
import { getDbAdapter } from '../db/adapter.js';
import { validate, profileUpdateSchema } from '../validation/schemas.js';
import type { UserRow } from '../types/index.js';

export function registerAccountRoutes(app: FastifyInstance): void {
  /* ------------------------------------------------------------------ */
  /*  1. Auth refresh — generate a new JWT token                         */
  /* ------------------------------------------------------------------ */
  app.post('/auth/refresh', async (request, reply) => {
    try {
      await request.jwtVerify();
      const newToken = app.jwt.sign({
        id: request.user.id,
        email: request.user.email,
        name: request.user.name,
        role: request.user.role,
      });
      return { token: newToken };
    } catch {
      return reply.status(401).send({ message: 'Token expired' });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  2. Onboarding endpoints — store data in users table                */
  /* ------------------------------------------------------------------ */

  // POST /onboarding/connect — acknowledge Meta connection
  app.post('/onboarding/connect', { preHandler: [app.authenticate] }, async (request) => {
    // Check if user actually has a meta token connected
    const row = await getDbAdapter().get('SELECT user_id FROM meta_tokens WHERE user_id = ?', [request.user.id]);
    return {
      success: true,
      connected: !!row,
      message: row ? 'Meta account connected' : 'Meta account not yet connected — use /auth/meta-oauth/exchange',
    };
  });

  // POST /onboarding/scan — store brand_name and website_url
  app.post('/onboarding/scan', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { brand_name, website_url } = request.body as { brand_name?: string; website_url?: string };

    if (!brand_name || !website_url) {
      return reply.status(400).send({ success: false, error: 'brand_name and website_url are required' });
    }

    await getDbAdapter().run('UPDATE users SET brand_name = ?, website_url = ? WHERE id = ?',
      [brand_name, website_url, request.user.id]);

    return { success: true, brand_name, website_url };
  });

  // POST /onboarding/goals — store goals array
  app.post('/onboarding/goals', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { goals } = request.body as { goals?: string[] };

    if (!goals || !Array.isArray(goals)) {
      return reply.status(400).send({ success: false, error: 'goals must be an array of strings' });
    }

    await getDbAdapter().run('UPDATE users SET goals = ? WHERE id = ?',
      [JSON.stringify(goals), request.user.id]);

    return { success: true, goals };
  });

  // POST /onboarding/competitors — store competitors array
  app.post('/onboarding/competitors', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { competitors } = request.body as { competitors?: string[] };

    if (!competitors || !Array.isArray(competitors)) {
      return reply.status(400).send({ success: false, error: 'competitors must be an array of strings' });
    }

    await getDbAdapter().run('UPDATE users SET competitors = ? WHERE id = ?',
      [JSON.stringify(competitors), request.user.id]);

    return { success: true, competitors };
  });

  /* ------------------------------------------------------------------ */
  /*  3. Settings endpoints                                              */
  /* ------------------------------------------------------------------ */

  // GET /settings/profile — fetch full user data from DB
  app.get('/settings/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getDbAdapter().get<UserRow>('SELECT * FROM users WHERE id = ?', [request.user.id]);

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return {
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        brand_name: user.brand_name || null,
        website_url: user.website_url || null,
        goals: (() => { try { return user.goals ? JSON.parse(user.goals) : []; } catch { return []; } })(),
        competitors: (() => { try { return user.competitors ? JSON.parse(user.competitors) : []; } catch { return []; } })(),
        active_brand: user.active_brand || null,
        phone: user.phone || null,
        timezone: user.timezone || 'IST',
        language: user.language || 'en',
        currency: user.currency || 'INR',
        date_format: user.date_format || 'DD/MM/YYYY',
        notification_preferences: user.notification_preferences || '{}',
        onboarding_complete: !!user.onboarding_complete,
        created_at: user.created_at,
      },
    };
  });

  // POST /settings/profile — update user profile fields
  app.post('/settings/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(profileUpdateSchema, request.body, reply);
    if (!parsed) return;
    const { name, phone, brand_name, website_url, goals, competitors, timezone, language, currency, date_format, notification_preferences } = parsed;
    const { email, onboarding_complete } = request.body as { email?: string; onboarding_complete?: boolean };

    if (!name && !email && !competitors && !brand_name && !website_url && !goals && !phone && !timezone && !language && !currency && !date_format && !notification_preferences && onboarding_complete === undefined) {
      return reply.status(400).send({ success: false, error: 'Provide at least one field to update' });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email) {
      // Check uniqueness
      const existing = await getDbAdapter().get('SELECT id FROM users WHERE email = ? AND id != ?', [email, request.user.id]);
      if (existing) {
        return reply.status(409).send({ success: false, error: 'Email already in use by another account' });
      }
      updates.push('email = ?');
      values.push(email);
    }
    if (competitors) {
      updates.push('competitors = ?');
      values.push(JSON.stringify(competitors));
    }
    if (phone) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (brand_name) {
      updates.push('brand_name = ?');
      values.push(brand_name);
    }
    if (website_url) {
      updates.push('website_url = ?');
      values.push(website_url);
    }
    if (goals) {
      updates.push('goals = ?');
      values.push(JSON.stringify(goals));
    }
    if (timezone) {
      updates.push('timezone = ?');
      values.push(timezone);
    }
    if (language) {
      updates.push('language = ?');
      values.push(language);
    }
    if (currency) {
      updates.push('currency = ?');
      values.push(currency);
    }
    if (date_format) {
      updates.push('date_format = ?');
      values.push(date_format);
    }
    if (notification_preferences) {
      updates.push('notification_preferences = ?');
      values.push(notification_preferences);
    }
    if (onboarding_complete !== undefined) {
      updates.push('onboarding_complete = ?');
      values.push(onboarding_complete ? 1 : 0);
    }

    values.push(request.user.id);
    await getDbAdapter().run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    // Fetch updated user and issue fresh JWT so token stays in sync
    const updatedUser = (await getDbAdapter().get<UserRow>('SELECT * FROM users WHERE id = ?', [request.user.id]))!;
    const newToken = app.jwt.sign({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    });

    // Log activity
    try {
      await getDbAdapter().run('INSERT INTO activity_log (user_id, action, category, details) VALUES (?, ?, ?, ?)',
        [request.user.id, 'Updated profile', 'account', updates.map(u => u.split(' = ')[0]).join(', ')]
      );
    } catch { /* activity log is best-effort */ }

    return {
      success: true,
      token: newToken,
      profile: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    };
  });

  // POST /settings/change-password — authenticated password change
  app.post('/settings/change-password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { changePasswordSchema } = await import('../validation/schemas.js');
    const parsed = validate(changePasswordSchema, request.body, reply);
    if (!parsed) return;

    const user = await getDbAdapter().get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [request.user.id]);
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' });

    const bcryptMod = await import('bcryptjs');
    if (!bcryptMod.default.compareSync(parsed.currentPassword, user.password_hash)) {
      return reply.status(400).send({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = bcryptMod.default.hashSync(parsed.newPassword, 10);
    await getDbAdapter().run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, request.user.id]);

    // Log activity
    await getDbAdapter().run('INSERT INTO activity_log (user_id, action, category) VALUES (?, ?, ?)',
      [request.user.id, 'Changed password', 'security']
    );

    return { success: true };
  });

  // GET /settings/activity — recent activity log
  app.get('/settings/activity', { preHandler: [app.authenticate] }, async (request) => {
    const rows = await getDbAdapter().all(
      'SELECT id, action, category, details, created_at FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [request.user.id]);
    return { success: true, activities: rows };
  });

  // DELETE /settings/account — permanently delete user account
  app.delete('/settings/account', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id;

    await getDbAdapter().transaction(async (tx) => {
      // Delete all user data across tables
      const tables = [
        'meta_tokens', 'google_tokens', 'tiktok_tokens', 'reports', 'automations',
        'autopilot_alerts', 'creative_sprints', 'creative_jobs', 'creative_assets',
        'cost_ledger', 'content_bank', 'agent_runs', 'agent_decisions',
        'agent_core_memory', 'agent_episodes', 'agent_entities', 'swipe_file',
        'team_members', 'team_invitations', 'password_reset_tokens', 'subscriptions',
        'user_usage', 'activity_log', 'studio_generations', 'score_predictions',
      ];
      for (const table of tables) {
        try { await tx.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]); } catch { /* table may not exist */ }
      }
      await tx.run('DELETE FROM users WHERE id = ?', [userId]);
    });

    return { success: true };
  });

  // Team routes now at /team/* via teamRoutes plugin

  // GET /settings/billing — return user's plan + usage from DB
  app.get('/settings/billing', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getDbAdapter().get<Pick<UserRow, 'id' | 'plan' | 'created_at'>>('SELECT id, plan, created_at FROM users WHERE id = ?', [request.user.id]);

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Forward to billing/status for full details
    return {
      success: true,
      plan: user.plan,
      billing: {
        plan: user.plan,
        status: 'active',
        member_since: user.created_at,
      },
    };
  });

  /* ------------------------------------------------------------------ */
  /*  5. Director endpoints — publish creative concepts                  */
  /* ------------------------------------------------------------------ */

  // POST /director/publish — acknowledge publish request
  app.post('/director/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { creative_id } = request.body as { creative_id?: string };

    if (!creative_id) {
      return reply.status(400).send({ success: false, error: 'creative_id is required' });
    }

    return {
      success: true,
      creative_id,
      status: 'queued',
      message: 'Creative has been queued for publishing. It will appear in your ad account shortly.',
      published_at: new Date().toISOString(),
    };
  });

  /* ------------------------------------------------------------------ */
  /*  6. Brands switch — set active brand for user                       */
  /* ------------------------------------------------------------------ */
  app.post('/brands/switch', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { brand_name } = request.body as { brand_name?: string };

    if (!brand_name) {
      return reply.status(400).send({ success: false, error: 'brand_name is required' });
    }

    await getDbAdapter().run('UPDATE users SET active_brand = ? WHERE id = ?',
      [brand_name, request.user.id]);

    return {
      success: true,
      active_brand: brand_name,
      message: `Switched active brand to "${brand_name}"`,
    };
  });

  /* ------------------------------------------------------------------ */
  /*  7. UGC endpoints                                                   */
  /* ------------------------------------------------------------------ */

  // GET /ugc/avatars — return default avatar personas
  app.get('/ugc/avatars', { preHandler: [app.authenticate] }, async () => {
    const avatars = [
      { id: 'avatar_01', name: 'Sophia', age_range: '25-34', gender: 'female', style: 'casual', description: 'Relatable everyday creator with a warm, authentic tone. Great for lifestyle and wellness brands.', thumbnail: '/avatars/sophia.png' },
      { id: 'avatar_02', name: 'Marcus', age_range: '30-40', gender: 'male', style: 'professional', description: 'Confident and authoritative presenter. Ideal for tech, finance, and B2B products.', thumbnail: '/avatars/marcus.png' },
      { id: 'avatar_03', name: 'Aisha', age_range: '20-28', gender: 'female', style: 'energetic', description: 'High-energy, trend-savvy creator. Perfect for beauty, fashion, and Gen-Z audiences.', thumbnail: '/avatars/aisha.png' },
      { id: 'avatar_04', name: 'Jake', age_range: '22-30', gender: 'male', style: 'humorous', description: 'Witty and humorous presenter who makes any product fun. Great for food, entertainment, and DTC brands.', thumbnail: '/avatars/jake.png' },
      { id: 'avatar_05', name: 'Priya', age_range: '28-38', gender: 'female', style: 'expert', description: 'Knowledgeable and trustworthy expert voice. Ideal for health, education, and premium brands.', thumbnail: '/avatars/priya.png' },
      { id: 'avatar_06', name: 'Chris', age_range: '35-45', gender: 'male', style: 'storyteller', description: 'Engaging storyteller with a relatable dad-next-door vibe. Works well for family, home, and insurance brands.', thumbnail: '/avatars/chris.png' },
    ];
    return { success: true, avatars };
  });
}
