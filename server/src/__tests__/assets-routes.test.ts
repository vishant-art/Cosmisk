/**
 * Assets Route Tests
 *
 * Tests asset listing and folder listing.
 * External Meta API calls are mocked.
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

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class {
    async get() { return { data: [] }; }
    async getAllPages(path: string) {
      if (path.includes('/ads')) {
        return [
          {
            id: 'ad_101',
            name: 'Product Launch Video',
            creative: { thumbnail_url: 'https://img.test/thumb1.jpg', object_type: 'VIDEO' },
            created_time: '2026-03-15T10:00:00Z',
            campaign: { name: 'Spring Sale' },
          },
          {
            id: 'ad_102',
            name: 'Banner Ad',
            creative: { thumbnail_url: 'https://img.test/thumb2.jpg', object_type: 'IMAGE' },
            created_time: '2026-03-10T08:00:00Z',
            campaign: { name: 'Spring Sale' },
          },
          {
            id: 'ad_103',
            name: 'Summer Promo',
            creative: { thumbnail_url: 'https://img.test/thumb3.jpg', object_type: 'IMAGE' },
            created_time: '2026-03-05T12:00:00Z',
            campaign: { name: 'Summer Campaign' },
          },
        ];
      }
      if (path.includes('/campaigns')) {
        return [
          { id: 'camp_1', name: 'Spring Sale', status: 'ACTIVE' },
          { id: 'camp_2', name: 'Summer Campaign', status: 'PAUSED' },
        ];
      }
      return [];
    }
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { assetRoutes } = await import('../routes/assets.js');

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

  await app.register(assetRoutes, { prefix: '/assets' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass1!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(testUserId, 'Test User', 'test@assets.com', hash, 'user', 'growth');

  // Insert a meta token
  testDb.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)').run(testUserId, 'enc-token', 'mu1', 'Meta User');

  authToken = app.jwt.sign({ id: testUserId, email: 'test@assets.com', name: 'Test User', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

describe('GET /assets/list', () => {
  it('returns asset files for an account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/list?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.files).toBeDefined();
    expect(body.files.length).toBe(3);
  });

  it('returns files sorted by newest first', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/list?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    const dates = body.files.map((f: any) => new Date(f.created_time).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
    expect(dates[1]).toBeGreaterThanOrEqual(dates[2]);
  });

  it('assigns correct file types (video vs image)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/list?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    const videoFile = body.files.find((f: any) => f.id === 'ad_101');
    const imageFile = body.files.find((f: any) => f.id === 'ad_102');
    expect(videoFile.type).toBe('video');
    expect(videoFile.name).toContain('.mp4');
    expect(imageFile.type).toBe('image');
    expect(imageFile.name).toContain('.png');
  });

  it('groups files by campaign folder', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/list?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    const folders = new Set(body.files.map((f: any) => f.folder));
    expect(folders.has('Spring Sale')).toBe(true);
    expect(folders.has('Summer Campaign')).toBe(true);
  });

  it('rejects when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/list',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/list?account_id=act_111' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /assets/folders', () => {
  it('returns folder structure based on campaigns', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/folders?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.folders).toBeDefined();
    expect(body.folders.length).toBeGreaterThan(0);

    // First folder should be "All Files"
    expect(body.folders[0].name).toBe('All Files');
    expect(body.folders[0].count).toBe(3);
  });

  it('includes campaign-based folders with counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/folders?account_id=act_111',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    // Should have "All Files" + campaign folders
    const campaignFolders = body.folders.filter((f: any) => f.name !== 'All Files');
    expect(campaignFolders.length).toBeGreaterThan(0);
    // Spring Sale has 2 ads, Summer Campaign has 1
    const springFolder = campaignFolders.find((f: any) => f.name === 'Spring Sale');
    expect(springFolder).toBeDefined();
    expect(springFolder.count).toBe(2);
  });

  it('rejects when account_id is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/folders',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Assets when Meta not connected', () => {
  it('returns empty files when no meta token exists', async () => {
    // Create a user without a meta token
    const noMetaUserId = uuidv4();
    const hash = bcrypt.hashSync('TestPass1!', 10);
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)').run(noMetaUserId, 'No Meta', 'nometa@test.com', hash, 'user', 'free');
    const noMetaToken = app.jwt.sign({ id: noMetaUserId, email: 'nometa@test.com', name: 'No Meta', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/assets/list?account_id=act_111',
      headers: { authorization: `Bearer ${noMetaToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.files).toEqual([]);
    expect(body.meta_connected).toBe(false);
  });
});
