/**
 * Database schema and integrity tests.
 *
 * Uses in-memory SQLite to verify: table creation, indexes, CRUD,
 * unique constraints, foreign key cascades, and migrations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../db/schema.js';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables(db);
});

afterAll(() => {
  db.close();
});

/* ------------------------------------------------------------------ */
/*  Table existence                                                    */
/* ------------------------------------------------------------------ */

describe('Schema — tables', () => {
  const expectedTables = [
    'users', 'meta_tokens', 'google_tokens', 'reports', 'campaigns',
    'ugc_projects', 'ugc_concepts', 'ugc_scripts', 'subscriptions',
    'user_usage', 'autopilot_alerts', 'automations', 'creative_sprints',
    'creative_jobs', 'creative_assets', 'cost_ledger', 'content_bank',
    'leads', 'dna_cache', 'agent_runs', 'agent_decisions',
    'agent_core_memory', 'agent_episodes', 'agent_entities',
    'password_reset_tokens', 'swipe_file', 'team_members',
    'team_invitations', 'tiktok_tokens',
  ];

  const tables = () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    return rows.map(r => r.name);
  };

  for (const table of expectedTables) {
    it(`should have table: ${table}`, () => {
      expect(tables()).toContain(table);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Indexes                                                            */
/* ------------------------------------------------------------------ */

describe('Schema — indexes', () => {
  const expectedIndexes = [
    'idx_jobs_sprint', 'idx_jobs_status', 'idx_content_bank_user',
    'idx_content_bank_platform', 'idx_leads_email', 'idx_dna_cache_account',
    'idx_agent_runs_user', 'idx_agent_decisions_run', 'idx_agent_decisions_user',
    'idx_agent_episodes_user', 'idx_agent_entities_user',
    'idx_reset_tokens_hash', 'idx_swipe_file_user',
    'idx_team_members_owner_email', 'idx_team_members_member',
    'idx_team_invitations_token',
  ];

  const indexes = () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    return rows.map(r => r.name);
  };

  for (const idx of expectedIndexes) {
    it(`should have index: ${idx}`, () => {
      expect(indexes()).toContain(idx);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  User CRUD                                                          */
/* ------------------------------------------------------------------ */

describe('Users — CRUD', () => {
  const userId = uuidv4();

  it('should insert a user', () => {
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(userId, 'Test', 'crud@test.com', 'hash123');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    expect(user).toBeTruthy();
    expect(user.name).toBe('Test');
    expect(user.role).toBe('user');       // default
    expect(user.plan).toBe('free');       // default
    expect(user.onboarding_complete).toBe(0); // default
  });

  it('should update a user', () => {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('growth', userId);
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId) as any;
    expect(user.plan).toBe('growth');
  });

  it('should delete a user', () => {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    expect(user).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Unique constraints                                                 */
/* ------------------------------------------------------------------ */

describe('Unique constraints', () => {
  it('should reject duplicate user email', () => {
    const id1 = uuidv4();
    const id2 = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id1, 'A', 'dup@test.com', 'h');
    expect(() => {
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id2, 'B', 'dup@test.com', 'h');
    }).toThrow(/UNIQUE/);
    db.prepare('DELETE FROM users WHERE id = ?').run(id1);
  });

  it('should reject duplicate user_usage (user_id, period)', () => {
    const uid = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'U', 'usage@test.com', 'h');
    db.prepare('INSERT INTO user_usage (user_id, period) VALUES (?, ?)').run(uid, '2026-03');
    expect(() => {
      db.prepare('INSERT INTO user_usage (user_id, period) VALUES (?, ?)').run(uid, '2026-03');
    }).toThrow(/UNIQUE/);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  it('should reject duplicate agent core memory (user_id, agent_type, key)', () => {
    const uid = uuidv4();
    const memId1 = uuidv4();
    const memId2 = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'M', 'mem@test.com', 'h');
    db.prepare('INSERT INTO agent_core_memory (id, user_id, agent_type, key, value) VALUES (?, ?, ?, ?, ?)').run(memId1, uid, 'watchdog', 'goal', 'test');
    expect(() => {
      db.prepare('INSERT INTO agent_core_memory (id, user_id, agent_type, key, value) VALUES (?, ?, ?, ?, ?)').run(memId2, uid, 'watchdog', 'goal', 'test2');
    }).toThrow(/UNIQUE/);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  it('should reject duplicate team member (owner_user_id, email)', () => {
    const uid = uuidv4();
    const tmId1 = uuidv4();
    const tmId2 = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'T', 'team@test.com', 'h');
    db.prepare('INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, ?, ?)').run(tmId1, uid, 'member@test.com', 'viewer');
    expect(() => {
      db.prepare('INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, ?, ?)').run(tmId2, uid, 'member@test.com', 'editor');
    }).toThrow(/UNIQUE/);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });
});

/* ------------------------------------------------------------------ */
/*  Foreign key cascades                                               */
/* ------------------------------------------------------------------ */

describe('Foreign key cascades', () => {
  it('should cascade delete meta_tokens when user deleted', () => {
    const uid = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'FK', 'fk@test.com', 'h');
    db.prepare('INSERT INTO meta_tokens (user_id, encrypted_access_token) VALUES (?, ?)').run(uid, 'token');
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    const token = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(uid);
    expect(token).toBeUndefined();
  });

  it('should cascade delete subscriptions when user deleted', () => {
    const uid = uuidv4();
    const subId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'Sub', 'sub@test.com', 'h');
    db.prepare('INSERT INTO subscriptions (id, user_id, plan) VALUES (?, ?, ?)').run(subId, uid, 'growth');
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(uid);
    expect(sub).toBeUndefined();
  });

  it('should cascade delete automations when user deleted', () => {
    const uid = uuidv4();
    const autoId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'Auto', 'auto@test.com', 'h');
    db.prepare("INSERT INTO automations (id, user_id, name, trigger_type, action_type) VALUES (?, ?, 'test', 'cpa_above', 'pause')").run(autoId, uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    const auto = db.prepare('SELECT * FROM automations WHERE user_id = ?').get(uid);
    expect(auto).toBeUndefined();
  });

  it('should cascade delete agent_runs and agent_decisions when user deleted', () => {
    const uid = uuidv4();
    const runId = uuidv4();
    const decId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'Agent', 'agent@test.com', 'h');
    db.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status) VALUES (?, 'watchdog', ?, 'completed')").run(runId, uid);
    db.prepare("INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action) VALUES (?, ?, ?, 'budget', 'reason', 'action')").run(decId, runId, uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    const run = db.prepare('SELECT * FROM agent_runs WHERE user_id = ?').get(uid);
    const dec = db.prepare('SELECT * FROM agent_decisions WHERE user_id = ?').get(uid);
    expect(run).toBeUndefined();
    expect(dec).toBeUndefined();
  });

  it('should cascade delete UGC chain (project -> concepts -> scripts)', () => {
    const uid = uuidv4();
    const projId = uuidv4();
    const conceptId = uuidv4();
    const scriptId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'UGC', 'ugc@test.com', 'h');
    db.prepare("INSERT INTO ugc_projects (id, user_id, name) VALUES (?, ?, 'Test')").run(projId, uid);
    db.prepare("INSERT INTO ugc_concepts (id, project_id, title) VALUES (?, ?, 'Concept')").run(conceptId, projId);
    db.prepare("INSERT INTO ugc_scripts (id, concept_id, project_id, title) VALUES (?, ?, ?, 'Script')").run(scriptId, conceptId, projId);

    // Delete user — should cascade through projects -> concepts -> scripts
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);

    expect(db.prepare('SELECT * FROM ugc_projects WHERE id = ?').get(projId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM ugc_concepts WHERE id = ?').get(conceptId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM ugc_scripts WHERE id = ?').get(scriptId)).toBeUndefined();
  });

  it('should cascade delete team_invitations when team_member deleted', () => {
    const uid = uuidv4();
    const tmId = uuidv4();
    const invId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'TM', 'tm@test.com', 'h');
    db.prepare("INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, 'inv@test.com', 'viewer')").run(tmId, uid);
    db.prepare("INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at) VALUES (?, ?, 'hash', datetime('now', '+7 days'))").run(invId, tmId);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    const inv = db.prepare('SELECT * FROM team_invitations WHERE id = ?').get(invId);
    expect(inv).toBeUndefined();
  });

  it('should cascade delete swipe_file when user deleted', () => {
    const uid = uuidv4();
    const swId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'SW', 'sw@test.com', 'h');
    db.prepare("INSERT INTO swipe_file (id, user_id, brand) VALUES (?, ?, 'Test')").run(swId, uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    expect(db.prepare('SELECT * FROM swipe_file WHERE id = ?').get(swId)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Migrations (ensureColumn)                                          */
/* ------------------------------------------------------------------ */

describe('Migrations', () => {
  it('should add brand_name column to users', () => {
    const cols = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('brand_name');
  });

  it('should add website_url column to users', () => {
    const cols = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('website_url');
  });

  it('should add visual_analysis column to dna_cache', () => {
    const cols = db.prepare("PRAGMA table_info('dna_cache')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('visual_analysis');
  });

  it('should add razorpay columns to subscriptions', () => {
    const cols = db.prepare("PRAGMA table_info('subscriptions')").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toContain('gateway');
    expect(names).toContain('razorpay_subscription_id');
    expect(names).toContain('razorpay_customer_id');
    expect(names).toContain('trial_ends_at');
  });

  it('should add notification_preferences and timezone to users', () => {
    const cols = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toContain('notification_preferences');
    expect(names).toContain('timezone');
    expect(names).toContain('language');
    expect(names).toContain('currency');
  });
});

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

describe('Default values', () => {
  it('should default user role to "user" and plan to "free"', () => {
    const uid = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'Def', 'def@test.com', 'h');
    const user = db.prepare('SELECT role, plan, onboarding_complete FROM users WHERE id = ?').get(uid) as any;
    expect(user.role).toBe('user');
    expect(user.plan).toBe('free');
    expect(user.onboarding_complete).toBe(0);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  it('should default automation is_active to 1', () => {
    const uid = uuidv4();
    const autoId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'DA', 'da@test.com', 'h');
    db.prepare("INSERT INTO automations (id, user_id, name, trigger_type, action_type) VALUES (?, ?, 'a', 'cpa', 'pause')").run(autoId, uid);
    const auto = db.prepare('SELECT is_active FROM automations WHERE id = ?').get(autoId) as any;
    expect(auto.is_active).toBe(1);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  it('should default agent_decisions status to "pending"', () => {
    const uid = uuidv4();
    const runId = uuidv4();
    const decId = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'DD', 'dd@test.com', 'h');
    db.prepare("INSERT INTO agent_runs (id, agent_type, user_id, status) VALUES (?, 'watchdog', ?, 'running')").run(runId, uid);
    db.prepare("INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action) VALUES (?, ?, ?, 'budget', 'r', 'a')").run(decId, runId, uid);
    const dec = db.prepare('SELECT status, confidence, urgency FROM agent_decisions WHERE id = ?').get(decId) as any;
    expect(dec.status).toBe('pending');
    expect(dec.confidence).toBe('moderate');
    expect(dec.urgency).toBe('medium');
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });
});

/* ------------------------------------------------------------------ */
/*  Idempotency                                                        */
/* ------------------------------------------------------------------ */

describe('Idempotency', () => {
  it('should not fail when createTables is called twice', () => {
    expect(() => createTables(db)).not.toThrow();
  });
});
