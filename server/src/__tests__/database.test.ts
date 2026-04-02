import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../db/schema.js';
import { randomUUID } from 'crypto';

/* ------------------------------------------------------------------ */
/*  Helper: create an in-memory SQLite DB with all tables              */
/* ------------------------------------------------------------------ */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}

/** Insert a minimal user and return its id */
function insertUser(
  db: Database.Database,
  overrides: Record<string, unknown> = {},
): string {
  const id = (overrides.id as string) ?? randomUUID();
  const email = (overrides.email as string) ?? `${id}@test.com`;
  const name = (overrides.name as string) ?? 'Test User';
  const passwordHash = (overrides.password_hash as string) ?? 'hash123';
  const role = (overrides.role as string) ?? 'user';
  const plan = (overrides.plan as string) ?? 'free';

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, plan)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, email, passwordHash, role, plan);

  return id;
}

/* ================================================================== */
/*  TESTS                                                              */
/* ================================================================== */

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

/* ------------------------------------------------------------------ */
/*  1. Schema creation – all tables and indexes exist                  */
/* ------------------------------------------------------------------ */
describe('Schema creation', () => {
  const expectedTables = [
    'users',
    'meta_tokens',
    'google_tokens',
    'reports',
    'campaigns',
    'ugc_projects',
    'ugc_concepts',
    'ugc_scripts',
    'subscriptions',
    'user_usage',
    'autopilot_alerts',
    'automations',
    'creative_sprints',
    'creative_jobs',
    'creative_assets',
    'cost_ledger',
    'content_bank',
    'leads',
    'dna_cache',
    'agent_runs',
    'agent_decisions',
    'agent_core_memory',
    'agent_episodes',
    'agent_entities',
    'password_reset_tokens',
    'swipe_file',
    'team_members',
    'team_invitations',
    'tiktok_tokens',
  ];

  it('creates all expected tables', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const tableNames = rows.map((r) => r.name);

    for (const t of expectedTables) {
      expect(tableNames, `missing table: ${t}`).toContain(t);
    }
  });

  const expectedIndexes = [
    'idx_jobs_sprint',
    'idx_jobs_status',
    'idx_content_bank_user',
    'idx_content_bank_platform',
    'idx_leads_email',
    'idx_dna_cache_account',
    'idx_agent_runs_user',
    'idx_agent_decisions_run',
    'idx_agent_decisions_user',
    'idx_agent_episodes_user',
    'idx_agent_entities_user',
    'idx_reset_tokens_hash',
    'idx_swipe_file_user',
    'idx_team_members_owner_email',
    'idx_team_members_member',
    'idx_team_invitations_token',
  ];

  it('creates all expected indexes', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const indexNames = rows.map((r) => r.name);

    for (const idx of expectedIndexes) {
      expect(indexNames, `missing index: ${idx}`).toContain(idx);
    }
  });

  it('is idempotent – calling createTables twice does not throw', () => {
    expect(() => createTables(db)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  2. User CRUD                                                       */
/* ------------------------------------------------------------------ */
describe('User CRUD', () => {
  it('creates a user and reads it back', () => {
    const id = insertUser(db, { name: 'Alice', email: 'alice@test.com' });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.name).toBe('Alice');
    expect(row.email).toBe('alice@test.com');
    expect(row.role).toBe('user');
    expect(row.plan).toBe('free');
    expect(row.onboarding_complete).toBe(0);
    expect(row.created_at).toBeDefined();
  });

  it('updates a user', () => {
    const id = insertUser(db);
    db.prepare('UPDATE users SET name = ?, plan = ? WHERE id = ?').run('Updated', 'growth', id);

    const row = db.prepare('SELECT name, plan FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.name).toBe('Updated');
    expect(row.plan).toBe('growth');
  });

  it('deletes a user', () => {
    const id = insertUser(db);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('supports brand-related columns from migrations', () => {
    const id = insertUser(db);
    db.prepare('UPDATE users SET brand_name = ?, website_url = ?, active_brand = ? WHERE id = ?').run(
      'Acme Corp',
      'https://acme.com',
      'brand-1',
      id,
    );

    const row = db.prepare('SELECT brand_name, website_url, active_brand FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.brand_name).toBe('Acme Corp');
    expect(row.website_url).toBe('https://acme.com');
    expect(row.active_brand).toBe('brand-1');
  });

  it('supports settings columns from migrations', () => {
    const id = insertUser(db);
    const row = db.prepare('SELECT phone, timezone, language, currency, date_format FROM users WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.timezone).toBe('IST');
    expect(row.language).toBe('en');
    expect(row.currency).toBe('INR');
    expect(row.date_format).toBe('DD/MM/YYYY');
  });
});

/* ------------------------------------------------------------------ */
/*  3. Brand fields on swipe_file                                      */
/* ------------------------------------------------------------------ */
describe('Brand data (swipe_file)', () => {
  it('creates, reads, updates, and deletes a swipe_file entry with brand', () => {
    const userId = insertUser(db);
    const id = randomUUID();

    // Create
    db.prepare(
      `INSERT INTO swipe_file (id, user_id, brand, hook_dna, visual_dna, audio_dna) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'Nike', '["bold"]', '["dark"]', '["upbeat"]');

    // Read
    const row = db.prepare('SELECT * FROM swipe_file WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.brand).toBe('Nike');
    expect(row.hook_dna).toBe('["bold"]');

    // Update
    db.prepare('UPDATE swipe_file SET brand = ? WHERE id = ?').run('Adidas', id);
    const updated = db.prepare('SELECT brand FROM swipe_file WHERE id = ?').get(id) as Record<string, unknown>;
    expect(updated.brand).toBe('Adidas');

    // Delete
    db.prepare('DELETE FROM swipe_file WHERE id = ?').run(id);
    expect(db.prepare('SELECT * FROM swipe_file WHERE id = ?').get(id)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  4. Foreign key constraints                                         */
/* ------------------------------------------------------------------ */
describe('Foreign key constraints', () => {
  it('rejects inserting a report referencing a non-existent user', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO reports (id, user_id, title, type) VALUES (?, ?, ?, ?)`,
        )
        .run(randomUUID(), 'nonexistent-user', 'Bad Report', 'performance'),
    ).toThrow();
  });

  it('rejects inserting a campaign referencing a non-existent user', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO campaigns (id, user_id, name) VALUES (?, ?, ?)`,
        )
        .run(randomUUID(), 'nonexistent-user', 'Bad Campaign'),
    ).toThrow();
  });

  it('rejects inserting a meta_token referencing a non-existent user', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO meta_tokens (user_id, encrypted_access_token) VALUES (?, ?)`,
        )
        .run('nonexistent-user', 'tok'),
    ).toThrow();
  });

  it('rejects inserting an agent_decision referencing a non-existent run', () => {
    const userId = insertUser(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), 'bad-run', userId, 'budget', 'too high', 'reduce'),
    ).toThrow();
  });

  it('rejects inserting ugc_concepts referencing a non-existent project', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO ugc_concepts (id, project_id, title) VALUES (?, ?, ?)`,
        )
        .run(randomUUID(), 'bad-project', 'My Concept'),
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  5. Unique constraints                                              */
/* ------------------------------------------------------------------ */
describe('Unique constraints', () => {
  it('rejects duplicate user email', () => {
    insertUser(db, { email: 'dup@test.com' });
    expect(() => insertUser(db, { email: 'dup@test.com' })).toThrow(/UNIQUE/);
  });

  it('rejects duplicate user_usage (user_id, period) pair', () => {
    const userId = insertUser(db);
    db.prepare('INSERT INTO user_usage (user_id, period) VALUES (?, ?)').run(userId, '2026-04');

    expect(() =>
      db.prepare('INSERT INTO user_usage (user_id, period) VALUES (?, ?)').run(userId, '2026-04'),
    ).toThrow(/UNIQUE/);
  });

  it('rejects duplicate agent_core_memory (user_id, agent_type, key)', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO agent_core_memory (id, user_id, agent_type, key, value) VALUES (?, ?, ?, ?, ?)',
    ).run(randomUUID(), userId, 'optimizer', 'pref', 'val1');

    expect(() =>
      db
        .prepare(
          'INSERT INTO agent_core_memory (id, user_id, agent_type, key, value) VALUES (?, ?, ?, ?, ?)',
        )
        .run(randomUUID(), userId, 'optimizer', 'pref', 'val2'),
    ).toThrow(/UNIQUE/);
  });

  it('rejects duplicate team_members (owner_user_id, email)', () => {
    const ownerId = insertUser(db);
    db.prepare(
      'INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), ownerId, 'member@test.com', 'editor');

    expect(() =>
      db
        .prepare(
          'INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, ?, ?)',
        )
        .run(randomUUID(), ownerId, 'member@test.com', 'viewer'),
    ).toThrow(/UNIQUE/);
  });

  it('rejects duplicate agent_entities (user_id, entity_type, entity_name)', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO agent_entities (id, user_id, entity_type, entity_name) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), userId, 'campaign', 'Summer Sale');

    expect(() =>
      db
        .prepare(
          'INSERT INTO agent_entities (id, user_id, entity_type, entity_name) VALUES (?, ?, ?, ?)',
        )
        .run(randomUUID(), userId, 'campaign', 'Summer Sale'),
    ).toThrow(/UNIQUE/);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Cascade operations                                              */
/* ------------------------------------------------------------------ */
describe('Cascade deletes', () => {
  it('deleting a user cascades to meta_tokens', () => {
    const userId = insertUser(db);
    db.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token) VALUES (?, ?)').run(userId, 'tok');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId)).toBeUndefined();
  });

  it('deleting a user cascades to reports', () => {
    const userId = insertUser(db);
    db.prepare('INSERT INTO reports (id, user_id, title) VALUES (?, ?, ?)').run(randomUUID(), userId, 'Report 1');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM reports WHERE user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user cascades to campaigns', () => {
    const userId = insertUser(db);
    db.prepare('INSERT INTO campaigns (id, user_id, name) VALUES (?, ?, ?)').run(randomUUID(), userId, 'Camp 1');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM campaigns WHERE user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user cascades to automations', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO automations (id, user_id, name, trigger_type, action_type) VALUES (?, ?, ?, ?, ?)',
    ).run(randomUUID(), userId, 'Auto1', 'spend_limit', 'pause');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM automations WHERE user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user cascades to agent_runs and nested agent_decisions', () => {
    const userId = insertUser(db);
    const runId = randomUUID();
    db.prepare('INSERT INTO agent_runs (id, agent_type, user_id) VALUES (?, ?, ?)').run(runId, 'optimizer', userId);
    db.prepare(
      'INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(randomUUID(), runId, userId, 'budget', 'reason', 'action');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM agent_runs WHERE user_id = ?').all(userId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM agent_decisions WHERE run_id = ?').all(runId)).toHaveLength(0);
  });

  it('deleting a user cascades to content_bank', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO content_bank (id, user_id, platform, body) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), userId, 'instagram', 'Post body');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM content_bank WHERE user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user cascades to swipe_file', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO swipe_file (id, user_id, brand) VALUES (?, ?, ?)',
    ).run(randomUUID(), userId, 'TestBrand');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM swipe_file WHERE user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user cascades to team_members (owner)', () => {
    const userId = insertUser(db);
    db.prepare(
      'INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, ?)',
    ).run(randomUUID(), userId, 'member@test.com');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT * FROM team_members WHERE owner_user_id = ?').all(userId)).toHaveLength(0);
  });

  it('deleting a user sets member_user_id to NULL (ON DELETE SET NULL)', () => {
    const ownerId = insertUser(db);
    const memberId = insertUser(db, { email: 'member@x.com' });
    const tmId = randomUUID();
    db.prepare(
      'INSERT INTO team_members (id, owner_user_id, member_user_id, email) VALUES (?, ?, ?, ?)',
    ).run(tmId, ownerId, memberId, 'member@x.com');

    db.prepare('DELETE FROM users WHERE id = ?').run(memberId);
    const row = db.prepare('SELECT member_user_id FROM team_members WHERE id = ?').get(tmId) as Record<string, unknown>;
    expect(row.member_user_id).toBeNull();
  });

  it('deleting a ugc_project cascades to ugc_concepts and ugc_scripts', () => {
    const userId = insertUser(db);
    const projectId = randomUUID();
    const conceptId = randomUUID();
    db.prepare('INSERT INTO ugc_projects (id, user_id, name) VALUES (?, ?, ?)').run(projectId, userId, 'Proj');
    db.prepare('INSERT INTO ugc_concepts (id, project_id, title) VALUES (?, ?, ?)').run(conceptId, projectId, 'Concept');
    db.prepare(
      'INSERT INTO ugc_scripts (id, concept_id, project_id, title) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), conceptId, projectId, 'Script');

    db.prepare('DELETE FROM ugc_projects WHERE id = ?').run(projectId);
    expect(db.prepare('SELECT * FROM ugc_concepts WHERE project_id = ?').all(projectId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM ugc_scripts WHERE project_id = ?').all(projectId)).toHaveLength(0);
  });

  it('deleting a creative_sprint cascades to creative_jobs', () => {
    const userId = insertUser(db);
    const sprintId = randomUUID();
    db.prepare('INSERT INTO creative_sprints (id, user_id, name) VALUES (?, ?, ?)').run(sprintId, userId, 'Sprint');
    db.prepare(
      'INSERT INTO creative_jobs (id, sprint_id, user_id, format) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), sprintId, userId, 'video');

    db.prepare('DELETE FROM creative_sprints WHERE id = ?').run(sprintId);
    expect(db.prepare('SELECT * FROM creative_jobs WHERE sprint_id = ?').all(sprintId)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Data integrity – insert & retrieve for key tables               */
/* ------------------------------------------------------------------ */
describe('Data integrity', () => {
  it('campaigns: insert and retrieve with all fields', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO campaigns (id, user_id, account_id, name, objective, budget, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'act_123', 'Summer Sale', 'conversions', '5000', 'active');

    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.name).toBe('Summer Sale');
    expect(row.objective).toBe('conversions');
    expect(row.budget).toBe('5000');
    expect(row.status).toBe('active');
    expect(row.account_id).toBe('act_123');
    expect(row.created_at).toBeDefined();
    expect(row.updated_at).toBeDefined();
  });

  it('creative_assets: insert and retrieve', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO creative_assets (id, user_id, format, name, asset_url, dna_tags, predicted_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'image', 'Hero Banner', 'https://cdn.test/img.png', '["bold","bright"]', 0.85);

    const row = db.prepare('SELECT * FROM creative_assets WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.format).toBe('image');
    expect(row.name).toBe('Hero Banner');
    expect(row.asset_url).toBe('https://cdn.test/img.png');
    expect(row.predicted_score).toBeCloseTo(0.85);
    expect(row.status).toBe('draft');
  });

  it('automations: insert and retrieve', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO automations (id, user_id, name, trigger_type, trigger_value, action_type, action_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'Budget Guard', 'spend_limit', '1000', 'pause_campaign', 'camp_1');

    const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.name).toBe('Budget Guard');
    expect(row.trigger_type).toBe('spend_limit');
    expect(row.trigger_value).toBe('1000');
    expect(row.action_type).toBe('pause_campaign');
    expect(row.is_active).toBe(1);
  });

  it('agent_runs: insert and retrieve', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO agent_runs (id, agent_type, user_id, status, summary)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, 'optimizer', userId, 'completed', 'Optimized 3 campaigns');

    const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.agent_type).toBe('optimizer');
    expect(row.status).toBe('completed');
    expect(row.summary).toBe('Optimized 3 campaigns');
    expect(row.started_at).toBeDefined();
  });

  it('agent_decisions: insert and retrieve', () => {
    const userId = insertUser(db);
    const runId = randomUUID();
    db.prepare('INSERT INTO agent_runs (id, agent_type, user_id) VALUES (?, ?, ?)').run(runId, 'optimizer', userId);

    const id = randomUUID();
    db.prepare(
      `INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_name, reasoning, confidence, urgency, suggested_action, estimated_impact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, runId, userId, 'act_1', 'budget', 'Summer Campaign', 'Spend is too high', 'high', 'high', 'Reduce budget by 20%', '+15% ROAS');

    const row = db.prepare('SELECT * FROM agent_decisions WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.type).toBe('budget');
    expect(row.confidence).toBe('high');
    expect(row.urgency).toBe('high');
    expect(row.status).toBe('pending');
    expect(row.estimated_impact).toBe('+15% ROAS');
  });

  it('content_bank: insert and retrieve', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO content_bank (id, user_id, platform, content_type, title, body, hashtags, status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'instagram', 'reel', 'Summer Vibes', 'Check out our new collection!', '#summer #fashion', 'scheduled', 'ai');

    const row = db.prepare('SELECT * FROM content_bank WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.platform).toBe('instagram');
    expect(row.content_type).toBe('reel');
    expect(row.title).toBe('Summer Vibes');
    expect(row.hashtags).toBe('#summer #fashion');
    expect(row.status).toBe('scheduled');
    expect(row.source).toBe('ai');
  });

  it('swipe_file: insert and retrieve', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO swipe_file (id, user_id, brand, thumbnail, hook_dna, visual_dna, audio_dna, notes, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'Apple', 'https://thumb.test/1.jpg', '["minimal"]', '["clean"]', '["ambient"]', 'Great ad', 'https://example.com/ad1');

    const row = db.prepare('SELECT * FROM swipe_file WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.brand).toBe('Apple');
    expect(row.thumbnail).toBe('https://thumb.test/1.jpg');
    expect(row.notes).toBe('Great ad');
    expect(row.source_url).toBe('https://example.com/ad1');
  });

  it('team_members: insert and retrieve', () => {
    const ownerId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO team_members (id, owner_user_id, email, name, role, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, 'bob@test.com', 'Bob', 'editor', 'pending');

    const row = db.prepare('SELECT * FROM team_members WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.email).toBe('bob@test.com');
    expect(row.name).toBe('Bob');
    expect(row.role).toBe('editor');
    expect(row.status).toBe('pending');
    expect(row.invited_at).toBeDefined();
  });

  it('subscriptions: insert with gateway and razorpay fields', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status, gateway, razorpay_subscription_id, trial_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'growth', 'trialing', 'razorpay', 'sub_rp_123', '2026-05-01');

    const row = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.gateway).toBe('razorpay');
    expect(row.razorpay_subscription_id).toBe('sub_rp_123');
    expect(row.trial_ends_at).toBe('2026-05-01');
    expect(row.plan).toBe('growth');
  });

  it('user_usage: increments correctly', () => {
    const userId = insertUser(db);
    db.prepare('INSERT INTO user_usage (user_id, period, chat_count) VALUES (?, ?, ?)').run(userId, '2026-04', 5);
    db.prepare('UPDATE user_usage SET chat_count = chat_count + 1 WHERE user_id = ? AND period = ?').run(userId, '2026-04');

    const row = db.prepare('SELECT chat_count FROM user_usage WHERE user_id = ? AND period = ?').get(userId, '2026-04') as Record<string, unknown>;
    expect(row.chat_count).toBe(6);
  });

  it('leads: auto-increments id', () => {
    db.prepare('INSERT INTO leads (email, source) VALUES (?, ?)').run('a@test.com', 'hero');
    db.prepare('INSERT INTO leads (email, source) VALUES (?, ?)').run('b@test.com', 'footer');

    const rows = db.prepare('SELECT * FROM leads ORDER BY id').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
    expect(rows[1].source).toBe('footer');
  });

  it('dna_cache: stores and retrieves JSON DNA arrays', () => {
    db.prepare(
      `INSERT INTO dna_cache (ad_id, account_id, ad_name, hook, visual, audio, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('ad_1', 'act_1', 'Hero Ad', '["urgency","discount"]', '["product-focus"]', '["voiceover"]', 'Strong hook');

    const row = db.prepare('SELECT * FROM dna_cache WHERE ad_id = ?').get('ad_1') as Record<string, unknown>;
    expect(JSON.parse(row.hook as string)).toEqual(['urgency', 'discount']);
    expect(row.reasoning).toBe('Strong hook');
  });

  it('agent_episodes: insert and retrieve with relevance_score', () => {
    const userId = insertUser(db);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO agent_episodes (id, user_id, agent_type, event, context, outcome, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, 'optimizer', 'budget_change', '{"camp":"1"}', 'improved', 0.9);

    const row = db.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.event).toBe('budget_change');
    expect(row.relevance_score).toBeCloseTo(0.9);
    expect(row.reinforcement_count).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  8. Index performance – verify indexes via sqlite_master            */
/* ------------------------------------------------------------------ */
describe('Index verification via sqlite_master', () => {
  it('idx_jobs_sprint covers creative_jobs(sprint_id)', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_jobs_sprint'").get() as { sql: string };
    expect(info.sql).toContain('creative_jobs');
    expect(info.sql).toContain('sprint_id');
  });

  it('idx_content_bank_user covers content_bank(user_id, status)', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_content_bank_user'").get() as { sql: string };
    expect(info.sql).toContain('content_bank');
    expect(info.sql).toContain('user_id');
    expect(info.sql).toContain('status');
  });

  it('idx_agent_decisions_user covers agent_decisions(user_id, status)', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_agent_decisions_user'").get() as { sql: string };
    expect(info.sql).toContain('agent_decisions');
    expect(info.sql).toContain('user_id');
    expect(info.sql).toContain('status');
  });

  it('idx_team_members_owner_email is a UNIQUE index', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_team_members_owner_email'").get() as { sql: string };
    expect(info.sql).toContain('UNIQUE');
    expect(info.sql).toContain('owner_user_id');
    expect(info.sql).toContain('email');
  });

  it('idx_swipe_file_user covers swipe_file(user_id)', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_swipe_file_user'").get() as { sql: string };
    expect(info.sql).toContain('swipe_file');
    expect(info.sql).toContain('user_id');
  });

  it('idx_agent_runs_user covers agent_runs(user_id, agent_type)', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_agent_runs_user'").get() as { sql: string };
    expect(info.sql).toContain('agent_runs');
    expect(info.sql).toContain('user_id');
    expect(info.sql).toContain('agent_type');
  });
});
