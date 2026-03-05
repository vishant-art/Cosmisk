import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { encryptToken, decryptToken } from '../services/token-crypto.js';
import { exchangeCodeForToken, getMetaUser, MetaApiService } from '../services/meta-api.js';
import type { UserRow, MetaTokenRow } from '../types/index.js';

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ message: 'Email and password required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.status(401).send({ message: 'Invalid email or password' });
    }

    // If user has a Meta token, treat onboarding as complete
    const hasMeta = db.prepare('SELECT 1 FROM meta_tokens WHERE user_id = ?').get(user.id);
    const onboardingComplete = Boolean(user.onboarding_complete) || !!hasMeta;

    const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name });

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

  // POST /auth/signup
  app.post('/signup', async (request, reply) => {
    const { name, email, password } = request.body as { name: string; email: string; password: string };

    if (!name || !email || !password) {
      return reply.status(400).send({ error: 'Name, email, and password required' });
    }

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

    const token = app.jwt.sign({ id, email, name });

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

  // POST /auth/meta-disconnect
  app.post('/meta-disconnect', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    db.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(request.user.id);
    return { success: true };
  });

  // DELETE /auth/account — self-delete (authenticated user deletes their own account)
  app.delete('/account', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    db.prepare('DELETE FROM meta_tokens WHERE user_id = ?').run(request.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(request.user.id);
    return { success: true };
  });
}
