import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/*  Safe migration: add a column only if it doesn't already exist      */
/* ------------------------------------------------------------------ */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      plan TEXT NOT NULL DEFAULT 'free',
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      meta_user_id TEXT,
      meta_user_name TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'performance',
      account_id TEXT,
      date_preset TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      data TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT,
      name TEXT NOT NULL,
      objective TEXT,
      budget TEXT,
      schedule_start TEXT,
      schedule_end TEXT,
      audience TEXT,
      placements TEXT,
      creative_ids TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ugc_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      brand_name TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      brief TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ugc_concepts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ugc_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      feedback TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ugc_scripts (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES ugc_concepts(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES ugc_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      chat_count INTEGER NOT NULL DEFAULT 0,
      image_count INTEGER NOT NULL DEFAULT 0,
      video_count INTEGER NOT NULL DEFAULT 0,
      creative_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, period)
    );

    CREATE TABLE IF NOT EXISTS autopilot_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_value TEXT,
      action_type TEXT NOT NULL,
      action_value TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_triggered TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS creative_sprints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'analyzing',
      plan TEXT,
      learn_snapshot TEXT,
      total_creatives INTEGER DEFAULT 0,
      completed_creatives INTEGER DEFAULT 0,
      failed_creatives INTEGER DEFAULT 0,
      estimated_cost_cents INTEGER DEFAULT 0,
      actual_cost_cents INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS creative_jobs (
      id TEXT PRIMARY KEY,
      sprint_id TEXT NOT NULL REFERENCES creative_sprints(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      script TEXT,
      api_provider TEXT,
      api_job_id TEXT,
      output_url TEXT,
      output_thumbnail TEXT,
      predicted_score REAL,
      dna_tags TEXT,
      cost_cents INTEGER DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_sprint ON creative_jobs(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON creative_jobs(status, priority DESC);

    CREATE TABLE IF NOT EXISTS creative_assets (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES creative_jobs(id),
      sprint_id TEXT,
      user_id TEXT NOT NULL,
      account_id TEXT,
      format TEXT NOT NULL,
      name TEXT NOT NULL,
      asset_url TEXT NOT NULL,
      thumbnail_url TEXT,
      meta_ad_id TEXT,
      meta_campaign_id TEXT,
      dna_tags TEXT,
      predicted_score REAL,
      actual_metrics TEXT,
      metrics_fetched_at TEXT,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cost_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      sprint_id TEXT,
      job_id TEXT,
      api_provider TEXT NOT NULL,
      operation TEXT NOT NULL,
      cost_cents INTEGER NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_bank (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'post',
      title TEXT,
      body TEXT NOT NULL,
      hashtags TEXT,
      media_notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_for TEXT,
      posted_at TEXT,
      source TEXT DEFAULT 'ai',
      generation_context TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_bank_user ON content_bank(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_content_bank_platform ON content_bank(user_id, platform);

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'hero',
      ip TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
  `);

  // --- Safe migrations ---
  ensureColumn(db, 'user_usage', 'creative_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'brand_name', 'TEXT');
  ensureColumn(db, 'users', 'website_url', 'TEXT');
  ensureColumn(db, 'users', 'goals', 'TEXT');          // JSON array
  ensureColumn(db, 'users', 'competitors', 'TEXT');     // JSON array
  ensureColumn(db, 'users', 'active_brand', 'TEXT');
}
