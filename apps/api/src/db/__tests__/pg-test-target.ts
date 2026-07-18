/**
 * Postgres test target — a migrated, isolated Postgres schema for DB-2 / M2.0.
 *
 * WHAT THIS IS
 * ------------
 * A reusable helper that hands pg-backend tests a freshly *migrated* Postgres
 * schema (schema == migrated prod schema, NOT the legacy SQLite `createTables`
 * DDL) on an isolated Neon test branch. It is strictly OPT-IN: only tests that
 * import it touch Postgres. The default (mocked) suite is unaffected.
 *
 * It NEVER connects to the production `DATABASE_URL`. It reads a separate
 * `TEST_DATABASE_URL` (a Neon test-branch connection string). When that env var
 * is unset, `hasPgTestTarget()` returns false and pg tests must SKIP — they must
 * not fail. `getMigratedTestPg()` throws an actionable error if called without it.
 *
 * HOW TO PROVISION THE NEON TEST BRANCH + SET TEST_DATABASE_URL
 * ------------------------------------------------------------
 * There is no Neon test branch wired into this environment yet. To enable the
 * pg-backed tests:
 *   1. In the Neon console (or `neonctl branches create --name test`), create a
 *      branch off the production branch of the Cosmisk Neon project. A branch is
 *      a copy-on-write clone, so it is cheap and fully isolated from prod data.
 *   2. Copy that branch's *direct* (non-pooled) connection string. Use the
 *      direct endpoint, not the PgBouncer/pooled one, because the Drizzle
 *      migrator runs DDL and benefits from a stable single session. Keep
 *      `?sslmode=require` in the string.
 *   3. Export it as `TEST_DATABASE_URL` for the test run, e.g.
 *        TEST_DATABASE_URL='postgresql://USER:PASS@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require' \
 *          npx vitest run src/db/__tests__/pg-test-target.test.ts
 *      (or put it in an untracked `.env.test` your runner loads). Never point it
 *      at the production `DATABASE_URL`.
 * See dev_reports/31_05/db2_execution_plan.md (A2) for the surrounding plan.
 *
 * MIGRATIONS DEFINE THE SCHEMA
 * ----------------------------
 * `getMigratedTestPg()` applies the Drizzle migrations in `server/drizzle`
 * (0000…, 0001…) via the node-postgres migrator. This is the same DDL that
 * produces the migrated prod schema, so pg tests run against schema parity — not
 * the SQLite-era `createTables()` path.
 *
 * PER-TEST ISOLATION
 * ------------------
 * `reset()` TRUNCATEs every table in the `public` schema in one statement with
 * `RESTART IDENTITY CASCADE`, giving each test a clean, empty (but still
 * fully-migrated) database without re-running migrations. Call `reset()` in a
 * `beforeEach`. The migrations table itself is preserved so the schema survives
 * resets. Call `teardown()` once in `afterAll` to end the pool.
 *
 * CROSS-FILE SERIALIZATION (shared branch)
 * ----------------------------------------
 * vitest runs test FILES concurrently, but every pg-backed file shares this ONE
 * Neon branch + `public` schema — so a `reset()` TRUNCATE in one file would wipe
 * another file's freshly-seeded rows mid-test. `getMigratedTestPg()` therefore
 * takes a Postgres SESSION advisory lock on a dedicated client and holds it until
 * `teardown()`, so only one pg-backed file touches the branch at a time. The lock
 * auto-releases if the process dies (session-scoped). This serializes the handful
 * of pg test files cleanly; per-file SCHEMA isolation (unique search_path) is the
 * M2.7 scaling fix when there are many such files.
 */
// IPv4-first DNS + family-race disable — MUST be imported before pg opens a
// connection. Mirrors db/pg.ts so the test endpoint gets the same connectivity.
import '../net-config.js';
// Make .env authoritative for connection strings (strips empty overrides).
import '../load-env.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// server/src/db/__tests__/  ->  server/drizzle
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(HERE, '../../../drizzle');

const NO_URL_ERROR =
  'TEST_DATABASE_URL is not set. Set it to a Neon test-branch connection string ' +
  '(NOT the production DATABASE_URL) before running pg-backed tests. ' +
  'See dev_reports/31_05/db2_execution_plan.md A2.';

// Shared key for the cross-file serialization advisory lock (see header).
const DB2_TEST_LOCK_KEY = 982025;

/** True when a Neon test-branch URL is configured. pg tests should skip when false. */
export function hasPgTestTarget(): boolean {
  return !!process.env['TEST_DATABASE_URL'];
}

export interface MigratedTestPg {
  pool: Pool;
  db: ReturnType<typeof drizzle>;
  /** Truncate every app table for per-test isolation (schema preserved). */
  reset: () => Promise<void>;
  /** End the pool. Call once in afterAll. */
  teardown: () => Promise<void>;
}

/**
 * Connect to the Neon test branch, apply Drizzle migrations so the schema
 * matches migrated prod, and return helpers for isolation and cleanup.
 * Throws an actionable error if TEST_DATABASE_URL is unset.
 */
export async function getMigratedTestPg(): Promise<MigratedTestPg> {
  const connectionString = process.env['TEST_DATABASE_URL'];
  if (!connectionString) {
    throw new Error(NO_URL_ERROR);
  }

  // keepAlive: the lock client below sits idle for this file's whole lifetime
  // while other test files run; without TCP keepalive Neon reaps that idle
  // socket and the file fails wholesale with "Connection terminated unexpectedly".
  const pool = new Pool({ connectionString, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
  // Without an 'error' listener, an idle client's dropped socket surfaces as an
  // UNHANDLED error and vitest marks the whole file failed even when every test
  // passed. Swallow it — the serialized-lock connection is best-effort.
  pool.on('error', () => { /* idle client dropped; harness recovers on next connect */ });
  const db = drizzle(pool);

  // Serialize pg-backed test FILES against this shared branch: hold a session
  // advisory lock on a dedicated client for the file's lifetime so concurrent
  // vitest files can't clobber each other's data via reset()'s TRUNCATE. Other
  // files block here until this one's teardown() releases. Auto-released if the
  // process dies (session-scoped lock).
  const lockClient = await pool.connect();
  // This client stays checked out (idle) for the whole file; a dropped socket
  // emits on the client itself, not the pool. Swallow so it isn't unhandled.
  lockClient.on('error', () => { /* idle lock client dropped; teardown/next run recovers */ });
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB2_TEST_LOCK_KEY]);

  // Apply migrations: test schema == migrated prod schema. (Serialized by the
  // lock above, so concurrent migrate() calls can't race on the migrations table.)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const reset = async (): Promise<void> => {
    // Gather every base table in `public` except Drizzle's migration bookkeeping,
    // then truncate them all in one statement so FK order doesn't matter.
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '__drizzle_migrations'`,
    );
    if (res.rows.length === 0) return;
    const tables = res.rows.map((r) => `"public"."${r.table_name}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  };

  const teardown = async (): Promise<void> => {
    // Release the cross-file serialization lock, then drop the pool. If the lock
    // client's socket already died (idle reaping), the unlock query rejects — but
    // the lock is SESSION-scoped, so a dead session has already released it. Swallow
    // it; letting it throw would fail the whole file's afterAll even though every
    // test passed. release(true) discards a possibly-broken client instead of
    // returning it to the pool.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [DB2_TEST_LOCK_KEY]);
    } catch { /* connection gone; session-scoped lock already released */ }
    finally {
      try { lockClient.release(true); } catch { /* already gone */ }
    }
    await pool.end().catch(() => { /* best-effort pool shutdown */ });
  };

  return { pool, db, reset, teardown };
}
