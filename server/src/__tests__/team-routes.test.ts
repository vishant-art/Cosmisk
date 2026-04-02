/**
 * Team Routes Tests
 *
 * Tests invite creation, invite acceptance, role management,
 * member listing, and revocation.
 * Uses in-memory SQLite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createTables } from '../db/schema.js';
import { vi } from 'vitest';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class { async get() { return { data: [] }; } },
  exchangeCodeForToken: async () => ({ accessToken: 'mock', expiresIn: 3600 }),
  getMetaUser: async () => ({ id: 'u1', name: 'Mock' }),
}));

vi.mock('../services/email.js', () => ({
  sendPasswordResetEmail: async () => {},
  sendTeamInviteEmail: async () => {},
}));

vi.mock('../services/notifications.js', () => ({
  notifyAlert: async () => {},
}));

vi.mock('../services/token-crypto.js', () => ({
  decryptToken: () => 'mock-decrypted-token',
  encryptToken: (t: string) => t,
}));

vi.mock('node-cron', () => ({
  default: { schedule: () => {} },
}));

const { teamRoutes } = await import('../routes/team.js');

let app: FastifyInstance;
let testUserId: string;
let authToken: string;

async function buildApp() {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);

  app = Fastify({ logger: false });

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret: 'test-secret-only',
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { reply.status(401).send({ message: 'Unauthorized' }); }
  });

  await app.register(teamRoutes, { prefix: '/team' });
  await app.ready();

  testUserId = uuidv4();
  const hash = bcrypt.hashSync('SecurePass123!', 10);
  testDb.prepare('INSERT INTO users (id, name, email, password_hash, role, plan) VALUES (?, ?, ?, ?, ?, ?)')
    .run(testUserId, 'Team Owner', 'owner@test.com', hash, 'user', 'growth');

  authToken = app.jwt.sign({ id: testUserId, email: 'owner@test.com', name: 'Team Owner', role: 'user' });
}

beforeAll(async () => {
  await buildApp();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

/* ------------------------------------------------------------------ */
/*  Members List                                                       */
/* ------------------------------------------------------------------ */

describe('GET /team/members', () => {
  it('returns owner as first member', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/team/members',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.members).toBeDefined();
    expect(body.members.length).toBeGreaterThanOrEqual(1);

    const owner = body.members[0];
    expect(owner.role).toBe('owner');
    expect(owner.email).toBe('owner@test.com');
    expect(owner.name).toBe('Team Owner');
  });

  it('rejects unauthenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/team/members',
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Invite                                                             */
/* ------------------------------------------------------------------ */

describe('POST /team/invite', () => {
  let invitedMemberId: string;

  it('sends invitation to new member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'member1@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.message).toContain('member1@test.com');
    invitedMemberId = body.id;

    // Verify in DB
    const member = testDb.prepare('SELECT * FROM team_members WHERE email = ?').get('member1@test.com') as any;
    expect(member).toBeDefined();
    expect(member.role).toBe('viewer');
    expect(member.status).toBe('pending');
    expect(member.owner_user_id).toBe(testUserId);

    // Verify invitation token was created
    const invite = testDb.prepare('SELECT * FROM team_invitations WHERE team_member_id = ?').get(member.id) as any;
    expect(invite).toBeDefined();
    expect(invite.used).toBe(0);
  });

  it('sends invitation with admin role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'admin@test.com', role: 'admin', name: 'Admin User' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const member = testDb.prepare('SELECT * FROM team_members WHERE email = ?').get('admin@test.com') as any;
    expect(member.role).toBe('admin');
    expect(member.name).toBe('Admin User');
  });

  it('rejects duplicate invitation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'member1@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already been invited');
  });

  it('rejects inviting self', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'owner@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('cannot invite yourself');
  });

  it('rejects invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'not-an-email', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'new@test.com', role: 'superadmin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('shows invited members in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/team/members',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    // Owner + 2 invited members
    expect(body.members.length).toBeGreaterThanOrEqual(3);
    const pending = body.members.filter((m: any) => m.status === 'pending');
    expect(pending.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Role Update                                                        */
/* ------------------------------------------------------------------ */

describe('PUT /team/members/:id/role', () => {
  it('updates member role', async () => {
    const member = testDb.prepare("SELECT id FROM team_members WHERE email = 'member1@test.com'").get() as any;

    const res = await app.inject({
      method: 'PUT',
      url: `/team/members/${member.id}/role`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { role: 'media_buyer' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify in DB
    const updated = testDb.prepare('SELECT role FROM team_members WHERE id = ?').get(member.id) as any;
    expect(updated.role).toBe('media_buyer');
  });

  it('returns 404 for non-existent member', async () => {
    const fakeId = uuidv4();
    const res = await app.inject({
      method: 'PUT',
      url: `/team/members/${fakeId}/role`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid role', async () => {
    const member = testDb.prepare("SELECT id FROM team_members WHERE email = 'member1@test.com'").get() as any;
    const res = await app.inject({
      method: 'PUT',
      url: `/team/members/${member.id}/role`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { role: 'superadmin' },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Accept Invitation                                                  */
/* ------------------------------------------------------------------ */

describe('POST /team/accept', () => {
  it('accepts invitation with valid token', async () => {
    // Create a new invite with known token
    const memberId = uuidv4();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    testDb.prepare("INSERT INTO team_members (id, owner_user_id, email, role, status) VALUES (?, ?, ?, 'viewer', 'pending')")
      .run(memberId, testUserId, 'accepter@test.com');
    testDb.prepare("INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))")
      .run(uuidv4(), memberId, tokenHash);

    // Create an accepting user
    const acceptUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(acceptUserId, 'Accepter', 'accepter@test.com', bcrypt.hashSync('pass', 10));
    const acceptToken = app.jwt.sign({ id: acceptUserId, email: 'accepter@test.com', name: 'Accepter', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/team/accept',
      headers: { authorization: `Bearer ${acceptToken}` },
      payload: { token: rawToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().message).toContain('joined');

    // Verify member is now active
    const member = testDb.prepare('SELECT * FROM team_members WHERE id = ?').get(memberId) as any;
    expect(member.status).toBe('active');
    expect(member.member_user_id).toBe(acceptUserId);
  });

  it('rejects invalid invitation token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/team/accept',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { token: 'invalid-token-value' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid or expired');
  });

  it('rejects expired invitation', async () => {
    const memberId = uuidv4();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    testDb.prepare("INSERT INTO team_members (id, owner_user_id, email, role, status) VALUES (?, ?, ?, 'viewer', 'pending')")
      .run(memberId, testUserId, 'expired-invite@test.com');
    testDb.prepare("INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '-1 day'))")
      .run(uuidv4(), memberId, tokenHash);

    const res = await app.inject({
      method: 'POST',
      url: '/team/accept',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { token: rawToken },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Revoke Member                                                      */
/* ------------------------------------------------------------------ */

describe('DELETE /team/members/:id', () => {
  it('revokes a member', async () => {
    const member = testDb.prepare("SELECT id FROM team_members WHERE email = 'member1@test.com'").get() as any;

    const res = await app.inject({
      method: 'DELETE',
      url: `/team/members/${member.id}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify in DB
    const revoked = testDb.prepare('SELECT status FROM team_members WHERE id = ?').get(member.id) as any;
    expect(revoked.status).toBe('revoked');
  });

  it('returns 404 for non-existent member', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/team/members/${uuidv4()}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('does not allow revoking other users members', async () => {
    // Create another owner with a member
    const otherOwnerId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(otherOwnerId, 'Other Owner', 'otherowner@test.com', bcrypt.hashSync('pass', 10));

    const otherMemberId = uuidv4();
    testDb.prepare("INSERT INTO team_members (id, owner_user_id, email, role, status) VALUES (?, ?, ?, 'viewer', 'pending')")
      .run(otherMemberId, otherOwnerId, 'othermember@test.com');

    // Try to delete as the first user
    const res = await app.inject({
      method: 'DELETE',
      url: `/team/members/${otherMemberId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  Plan Limit Enforcement                                             */
/* ------------------------------------------------------------------ */

describe('Team plan limits', () => {
  it('enforces team member limit for free plan user', async () => {
    // Create a free plan user
    const freeUserId = uuidv4();
    testDb.prepare('INSERT INTO users (id, name, email, password_hash, plan) VALUES (?, ?, ?, ?, ?)')
      .run(freeUserId, 'Free User', 'freeuser@test.com', bcrypt.hashSync('pass', 10), 'free');
    const freeToken = app.jwt.sign({ id: freeUserId, email: 'freeuser@test.com', name: 'Free User', role: 'user' });

    // Free plan allows 1 team member (just themselves) so inviting should fail
    const res = await app.inject({
      method: 'POST',
      url: '/team/invite',
      headers: { authorization: `Bearer ${freeToken}` },
      payload: { email: 'someone@test.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('plan allows');
  });
});
