/**
 * Database connectivity check — run with: npm run db:check
 *
 * Read-only. Uses the SAME connection strategy as the app and migrations
 * (IPv4-first DNS + .env-authoritative loading), so a pass here means the app
 * and drizzle-kit will connect too. Verifies BOTH the direct (migration) and
 * pooled (runtime) endpoints, preserving SSL verification from the URL.
 */
import './net-config.js';
import './load-env.js';
import { Pool } from 'pg';

type Target = { label: string; key: 'MIGRATION_DATABASE_URL' | 'DATABASE_URL' };

const TARGETS: Target[] = [
  { label: 'direct  (migrations)', key: 'MIGRATION_DATABASE_URL' },
  { label: 'pooled  (runtime app)', key: 'DATABASE_URL' },
];

async function check({ label, key }: Target): Promise<boolean> {
  const connectionString = process.env[key];
  if (!connectionString) {
    console.log(`✗ ${label}: ${key} is not set`);
    return false;
  }
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 15000 });
  const started = Date.now();
  try {
    const client = await pool.connect();
    try {
      // Parameterized query exercises the prepared-statement path (matters on the
      // pooled PgBouncer endpoint).
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
        ['public'],
      );
      console.log(`✓ ${label}: connected in ${Date.now() - started}ms — ${rows[0].n} public tables`);
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.log(`✗ ${label}: ${e.code || e.message} (after ${Date.now() - started}ms)`);
    return false;
  } finally {
    await pool.end();
  }
}

(async () => {
  console.log('Database connectivity check (IPv4-first, SSL preserved)\n');
  const results = await Promise.all(TARGETS.map(check));
  const ok = results.every(Boolean);
  console.log(ok ? '\n✅ all endpoints reachable' : '\n❌ one or more endpoints failed');
  process.exit(ok ? 0 : 1);
})();
