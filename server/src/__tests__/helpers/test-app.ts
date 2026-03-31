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

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

/** Create auth headers for a given JWT token */
export function createAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/* ------------------------------------------------------------------ */
/*  Seed factories                                                     */
/* ------------------------------------------------------------------ */

export function seedTestUser(db: Database.Database, app: any, overrides: Partial<{ name: string; email: string; role: string; plan: string; onboarding_complete: number }> = {}): TestUser {
  const id = uuidv4();
  const name = overrides.name || 'Seed User';
  const email = overrides.email || `seed-${id.slice(0, 8)}@test.com`;
  const role = overrides.role || 'user';
  const plan = overrides.plan || 'growth';
  const onboardingComplete = overrides.onboarding_complete ?? 1;

  const passwordHash = bcrypt.hashSync('TestPassword123!', 10);
  db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, plan, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, email, passwordHash, role, plan, onboardingComplete);

  const token = app.jwt.sign({ id, email, name, role });
  return { id, name, email, token, role, plan };
}

export function seedTestBrand(db: Database.Database, userId: string, overrides: Partial<{ brand_name: string; website_url: string }> = {}) {
  const brandName = overrides.brand_name || 'Test Brand';
  const websiteUrl = overrides.website_url || 'https://testbrand.com';
  db.prepare('UPDATE users SET brand_name = ?, website_url = ?, active_brand = ? WHERE id = ?').run(brandName, websiteUrl, brandName, userId);
  return { brandName, websiteUrl };
}

export function seedTestAutomation(db: Database.Database, userId: string, overrides: Partial<{ name: string; trigger_type: string; action_type: string; is_active: number }> = {}) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO automations (id, user_id, name, trigger_type, trigger_value, action_type, action_value, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, userId,
    overrides.name || 'Test Automation',
    overrides.trigger_type || 'cpa_above',
    '50',
    overrides.action_type || 'pause',
    '{}',
    overrides.is_active ?? 1,
  );
  return { id };
}

export function seedTestSprint(db: Database.Database, userId: string, overrides: Partial<{ name: string; status: string; account_id: string }> = {}) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO creative_sprints (id, user_id, account_id, name, status) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, overrides.account_id || 'act_123', overrides.name || 'Test Sprint', overrides.status || 'completed');
  return { id };
}

export function seedTestMetaToken(db: Database.Database, userId: string) {
  db.prepare(
    'INSERT OR REPLACE INTO meta_tokens (user_id, encrypted_access_token, meta_user_id, meta_user_name) VALUES (?, ?, ?, ?)'
  ).run(userId, 'encrypted_mock_token', 'meta_u1', 'Meta User');
}

export function seedTestSubscription(db: Database.Database, userId: string, overrides: Partial<{ plan: string; status: string; gateway: string }> = {}) {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO subscriptions (id, user_id, plan, status, gateway, current_period_start, current_period_end) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+30 days'))"
  ).run(id, userId, overrides.plan || 'growth', overrides.status || 'active', overrides.gateway || 'stripe');
  return { id };
}

export function seedTestUsage(db: Database.Database, userId: string, period: string, overrides: Partial<{ chat_count: number; image_count: number; video_count: number; creative_count: number }> = {}) {
  db.prepare(
    'INSERT INTO user_usage (user_id, period, chat_count, image_count, video_count, creative_count) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, period, overrides.chat_count ?? 5, overrides.image_count ?? 10, overrides.video_count ?? 2, overrides.creative_count ?? 3);
}

export function seedTestSwipeEntry(db: Database.Database, userId: string, overrides: Partial<{ brand: string }> = {}) {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna, notes) VALUES (?, ?, ?, '[]', '[]', '[]', 'test note')"
  ).run(id, userId, overrides.brand || 'Test Brand');
  return { id };
}

export function seedTestAgentRun(db: Database.Database, userId: string, overrides: Partial<{ agent_type: string; status: string; summary: string }> = {}) {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO agent_runs (id, agent_type, user_id, status, started_at, completed_at, summary) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)"
  ).run(id, overrides.agent_type || 'watchdog', userId, overrides.status || 'completed', overrides.summary || 'Test run');
  return { id };
}

/* ------------------------------------------------------------------ */
/*  Admin user helper                                                  */
/* ------------------------------------------------------------------ */

export function seedAdminUser(db: Database.Database, app: any): TestUser {
  return seedTestUser(db, app, { name: 'Admin User', email: 'admin@cosmisk.com', role: 'admin' });
}
