/**
 * Tests for db/schema.ts — Database Schema Creation
 *
 * Tests table creation, index creation, column migrations, and idempotency.
 * Uses an actual in-memory SQLite database for realistic testing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../db/schema.js';

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // Helper to get all table names
  const getTableNames = (): string[] => {
    const rows = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    return rows.map(r => r.name);
  };

  // Helper to get all index names
  const getIndexNames = (): string[] => {
    const rows = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    return rows.map(r => r.name);
  };

  // Helper to get column names for a table
  const getColumnNames = (table: string): string[] => {
    const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    return rows.map(r => r.name);
  };

  // Helper to get column info
  const getColumnInfo = (table: string, column: string): { name: string; type: string; dflt_value: string | null } | undefined => {
    const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{
      name: string;
      type: string;
      dflt_value: string | null;
    }>;
    return rows.find(r => r.name === column);
  };

  // ============ TABLE CREATION TESTS ============

  describe('createTables', () => {
    it('creates all core tables', () => {
      createTables(db);

      const tables = getTableNames();

      // Core tables
      expect(tables).toContain('users');
      expect(tables).toContain('meta_tokens');
      expect(tables).toContain('google_tokens');
      expect(tables).toContain('reports');
      expect(tables).toContain('campaigns');
    });

    it('creates UGC-related tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('ugc_projects');
      expect(tables).toContain('ugc_concepts');
      expect(tables).toContain('ugc_scripts');
    });

    it('creates subscription and usage tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('subscriptions');
      expect(tables).toContain('user_usage');
    });

    it('creates autopilot and automation tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('autopilot_alerts');
      expect(tables).toContain('automations');
    });

    it('creates creative sprint tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('creative_sprints');
      expect(tables).toContain('creative_jobs');
      expect(tables).toContain('creative_assets');
      expect(tables).toContain('cost_ledger');
    });

    it('creates content and marketing tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('content_bank');
      expect(tables).toContain('leads');
      expect(tables).toContain('dna_cache');
      expect(tables).toContain('swipe_file');
    });

    it('creates agent memory tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('agent_runs');
      expect(tables).toContain('agent_decisions');
      expect(tables).toContain('agent_core_memory');
      expect(tables).toContain('agent_episodes');
      expect(tables).toContain('agent_entities');
    });

    it('creates auth and team tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('password_reset_tokens');
      expect(tables).toContain('team_members');
      expect(tables).toContain('team_invitations');
    });

    it('creates integration tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('tiktok_tokens');
      expect(tables).toContain('shopify_tokens');
    });

    it('creates studio and scoring tables', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('studio_generations');
      expect(tables).toContain('studio_outputs');
      expect(tables).toContain('score_predictions');
      expect(tables).toContain('url_analysis_cache');
    });

    it('creates activity log table', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('activity_log');
    });

    it('creates creative briefs table', () => {
      createTables(db);

      const tables = getTableNames();

      expect(tables).toContain('creative_briefs');
    });
  });

  // ============ INDEX CREATION TESTS ============

  describe('index creation', () => {
    it('creates creative_jobs indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_jobs_sprint');
      expect(indexes).toContain('idx_jobs_status');
    });

    it('creates content_bank indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_content_bank_user');
      expect(indexes).toContain('idx_content_bank_platform');
    });

    it('creates agent-related indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_agent_runs_user');
      expect(indexes).toContain('idx_agent_decisions_run');
      expect(indexes).toContain('idx_agent_decisions_user');
      expect(indexes).toContain('idx_agent_episodes_user');
      expect(indexes).toContain('idx_agent_entities_user');
    });

    it('creates team and auth indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_reset_tokens_hash');
      expect(indexes).toContain('idx_team_members_owner_email');
      expect(indexes).toContain('idx_team_members_member');
      expect(indexes).toContain('idx_team_invitations_token');
    });

    it('creates studio and scoring indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_studio_outputs_gen');
      expect(indexes).toContain('idx_score_predictions_user');
      expect(indexes).toContain('idx_score_predictions_unresolved');
    });

    it('creates activity log index', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_activity_log_user');
    });

    it('creates creative briefs indexes', () => {
      createTables(db);

      const indexes = getIndexNames();

      expect(indexes).toContain('idx_briefs_user');
      expect(indexes).toContain('idx_briefs_account');
    });
  });

  // ============ IDEMPOTENCY TESTS ============

  describe('idempotency', () => {
    it('can be called multiple times without error', () => {
      // First call
      expect(() => createTables(db)).not.toThrow();

      // Second call should not fail
      expect(() => createTables(db)).not.toThrow();

      // Third call for good measure
      expect(() => createTables(db)).not.toThrow();
    });

    it('produces same tables after multiple calls', () => {
      createTables(db);
      const tablesAfterFirst = getTableNames();

      createTables(db);
      const tablesAfterSecond = getTableNames();

      expect(tablesAfterSecond).toEqual(tablesAfterFirst);
    });

    it('produces same indexes after multiple calls', () => {
      createTables(db);
      const indexesAfterFirst = getIndexNames();

      createTables(db);
      const indexesAfterSecond = getIndexNames();

      expect(indexesAfterSecond).toEqual(indexesAfterFirst);
    });
  });

  // ============ COLUMN MIGRATION TESTS (ensureColumn) ============

  describe('ensureColumn migrations', () => {
    it('adds brand_name column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('brand_name');
    });

    it('adds website_url column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('website_url');
    });

    it('adds goals column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('goals');
    });

    it('adds competitors column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('competitors');
    });

    it('adds active_brand column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('active_brand');
    });

    it('adds phone column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('phone');
    });

    it('adds notification_preferences column to users table', () => {
      createTables(db);

      const columns = getColumnNames('users');
      expect(columns).toContain('notification_preferences');
    });

    it('adds timezone column to users table with IST default', () => {
      createTables(db);

      const col = getColumnInfo('users', 'timezone');
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("'IST'");
    });

    it('adds language column to users table with en default', () => {
      createTables(db);

      const col = getColumnInfo('users', 'language');
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("'en'");
    });

    it('adds currency column to users table with INR default', () => {
      createTables(db);

      const col = getColumnInfo('users', 'currency');
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("'INR'");
    });

    it('adds date_format column to users table', () => {
      createTables(db);

      const col = getColumnInfo('users', 'date_format');
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("'DD/MM/YYYY'");
    });

    it('adds creative_count column to user_usage table', () => {
      createTables(db);

      const columns = getColumnNames('user_usage');
      expect(columns).toContain('creative_count');
    });

    it('adds visual_analysis column to dna_cache table', () => {
      createTables(db);

      const columns = getColumnNames('dna_cache');
      expect(columns).toContain('visual_analysis');
    });

    it('adds Razorpay columns to subscriptions table', () => {
      createTables(db);

      const columns = getColumnNames('subscriptions');
      expect(columns).toContain('gateway');
      expect(columns).toContain('razorpay_subscription_id');
      expect(columns).toContain('razorpay_customer_id');
      expect(columns).toContain('trial_ends_at');
    });

    it('adds score_json column to studio_outputs table', () => {
      createTables(db);

      const columns = getColumnNames('studio_outputs');
      expect(columns).toContain('score_json');
    });
  });

  // ============ TABLE STRUCTURE TESTS ============

  describe('users table structure', () => {
    it('has all required columns', () => {
      createTables(db);

      const columns = getColumnNames('users');

      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('email');
      expect(columns).toContain('password_hash');
      expect(columns).toContain('role');
      expect(columns).toContain('plan');
      expect(columns).toContain('onboarding_complete');
      expect(columns).toContain('created_at');
    });

    it('can insert and query a user', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test User', 'test@example.com', 'hash123')
      `).run();

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as any;

      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('user'); // default
      expect(user.plan).toBe('free'); // default
      expect(user.onboarding_complete).toBe(0); // default
    });

    it('enforces unique email constraint', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'User 1', 'same@example.com', 'hash1')
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO users (id, name, email, password_hash)
          VALUES ('u2', 'User 2', 'same@example.com', 'hash2')
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('meta_tokens table structure', () => {
    it('has correct foreign key relationship', () => {
      createTables(db);

      // Insert user first
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test User', 'test@example.com', 'hash123')
      `).run();

      // Insert token for user
      db.prepare(`
        INSERT INTO meta_tokens (user_id, encrypted_access_token)
        VALUES ('u1', 'encrypted_token')
      `).run();

      const token = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get('u1') as any;
      expect(token.encrypted_access_token).toBe('encrypted_token');
    });
  });

  describe('agent_decisions table structure', () => {
    it('has all required columns for watchdog decisions', () => {
      createTables(db);

      const columns = getColumnNames('agent_decisions');

      expect(columns).toContain('id');
      expect(columns).toContain('run_id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('account_id');
      expect(columns).toContain('type');
      expect(columns).toContain('target_id');
      expect(columns).toContain('target_name');
      expect(columns).toContain('reasoning');
      expect(columns).toContain('confidence');
      expect(columns).toContain('urgency');
      expect(columns).toContain('suggested_action');
      expect(columns).toContain('estimated_impact');
      expect(columns).toContain('status');
      expect(columns).toContain('approved_at');
      expect(columns).toContain('executed_at');
      expect(columns).toContain('outcome_checked_at');
      expect(columns).toContain('outcome');
      expect(columns).toContain('created_at');
    });
  });

  describe('shopify_tokens table structure', () => {
    it('has all required columns for Shopify integration', () => {
      createTables(db);

      const columns = getColumnNames('shopify_tokens');

      expect(columns).toContain('user_id');
      expect(columns).toContain('encrypted_access_token');
      expect(columns).toContain('shop_domain');
      expect(columns).toContain('shop_name');
      expect(columns).toContain('created_at');
    });
  });

  describe('subscriptions table structure', () => {
    it('supports both Stripe and Razorpay', () => {
      createTables(db);

      const columns = getColumnNames('subscriptions');

      // Stripe columns
      expect(columns).toContain('stripe_customer_id');
      expect(columns).toContain('stripe_subscription_id');

      // Razorpay columns (from migration)
      expect(columns).toContain('gateway');
      expect(columns).toContain('razorpay_customer_id');
      expect(columns).toContain('razorpay_subscription_id');

      // Trial support
      expect(columns).toContain('trial_ends_at');
    });

    it('has stripe as default gateway', () => {
      createTables(db);

      const col = getColumnInfo('subscriptions', 'gateway');
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("'stripe'");
    });
  });

  describe('content_bank table structure', () => {
    it('has all required columns for social content', () => {
      createTables(db);

      const columns = getColumnNames('content_bank');

      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('platform');
      expect(columns).toContain('content_type');
      expect(columns).toContain('title');
      expect(columns).toContain('body');
      expect(columns).toContain('hashtags');
      expect(columns).toContain('status');
      expect(columns).toContain('scheduled_for');
      expect(columns).toContain('posted_at');
      expect(columns).toContain('source');
    });
  });

  describe('creative_briefs table structure', () => {
    it('has all required columns for AI briefs', () => {
      createTables(db);

      const columns = getColumnNames('creative_briefs');

      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('account_id');
      expect(columns).toContain('product_name');
      expect(columns).toContain('product_id');
      expect(columns).toContain('format');
      expect(columns).toContain('length');
      expect(columns).toContain('hook_suggestion');
      expect(columns).toContain('cta_suggestion');
      expect(columns).toContain('reasoning');
      expect(columns).toContain('status');
      expect(columns).toContain('created_at');
    });
  });

  // ============ DATA INTEGRITY TESTS ============

  describe('data integrity', () => {
    it('cascades user deletion to meta_tokens', () => {
      createTables(db);
      db.pragma('foreign_keys = ON');

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO meta_tokens (user_id, encrypted_access_token)
        VALUES ('u1', 'token')
      `).run();

      // Verify token exists
      let token = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get('u1');
      expect(token).toBeDefined();

      // Delete user
      db.prepare('DELETE FROM users WHERE id = ?').run('u1');

      // Token should be cascaded
      token = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get('u1');
      expect(token).toBeUndefined();
    });

    it('cascades user deletion to reports', () => {
      createTables(db);
      db.pragma('foreign_keys = ON');

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO reports (id, user_id, title)
        VALUES ('r1', 'u1', 'Test Report')
      `).run();

      // Delete user
      db.prepare('DELETE FROM users WHERE id = ?').run('u1');

      // Report should be cascaded
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get('r1');
      expect(report).toBeUndefined();
    });

    it('cascades agent_run deletion to agent_decisions', () => {
      createTables(db);
      db.pragma('foreign_keys = ON');

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO agent_runs (id, agent_type, user_id)
        VALUES ('run1', 'watchdog', 'u1')
      `).run();

      db.prepare(`
        INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action)
        VALUES ('d1', 'run1', 'u1', 'test', 'reasoning', 'pause')
      `).run();

      // Delete run
      db.prepare('DELETE FROM agent_runs WHERE id = ?').run('run1');

      // Decision should be cascaded
      const decision = db.prepare('SELECT * FROM agent_decisions WHERE id = ?').get('d1');
      expect(decision).toBeUndefined();
    });

    it('enforces unique constraint on user_usage (user_id, period)', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO user_usage (user_id, period, chat_count)
        VALUES ('u1', '2024-01', 10)
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO user_usage (user_id, period, chat_count)
          VALUES ('u1', '2024-01', 20)
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });

    it('enforces unique constraint on agent_core_memory (user_id, agent_type, key)', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO agent_core_memory (id, user_id, agent_type, key, value)
        VALUES ('m1', 'u1', 'watchdog', 'preference', 'conservative')
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO agent_core_memory (id, user_id, agent_type, key, value)
          VALUES ('m2', 'u1', 'watchdog', 'preference', 'aggressive')
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  // ============ DEFAULT VALUES TESTS ============

  describe('default values', () => {
    it('sets default role to user', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      const user = db.prepare('SELECT role FROM users WHERE id = ?').get('u1') as any;
      expect(user.role).toBe('user');
    });

    it('sets default plan to free', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      const user = db.prepare('SELECT plan FROM users WHERE id = ?').get('u1') as any;
      expect(user.plan).toBe('free');
    });

    it('sets default report status to pending', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO reports (id, user_id, title)
        VALUES ('r1', 'u1', 'Test Report')
      `).run();

      const report = db.prepare('SELECT status FROM reports WHERE id = ?').get('r1') as any;
      expect(report.status).toBe('pending');
    });

    it('sets default agent_decision status to pending', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO agent_runs (id, agent_type, user_id)
        VALUES ('run1', 'watchdog', 'u1')
      `).run();

      db.prepare(`
        INSERT INTO agent_decisions (id, run_id, user_id, type, reasoning, suggested_action)
        VALUES ('d1', 'run1', 'u1', 'test', 'reasoning', 'pause')
      `).run();

      const decision = db.prepare('SELECT status, confidence, urgency FROM agent_decisions WHERE id = ?').get('d1') as any;
      expect(decision.status).toBe('pending');
      expect(decision.confidence).toBe('moderate');
      expect(decision.urgency).toBe('medium');
    });

    it('sets default episode relevance_score to 1.0', () => {
      createTables(db);

      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES ('u1', 'Test', 'test@example.com', 'hash')
      `).run();

      db.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event)
        VALUES ('ep1', 'u1', 'watchdog', 'test event')
      `).run();

      const episode = db.prepare('SELECT relevance_score, reinforcement_count FROM agent_episodes WHERE id = ?').get('ep1') as any;
      expect(episode.relevance_score).toBe(1.0);
      expect(episode.reinforcement_count).toBe(0);
    });
  });
});
