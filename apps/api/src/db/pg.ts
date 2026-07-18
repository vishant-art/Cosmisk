/**
 * Postgres (Neon) connection layer — Drizzle + node-postgres.
 *
 * This is the live application backend. `getDbAdapter()` (src/db/adapter.ts)
 * wraps `pgPool` in a PgAdapter for all runtime queries; `closePgPool()` is
 * called on shutdown. The SQLite path was removed in DB-2 / M2.9.
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
// keepAlive stops Neon/the network from silently reaping an idle socket — a
// dropped idle connection otherwise surfaces as "Connection terminated
// unexpectedly" on the next query.
export const pgPool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

export const pgDb = drizzle(pgPool, { schema });

export async function closePgPool(): Promise<void> {
  await pgPool.end();
}
