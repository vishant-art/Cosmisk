/**
 * DB-2 E1 harness smoke — validates that under the pg integration config
 * (vitest.pg.config.ts: DB_BACKEND=postgres + DATABASE_URL=Neon test branch)
 * the app's getDbAdapter() routes to the migrated test branch and the dialect
 * shim correctly translates the SQLite-flavored SQL the converted app emits.
 *
 * This is the proof-of-concept that gates the bulk port of the 21 route/service
 * tests. The risk surface is the translations, so we exercise them on REAL pg:
 *   - `?` placeholders -> `$n`
 *   - `datetime('now')` -> `now()`
 *   - INSERT OR REPLACE / ON CONFLICT upsert
 *   - INSERT ... RETURNING id (lastInsertRowid replacement)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getMigratedTestPg, type MigratedTestPg } from './pg-test-target.js';
import { getDbAdapter } from '../adapter.js';

let pg: MigratedTestPg;

beforeAll(async () => {
  pg = await getMigratedTestPg();
});
afterAll(async () => {
  await pg.teardown();
});
beforeEach(async () => {
  await pg.reset();
});

describe('pg harness smoke (DB_BACKEND=postgres, Neon test branch)', () => {
  it('round-trips a row via getDbAdapter() against the test branch (? -> $n)', async () => {
    await getDbAdapter().run(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
      ['u-smoke', 'Smoke', 'smoke@cosmisk.test', 'hash'],
    );
    const row = await getDbAdapter().get<{ id: string; name: string }>(
      'SELECT id, name FROM users WHERE id = ?',
      ['u-smoke'],
    );
    expect(row).toMatchObject({ id: 'u-smoke', name: 'Smoke' });
  });

  it("translates datetime('now') via the shim", async () => {
    await getDbAdapter().run(
      "INSERT INTO leads (email, source, created_at) VALUES (?, 'hero', datetime('now'))",
      ['lead@cosmisk.test'],
    );
    const row = await getDbAdapter().get<{ email: string; created_at: string }>(
      'SELECT email, created_at FROM leads WHERE email = ?',
      ['lead@cosmisk.test'],
    );
    expect(row?.email).toBe('lead@cosmisk.test');
    expect(row?.created_at).toBeTruthy();
  });

  it('performs an ON CONFLICT upsert (dna_cache, pk ad_id)', async () => {
    const sql =
      'INSERT INTO dna_cache (ad_id, account_id, ad_name, hook, visual, audio, reasoning, analyzed_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) " +
      'ON CONFLICT(ad_id) DO UPDATE SET account_id=excluded.account_id, ad_name=excluded.ad_name, reasoning=excluded.reasoning';
    await getDbAdapter().run(sql, ['ad-1', 'acct-1', 'First', '[]', '[]', '[]', 'r1']);
    await getDbAdapter().run(sql, ['ad-1', 'acct-2', 'Second', '[]', '[]', '[]', 'r2']);
    const row = await getDbAdapter().get<{ ad_name: string; account_id: string }>(
      'SELECT ad_name, account_id FROM dna_cache WHERE ad_id = ?',
      ['ad-1'],
    );
    expect(row).toMatchObject({ ad_name: 'Second', account_id: 'acct-2' });
  });

  it('returns the new id via INSERT ... RETURNING (lastInsertRowid replacement)', async () => {
    const result = await getDbAdapter().get<{ id: number }>(
      'INSERT INTO waitlist_leads (email, source, signed_up_at) VALUES (?, ?, ?) RETURNING id',
      ['wl@cosmisk.test', 'waitlist', new Date('2026-06-02T00:00:00Z').toISOString()],
    );
    expect(typeof result?.id).toBe('number');
    expect(result!.id).toBeGreaterThan(0);
  });
});
