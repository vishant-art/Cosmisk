/**
 * Strangler adapter tests (DB-2 / M2.0).
 *
 *   - Pure dialect-shim tests: no DB, fully deterministic.
 *   - SqliteAdapter tests: backed by a `:memory:` better-sqlite3 handle
 *     injected into the adapter (no live DB touched).
 *   - PgAdapter tests: GATED behind TEST_DATABASE_URL via describe.skipIf —
 *     they SKIP (not fail) when the env var is unset, keeping the suite green.
 *
 * Run only this file (siblings may be mid-edit by other agents):
 *   npx vitest run src/db/__tests__/adapter.test.ts
 */
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PgAdapter,
  SqliteAdapter,
  toPgPlaceholders,
  translateSqliteToPg,
} from '../adapter.js';

// ---------------------------------------------------------------------------
// Pure dialect-shim tests (no DB).
// ---------------------------------------------------------------------------

describe('dialect shim — toPgPlaceholders', () => {
  it('rewrites ? to $1, $2 left-to-right', () => {
    expect(toPgPlaceholders('a=? AND b=?')).toBe('a=$1 AND b=$2');
  });

  it('handles a single placeholder', () => {
    expect(toPgPlaceholders('SELECT * FROM t WHERE id = ?')).toBe(
      'SELECT * FROM t WHERE id = $1',
    );
  });

  it('does not rewrite a ? inside a string literal', () => {
    expect(toPgPlaceholders("col = ? AND note = 'why?'")).toBe(
      "col = $1 AND note = 'why?'",
    );
  });
});

describe('dialect shim — translateSqliteToPg', () => {
  it("translates datetime('now') → now()", () => {
    expect(translateSqliteToPg("SELECT datetime('now')")).toBe('SELECT now()');
  });

  it("translates a +30 days modifier → now() + interval '30 days'", () => {
    expect(translateSqliteToPg("datetime('now', '+30 days')")).toBe(
      "now() + interval '30 days'",
    );
  });

  it("translates a -7 days modifier → now() - interval '7 days'", () => {
    expect(translateSqliteToPg("datetime('now','-7 days')")).toBe(
      "now() - interval '7 days'",
    );
  });

  it("translates json_extract(c, '$.x') → (c)::jsonb->>'x'", () => {
    // The JSON-bearing columns are TEXT in the migrated schema; Postgres rejects
    // `->>` on text, so the shim casts to jsonb first.
    expect(translateSqliteToPg("json_extract(c, '$.x')")).toBe("(c)::jsonb->>'x'");
  });

  it('leaves INSERT OR REPLACE verbatim (manual conversion site)', () => {
    const sql = 'INSERT OR REPLACE INTO t (id) VALUES (?)';
    expect(translateSqliteToPg(sql)).toBe(sql);
  });
});

// ---------------------------------------------------------------------------
// SqliteAdapter tests — in-memory better-sqlite3 handle injected.
// ---------------------------------------------------------------------------

describe('SqliteAdapter (:memory:)', () => {
  let db: Database.Database;
  let adapter: SqliteAdapter;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(
      'CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, qty INTEGER)',
    );
    adapter = new SqliteAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  it('run() inserts and reports changes + lastInsertRowid', async () => {
    const res = await adapter.run('INSERT INTO items (name, qty) VALUES (?, ?)', [
      'widget',
      3,
    ]);
    expect(res.changes).toBe(1);
    expect(res.lastInsertRowid).toBe(1);
  });

  it('get() returns a single row or undefined', async () => {
    await adapter.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['gadget', 9]);
    const row = await adapter.get<{ name: string; qty: number }>(
      'SELECT name, qty FROM items WHERE name = ?',
      ['gadget'],
    );
    expect(row).toEqual({ name: 'gadget', qty: 9 });

    const missing = await adapter.get('SELECT * FROM items WHERE name = ?', ['nope']);
    expect(missing).toBeUndefined();
  });

  it('all() returns every matching row', async () => {
    await adapter.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['a', 1]);
    await adapter.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['b', 2]);
    const rows = await adapter.all<{ name: string }>('SELECT name FROM items ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('exec() runs raw DDL', async () => {
    await adapter.exec('CREATE TABLE more (x INTEGER)');
    const row = await adapter.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='more'",
    );
    expect(row?.name).toBe('more');
  });

  it('transaction() commits all statements on success', async () => {
    await adapter.transaction(async (tx) => {
      await tx.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['x', 1]);
      await tx.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['y', 2]);
    });
    const rows = await adapter.all('SELECT * FROM items');
    expect(rows.length).toBe(2);
  });

  it('transaction() rolls back all statements when fn throws', async () => {
    await expect(
      adapter.transaction(async (tx) => {
        await tx.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['z', 1]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await adapter.all('SELECT * FROM items');
    expect(rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PgAdapter tests — GATED behind TEST_DATABASE_URL (skip cleanly when unset).
// ---------------------------------------------------------------------------

const PG_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!PG_URL)('PgAdapter (TEST_DATABASE_URL)', () => {
  let pool: Pool;
  let adapter: PgAdapter;
  const table = 'adapter_t';
  // ISOLATED SCHEMA (root-cause fix for the cross-file flake): pin this pool's
  // search_path to a unique schema so this file's table lives OUTSIDE `public`.
  // The other pg files (pg-test-target/m2_1_pilot) run `reset()` = TRUNCATE over
  // `public`; with our table in its own schema, their TRUNCATE can never wipe it
  // mid-test (that race was the intermittent `transaction()` failure). The
  // `-c search_path=` startup option is honoured on the Neon direct endpoint.
  const schema = `adapter_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  beforeEach(async () => {
    pool = new Pool({ connectionString: PG_URL, options: `-c search_path=${schema}` });
    adapter = new PgAdapter(pool);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await adapter.exec(
      `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, name TEXT, qty INTEGER)`,
    );
  });

  afterEach(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  it('run() reports changes; lastInsertRowid is null on Postgres', async () => {
    const res = await adapter.run(
      `INSERT INTO ${table} (name, qty) VALUES (?, ?)`,
      ['widget', 3],
    );
    expect(res.changes).toBe(1);
    expect(res.lastInsertRowid).toBeNull();
  });

  it('get() returns a single row or undefined', async () => {
    await adapter.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['gadget', 9]);
    const row = await adapter.get<{ name: string; qty: number }>(
      `SELECT name, qty FROM ${table} WHERE name = ?`,
      ['gadget'],
    );
    expect(row).toEqual({ name: 'gadget', qty: 9 });

    const missing = await adapter.get(`SELECT * FROM ${table} WHERE name = ?`, ['nope']);
    expect(missing).toBeUndefined();
  });

  it('all() returns every matching row', async () => {
    await adapter.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['a', 1]);
    await adapter.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['b', 2]);
    const rows = await adapter.all<{ name: string }>(
      `SELECT name FROM ${table} ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('transaction() commits on success', async () => {
    await adapter.transaction(async (tx) => {
      await tx.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['x', 1]);
      await tx.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['y', 2]);
    });
    const rows = await adapter.all(`SELECT * FROM ${table}`);
    expect(rows.length).toBe(2);
  });

  it('transaction() rolls back when fn throws', async () => {
    await expect(
      adapter.transaction(async (tx) => {
        await tx.run(`INSERT INTO ${table} (name, qty) VALUES (?, ?)`, ['z', 1]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await adapter.all(`SELECT * FROM ${table}`);
    expect(rows.length).toBe(0);
  });
});

// Silence "no tests" when the gated block skips and nothing else uses afterAll.
afterAll(() => {});
