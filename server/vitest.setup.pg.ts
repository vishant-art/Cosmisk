// Setup for the Postgres-backed integration suite (vitest.pg.config.ts).
//
// Runs BEFORE any test module imports, so config.ts (config.dbBackend) and
// pg.ts (pgPool's connectionString) capture these values at module-init:
//   - DB_BACKEND=postgres  -> getDbAdapter() returns the PgAdapter
//   - DATABASE_URL=<Neon test branch> -> the app's pgPool hits the test branch
//
// This is why pg tests live in a SEPARATE vitest config: the DB_BACKEND flag is
// process-global and must NOT leak into the default (sqlite/mocked) suite.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '.env.test') });

if (!process.env['TEST_DATABASE_URL']) {
  throw new Error(
    'The pg integration suite requires TEST_DATABASE_URL (Neon test branch) in server/.env.test',
  );
}

// Point the app's pgPool at the migrated Neon test branch and select the pg adapter.
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
process.env['DB_BACKEND'] = 'postgres';
