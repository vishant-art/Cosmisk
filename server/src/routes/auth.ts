import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { encryptToken, decryptToken } from '../services/token-crypto.js';
import { exchangeCodeForToken, getMetaUser, MetaApiService } from '../services/meta-api.js';
import { sendPasswordResetEmail } from '../services/email.js';
import type { UserRow, MetaTokenRow } from '../types/index.js';
import { validate, loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login — 10 attempts per minute per IP
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(loginSchema, request.body, reply);
    if (!parsed) return;
    const { email, password } = parsed;

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.status(401).send({ message: 'Invalid email or password' });
    }

    // If user has a Meta token, treat onboarding as complete
    const hasMeta = db.prepare('SELECT 1 FROM meta_tokens WHERE user_id = ?').get(user.id);
    const onboardingComplete = Boolean(user.onboarding_complete) || !!hasMeta;

    const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role });

    // Log login activity
    try {
      db.prepare('INSERT INTO activity_log (user_id, action, category) VALUES (?, ?, ?)').run(
        user.id, 'Logged in', 'security'
      );
    } catch { /* best-effort */ }

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        onboardingComplete,
        plan: user.plan,
        createdAt: user.created_at,
      },
    };
  });

  // POST /auth/signup — 5 attempts per minute per IP
  app.post('/signup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(registerSchema, request.body, reply);
    if (!parsed) return;
    const { name, email, password } = parsed;

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, name, email, passwordHash);

    const token = app.jwt.sign({ id, email, name, role: 'user' });

    return {
      token,
      user: {
        id,
        name,
        email,
        role: 'user',
        onboardingComplete: false,
        plan: 'free',
        createdAt: new Date().toISOString(),
      },
    };
  });

  // GET /auth/meta-status
  app.get('/meta-status', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(request.user.id) as MetaTokenRow | undefined;

    if (!row) {
      return { connected: false, status: 'disconnected', accountCount: 0, metaUserName: null, expiresAt: null };
    }

    const isExpired = row.expires_at ? new Date(row.expires_at) < new Date() : false;

    if (isExpired) {
      return { connected: false, status: 'expired', accountCount: 0, metaUserName: row.meta_user_name, expiresAt: row.expires_at };
    }

    // Validate token with a lightweight call (just 1 account to confirm token works)
    let accountCount = 0;
    try {
      const token = decryptToken(row.encrypted_access_token);
      const meta = new MetaApiService(token);
      const resp = await meta.get<any>('/me/adaccounts', { fields: 'id', limit: '1' });
      accountCount = resp.data?.length ? 1 : 0; // Just confirm token works, actual count comes from /ad-accounts/list
    } catch {
      // Token may be invalid
      return { connected: false, status: 'expired', accountCount: 0, metaUserName: row.meta_user_name, expiresAt: row.expires_at };
    }

    return {
      connected: true,
      status: 'connected',
      accountCount,
      metaUserName: row.meta_user_name,
      expiresAt: row.expires_at,
    };
  });

  // POST /auth/meta-oauth/exchange
  app.post('/meta-oauth/exchange', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { code, redirect_uri } = request.body as { code: string; redirect_uri: string };

    if (!code || !redirect_uri) {
      return reply.status(400).send({ success: false, error: 'Code and redirect_uri required' });
    }

    try {
      const { accessToken, expiresIn } = await exchangeCodeForToken(code, redirect_uri);
      const metaUser = await getMetaUser(accessToken);

      const encrypted = encryptToken(accessToken);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const db = getDb();
      db.prepare(`
        INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          encrypted_access_token = excluded.encrypted_access_token,
          meta_user_id = excluded.meta_user_id,
          meta_user_name = excluded.meta_user_name,
          expires_at = excluded.expires_at,
          created_at = datetime('now')
      `).run(request.user.id, encrypted, metaUser.id, metaUser.name, expiresAt);

      // Mark onboarding complete
      db.prepare('UPDATE users SET onboarding_complete = 1 WHERE id = ?').run(request.user.id);

      return { success: true, accountCount: -1 };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message || 'OAuth exchange failed' });
    }
  });

  // POST /auth/forgot-password — 3 per minute per IP (prevents email spam)
  app.post('/forgot-password', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(forgotPasswordSchema, request.body, reply);
    if (!parsed) return;
    const { email } = parsed;

    const db = getDb();
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email) as Pick<UserRow, 'id' | 'name' | 'email'> | undefined;

    // Always return success to prevent email enumeration
    if (!user) return { success: true };

    // Rate limit: max 3 tokens per hour per user
    const recentCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM password_reset_tokens
      WHERE user_id = ? AND created_at > datetime('now', '-1 hour')
    `).get(user.id) as { cnt: number }).cnt;

    if (recentCount >= 3) return { success: true }; // Silent rate limit

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), user.id, tokenHash, expiresAt);

    // Send email (fire-and-forget)
    sendPasswordResetEmail(user.email, user.name, rawToken).catch(err =>
      logger.error({ err: err.message }, '[Auth] Failed to send reset email')
    );

    return { success: true };
  });

  // POST /auth/reset-password
  app.post('/reset-password', async (request, reply) => {
    const parsed = validate(resetPasswordSchema, request.body, reply);
    if (!parsed) return;
    const { token, password } = parsed;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const db = getDb();

    const resetRow = db.prepare(`
      SELECT id, user_id, expires_at, used FROM password_reset_tokens
      WHERE token_hash = ?
    `).get(tokenHash) as { id: string; user_id: string; expires_at: string; used: number } | undefined;

    if (!resetRow) return reply.status(400).send({ success: false, error: 'Invalid or expired reset link' });
    if (resetRow.used) return reply.status(400).send({ success: false, error: 'This reset link has already been used' });
    if (new Date(resetRow.expires_at) < new Date()) {
      return reply.status(400).send({ success: false, error: 'This reset link has expired' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    // Update password and mark token as used (transaction)
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, resetRow.user_id);
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetRow.id);
      // Invalidate all other tokens for this user
      db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND id != ?").run(resetRow.user_id, resetRow.id);
    })();

    return { success: true };
  });

  // POST /auth/meta-disconnect
  app.post('/meta-disconnect', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    db.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(request.user.id);
    return { success: true };
  });

}
