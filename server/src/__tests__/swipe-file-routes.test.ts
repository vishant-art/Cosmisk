/**
 * Swipe File Routes Tests
 *
 * Tests swipe item CRUD and DNA tagging.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { swipeFileRoutes } = await import('../routes/swipe-file.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

beforeAll(async () => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, { secret: 'test-secret-only', sign: { expiresIn: '1h' } });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(swipeFileRoutes, { prefix: '/swipe-file' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Swipe Tester', 'swipe@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'swipe@test.com', name: 'Swipe Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Swipe File CRUD                                                     */
/* ------------------------------------------------------------------ */

describe('Swipe File CRUD', () => {
  let entryId: string;

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/swipe-file/list' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /swipe-file/list returns empty array initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.items).toEqual([]);
  });

  it('POST /swipe-file/save saves an item with DNA tags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        brand: 'Nike India',
        hookDna: ['urgency', 'fomo', 'social-proof'],
        visualDna: ['product-shot', 'lifestyle'],
        audioDna: ['upbeat', 'voiceover'],
        notes: 'Great FOMO hook with product launch angle',
        sourceUrl: 'https://example.com/ad/123',
        sourceAdId: 'ad_123456',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    entryId = body.id;
  });

  it('GET /swipe-file/list returns saved entry with correct DNA tags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(item.brand).toBe('Nike India');
    expect(item.hookDna).toEqual(['urgency', 'fomo', 'social-proof']);
    expect(item.visualDna).toEqual(['product-shot', 'lifestyle']);
    expect(item.audioDna).toEqual(['upbeat', 'voiceover']);
    expect(item.notes).toBe('Great FOMO hook with product launch angle');
    expect(item.sourceUrl).toBe('https://example.com/ad/123');
    expect(item.sourceAdId).toBe('ad_123456');
    expect(item.savedAt).toBeDefined();
  });

  it('POST /swipe-file/save saves a second entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        brand: 'Adidas',
        hookDna: ['curiosity'],
        visualDna: ['animation'],
        audioDna: ['music-only'],
        notes: 'Clean animation style',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('GET /swipe-file/list returns multiple entries ordered by recency', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.items).toHaveLength(2);
    // Most recent first
    expect(body.items[0].brand).toBe('Adidas');
    expect(body.items[1].brand).toBe('Nike India');
  });

  it('DELETE /swipe-file/:id removes an entry', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${entryId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify deletion
    const listRes = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(listRes.json().items).toHaveLength(1);
    expect(listRes.json().items[0].brand).toBe('Adidas');
  });

  it('DELETE /swipe-file/:id returns 404 for non-existent item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /swipe-file/:id returns 404 for already deleted item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/swipe-file/${entryId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  DNA Tag Validation                                                  */
/* ------------------------------------------------------------------ */

describe('DNA tagging edge cases', () => {
  it('saves entry with empty DNA arrays', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        brand: 'Generic Brand',
        hookDna: [],
        visualDna: [],
        audioDna: [],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const listRes = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const item = listRes.json().items.find((i: any) => i.brand === 'Generic Brand');
    expect(item.hookDna).toEqual([]);
    expect(item.visualDna).toEqual([]);
    expect(item.audioDna).toEqual([]);
  });

  it('saves entry with minimal data (just brand)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/swipe-file/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        brand: 'Minimal Brand',
        hookDna: ['test'],
        visualDna: ['test'],
        audioDna: ['test'],
      },
    });
    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: '/swipe-file/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const item = listRes.json().items.find((i: any) => i.brand === 'Minimal Brand');
    expect(item).toBeDefined();
    expect(item.notes).toBe('');
    expect(item.sourceUrl).toBe('');
  });
});
