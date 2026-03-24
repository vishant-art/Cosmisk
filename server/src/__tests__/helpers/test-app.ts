/**
 * Test helper: builds a real Fastify instance with in-memory SQLite.
 *
 * This gives us REAL HTTP integration tests — actual request parsing,
 * Zod validation, JWT auth, DB queries. The only things mocked are
 * external APIs (Meta, Claude, Stripe).
 */
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../../db/schema.js';

// Override getDb to use our test DB
let testDb: Database.Database;

export function getTestDb(): Database.Database {
  return testDb;
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
  role: string;
  plan: string;
}

/**
 * Build a minimal Fastify app with auth for testing.
 * Returns the app + a pre-authenticated test user.
 */
export async function buildTestApp() {
  // Create in-memory DB with full schema
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  const app = Fastify({ logger: false });

  // Register JWT
  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-for-testing-only',
    sign: { expiresIn: '1h' },
  });

  // Add authenticate decorator
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  // Create test user
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync('TestPassword123!', 10);
  testDb.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, 'Test User', 'test@cosmisk.com', passwordHash, 'user', 'growth');

  const token = app.jwt.sign({ id: userId, email: 'test@cosmisk.com', name: 'Test User', role: 'user' });

  const testUser: TestUser = {
    id: userId,
    name: 'Test User',
    email: 'test@cosmisk.com',
    token,
    role: 'user',
    plan: 'growth',
  };

  return { app, db: testDb, testUser };
}

export async function closeTestApp(app: any, db: Database.Database) {
  await app.close();
  db.close();
}
