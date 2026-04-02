/**
 * Score Route Tests
 *
 * Tests creative scoring and batch analysis.
 * Uses Fastify inject. Claude AI is mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';
import bcrypt from 'bcryptjs';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const mockScoreResponse = {
  score: 72,
  grade: 'B',
  summary: 'Strong hook with room for visual improvement',
  dna: {
    hook: { types: ['Curiosity'], score: 80, analysis: 'Good hook' },
    visual: { styles: ['UGC Style'], score: 65, analysis: 'Average visuals' },
    audio: { styles: ['Music-Only'], score: 70, analysis: 'Decent audio' },
  },
  strengths: ['Strong hook', 'Good pacing'],
  improvements: [
    { priority: 1, area: 'visual', current: 'Low quality', suggested: 'Better lighting', expected_impact: '+15% CTR' },
    { priority: 2, area: 'hook', current: 'Slow start', suggested: 'Faster pacing', expected_impact: '+10% CTR' },
    { priority: 3, area: 'audio', current: 'Generic', suggested: 'Trending audio', expected_impact: '+5% engagement' },
  ],
  competitor_context: 'Above average for the industry',
  remake_suggestions: ['Try UGC approach', 'Test before/after format'],
};

const mockBatchResponse = {
  results: [
    { index: 0, score: 72, grade: 'B', one_line_summary: 'Strong', top_strength: 'Hook', top_improvement: 'Visuals', dna_hook: 'Curiosity', dna_visual: 'UGC' },
  ],
  ranking: [{ index: 0, reason: 'Best overall' }],
  overall_insight: 'Test insight',
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        const isSystem = typeof params.system === 'string';
        const isBatch = isSystem && params.system.includes('multiple');
        return {
          content: [{ type: 'text', text: JSON.stringify(isBatch ? mockBatchResponse : mockScoreResponse) }],
        };
      },
    };
  },
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: (response: any) => response.content[0].text,
}));

vi.mock('../config.js', () => ({
  config: { anthropicApiKey: 'test-key' },
}));

const { scoreRoutes } = await import('../routes/score.js');

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

  await app.register(scoreRoutes, { prefix: '/score' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@test.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('POST /score/analyze', () => {
  it('analyzes a creative by URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/analyze',
      payload: {
        url: 'https://example.com/ad.mp4',
        format: 'video',
        industry: 'ecommerce',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.analysis).toBeDefined();
    expect(body.analysis.score).toBe(72);
    expect(body.analysis.grade).toBe('B');
    expect(body.analysis.dna).toBeDefined();
    expect(body.analysis.improvements).toHaveLength(3);
    expect(body.meta).toBeDefined();
    expect(body.meta.analyzed_at).toBeDefined();
  });

  it('analyzes a creative by description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/analyze',
      payload: {
        description: 'A video ad showing a woman using a skincare product with before/after shots',
        format: 'video',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().analysis.score).toBe(72);
  });

  it('rejects when neither URL nor description provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/analyze',
      payload: { format: 'video' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('URL or a description');
  });

  it('does not require authentication (public endpoint)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/analyze',
      payload: { description: 'An ad', format: 'image' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /score/batch', () => {
  it('analyzes multiple creatives', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/batch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        creatives: [
          { description: 'First ad', format: 'video' },
          { url: 'https://example.com/ad2.jpg', format: 'image' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.results).toBeDefined();
    expect(body.ranking).toBeDefined();
    expect(body.overall_insight).toBeDefined();
  });

  it('rejects more than 5 creatives', async () => {
    const creatives = Array.from({ length: 6 }, (_, i) => ({ description: `Ad ${i}` }));
    const res = await app.inject({
      method: 'POST',
      url: '/score/batch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { creatives },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty creatives array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/batch',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { creatives: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/score/batch',
      payload: { creatives: [{ description: 'test' }] },
    });
    expect(res.statusCode).toBe(401);
  });
});
