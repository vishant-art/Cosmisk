/**
 * Media Generation Route Tests
 *
 * Tests image generation, video generation, and video status polling.
 * External API calls (Nano Banana, n8n) are mocked via global fetch.
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

vi.mock('../config.js', () => ({
  config: {
    nanoBananaApiKey: 'test-nano-banana-key',
    n8nVideoWebhook: 'https://n8n.test/webhook/video',
    anthropicApiKey: 'test-key',
  },
}));

vi.mock('../utils/safe-fetch.js', () => ({
  safeJson: async (resp: any) => {
    if (typeof resp.json === 'function') return resp.json();
    return resp;
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

// Mock global fetch for Nano Banana and n8n
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { mediaGenRoutes } = await import('../routes/media-gen.js');

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
  await app.register(jwt.default, { secret: 'test-secret', sign: { expiresIn: '1h' } });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(mediaGenRoutes, { prefix: '/media' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@media.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@media.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('POST /media/generate-image', () => {
  it('generates an image and returns URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ image_url: 'https://cdn.test/image.png', id: 'gen_123' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { prompt: 'A beautiful sunset over mountains' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.image_url).toBe('https://cdn.test/image.png');
    expect(body.generation_id).toBe('gen_123');
  });

  it('accepts style and aspect_ratio parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ image_url: 'https://cdn.test/styled.png', id: 'gen_456' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { prompt: 'Product shot', style: 'minimalist', aspect_ratio: '16:9' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects missing prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 when image API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'API error',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { prompt: 'test image' },
    });
    expect(res.statusCode).toBe(502);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-image',
      payload: { prompt: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /media/generate-video', () => {
  it('initiates video generation and returns processing status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ id: 'vid_job_789', status: 'processing' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { script: 'Hello, welcome to our product showcase.' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('processing');
    expect(body.generation_id).toBe('vid_job_789');
  });

  it('returns completed video when webhook returns URL immediately', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ video_url: 'https://cdn.test/video.mp4', id: 'vid_done' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { script: 'Quick video script' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
    expect(body.video_url).toBe('https://cdn.test/video.mp4');
  });

  it('rejects missing script', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 when video API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/media/generate-video',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { script: 'test script' },
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('GET /media/video-status', () => {
  it('polls video generation status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'completed', video_url: 'https://cdn.test/done.mp4', progress: 100 }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status?generation_id=vid_job_789',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
    expect(body.video_url).toBe('https://cdn.test/done.mp4');
  });

  it('returns processing status when not yet done', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'processing', progress: 50 }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status?generation_id=vid_job_789',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('processing');
    expect(body.progress).toBe(50);
  });

  it('rejects missing generation_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 when status API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Error',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/media/video-status?generation_id=vid_fail',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(502);
  });
});
