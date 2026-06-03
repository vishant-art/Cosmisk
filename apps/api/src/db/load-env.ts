/**
 * Env loader for database consumers.
 *
 * dotenv does NOT overwrite a variable that is already present in process.env.
 * That means an EMPTY shell export (e.g. `DATABASE_URL=` with no value, which is
 * easy to leave in a parent shell or a partially-filled .env) silently shadows
 * the real value in the .env file — the pool then gets `''` and fails opaquely.
 *
 * To make .env authoritative for the DB connection strings, we delete any
 * empty-string DB keys from process.env BEFORE loading dotenv, so dotenv fills
 * them from the file. A genuinely-set (non-empty) override is still respected.
 */
import * as dotenv from 'dotenv';

const DB_KEYS = ['DATABASE_URL', 'MIGRATION_DATABASE_URL'] as const;

for (const key of DB_KEYS) {
  const v = process.env[key];
  if (v !== undefined && v.trim() === '') {
    delete process.env[key];
  }
}

dotenv.config();
