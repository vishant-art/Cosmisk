import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Keys live in server/.env (mirrored from repo-root .env). drizzle-kit runs
// from the server/ directory, so the default lookup resolves correctly.
dotenv.config();

export default defineConfig({
  schema: './src/db/pg-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Direct / unpooled URL — drizzle-kit must NOT go through PgBouncer.
    url: process.env['MIGRATION_DATABASE_URL']!,
  },
  verbose: true,
  strict: true,
});
