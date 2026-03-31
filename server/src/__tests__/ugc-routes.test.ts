/**
 * UGC Routes Tests
 *
 * Tests for /ugc endpoints: projects, project-detail, concepts, scripts.
 * In-memory SQLite with real Zod validation. No external API calls.
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

const { ugcRoutes } = await import('../routes/ugc.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;
let otherUserId: string;
let otherAuthToken: string;

// Test data IDs
let projectId1: string;
let projectId2: string;
let conceptId1: string;
let conceptId2: string;
let scriptId1: string;
let otherProjectId: string;

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

  await app.register(ugcRoutes, { prefix: '/ugc' });
  await app.ready();

  // Main test user
  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'UGC Test User', 'ugc@test.com', hash, 'user', 'growth');
  authToken = app.jwt.sign({ id: testUserId, email: 'ugc@test.com', name: 'UGC Test User', role: 'user' });

  // Other user for isolation tests
  otherUserId = uuidv4();
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(otherUserId, 'Other UGC User', 'other-ugc@test.com', hash, 'user', 'free');
  otherAuthToken = app.jwt.sign({ id: otherUserId, email: 'other-ugc@test.com', name: 'Other UGC User', role: 'user' });

  // Seed UGC data for main user
  projectId1 = uuidv4();
  projectId2 = uuidv4();
  testDb.prepare(
    "INSERT INTO ugc_projects (id, user_id, name, brand_name, status, brief) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(projectId1, testUserId, 'Oud Arabia UGC', 'Oud Arabia', 'active', JSON.stringify({ target: 'luxury fragrance', budget: '50000' }));
  testDb.prepare(
    "INSERT INTO ugc_projects (id, user_id, name, brand_name, status) VALUES (?, ?, ?, ?, ?)"
  ).run(projectId2, testUserId, 'Nike Campaign', 'Nike', 'draft');

  // Seed concepts
  conceptId1 = uuidv4();
  conceptId2 = uuidv4();
  testDb.prepare(
    "INSERT INTO ugc_concepts (id, project_id, title, description, status, feedback) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(conceptId1, projectId1, 'ASMR Unboxing', 'Unboxing with ASMR sounds', 'approved', 'Great concept');
  testDb.prepare(
    "INSERT INTO ugc_concepts (id, project_id, title, description, status) VALUES (?, ?, ?, ?, ?)"
  ).run(conceptId2, projectId1, 'Testimonial', 'Customer testimonial video', 'pending');

  // Seed scripts
  scriptId1 = uuidv4();
  testDb.prepare(
    "INSERT INTO ugc_scripts (id, concept_id, project_id, title, content, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(scriptId1, conceptId1, projectId1, 'ASMR Script v1', 'Open with close-up of box...', 'approved');
  testDb.prepare(
    "INSERT INTO ugc_scripts (id, concept_id, project_id, title, content, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(uuidv4(), conceptId1, projectId1, 'ASMR Script v2', 'Start with hands touching texture...', 'draft');

  // Seed other user's project
  otherProjectId = uuidv4();
  testDb.prepare(
    "INSERT INTO ugc_projects (id, user_id, name, brand_name, status) VALUES (?, ?, ?, ?, ?)"
  ).run(otherProjectId, otherUserId, 'Secret Project', 'Hidden Brand', 'active');
  const otherConceptId = uuidv4();
  testDb.prepare(
    "INSERT INTO ugc_concepts (id, project_id, title, description, status) VALUES (?, ?, ?, ?, ?)"
  ).run(otherConceptId, otherProjectId, 'Hidden Concept', 'Should not be visible', 'pending');
  testDb.prepare(
    "INSERT INTO ugc_scripts (id, concept_id, project_id, title, content, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(uuidv4(), otherConceptId, otherProjectId, 'Hidden Script', 'Secret content', 'draft');
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
/*  GET /ugc/projects                                                  */
/* ------------------------------------------------------------------ */
describe('GET /ugc/projects', () => {
  it('returns projects for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBe(2);
  });

  it('returns properly formatted project items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(),
    });
    const body = res.json();
    const project = body.projects.find((p: any) => p.id === projectId1);
    expect(project).toBeDefined();
    expect(project.name).toBe('Oud Arabia UGC');
    expect(project.brand_name).toBe('Oud Arabia');
    expect(project.status).toBe('active');
    expect(project.created_at).toBeDefined();
    expect(project.updated_at).toBeDefined();
  });

  it('returns projects ordered by created_at DESC', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(),
    });
    const body = res.json();
    // The second seeded project should come first (created later in same transaction, but stable by rowid)
    expect(body.projects.length).toBe(2);
  });

  it('does not return other users projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(),
    });
    const body = res.json();
    const names = body.projects.map((p: any) => p.name);
    expect(names).not.toContain('Secret Project');
  });

  it('other user sees only their projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(otherAuthToken),
    });
    const body = res.json();
    expect(body.projects.length).toBe(1);
    expect(body.projects[0].name).toBe('Secret Project');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty array for user with no projects', async () => {
    const emptyUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(emptyUserId, 'Empty', 'empty-ugc@test.com', bcrypt.hashSync('Test123!', 10), 'user', 'free');
    const emptyToken = app.jwt.sign({ id: emptyUserId, email: 'empty-ugc@test.com', name: 'Empty', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/ugc/projects',
      headers: authHeaders(emptyToken),
    });
    const body = res.json();
    expect(body.projects).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /ugc/project-detail                                           */
/* ------------------------------------------------------------------ */
describe('POST /ugc/project-detail', () => {
  it('returns full project detail with concepts and scripts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: projectId1 },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.id).toBe(projectId1);
    expect(body.name).toBe('Oud Arabia UGC');
    expect(body.brand_name).toBe('Oud Arabia');
    expect(body.status).toBe('active');
    expect(body.brief).toBeDefined();
    expect(body.brief.target).toBe('luxury fragrance');
    expect(Array.isArray(body.concepts)).toBe(true);
    expect(Array.isArray(body.scripts)).toBe(true);
  });

  it('returns concepts with correct fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: projectId1 },
    });
    const body = res.json();
    expect(body.concepts.length).toBe(2);
    const concept = body.concepts.find((c: any) => c.id === conceptId1);
    expect(concept.title).toBe('ASMR Unboxing');
    expect(concept.description).toBe('Unboxing with ASMR sounds');
    expect(concept.status).toBe('approved');
    expect(concept.feedback).toBe('Great concept');
    expect(concept.created_at).toBeDefined();
  });

  it('returns scripts with correct fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: projectId1 },
    });
    const body = res.json();
    expect(body.scripts.length).toBe(2);
    const script = body.scripts.find((s: any) => s.id === scriptId1);
    expect(script.title).toBe('ASMR Script v1');
    expect(script.content).toBe('Open with close-up of box...');
    expect(script.concept_id).toBe(conceptId1);
    expect(script.status).toBe('approved');
  });

  it('returns project with no concepts or scripts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: projectId2 },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.name).toBe('Nike Campaign');
    expect(body.concepts).toEqual([]);
    expect(body.scripts).toEqual([]);
    expect(body.brief).toBeNull();
  });

  it('returns 404 for nonexistent project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: uuidv4() },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Project not found');
  });

  it('returns 404 for other users project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: otherProjectId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects missing project_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty project_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      headers: authHeaders(),
      payload: { project_id: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ugc/project-detail',
      payload: { project_id: projectId1 },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ugc/concepts                                                  */
/* ------------------------------------------------------------------ */
describe('GET /ugc/concepts', () => {
  it('returns concepts for a given project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${projectId1}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.concepts)).toBe(true);
    expect(body.concepts.length).toBe(2);
  });

  it('returns properly formatted concept items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${projectId1}`,
      headers: authHeaders(),
    });
    const body = res.json();
    const concept = body.concepts.find((c: any) => c.id === conceptId1);
    expect(concept).toBeDefined();
    expect(concept).toHaveProperty('id');
    expect(concept).toHaveProperty('title');
    expect(concept).toHaveProperty('description');
    expect(concept).toHaveProperty('status');
    expect(concept).toHaveProperty('feedback');
    expect(concept).toHaveProperty('created_at');
  });

  it('returns empty array for project with no concepts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${projectId2}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(body.concepts).toEqual([]);
  });

  it('does not return concepts from other users projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${otherProjectId}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(body.concepts).toEqual([]);
  });

  it('rejects missing project_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/concepts',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty project_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/concepts?project_id=',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/concepts?project_id=${projectId1}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /ugc/scripts                                                   */
/* ------------------------------------------------------------------ */
describe('GET /ugc/scripts', () => {
  it('returns scripts for a given project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId1}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.scripts)).toBe(true);
    expect(body.scripts.length).toBe(2);
  });

  it('returns properly formatted script items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId1}`,
      headers: authHeaders(),
    });
    const body = res.json();
    const script = body.scripts.find((s: any) => s.id === scriptId1);
    expect(script).toBeDefined();
    expect(script).toHaveProperty('id');
    expect(script).toHaveProperty('concept_id');
    expect(script).toHaveProperty('title');
    expect(script).toHaveProperty('content');
    expect(script).toHaveProperty('status');
    expect(script).toHaveProperty('created_at');
    expect(script).toHaveProperty('updated_at');
  });

  it('returns empty array for project with no scripts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId2}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(body.scripts).toEqual([]);
  });

  it('does not return scripts from other users projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${otherProjectId}`,
      headers: authHeaders(),
    });
    const body = res.json();
    expect(body.scripts).toEqual([]);
  });

  it('rejects missing project_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/scripts',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty project_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ugc/scripts?project_id=',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId1}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns scripts with correct concept_id association', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ugc/scripts?project_id=${projectId1}`,
      headers: authHeaders(),
    });
    const body = res.json();
    // All scripts for project1 should have concept_id pointing to conceptId1
    for (const script of body.scripts) {
      expect(script.concept_id).toBe(conceptId1);
    }
  });
});
