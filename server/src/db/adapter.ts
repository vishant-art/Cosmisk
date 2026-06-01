/**
 * Strangler adapter (DB-2 / M2.0) — ADDITIVE INFRASTRUCTURE ONLY.
 *
 * Provides a single async DB interface (`DbAdapter`) with two backends:
 *   - SqliteAdapter — wraps the live better-sqlite3 handle from `./index.js`.
 *   - PgAdapter     — wraps the pooled Neon connection from `./pg.js`,
 *                     applying a SQLite→Postgres dialect shim to every query.
 *
 * `getDbAdapter()` returns the backend selected by `config.dbBackend`
 * (env `DB_BACKEND`; default sqlite).
 *
 * IMPORTANT: Nothing in the runtime request path imports this module yet.
 * Converting the ~635 existing `.prepare()` call sites is M2.1+. This file
 * exists so the adapter + dialect shim can be unit-tested in isolation.
 *
 * Manual-conversion sites NOT auto-handled by the dialect shim (M2.2/M2.3):
 *   - ~9 sites using `INSERT OR REPLACE` / `INSERT OR IGNORE` / sqlite
 *     `ON CONFLICT` upserts — left verbatim; ported to Postgres upserts by hand.
 *   - 7 `db.transaction()` sites — must be reworked onto `adapter.transaction()`
 *     (better-sqlite3 transactions are sync; Postgres uses BEGIN/COMMIT).
 *   - 1 `lastInsertRowid` reader — Postgres has no implicit lastInsertRowid;
 *     rewrite to `INSERT … RETURNING id` + `get()` (see PgAdapter.run docs).
 */
import type { Pool, PoolClient } from 'pg';
import { config } from '../config.js';
import { getDb } from './index.js';
import { pgPool } from './pg.js';

// NOTE on imports: we use plain ESM imports (not createRequire) so that
// `vi.mock('../db/index')` / `vi.mock('../db/pg')` in the test suite reach the
// adapter — a CommonJS require() bypasses vitest's ESM module interception.
// These imports are still side-effect-light: importing `getDb` does not open
// the SQLite DB (getDb is lazy), and importing `pgPool` constructs an idle
// pg.Pool that opens no connection until its first query. So importing this
// adapter never opens a DB connection, exactly as before.

export interface DbAdapter {
  get<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  run(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number | string | null }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Dialect shim — PURE functions (no DB), unit-testable in isolation.
// ---------------------------------------------------------------------------

/**
 * Rewrite SQLite `?` positional placeholders to Postgres `$1, $2, …`
 * left-to-right.
 *
 * LIMITATION: a naive left-to-right rewrite would also touch a `?` that
 * appears inside a string literal. We skip `?` inside single- or
 * double-quoted string literals (handling doubled-quote escapes `''`/`""`).
 * The codebase does not appear to use a literal `?` inside SQL strings, but
 * the guard is cheap and avoids a silent corruption class.
 */
export function toPgPlaceholders(sql: string): string {
  let out = '';
  let i = 0;
  let n = 0;
  let quote: "'" | '"' | null = null;

  while (i < sql.length) {
    const ch = sql[i]!;

    if (quote) {
      out += ch;
      if (ch === quote) {
        // Doubled quote inside a literal is an escaped quote, stay in-literal.
        if (sql[i + 1] === quote) {
          out += sql[i + 1];
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '?') {
      n += 1;
      out += `$${n}`;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Translate the SQLite-isms the codebase actually uses into Postgres:
 *   - `datetime('now')`                       → `now()`
 *   - `datetime('now', '+N days')` (etc.)      → `now() + interval 'N days'`
 *     (sign-aware; supports days/hours/minutes/seconds/months/years)
 *   - `json_extract(col, '$.key')`             → `col->>'key'`
 *
 * NOT translated (left verbatim — handled manually in M2.2/M2.3, see header):
 *   - `INSERT OR REPLACE` / `INSERT OR IGNORE`
 *   - SQLite `ON CONFLICT` upsert tails
 */
export function translateSqliteToPg(sql: string): string {
  let out = sql;

  // datetime('now', '<sign><N> <unit>') → now() <sign> interval 'N unit'
  // Match before the bare datetime('now') rule so the modifier form wins.
  out = out.replace(
    /datetime\(\s*'now'\s*,\s*'([+-])\s*(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds|month|months|year|years)'\s*\)/gi,
    (_m, sign: string, num: string, unit: string) => {
      const op = sign === '-' ? '-' : '+';
      return `now() ${op} interval '${num} ${unit}'`;
    },
  );

  // datetime('now') → now()
  out = out.replace(/datetime\(\s*'now'\s*\)/gi, 'now()');

  // json_extract(col, '$.key') → col->>'key'
  // `col` may be a qualified identifier (table.column). `key` is a simple
  // path segment after the leading `$.`.
  out = out.replace(
    /json_extract\(\s*([A-Za-z_][\w.]*)\s*,\s*'\$\.([A-Za-z_][\w]*)'\s*\)/gi,
    (_m, col: string, key: string) => `${col}->>'${key}'`,
  );

  return out;
}

// ---------------------------------------------------------------------------
// SqliteAdapter — wraps the live better-sqlite3 handle.
// ---------------------------------------------------------------------------

// better-sqlite3 is the canonical handle type; we only need a structural slice
// of it so the adapter can also wrap a `:memory:` Database in tests.
interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
interface SqliteHandle {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
}

export class SqliteAdapter implements DbAdapter {
  // Lazily resolve the live handle so importing this module never opens a DB.
  // Tests may inject a `:memory:` handle directly.
  constructor(private readonly handle?: SqliteHandle) {}

  private db(): SqliteHandle {
    if (this.handle) return this.handle;
    return getDb() as unknown as SqliteHandle;
  }

  get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const row = this.db().prepare(sql).get(...params) as T | undefined;
    return Promise.resolve(row);
  }

  all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = this.db().prepare(sql).all(...params) as T[];
    return Promise.resolve(rows);
  }

  run(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ changes: number; lastInsertRowid: number | string | null }> {
    const res = this.db().prepare(sql).run(...params);
    // better-sqlite3 returns lastInsertRowid as number | bigint.
    const rowid =
      typeof res.lastInsertRowid === 'bigint'
        ? res.lastInsertRowid.toString()
        : res.lastInsertRowid;
    return Promise.resolve({ changes: res.changes, lastInsertRowid: rowid });
  }

  exec(sql: string): Promise<void> {
    this.db().exec(sql);
    return Promise.resolve();
  }

  /**
   * better-sqlite3 transactions are SYNCHRONOUS — there is no async tx API,
   * and you cannot `await` across the boundary of `db.transaction(...)`
   * without losing atomicity (other queries could interleave once the event
   * loop yields).
   *
   * Rather than fight that, we drive the transaction with explicit, fully
   * synchronous `BEGIN` / `COMMIT` / `ROLLBACK` statements and `await fn`
   * normally. Because EVERY statement issued through the tx adapter is itself
   * synchronous (better-sqlite3 executes inline; our adapter only wraps the
   * already-computed result in `Promise.resolve`), no event-loop yield ever
   * occurs in between as long as `fn` only awaits adapter operations. The
   * outer method stays `async` for interface parity; the SQLite engine work
   * happens synchronously between BEGIN and COMMIT.
   *
   * If `fn` rejects, we ROLLBACK and re-throw. This mirrors better-sqlite3's
   * own `transaction()` rollback-on-throw semantics while permitting the
   * async `DbAdapter` signature.
   */
  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    const handle = this.db();
    const txAdapter = new SqliteAdapter(handle);

    handle.exec('BEGIN');
    try {
      const result = await fn(txAdapter);
      handle.exec('COMMIT');
      return result;
    } catch (err) {
      handle.exec('ROLLBACK');
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// PgAdapter — wraps the pooled Neon connection; applies the dialect shim.
// ---------------------------------------------------------------------------

function translateForPg(sql: string): string {
  return toPgPlaceholders(translateSqliteToPg(sql));
}

// Structural slice of the pieces we use, so tests can inject a local Pool.
interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export class PgAdapter implements DbAdapter {
  constructor(private readonly pool: Pool | PgQueryable) {}

  async get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const res = await this.pool.query(translateForPg(sql), params);
    return res.rows[0] as T | undefined;
  }

  async all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(translateForPg(sql), params);
    return res.rows as T[];
  }

  /**
   * Postgres has NO implicit lastInsertRowid — it is always returned as null.
   * Call sites that need the generated id MUST rewrite their statement to
   * `INSERT … RETURNING id` and read it via `get()`. This is the single
   * manual-conversion site flagged in the module header (M2.2/M2.3).
   */
  async run(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ changes: number; lastInsertRowid: number | string | null }> {
    const res = await this.pool.query(translateForPg(sql), params);
    return { changes: res.rowCount ?? 0, lastInsertRowid: null };
  }

  async exec(sql: string): Promise<void> {
    // exec runs raw DDL/multi-statement SQL with no params. We still apply the
    // dialect translation so datetime()/json_extract in DDL defaults are ported,
    // but there are no `?` placeholders to rewrite.
    await this.pool.query(translateSqliteToPg(sql));
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    // A pooled-Pool exposes connect(); an injected queryable may not. Only the
    // real pg.Pool supports per-connection transactions.
    const pool = this.pool as Pool;
    if (typeof pool.connect !== 'function') {
      throw new Error('PgAdapter.transaction requires a pg.Pool (connect()).');
    }
    const client: PoolClient = await pool.connect();
    const txAdapter = new PgAdapter(clientQueryable(client));
    try {
      await client.query('BEGIN');
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

function clientQueryable(client: PoolClient): PgQueryable {
  return {
    query: (text: string, params?: unknown[]) =>
      client.query(text, params as any[]) as Promise<{
        rows: any[];
        rowCount: number | null;
      }>,
  };
}

// ---------------------------------------------------------------------------
// Backend selection — module singletons.
// ---------------------------------------------------------------------------

let sqliteSingleton: SqliteAdapter | undefined;
let pgSingleton: PgAdapter | undefined;

export function getDbAdapter(): DbAdapter {
  if (config.dbBackend === 'postgres') {
    if (!pgSingleton) {
      pgSingleton = new PgAdapter(pgPool);
    }
    return pgSingleton;
  }
  if (!sqliteSingleton) {
    sqliteSingleton = new SqliteAdapter();
  }
  return sqliteSingleton;
}
