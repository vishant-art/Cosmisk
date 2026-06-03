/**
 * Swipe File Routes Tests (Postgres integration)
 *
 * Tests for /swipe-file endpoints: list, save, delete.
 * Covers CRUD, validation, auth, user isolation.
 * Runs against the migrated Neon TEST BRANCH via the pg integration harness
 * (DB_BACKEND=postgres). External services are mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMigratedTestPg, type MigratedTestPg } from '../db/__tests__/pg-test-target.js';
import { getDbAdapter } from '../db/adapter.js';

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

const { swipeFileRoutes } = await import('../routes/swipe-file.js');

let pg: MigratedTestPg;
let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let otherUserId: string;
let otherAuthToken: string;

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

  await app.register(swipeFileRoutes, { prefix: '/swipe-file' });
  await app.ready();
}

async function seedUsers() {
  const hash = bcrypt.hashSync('SecurePass123!', 10);

  // Main test user (parent row — FK order: users first).
  testUserId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [testUserId, 'Swipe Test User', 'swipe@test.com', hash, 'user', 'growth'],
  );
  authToken = app.jwt.sign({ id: testUserId, email: 'swipe@test.com', name: 'Swipe Test User', role: 'user' });

  // Second user for isolation tests
  otherUserId = uuidv4();
  await getDbAdapter().run(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
    [otherUserId, 'Other User', 'other-swipe@test.com', hash, 'user', 'free'],
  );
  otherAuthToken = app.jwt.sign({ id: otherUserId, email: 'other-swipe@test.com', name: 'Other User', role: 'user' });
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
  await seedUsers();
});

function authHeaders(token?: string) {
  return { Authorization: `Bearer ${token || authToken}` };
}

/* ------------------------------------------------------------------ */
/*  POST /swipe-file/save                                              */
/* ------------------------------------------------------------------ */
describe('POST /swipe-file/save', () => {
  it('saves a swipe file entry with full data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'Nike',
        hookDna: ['urgency', 'social-proof'],
        visualDna: ['dark-background', 'product-close-up'],
        audioDna: ['upbeat-music', 'voiceover'],
        notes: 'Great hook with social proof angle',
        sourceUrl: 'https://example.com/ad/123',
        sourceAdId: 'ad_12345',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
  });

  it('saves with minimal data (defaults)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {},
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
  });

  it('saves with empty DNA arrays', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'Adidas',
        hookDna: [],
        visualDna: [],
        audioDna: [],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('saves with thumbnail URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'Apple',
        thumbnail: 'https://example.com/thumbnail.jpg',
        hookDna: ['curiosity'],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects invalid thumbnail URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'Test',
        thumbnail: 'not-a-valid-url',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid sourceUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'Test',
        sourceUrl: 'not-a-url',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects brand exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        brand: 'A'.repeat(201),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects hookDna exceeding max 20 items', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: authHeaders(),
      payload: {
        hookDna: Array(21).fill('tag'),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      payload: { brand: 'Test' },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /swipe-file/list                                               */
/* ------------------------------------------------------------------ */
describe('GET /swipe-file/list', () => {
  // pg harness resets between tests, so seed list fixtures here per-test.
  async function seedListFixtures() {
    // Seed entries for main user (FK: users already seeded in beforeEach).
    for (let i = 0; i < 3; i++) {
      await getDbAdapter().run(
        `INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna, notes)
         VALUES (?, ?, ?, '["hook-tag"]', '["visual-tag"]', '["audio-tag"]', ?)`,
        [uuidv4(), testUserId, `Brand ${i}`, `Note ${i}`],
      );
    }
    // Seed entry for other user
    await getDbAdapter().run(
      `INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna, notes)
       VALUES (?, ?, 'Other Brand', '[]', '[]', '[]', 'should not appear')`,
      [uuidv4(), otherUserId],
    );
  }

  beforeEach(async () => {
    await seedListFixtures();
  });

  it('returns all swipe file items for user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('returns properly formatted items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: authHeaders(),
    });
    const body = res.json();
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('brand');
    expect(item).toHaveProperty('hookDna');
    expect(item).toHaveProperty('visualDna');
    expect(item).toHaveProperty('audioDna');
    expect(item).toHaveProperty('notes');
    expect(item).toHaveProperty('savedAt');
    expect(Array.isArray(item.hookDna)).toBe(true);
    expect(Array.isArray(item.visualDna)).toBe(true);
    expect(Array.isArray(item.audioDna)).toBe(true);
  });

  it('does not return other users items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: authHeaders(),
    });
    const body = res.json();
    const brands = body.items.map((i: any) => i.brand);
    expect(brands).not.toContain('Other Brand');
  });

  it('other user only sees their own items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: authHeaders(otherAuthToken),
    });
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const brands = body.items.map((i: any) => i.brand);
    expect(brands).toContain('Other Brand');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /swipe-file/:id                                             */
/* ------------------------------------------------------------------ */
describe('DELETE /swipe-file/:id', () => {
  it('deletes own swipe file entry', async () => {
    const id = uuidv4();
    await getDbAdapter().run(
      `INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna)
       VALUES (?, ?, 'ToDelete', '[]', '[]', '[]')`,
      [id, testUserId],
    );

    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${id}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Verify it's gone
    const row = await getDbAdapter().get('SELECT id FROM swipe_file WHERE id = ?', [id]);
    expect(row).toBeUndefined();
  });

  it('returns 404 for nonexistent entry', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${uuidv4()}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });

  it('cannot delete another users entry', async () => {
    const otherId = uuidv4();
    await getDbAdapter().run(
      `INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna)
       VALUES (?, ?, 'Protected', '[]', '[]', '[]')`,
      [otherId, otherUserId],
    );

    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${otherId}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);

    // Verify it still exists
    const row = await getDbAdapter().get('SELECT id FROM swipe_file WHERE id = ?', [otherId]);
    expect(row).toBeDefined();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${uuidv4()}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates id parameter format', async () => {
    // idParamSchema requires UUID format, so 'some-random-id' fails validation
    const res = await app.inject({
      method: 'DELETE',
      url: '/swipe-file/some-random-id',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });
});
