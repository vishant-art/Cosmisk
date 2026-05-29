/**
 * Postgres (Neon) connection layer — Drizzle + node-postgres.
 *
 * M1 NOTE: This module is ADDITIVE. The live application still runs on
 * better-sqlite3 via `getDb()` in ./index.ts. Nothing in the request path
 * imports this file yet. It exists so the Postgres schema can be migrated and
 * verified out-of-band while SQLite stays live. The call-site cutover happens
 * in M2 (see dev_reports/29_05/async_migration_call_site_audit.md).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as schema from './pg-schema.js';

dotenv.config();

// Pooled connection (PgBouncer endpoint) for the long-running app process.
export const pgPool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
});

export const pgDb = drizzle(pgPool, { schema });

export async function closePgPool(): Promise<void> {
  await pgPool.end();
}
