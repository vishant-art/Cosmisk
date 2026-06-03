/**
 * DB adapter (DB-2 / M2.9).
 *
 * Provides a single async DB interface (`DbAdapter`) backed by Postgres:
 *   - PgAdapter — wraps the pooled Neon connection from `./pg.js`,
 *                 applying a SQLite→Postgres dialect shim to every query.
 *
 * `getDbAdapter()` always returns the PgAdapter singleton. The SQLite path
 * (SqliteAdapter, getDb/closeDb, the dbBackend flag) was removed in M2.9;
 * Postgres is the only backend.
 *
 * The dialect shim (translateSqliteToPg/toPgPlaceholders) is retained because
 * the converted call sites still emit SQLite-flavored SQL that Postgres needs
 * translated at runtime.
 */
import type { Pool, PoolClient } from 'pg';
import { pgPool } from './pg.js';

// NOTE on imports: we use plain ESM imports (not createRequire) so that
// `vi.mock('../db/pg')` in the test suite reaches the adapter — a CommonJS
// require() bypasses vitest's ESM module interception. Importing `pgPool`
// constructs an idle pg.Pool that opens no connection until its first query,
// so importing this adapter never opens a DB connection.

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

  // json_extract(col, '$.key') → (col)::jsonb->>'key'
  // `col` may be a qualified identifier (table.column). `key` is a simple
  // path segment after the leading `$.`. The JSON-bearing columns are TEXT in
  // the migrated schema (the app JSON.parses them), and Postgres rejects `->>`
  // on text (SQLSTATE 42883), so cast to jsonb first. NULL::jsonb stays NULL.
  out = out.replace(
    /json_extract\(\s*([A-Za-z_][\w.]*)\s*,\s*'\$\.([A-Za-z_][\w]*)'\s*\)/gi,
    (_m, col: string, key: string) => `(${col})::jsonb->>'${key}'`,
  );

  // SQLite scalar MIN(a, b) / MAX(a, b) → Postgres LEAST(a, b) / GREATEST(a, b).
  // In Postgres MIN/MAX are AGGREGATE-only; scalar min/max is LEAST/GREATEST.
  // Only the TWO-ARGUMENT form with simple (paren/comma-free) args is matched, so
  // single-arg aggregates `MIN(col)` / `MAX(col)` and `SELECT MIN(a), MAX(b)` are
  // left untouched. Runs before placeholder substitution, so `?` is still present
  // inside the args (allowed by the [^(),] arg class).
  out = out.replace(/\bMIN\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)/gi, 'LEAST($1, $2)');
  out = out.replace(/\bMAX\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)/gi, 'GREATEST($1, $2)');

  return out;
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

let pgSingleton: PgAdapter | undefined;

export function getDbAdapter(): DbAdapter {
  if (!pgSingleton) pgSingleton = new PgAdapter(pgPool);
  return pgSingleton;
}
