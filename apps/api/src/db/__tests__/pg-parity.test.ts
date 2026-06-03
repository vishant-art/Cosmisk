/**
 * Postgres parity spec — proves the 9 ported tables exist on the POOLED Neon
 * (PgBouncer) endpoint and that a JSON-bearing TEXT column round-trips.
 *
 * Importing `../pg.js` triggers `load-env.js`, making `DATABASE_URL` from
 * `server/.env` authoritative — that is the pooled endpoint we must verify.
 *
 * Run ONLY this file (siblings may be mid-edit by other agents):
 *   npx vitest run src/db/__tests__/pg-parity.test.ts
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { pgPool, closePgPool } from '../pg.js';

// GATED behind DATABASE_URL (the pooled endpoint this spec verifies). CI runs the
// default suite with no DATABASE_URL, so this SKIPS cleanly there (like the other
// pg specs gated on TEST_DATABASE_URL); without the gate, pgPool falls back to
// localhost:5432 → ECONNREFUSED. Run it by pointing DATABASE_URL at the pooled DB.
const HAS_DB = !!process.env['DATABASE_URL'];

const PORTED_TABLES = [
  'brands',
  'brand_context',
  'audits',
  'scheduled_audits',
  'client_contexts',
  'strategic_reports',
  'strategic_recommendations',
  'strategic_predictions',
  'strategic_running_context',
];

const TEST_ID = '__pgparity_test__';

describe.skipIf(!HAS_DB)('Postgres parity (pooled Neon endpoint)', () => {
  // Hooks live INSIDE the gated describe so they don't run (and hit pgPool) when skipped.
  afterEach(async () => {
    await pgPool.query('DELETE FROM client_contexts WHERE id = $1', [TEST_ID]);
  });

  afterAll(async () => {
    await closePgPool();
  });

  it('has all 9 ported tables in the public schema', async () => {
    // Parameterized query exercises the prepared-statement path on the pooled endpoint.
    const res = await pgPool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)`,
      [PORTED_TABLES],
    );

    const found = res.rows.map((r) => r.table_name).sort();
    expect(found).toEqual([...PORTED_TABLES].sort());
    expect(res.rows.length).toBe(9);
  });

  it('round-trips a JSON-bearing TEXT column (client_contexts.context_json)', async () => {
    const original = { k: 'v', n: 42, arr: [1, 2, 3] };

    await pgPool.query(
      'INSERT INTO client_contexts (id, name, context_json) VALUES ($1, $2, $3)',
      [TEST_ID, 'pgparity', JSON.stringify(original)],
    );

    const res = await pgPool.query<{ context_json: string }>(
      'SELECT context_json FROM client_contexts WHERE id = $1',
      [TEST_ID],
    );

    expect(res.rows.length).toBe(1);
    const parsed = JSON.parse(res.rows[0]!.context_json);
    expect(parsed).toEqual(original);
  });
});
