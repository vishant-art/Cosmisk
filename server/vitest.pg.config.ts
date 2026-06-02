import { defineConfig } from 'vitest/config';

// Postgres integration suite — DB-2 E1 (M2.7). Runs the ported route/service
// tests against the migrated Neon TEST BRANCH with DB_BACKEND=postgres (see
// vitest.setup.pg.ts). This is the authoritative "smoke all db routes on pg"
// gate before SQLite is retired.
//
// Separate config (not the default) so the process-global DB_BACKEND=postgres
// flag cannot bleed into the still-sqlite default suite during the port.
//
// singleFork: all pg files run in ONE process, serialized — they share the Neon
// branch (getMigratedTestPg holds a session advisory lock + reset() TRUNCATEs
// public between tests), so concurrency would only cause lock contention and
// connection storms against Neon.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.pg.ts'],
    include: ['**/*.pg.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
