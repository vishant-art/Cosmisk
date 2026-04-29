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

    CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      customer_ids TEXT,
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

    CREATE TABLE IF NOT EXISTS dna_cache (
      ad_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      ad_name TEXT,
      hook TEXT NOT NULL DEFAULT '[]',
      visual TEXT NOT NULL DEFAULT '[]',
      audio TEXT NOT NULL DEFAULT '[]',
      reasoning TEXT,
      analyzed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dna_cache_account ON dna_cache(account_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      summary TEXT,
      raw_context TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, agent_type);

    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT,
      type TEXT NOT NULL,
      target_id TEXT,
      target_name TEXT,
      reasoning TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'moderate',
      urgency TEXT NOT NULL DEFAULT 'medium',
      suggested_action TEXT NOT NULL,
      estimated_impact TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TEXT,
      executed_at TEXT,
      outcome_checked_at TEXT,
      outcome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_decisions_run ON agent_decisions(run_id);
    CREATE INDEX IF NOT EXISTS idx_agent_decisions_user ON agent_decisions(user_id, status);

    CREATE TABLE IF NOT EXISTS agent_core_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, agent_type, key)
    );

    CREATE TABLE IF NOT EXISTS agent_episodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL,
      event TEXT NOT NULL,
      context TEXT,
      outcome TEXT,
      entities TEXT,
      relevance_score REAL NOT NULL DEFAULT 1.0,
      reinforcement_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_episodes_user ON agent_episodes(user_id, agent_type);

    CREATE TABLE IF NOT EXISTS agent_entities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      attributes TEXT,
      mention_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, entity_type, entity_name)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_entities_user ON agent_entities(user_id, entity_type);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS swipe_file (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand TEXT NOT NULL DEFAULT '',
      thumbnail TEXT,
      hook_dna TEXT NOT NULL DEFAULT '[]',
      visual_dna TEXT NOT NULL DEFAULT '[]',
      audio_dna TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      source_url TEXT,
      source_ad_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_swipe_file_user ON swipe_file(user_id);

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      invited_at TEXT NOT NULL DEFAULT (datetime('now')),
      accepted_at TEXT,
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_owner_email ON team_members(owner_user_id, email);
    CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);

    CREATE TABLE IF NOT EXISTS team_invitations (
      id TEXT PRIMARY KEY,
      team_member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token_hash);

    CREATE TABLE IF NOT EXISTS tiktok_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      advertiser_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shopify_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      shop_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS url_analysis_cache (
      url TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS studio_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      brief_json TEXT NOT NULL,
      formats TEXT NOT NULL,
      meta_account_id TEXT,
      status TEXT NOT NULL DEFAULT 'generating',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS studio_outputs (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output_json TEXT,
      cost_cents INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (generation_id) REFERENCES studio_generations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_studio_outputs_gen ON studio_outputs(generation_id);

    CREATE TABLE IF NOT EXISTS score_predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      studio_output_id TEXT,
      format TEXT NOT NULL,
      dna_tags TEXT,
      predicted_score REAL NOT NULL,
      predicted_roas_mid REAL,
      score_breakdown TEXT NOT NULL,
      confidence TEXT NOT NULL,
      actual_roas REAL,
      actual_ctr REAL,
      accuracy_error REAL,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_score_predictions_user ON score_predictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_score_predictions_unresolved ON score_predictions(resolved_at) WHERE resolved_at IS NULL;
  `);

  // --- Safe migrations ---
  ensureColumn(db, 'user_usage', 'creative_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'brand_name', 'TEXT');
  ensureColumn(db, 'users', 'website_url', 'TEXT');
  ensureColumn(db, 'users', 'goals', 'TEXT');          // JSON array
  ensureColumn(db, 'users', 'competitors', 'TEXT');     // JSON array
  ensureColumn(db, 'users', 'active_brand', 'TEXT');
  ensureColumn(db, 'dna_cache', 'visual_analysis', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'users', 'phone', 'TEXT');
  ensureColumn(db, 'users', 'notification_preferences', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'users', 'timezone', "TEXT DEFAULT 'IST'");
  ensureColumn(db, 'users', 'language', "TEXT DEFAULT 'en'");
  ensureColumn(db, 'users', 'currency', "TEXT DEFAULT 'INR'");
  ensureColumn(db, 'users', 'date_format', "TEXT DEFAULT 'DD/MM/YYYY'");

  // Razorpay + trial support
  ensureColumn(db, 'subscriptions', 'gateway', "TEXT DEFAULT 'stripe'");
  ensureColumn(db, 'subscriptions', 'razorpay_subscription_id', 'TEXT');
  ensureColumn(db, 'subscriptions', 'razorpay_customer_id', 'TEXT');
  ensureColumn(db, 'subscriptions', 'trial_ends_at', 'TEXT');

  // Creative scoring
  ensureColumn(db, 'studio_outputs', 'score_json', 'TEXT');

  // Activity log — audit trail for user actions
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at DESC);
  `);
}
