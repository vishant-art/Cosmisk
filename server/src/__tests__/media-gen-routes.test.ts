/**
 * Media Generation Route Tests
 *
 * Integration tests for /media endpoints.
 * Tests image generation, video generation, video status polling,
 * validation, and service unavailability handling.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('../services/api-providers.js', () => ({
  generateImage: async () => ({ url: 'https://img.com/generated.jpg' }),
  generateVideo: async () => ({ id: 'job_123' }),
}));

vi.mock('../services/job-queue.js', () => ({
  addJob: async () => 'job_123',
  getJob: async () => ({ id: 'job_123', status: 'completed' }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {},
}));

// Mock global fetch for NanoBanana and n8n calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { mediaGenRoutes } = await import('../routes/media-gen.js');

let app: FastifyInstance;
let userId: string;
let userToken: string;

async function buildApp() {
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

  await app.register(mediaGenRoutes, { prefix: '/media' });
  await app.ready();

  const hash = bcrypt.hashSync('SecurePass123!', 10);

  userId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'Test User', 'test@test.com', hash, 'user', 'growth');
  userToken = app.jwt.sign({ id: userId, email: 'test@test.com', name: 'Test User', role: 'user' });
}

beforeAll(async () => { await buildApp(); });
afterAll(async () => { await app.close(); testDb.close(); });
beforeEach(() => { mockFetch.mockReset(); });

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

describe('Media Gen Routes — Auth', () => {
  it('rejects unauthenticated requests', async () => {
    const endpoints = [
      { method: 'POST' as const, url: '/media/generate-image' },
      { method: 'POST' as const, url: '/media/generate-video' },
      { method: 'GET' as const, url: '/media/video-status?generation_id=123' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      expect(res.statusCode).toBe(401);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  POST /media/generate-image                                         */
/* ------------------------------------------------------------------ */

describe('POST /media/generate-image', () => {
  it('returns 503 when NANO_BANANA_API_KEY not configured', async () => {
    // The config reads env at import time. If it's empty, route returns 503.
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: 'A beautiful sunset over the ocean' },
    });
    // Since NANO_BANANA_API_KEY is not in test env, expect 503
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toContain('not configured');
  });

  it('rejects empty prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing prompt field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects prompt exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: 'x'.repeat(2001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates optional reference_image_url is a valid URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: 'A sunset', reference_image_url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts valid optional fields', async () => {
    // Will still return 503 because API key not configured, but validates payload first
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        prompt: 'A sunset',
        style: 'watercolor',
        aspect_ratio: '16:9',
        reference_image_url: 'https://example.com/ref.jpg',
      },
    });
    // 503 means validation passed but service unavailable
    expect(res.statusCode).toBe(503);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /media/generate-video                                         */
/* ------------------------------------------------------------------ */

describe('POST /media/generate-video', () => {
  it('returns 503 when N8N_VIDEO_WEBHOOK not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { script: 'Hey everyone, check out this new product.' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toContain('not configured');
  });

  it('rejects empty script', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { script: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing script field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects script exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { script: 'x'.repeat(5001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts valid optional fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        script: 'A great product video',
        duration: 30,
        aspect_ratio: '9:16',
        avatar: 'sophia',
      },
    });
    // 503 because webhook not configured, but validates first
    expect(res.statusCode).toBe(503);
  });

  it('rejects duration below minimum', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { script: 'Hello world', duration: 2 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects duration above maximum', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { script: 'Hello world', duration: 999 },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /media/video-status                                            */
/* ------------------------------------------------------------------ */

describe('GET /media/video-status', () => {
  it('returns 400 when generation_id missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('generation_id');
  });

  it('returns 503 when N8N_VIDEO_WEBHOOK not configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status?generation_id=gen_123',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(503);
  });
});
