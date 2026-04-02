/**
 * Content Routes Tests
 *
 * Tests content bank CRUD and platform filtering.
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

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
  },
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/insights-parser.js', () => ({
  parseInsightMetrics: () => ({ spend: 0, revenue: 0, roas: 0, cpa: 0, ctr: 0, impressions: 0, clicks: 0, conversions: 0 }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: '{"content": {}}' }],
      }),
    };
  },
}));

vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { contentRoutes } = await import('../routes/content.js');

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

  await app.register(contentRoutes, { prefix: '/content' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Content Tester', 'content@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'content@test.com', name: 'Content Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Content Bank CRUD                                                   */
/* ------------------------------------------------------------------ */

describe('Content Bank CRUD', () => {
  let contentId: string;

  it('GET /content/bank returns empty list initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('POST /content/save creates a content item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        platform: 'twitter',
        content_type: 'post',
        title: 'Test Tweet',
        body: 'This is a test tweet about performance marketing.',
        hashtags: ['#marketing', '#ads'],
        source: 'manual',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('draft');
    contentId = body.id;
  });

  it('POST /content/save creates a scheduled item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        platform: 'linkedin',
        content_type: 'post',
        body: 'LinkedIn post content',
        scheduled_for: '2026-04-10T10:00:00Z',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('scheduled');
  });

  it('GET /content/bank returns saved items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it('PUT /content/bank/:id updates a content item', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        body: 'Updated tweet content!',
        status: 'posted',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Verify update
    const row = testDb.prepare('SELECT body, status FROM content_bank WHERE id = ?').get(contentId) as any;
    expect(row.body).toBe('Updated tweet content!');
    expect(row.status).toBe('posted');
  });

  it('PUT /content/bank/:id returns 404 for non-existent item', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { body: 'nope' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /content/bank/:id returns 400 when no fields to update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /content/bank/:id removes content item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${contentId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().deleted).toBe(contentId);
  });

  it('DELETE /content/bank/:id returns 404 for already deleted item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${contentId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  Platform Filtering                                                  */
/* ------------------------------------------------------------------ */

describe('Content Bank platform filtering', () => {
  beforeAll(async () => {
    // Seed content for multiple platforms
    const platforms = ['twitter', 'linkedin', 'instagram', 'twitter'];
    for (const platform of platforms) {
      await app.inject({
        method: 'POST',
        url: '/content/save',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { platform, content_type: 'post', body: `${platform} post content` },
      });
    }
  });

  it('filters by platform=twitter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?platform=twitter',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.items.every((i: any) => i.platform === 'twitter')).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by platform=linkedin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?platform=linkedin',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.items.every((i: any) => i.platform === 'linkedin')).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by status=draft', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?status=draft',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.items.every((i: any) => i.status === 'draft')).toBe(true);
  });

  it('supports pagination with limit and offset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?limit=2&offset=0',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThan(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Batch Save                                                          */
/* ------------------------------------------------------------------ */

describe('POST /content/save-batch', () => {
  it('saves multiple content items at once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save-batch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        items: [
          { platform: 'twitter', body: 'Batch tweet 1' },
          { platform: 'linkedin', body: 'Batch linkedin post' },
          { platform: 'instagram', body: 'Batch insta caption' },
        ],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.saved).toBe(3);
    expect(body.ids).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Weekly Stats                                                        */
/* ------------------------------------------------------------------ */

describe('GET /content/weekly-stats', () => {
  it('returns stats structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/weekly-stats',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats.week).toBeDefined();
    expect(body.stats.all_time).toBeDefined();
    expect(body.stats.top_performers).toBeDefined();
  });
});
