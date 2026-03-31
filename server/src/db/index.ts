import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { createTables } from './schema.js';

let db: Database.Database;

/** Ensure the Meta App Review test account exists with Meta token (idempotent) */
function seedReviewerAccount(database: Database.Database): void {
  const existing = database.prepare("SELECT id FROM users WHERE email = 'reviewer@cosmisk.com'").get() as { id: string } | undefined;
  if (existing) {
    // Ensure reviewer has a Meta token (copy from any admin if missing)
    const hasToken = database.prepare('SELECT 1 FROM meta_tokens WHERE user_id = ?').get(existing.id);
    if (!hasToken) {
      const adminToken = database.prepare(`
        SELECT mt.* FROM meta_tokens mt
        JOIN users u ON u.id = mt.user_id
        WHERE u.role = 'admin' LIMIT 1
      `).get() as any;
      if (adminToken) {
        database.prepare(`
          INSERT INTO meta_tokens (user_id, meta_user_id, encrypted_access_token, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(existing.id, adminToken.meta_user_id, adminToken.encrypted_access_token, adminToken.expires_at);
      }
    }
    return;
  }

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync('MetaReview2026!', 10);

  database.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, plan, onboarding_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Meta Reviewer', 'reviewer@cosmisk.com', hash, 'user', 'agency', 1);

  // Copy Meta token from admin account so reviewer sees real ad data
  const adminToken = database.prepare(`
    SELECT mt.* FROM meta_tokens mt
    JOIN users u ON u.id = mt.user_id
    WHERE u.role = 'admin' LIMIT 1
  `).get() as any;
  if (adminToken) {
    database.prepare(`
      INSERT INTO meta_tokens (user_id, meta_user_id, encrypted_access_token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(id, adminToken.meta_user_id, adminToken.encrypted_access_token, adminToken.expires_at);
  }
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables(db);
    seedReviewerAccount(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
