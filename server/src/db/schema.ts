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
  `);

  // --- Safe migrations for users table ---
  ensureColumn(db, 'users', 'brand_name', 'TEXT');
  ensureColumn(db, 'users', 'website_url', 'TEXT');
  ensureColumn(db, 'users', 'goals', 'TEXT');          // JSON array
  ensureColumn(db, 'users', 'competitors', 'TEXT');     // JSON array
  ensureColumn(db, 'users', 'active_brand', 'TEXT');
}
