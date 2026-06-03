// Loads server/.env.test (TEST_DATABASE_URL etc.) into process.env for the test run.
// vitest does not populate process.env from .env.test on its own. This is harmless
// to the SQLite suite (those tests never read TEST_DATABASE_URL); it is what lets the
// gated Postgres-path tests (db/__tests__/adapter.test.ts, pg-test-target.test.ts)
// reach the Neon test branch. dotenv does not override already-set vars, so an
// exported TEST_DATABASE_URL still wins.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '.env.test') });
