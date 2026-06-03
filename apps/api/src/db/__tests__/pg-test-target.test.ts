/**
 * Self-test for the Postgres test target helper (DB-2 / M2.0, A2).
 *
 * OPT-IN: the whole describe block SKIPS unless `TEST_DATABASE_URL` (a Neon
 * test-branch connection string) is set, so this never touches the production
 * DB and keeps the SQLite suite green. When a branch URL is present, it proves
 * the helper connects, migrations applied the expected schema, reset() works,
 * and teardown() closes cleanly.
 *
 * Provision a Neon test branch and set TEST_DATABASE_URL — see
 * ./pg-test-target.ts (file header) and dev_reports/31_05/db2_execution_plan.md A2.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getMigratedTestPg,
  hasPgTestTarget,
  type MigratedTestPg,
} from './pg-test-target.js';

describe.skipIf(!process.env['TEST_DATABASE_URL'])(
  'Postgres test target (Neon test branch)',
  () => {
    let target: MigratedTestPg;

    beforeAll(async () => {
      target = await getMigratedTestPg();
    });

    afterAll(async () => {
      await target?.teardown();
    });

    it('reports the test target is available', () => {
      expect(hasPgTestTarget()).toBe(true);
    });

    it('returns a connected pool', async () => {
      const res = await target.pool.query<{ one: number }>('SELECT 1 AS one');
      expect(res.rows[0]?.one).toBe(1);
    });

    it('migrated schema has the expected tables', async () => {
      const res = await target.pool.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1)`,
        [['users', 'brands']],
      );
      const found = res.rows.map((r) => r.table_name).sort();
      expect(found).toEqual(['brands', 'users']);
    });

    it('reset() leaves a clean, empty, still-migrated schema', async () => {
      await target.pool.query(
        `INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`,
        ['__pgtt_reset__', 'pgtt', '__pgtt_reset__@example.com', 'x'],
      );
      await target.reset();

      const rows = await target.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users`,
      );
      expect(rows.rows[0]?.count).toBe('0');

      // Schema (the table) still exists after reset.
      const tbl = await target.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'users'`,
      );
      expect(tbl.rows.length).toBe(1);
    });
  },
);
