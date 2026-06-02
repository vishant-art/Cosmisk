/**
 * Postgres (Neon) connection layer — Drizzle + node-postgres.
 *
 * M1 NOTE: This module is ADDITIVE. The live application still runs on
 * better-sqlite3 via `getDb()` in ./index.ts. Nothing in the request path
 * imports this file yet. It exists so the Postgres schema can be migrated and
 * verified out-of-band while SQLite stays live. The call-site cutover happens
 * in M2 (see dev_reports/29_05/async_migration_call_site_audit.md).
 */
// IPv4-first DNS — MUST be imported before pg opens a connection. See net-config.ts.
import './net-config.js';
// Make .env authoritative for DB connection strings (strips empty overrides).
import './load-env.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from './pg-schema.js';

// node-postgres returns int8 (OID 20) — what `COUNT(*)` and `SUM(int)` produce —
// as a JS STRING by default, to avoid precision loss beyond Number.MAX_SAFE_INTEGER.
// The Cosmisk app reads these as numbers (=== 1, arithmetic, JSON counts) and has
// no int8 value near that ceiling (row counts + cost_cents-in-cents), so under
// SQLite they were always numbers. Parse OID 20 to a JS number process-wide to
// preserve that contract under Postgres. (Parsers are skipped for NULL, so SUM()
// over zero rows stays null.)
types.setTypeParser(20, (val) => parseInt(val, 10));

// Pooled connection (PgBouncer endpoint) for the long-running app process.
export const pgPool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
});

export const pgDb = drizzle(pgPool, { schema });

export async function closePgPool(): Promise<void> {
  await pgPool.end();
}
