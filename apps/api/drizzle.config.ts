import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import dns from 'node:dns';
import net from 'node:net';

// Same connection strategy as the app runtime (src/db/net-config.ts): IPv4-first
// DNS + disable Happy Eyeballs family race. Node 20 races IPv4/IPv6 with a 250ms
// per-attempt timeout, but Neon's IPv4 handshake (~287ms) exceeds it, so Node
// falls into unreachable IPv6 (e.g. WSL2) and migrations fail with ETIMEDOUT.
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

// Make .env authoritative: drop empty DB-key overrides so dotenv fills them from
// the file (dotenv won't overwrite an already-present, even if empty, var).
for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
  if (process.env[key] !== undefined && process.env[key]!.trim() === '') {
    delete process.env[key];
  }
}

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
