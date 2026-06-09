/**
 * DB-2 / M2.1 PILOT — real-Postgres proof for the converted pilot route.
 *
 * Proves src/routes/brands.ts (the first .prepare()->getDbAdapter() conversion)
 * serves correctly through PgAdapter against a REAL migrated Postgres schema
 * (the Neon test branch in TEST_DATABASE_URL), establishing the both-backends
 * pattern for the rest of DB-2.
 *
 * This is the Postgres counterpart of src/__tests__/brands-routes.test.ts
 * (which proves the same route on in-memory SQLite via the SqliteAdapter). Same
 * route, same assertions, different backend.
 *
 * GATING: describe.skipIf(!TEST_DATABASE_URL) — skips cleanly (never fails) when
 * the Neon test branch is absent, so the core suite stays green everywhere.
 *
 * POOL INJECTION (resource-safe on a shared Neon branch):
 *   We inject the test branch's single pool into the route by mocking
 *   getDbAdapter() to return a real PgAdapter over pg.pool (from
 *   getMigratedTestPg). The route, PgAdapter, and dialect shim are all real —
 *   only the pool source is injected. We deliberately do NOT drive the real
 *   getDbAdapter() pg-branch here: that opens src/db/pg.ts's PRODUCTION pool
 *   (max:20), and since several pg-backed test files hit the SAME Neon test
 *   branch and vitest runs files concurrently, those pools exhaust the branch's
 *   connection limit (observed as a beforeAll failure only in the full suite).
 *   One injected pool per file keeps it safe. M2.0.1 made the real pg branch
 *   reachable; the resource constraint — not reachability — is why we inject.
 *   A per-file schema + bounded pool is the M2.7 follow-up.
 *
 * Dynamic import() in beforeAll: vi.doMock must run before the modules it
 * affects are loaded, so the route/adapter graph is imported LATE (statically we
 * import only env-free modules: vitest, Fastify, the pg-test-target helper).
 *
 * Run only this file:
 *   npx vitest run src/db/__tests__/m2_1_pilot_pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getMigratedTestPg, type MigratedTestPg } from './pg-test-target.js';

const PG_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!PG_URL)('M2.1 pilot — GET /brands/list on real Postgres', () => {
  let pg: MigratedTestPg;
  let app: FastifyInstance;
  let authToken: string;
  const testUserId = uuidv4();

  // Mutable Meta API response; the route's MetaApiService is stubbed below.
  let mockMetaAccounts: any[] = [];

  beforeAll(async () => {
    // 1) Migrated schema (prod parity) on the Neon test branch + clean slate.
    pg = await getMigratedTestPg();
    await pg.reset();

    // 3) Seed the minimum rows the route reads:
    //    GET /brands/list selects meta_tokens (by user_id) then users.name.
    //    No INSERT OR REPLACE / transaction / lastInsertRowid here, so the
    //    dialect shim alone is enough (the M2.0 manual-conversion sites are
    //    deliberately avoided for the pilot).
    await pg.pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, plan)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [testUserId, 'Brands Test', 'brands-pg@test.com', 'x', 'user', 'growth'],
    );
    await pg.pool.query(
      `INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name)
         VALUES ($1, $2, $3, $4)`,
      [testUserId, 'encrypted_mock_token', 'meta_u1', 'Meta User'],
    );

    // 4) Stub the external Meta API + token crypto the route calls (same as the
    //    SQLite route test). These are unrelated to the DB backend under test.
    //    NOTE: vi.doMock (not vi.mock) so it is NOT hoisted above the env writes;
    //    it applies to the dynamic import() that follows.
    const { vi } = await import('vitest');
    vi.doMock('../../services/meta-api.js', () => ({
      MetaApiService: class {
        async get() {
          return { data: [] };
        }
        async getAllPages() {
          return mockMetaAccounts;
        }
      },
    }));
    vi.doMock('../../services/token-crypto.js', () => ({
      decryptToken: () => 'mock-decrypted-token',
      encryptToken: (t: string) => t,
    }));

    // 5) Inject the test-branch pool: mock getDbAdapter() to return a real
    //    PgAdapter over pg.pool. importActual provides the real PgAdapter class +
    //    dialect shim; only the pool source is swapped (see header for why we do
    //    not open src/db/pg.ts's production pool here).
    const actualAdapter =
      await vi.importActual<typeof import('../../db/adapter.js')>('../../db/adapter.js');
    const pgAdapter = new actualAdapter.PgAdapter(pg.pool);
    vi.doMock('../../db/adapter.js', () => ({
      ...actualAdapter,
      getDbAdapter: () => pgAdapter,
    }));

    // 6) NOW import the route — it picks up the mocked getDbAdapter() returning
    //    the PgAdapter over the test branch. Route + PgAdapter + dialect shim are
    //    all real; only the pool source is injected.
    const { brandRoutes } = await import('../../routes/brands.js');

    app = Fastify({ logger: false });
    const jwt = await import('@fastify/jwt');
    await app.register(jwt.default, {
      secret: 'test-secret-only',
      sign: { expiresIn: '1h' },
    });
    app.decorate('authenticate', async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ message: 'Unauthorized' });
      }
    });
    await app.register(brandRoutes, { prefix: '/brands' });
    await app.ready();

    authToken = app.jwt.sign({
      id: testUserId,
      email: 'brands-pg@test.com',
      name: 'Brands Test',
      role: 'user',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pg) await pg.teardown();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/brands/list' });
    expect(res.statusCode).toBe(401);
  });

  it('returns brands grouped by business_name — served from Postgres', async () => {
    mockMetaAccounts = [
      { business_name: 'Brand Alpha', account_status: 1 },
      { business_name: 'Brand Alpha', account_status: 1 },
      { business_name: 'Brand Beta', account_status: 2 },
    ];

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toHaveLength(2);

    const alpha = body.brands.find((b: any) => b.brand_name === 'Brand Alpha');
    expect(alpha).toBeDefined();
    expect(alpha.project_count).toBe(2);
    expect(alpha.latest_status).toBe('active');

    const beta = body.brands.find((b: any) => b.brand_name === 'Brand Beta');
    expect(beta).toBeDefined();
    expect(beta.project_count).toBe(1);
    expect(beta.latest_status).toBe('inactive');
  });

  it('uses the users.name fallback when business_name is missing (PG users SELECT)', async () => {
    // Fresh user avoids the route's 5-min in-memory brandsCache from the prior test.
    const freshUserId = uuidv4();
    await pg.pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, plan)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [freshUserId, 'John Smith', 'john-pg@test.com', 'x', 'user', 'growth'],
    );
    await pg.pool.query(
      `INSERT INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name)
         VALUES ($1, $2, $3, $4)`,
      [freshUserId, 'encrypted_mock_token', 'meta_u2', 'Meta User 2'],
    );

    mockMetaAccounts = [
      { business_name: null, account_status: 1 },
      { business_name: '', account_status: 1 },
    ];

    const freshToken = app.jwt.sign({
      id: freshUserId,
      email: 'john-pg@test.com',
      name: 'John Smith',
      role: 'user',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands.length).toBeGreaterThanOrEqual(1);
    const fallbackBrand = body.brands.find((b: any) => b.brand_name === 'John Smith');
    expect(fallbackBrand).toBeDefined();
  });

  it('returns empty brands array when the user has no Meta token (PG miss)', async () => {
    mockMetaAccounts = [];
    const otherUserId = uuidv4();
    await pg.pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, plan)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [otherUserId, 'Other User', 'other-pg@test.com', 'x', 'user', 'growth'],
    );
    const otherToken = app.jwt.sign({
      id: otherUserId,
      email: 'other-pg@test.com',
      name: 'Other User',
      role: 'user',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/brands/list',
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.brands).toEqual([]);
  });
});
