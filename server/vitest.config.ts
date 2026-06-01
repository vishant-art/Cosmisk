import { defineConfig } from 'vitest/config';

// Minimal config: only registers the setup file that loads .env.test into
// process.env (for the gated Postgres-path tests). All other vitest behavior
// stays on defaults so the existing SQLite suite is unaffected.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
