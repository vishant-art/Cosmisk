/**
 * UGC Routes Tests
 *
 * Tests project CRUD, concept generation, and script generation.
 * Covers both ugc.ts and ugc-workflows.ts routes.
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

vi.mock('../services/format-helpers.js', () => ({
  round: (v: number) => v,
  fmt: (v: number) => `$${v}`,
  setCurrency: () => {},
}));

vi.mock('../services/trend-analyzer.js', () => ({
  computeTrend: () => ({ direction: 'stable', pctChange: 0 }),
  assessConfidence: () => ({ shouldRecommendAction: true }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { ugcRoutes } = await import('../routes/ugc.js');
const { ugcWorkflowRoutes } = await import('../routes/ugc-workflows.js');

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

  await app.register(ugcRoutes, { prefix: '/ugc' });
  await app.register(ugcWorkflowRoutes);
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'UGC Tester', 'ugc@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'ugc@test.com', name: 'UGC Tester', role: 'user' });
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  UGC Projects (ugc.ts)                                              */
/* ------------------------------------------------------------------ */

describe('GET /ugc/projects', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/ugc/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty projects list initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.projects).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  UGC Onboarding & Concept Generation (ugc-workflows.ts)             */
/* ------------------------------------------------------------------ */

describe('POST /ugc-onboarding', () => {
  let projectId: string;

  it('creates a project with auto-generated concepts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-onboarding',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'My UGC Project',
        brand_name: 'TestBrand',
        brief: { product_description: 'Test Product', target_audience: 'Millennials' },
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.project_id).toBeDefined();
    expect(body.concepts_generated).toBeGreaterThan(0);
    projectId = body.project_id;
  });

  it('GET /ugc/projects shows the created project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe('My UGC Project');
    expect(body.projects[0].brand_name).toBe('TestBrand');
    expect(body.projects[0].status).toBe('concepts');
  });

  it('POST /ugc/project-detail returns project with concepts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { project_id: projectId },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.name).toBe('My UGC Project');
    expect(body.concepts.length).toBeGreaterThan(0);
    expect(body.concepts[0].title).toBeDefined();
    expect(body.concepts[0].status).toBe('pending');
  });

  it('POST /ugc/project-detail returns 404 for non-existent project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { project_id: uuidv4() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /ugc/concepts returns concepts for a project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${projectId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.concepts.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Concept Approval & Script Generation                               */
/* ------------------------------------------------------------------ */

describe('Concept approval and script generation workflow', () => {
  let projectId: string;
  let conceptIds: string[];

  beforeAll(async () => {
    // Create a new project with concepts
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-onboarding',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Script Test Project',
        brand_name: 'ScriptBrand',
        brief: { product_description: 'Widget', target_audience: 'GenZ' },
      },
    });
    projectId = res.json().project_id;

    // Get concept IDs
    const detailRes = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { project_id: projectId },
    });
    conceptIds = detailRes.json().concepts.map((c: any) => c.id);
  });

  it('POST /ugc-concept-approval approves concepts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-concept-approval',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        project_id: projectId,
        action: 'pm_approve',
        concept_ids: conceptIds.slice(0, 2),
        notes: 'Looks good',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify status changed in DB
    const concept = testDb.prepare('SELECT status, feedback FROM ugc_concepts WHERE id = ?').get(conceptIds[0]) as any;
    expect(concept.status).toBe('approved');
    expect(concept.feedback).toBe('Looks good');
  });

  it('POST /ugc-concept-approval returns 403 for unauthorized project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-concept-approval',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        project_id: uuidv4(),
        action: 'pm_approve',
        concept_ids: ['fake-id'],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /ugc-phase3 generates scripts for approved concepts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-phase3',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { project_id: projectId },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.scripts_generated).toBe(2); // We approved 2 concepts
  });

  it('GET /ugc/scripts returns generated scripts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.scripts).toHaveLength(2);
    expect(body.scripts[0].content).toBeDefined();
    expect(body.scripts[0].status).toBe('draft');
  });

  it('POST /ugc-script-revision updates script content', async () => {
    const scripts = testDb.prepare('SELECT id FROM ugc_scripts WHERE project_id = ?').all(projectId) as any[];
    const scriptId = scripts[0].id;

    const res = await app.inject({
      method: 'POST',
      url: '/ugc-script-revision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { script_id: scriptId, content: 'Updated script content' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const updated = testDb.prepare('SELECT content, status FROM ugc_scripts WHERE id = ?').get(scriptId) as any;
    expect(updated.content).toBe('Updated script content');
    expect(updated.status).toBe('in_review');
  });

  it('POST /ugc-script-revision returns 403 for unauthorized script', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc-script-revision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { script_id: uuidv4(), content: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });
});
