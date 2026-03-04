import Database from 'better-sqlite3';
import { config } from '../config.js';
import { createTables } from './schema.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
