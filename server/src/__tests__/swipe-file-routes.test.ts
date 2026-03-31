/**
 * Swipe File Routes Tests
 *
 * Tests for /swipe-file endpoints: list, save, delete.
 * Covers CRUD, validation, auth, user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
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

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let otherUserId: string;
let otherAuthToken: string;

async function buildApp() {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

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

  // Main test user
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Swipe Test User', 'swipe@test.com', hash, 'user', 'growth');
  authToken = app.jwt.sign({ id: testUserId, email: 'swipe@test.com', name: 'Swipe Test User', role: 'user' });

  // Second user for isolation tests
  otherUserId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(otherUserId, 'Other User', 'other-swipe@test.com', hash, 'user', 'free');
  otherAuthToken = app.jwt.sign({ id: otherUserId, email: 'other-swipe@test.com', name: 'Other User', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
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
  beforeAll(() => {
    // Seed entries for main user
    for (let i = 0; i < 3; i++) {
      testDb.prepare(`
        INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna, notes)
        VALUES (?, ?, ?, '["hook-tag"]', '["visual-tag"]', '["audio-tag"]', ?)
      `).run(uuidv4(), testUserId, `Brand ${i}`, `Note ${i}`);
    }
    // Seed entry for other user
    testDb.prepare(`
      INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna, notes)
      VALUES (?, ?, 'Other Brand', '[]', '[]', '[]', 'should not appear')
    `).run(uuidv4(), otherUserId);
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
    // Should have at least 3 (seeded above) plus any from save tests
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
    testDb.prepare(`
      INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna)
      VALUES (?, ?, 'ToDelete', '[]', '[]', '[]')
    `).run(id, testUserId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${id}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Verify it's gone
    const row = testDb.prepare('SELECT id FROM swipe_file WHERE id = ?').get(id);
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
    testDb.prepare(`
      INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna)
      VALUES (?, ?, 'Protected', '[]', '[]', '[]')
    `).run(otherId, otherUserId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${otherId}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);

    // Verify it still exists
    const row = testDb.prepare('SELECT id FROM swipe_file WHERE id = ?').get(otherId);
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
    // The idParamSchema just requires a string, so any non-empty string should pass validation
    // but should return 404 since no matching row
    const res = await app.inject({
      method: 'DELETE',
      url: '/swipe-file/some-random-id',
      headers: authHeaders(),
    });
    // idParamSchema requires UUID format, so 'some-random-id' fails validation
    expect(res.statusCode).toBe(400);
  });
});
