/**
 * Feedback Route Tests (Postgres integration)
 *
 * POST /feedback upsert semantics: a re-vote overwrites on (user_id, kind, ref_id),
 * and a comment-only chat row (rating 0) is accepted. Runs against the migrated Neon
 * test branch via the pg integration harness.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMigratedTestPg, type MigratedTestPg } from '../../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../../db/adapter.js';

const { registerFeedbackRoutes } = await import('../feedback.js');

let pg: MigratedTestPg;
let app: FastifyInstance;
let auth: Record<string, string>;
let userId: string;

async function buildApp() {
  app = Fastify({ logger: false });
  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'test-secret-only', sign: { expiresIn: '1h' } });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });
  registerFeedbackRoutes(app);
  await app.ready();
}

async function seedUser() {
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  userId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, 'Test User', 'test@test.com', hash, 'user', 'growth'],
  );
  const token = app.jwt.sign({ id: userId, email: 'test@test.com', name: 'Test User', role: 'user' });
  auth = { authorization: `Bearer ${token}` };
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
  await seedUser();
});

describe('POST /feedback', () => {
  const post = (body: Record<string, unknown>) => app.inject({ method: 'POST', url: '/feedback', headers: auth, payload: body });

  it('upserts and a re-vote overwrites', async () => {
    let r = await post({ kind: 'creative', ref_id: 'out1', rating: 1 });
    expect(r.statusCode).toBe(200);
    r = await post({ kind: 'creative', ref_id: 'out1', rating: -1 }); // re-vote
    expect(r.statusCode).toBe(200);
    const rows = await getDbAdapter().all<{ rating: number }>(
      "SELECT rating FROM ai_feedback WHERE ref_id = ? AND user_id = ?", ['out1', userId]);
    expect(rows.length).toBe(1);
    expect(rows[0].rating).toBe(-1);
  });

  it('stores a comment-only chat row', async () => {
    const r = await post({ kind: 'chat', ref_id: 'sess-9', rating: 0, comment: 'helpful', prompt_text: 'q', response_text: 'a' });
    expect(r.statusCode).toBe(200);
    const rows = await getDbAdapter().all<{ comment: string }>(
      "SELECT comment FROM ai_feedback WHERE ref_id = ? AND user_id = ?", ['sess-9', userId]);
    expect(rows[0].comment).toBe('helpful');
  });

  it('rejects a bad kind or rating', async () => {
    expect((await post({ kind: 'bogus', ref_id: 'x', rating: 1 })).statusCode).toBe(400);
    expect((await post({ kind: 'chat', ref_id: 'x', rating: 5 })).statusCode).toBe(400);
  });
});
