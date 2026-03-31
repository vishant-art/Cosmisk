/**
 * Content Routes Tests
 *
 * Tests for /content endpoints: weekly-stats, save, save-batch, bank CRUD, generate.
 * External APIs (Claude, Meta) are mocked. In-memory SQLite with real Zod validation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';

let testDb: Database.Database;

// Mock DB
vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Mock external services
vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
  },
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

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          content: {
            twitter: { thread: ['tweet 1'], single_tweets: ['standalone'] },
            linkedin: { post: 'linkedin post' },
            instagram: { caption: 'ig caption', reel_idea: 'reel' },
          },
          hashtags: { twitter: ['#test'], linkedin: ['#test'], instagram: ['#test'] },
          best_posting_times: { twitter: '9am', linkedin: '10am', instagram: '11am' },
        }) }],
      }),
    };
  },
}));

const { contentRoutes } = await import('../routes/content.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

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

  await app.register(contentRoutes, { prefix: '/content' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Content Test User', 'content@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'content@test.com', name: 'Content Test User', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

/* ------------------------------------------------------------------ */
/*  GET /content/weekly-stats                                          */
/* ------------------------------------------------------------------ */
describe('GET /content/weekly-stats', () => {
  it('returns stats for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/weekly-stats',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats.week).toBeDefined();
    expect(body.stats.all_time).toBeDefined();
    expect(body.stats.top_performers).toBeDefined();
    expect(typeof body.stats.week.sprints).toBe('number');
    expect(typeof body.stats.all_time.total_sprints).toBe('number');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/weekly-stats',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns zero stats for user with no data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/weekly-stats',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(body.stats.week.sprints).toBe(0);
    expect(body.stats.week.creatives_generated).toBe(0);
    expect(body.stats.all_time.total_sprints).toBe(0);
    expect(body.stats.top_performers).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /content/save                                                 */
/* ------------------------------------------------------------------ */
describe('POST /content/save', () => {
  it('saves content to bank', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: authHeaders(),
      payload: {
        platform: 'twitter',
        content_type: 'post',
        title: 'Test Tweet',
        body: 'This is a test tweet about performance marketing.',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('draft');
  });

  it('saves content with scheduled status when scheduled_for provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: authHeaders(),
      payload: {
        platform: 'linkedin',
        content_type: 'post',
        body: 'Scheduled linkedin post',
        scheduled_for: '2026-04-01T10:00:00Z',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe('scheduled');
  });

  it('saves content with hashtags and media_notes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: authHeaders(),
      payload: {
        platform: 'instagram',
        content_type: 'post',
        body: 'Check out our latest campaign results!',
        hashtags: ['#marketing', '#adtech'],
        media_notes: 'Use carousel with 3 slides',
        source: 'ai',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects missing platform', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: authHeaders(),
      payload: {
        body: 'No platform provided',
        content_type: 'post',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      headers: authHeaders(),
      payload: {
        platform: 'twitter',
        content_type: 'post',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save',
      payload: { platform: 'twitter', content_type: 'post', body: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /content/save-batch                                           */
/* ------------------------------------------------------------------ */
describe('POST /content/save-batch', () => {
  it('saves multiple items in one request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save-batch',
      headers: authHeaders(),
      payload: {
        items: [
          { platform: 'twitter', body: 'Batch tweet 1' },
          { platform: 'linkedin', body: 'Batch linkedin post', title: 'Post Title' },
          { platform: 'instagram', body: 'Batch ig caption', media_notes: 'Use vertical video' },
        ],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.saved).toBe(3);
    expect(body.ids).toHaveLength(3);
  });

  it('rejects empty items array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save-batch',
      headers: authHeaders(),
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects items without body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save-batch',
      headers: authHeaders(),
      payload: {
        items: [{ platform: 'twitter' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects items without platform', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/save-batch',
      headers: authHeaders(),
      payload: {
        items: [{ body: 'missing platform field' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /content/bank                                                  */
/* ------------------------------------------------------------------ */
describe('GET /content/bank', () => {
  let savedContentId: string;

  beforeAll(async () => {
    // Seed some content bank items
    const platforms = ['twitter', 'linkedin', 'instagram'];
    for (let i = 0; i < 5; i++) {
      const id = uuidv4();
      if (i === 0) savedContentId = id;
      testDb.prepare(`
        INSERT INTO content_bank (id, user_id, platform, content_type, title, body, status, source)
        VALUES (?, ?, ?, 'post', ?, ?, ?, 'manual')
      `).run(id, testUserId, platforms[i % 3], `Post ${i}`, `Body of post ${i}`, i === 0 ? 'scheduled' : 'draft');
    }
  });

  it('returns all content bank items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('filters by platform', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?platform=twitter',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    for (const item of body.items) {
      expect(item.platform).toBe('twitter');
    }
  });

  it('filters by status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?status=scheduled',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    for (const item of body.items) {
      expect(item.status).toBe('scheduled');
    }
  });

  it('supports pagination with limit and offset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?limit=2&offset=0',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(5);
  });

  it('rejects invalid status value', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank?status=invalid_status',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/bank',
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not return other users content', async () => {
    const otherUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(otherUserId, 'Other', 'other-content@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'free');
    testDb.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, body, status)
      VALUES (?, ?, 'twitter', 'post', 'Other users content', 'draft')
    `).run(uuidv4(), otherUserId);

    const res = await app.inject({
      method: 'GET',
      url: '/content/bank',
      headers: authHeaders(),
    });
    const body = res.json();
    for (const item of body.items) {
      expect(item.body).not.toBe('Other users content');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PUT /content/bank/:id                                              */
/* ------------------------------------------------------------------ */
describe('PUT /content/bank/:id', () => {
  let contentId: string;

  beforeAll(() => {
    contentId = uuidv4();
    testDb.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, body, status)
      VALUES (?, ?, 'twitter', 'post', 'Original body', 'draft')
    `).run(contentId, testUserId);
  });

  it('updates content body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: authHeaders(),
      payload: { body: 'Updated body text' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBe(contentId);
  });

  it('updates content status', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: authHeaders(),
      payload: { status: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('updates multiple fields at once', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: authHeaders(),
      payload: {
        title: 'New Title',
        body: 'Newer body',
        status: 'draft',
        media_notes: 'Updated notes',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when no fields to update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${contentId}`,
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent content', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${uuidv4()}`,
      headers: authHeaders(),
      payload: { body: 'does not matter' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('does not allow updating another users content', async () => {
    const otherUserId = uuidv4();
    const otherId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(otherUserId, 'Other2', 'other2-content@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'free');
    testDb.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, body, status)
      VALUES (?, ?, 'twitter', 'post', 'Other body', 'draft')
    `).run(otherId, otherUserId);

    const res = await app.inject({
      method: 'PUT',
      url: `/content/bank/${otherId}`,
      headers: authHeaders(),
      payload: { body: 'hacked' },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /content/bank/:id                                           */
/* ------------------------------------------------------------------ */
describe('DELETE /content/bank/:id', () => {
  it('deletes content item', async () => {
    const id = uuidv4();
    testDb.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, body, status)
      VALUES (?, ?, 'twitter', 'post', 'To be deleted', 'draft')
    `).run(id, testUserId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${id}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(id);
  });

  it('returns 404 for nonexistent content', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${uuidv4()}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('cannot delete another users content', async () => {
    const otherUserId = uuidv4();
    const otherId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(otherUserId, 'Other3', 'other3-content@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'free');
    testDb.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, body, status)
      VALUES (?, ?, 'twitter', 'post', 'Protected body', 'draft')
    `).run(otherId, otherUserId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${otherId}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/content/bank/${uuidv4()}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /content/generate                                             */
/* ------------------------------------------------------------------ */
describe('POST /content/generate', () => {
  it('generates content with default platforms', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/generate',
      headers: authHeaders(),
      payload: {},
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.content).toBeDefined();
  });

  it('generates content with specific platforms and tone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/generate',
      headers: authHeaders(),
      payload: {
        platforms: ['twitter', 'linkedin'],
        tone: 'technical',
        topic: 'ROAS optimization',
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('accepts transcript field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/generate',
      headers: authHeaders(),
      payload: {
        transcript: 'This is a transcript of my screen recording showing ad performance...',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/generate',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /content/trigger-weekly                                       */
/* ------------------------------------------------------------------ */
describe('POST /content/trigger-weekly', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/trigger-weekly',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});
