import { defineConfig, configDefaults } from 'vitest/config';

// Minimal config: only registers the setup file that loads .env.test into
// process.env (for the gated Postgres-path tests). All other vitest behavior
// stays on defaults so the existing SQLite suite is unaffected.
//
// The Postgres integration suite (*.pg.test.ts) runs under vitest.pg.config.ts
// (DB_BACKEND=postgres against the Neon test branch) and is EXCLUDED here so the
// process-global pg flag never reaches the sqlite/mocked default suite.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, '**/*.pg.test.ts'],
    // pg-backed test files serialize against the shared Neon branch via a
    // session advisory lock (see db/__tests__/pg-test-target.ts). A waiting
    // file's beforeAll can block until the holding file finishes (~10s+), which
    // exceeds vitest's 10s default — so raise the ceilings. These are timeouts,
    // not delays: fast hooks/tests are unaffected. SQLite tests stay quick.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
