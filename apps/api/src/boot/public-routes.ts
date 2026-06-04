import type { FastifyInstance } from 'fastify';
import { getDbAdapter } from '../db/adapter.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { VERSION } from '../version.js';

// Health check — production monitoring
const SERVER_START = new Date().toISOString();

export function registerPublicRoutes(app: FastifyInstance): void {
  app.get('/health', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
    let dbOk = false;
    try { await getDbAdapter().get('SELECT 1'); dbOk = true; } catch (err) { logger.warn({ err }, 'Health check: DB unavailable'); }
    return {
      status: dbOk ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      started_at: SERVER_START,
      db: dbOk ? 'connected' : 'error',
      node: process.version,
      env: config.nodeEnv,
      version: VERSION,
    };
  });

  // Public: Lead capture (no auth)
  app.post('/leads/capture', async (request, reply) => {
    const { email, source = 'hero' } = request.body as { email?: string; source?: string };
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ success: false, error: 'Valid email required' });
    }
    const ip = request.ip;
    const ua = request.headers['user-agent'] || '';
    const referrer = request.headers['referer'] || '';
    await getDbAdapter().run('INSERT INTO leads (email, source, ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase().trim(), source, ip, ua, referrer]);
    return { success: true };
  });

  // Public: Waitlist join (no auth)
  app.post('/waitlist/join', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const email = (body['email'] as string || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ success: false, error: 'Valid email required' });
    }
    // Check for existing
    const existing = await getDbAdapter().get<{ id: number }>('SELECT id FROM waitlist_leads WHERE email = ?', [email]);
    if (existing) {
      return { success: true, existing: true, position: existing.id };
    }

    const result = await getDbAdapter().get<{ id: number }>(`INSERT INTO waitlist_leads (email, name, company, role, ad_spend, team_size, pain_points, interested_features, source, referrer, signed_up_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [
      email,
      body['name'] || '',
      body['company'] || '',
      body['role'] || '',
      body['ad_spend'] || '',
      body['team_size'] || '',
      JSON.stringify(body['pain_points'] || []),
      JSON.stringify(body['interested_features'] || []),
      body['source'] || 'waitlist',
      body['referrer'] || '',
      body['signed_up_at'] || new Date().toISOString()
    ]);

    const position = result!.id;

    // Forward to n8n webhook for Airtable sync (fire-and-forget)
    try {
      fetch(`http://${process.env['N8N_HOST'] || '187.127.132.91'}:5678/webhook/waitlist/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, email }),
      }).catch((err: unknown) => { logger.error({ err }, 'Failed to sync waitlist to n8n'); });
    } catch (err) { logger.error({ err }, 'Failed to fire waitlist webhook'); }

    return { success: true, position };
  });
}
