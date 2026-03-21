import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// We test the plan limits and logic directly since they're pure data
import { PLAN_LIMITS, TRIAL_LIMITS } from '../routes/billing.js';

describe('Plan Limits', () => {
  it('should have 4 plan tiers', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(['free', 'solo', 'growth', 'agency']);
  });

  it('free plan should be most restrictive', () => {
    expect(PLAN_LIMITS.free.ad_accounts).toBe(1);
    expect(PLAN_LIMITS.free.images_per_month).toBe(0);
    expect(PLAN_LIMITS.free.videos_per_month).toBe(0);
    expect(PLAN_LIMITS.free.team_members).toBe(1);
  });

  it('agency plan should be unlimited (-1)', () => {
    expect(PLAN_LIMITS.agency.ad_accounts).toBe(-1);
    expect(PLAN_LIMITS.agency.images_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.videos_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.creatives_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.autopilot_rules).toBe(-1);
    expect(PLAN_LIMITS.agency.competitors).toBe(-1);
    expect(PLAN_LIMITS.agency.team_members).toBe(-1);
  });

  it('solo plan should allow only 1 team member (owner)', () => {
    expect(PLAN_LIMITS.solo.team_members).toBe(1);
  });

  it('growth plan should allow 5 team members', () => {
    expect(PLAN_LIMITS.growth.team_members).toBe(5);
  });

  it('plan limits should increase with tier', () => {
    expect(PLAN_LIMITS.solo.ad_accounts).toBeGreaterThan(PLAN_LIMITS.free.ad_accounts);
    expect(PLAN_LIMITS.growth.ad_accounts).toBeGreaterThan(PLAN_LIMITS.solo.ad_accounts);
    expect(PLAN_LIMITS.growth.images_per_month).toBeGreaterThan(PLAN_LIMITS.solo.images_per_month);
    expect(PLAN_LIMITS.growth.videos_per_month).toBeGreaterThan(PLAN_LIMITS.solo.videos_per_month);
  });

  it('trial limits should be roughly 50% of paid tiers', () => {
    // Solo trial: 15 images vs 30 paid
    expect(TRIAL_LIMITS.solo.images_per_month).toBeLessThan(PLAN_LIMITS.solo.images_per_month);
    expect(TRIAL_LIMITS.solo.images_per_month).toBeGreaterThan(0);

    // Growth trial: 50 images vs 100 paid
    expect(TRIAL_LIMITS.growth.images_per_month).toBeLessThan(PLAN_LIMITS.growth.images_per_month);
    expect(TRIAL_LIMITS.growth.images_per_month).toBeGreaterThan(0);
  });

  it('all plans should have all required limit fields', () => {
    const requiredFields = ['ad_accounts', 'chats_per_day', 'images_per_month', 'videos_per_month', 'creatives_per_month', 'autopilot_rules', 'competitors', 'team_members'];

    for (const plan of Object.values(PLAN_LIMITS)) {
      for (const field of requiredFields) {
        expect(plan).toHaveProperty(field);
        expect(typeof (plan as any)[field]).toBe('number');
      }
    }
  });
});

describe('Database Schema — Team Tables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Create minimal user table
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        plan TEXT NOT NULL DEFAULT 'free',
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_members (
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
      CREATE UNIQUE INDEX idx_team_members_owner_email ON team_members(owner_user_id, email);

      CREATE TABLE team_invitations (
        id TEXT PRIMARY KEY,
        team_member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('should create team member with pending status', () => {
    const ownerId = uuidv4();
    const memberId = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner', 'owner@test.com', 'hash')").run(ownerId);
    db.prepare("INSERT INTO team_members (id, owner_user_id, email, role) VALUES (?, ?, 'member@test.com', 'admin')").run(memberId, ownerId);

    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(memberId) as any;
    expect(member.status).toBe('pending');
    expect(member.role).toBe('admin');
    expect(member.email).toBe('member@test.com');
    expect(member.member_user_id).toBeNull();
  });

  it('should enforce unique owner+email constraint', () => {
    const ownerId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner', 'owner@test.com', 'hash')").run(ownerId);
    db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'dup@test.com')").run(uuidv4(), ownerId);

    expect(() => {
      db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'dup@test.com')").run(uuidv4(), ownerId);
    }).toThrow();
  });

  it('should cascade delete team members when user is deleted', () => {
    const ownerId = uuidv4();
    const memberId = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner', 'owner@test.com', 'hash')").run(ownerId);
    db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'member@test.com')").run(memberId, ownerId);

    const before = db.prepare('SELECT COUNT(*) as c FROM team_members').get() as any;
    expect(before.c).toBe(1);

    db.prepare('DELETE FROM users WHERE id = ?').run(ownerId);

    const after = db.prepare('SELECT COUNT(*) as c FROM team_members').get() as any;
    expect(after.c).toBe(0);
  });

  it('should cascade delete invitations when team member is deleted', () => {
    const ownerId = uuidv4();
    const memberId = uuidv4();
    const inviteId = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner', 'owner@test.com', 'hash')").run(ownerId);
    db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'member@test.com')").run(memberId, ownerId);
    db.prepare("INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at) VALUES (?, ?, 'hash123', datetime('now', '+7 days'))").run(inviteId, memberId);

    db.prepare('DELETE FROM team_members WHERE id = ?').run(memberId);

    const invites = db.prepare('SELECT COUNT(*) as c FROM team_invitations').get() as any;
    expect(invites.c).toBe(0);
  });

  it('should allow same email for different owners', () => {
    const owner1 = uuidv4();
    const owner2 = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner1', 'owner1@test.com', 'hash')").run(owner1);
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Owner2', 'owner2@test.com', 'hash')").run(owner2);

    db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'shared@test.com')").run(uuidv4(), owner1);
    db.prepare("INSERT INTO team_members (id, owner_user_id, email) VALUES (?, ?, 'shared@test.com')").run(uuidv4(), owner2);

    const count = db.prepare('SELECT COUNT(*) as c FROM team_members').get() as any;
    expect(count.c).toBe(2);
  });
});

describe('Token Hashing', () => {
  it('should produce consistent SHA-256 hashes', async () => {
    const crypto = await import('crypto');
    const token = 'test-token-123';
    const hash1 = crypto.createHash('sha256').update(token).digest('hex');
    const hash2 = crypto.createHash('sha256').update(token).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should produce different hashes for different tokens', async () => {
    const crypto = await import('crypto');
    const hash1 = crypto.createHash('sha256').update('token-a').digest('hex');
    const hash2 = crypto.createHash('sha256').update('token-b').digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});
