import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDbAdapter } from '../db/adapter.js';
import { config } from '../config.js';
import { sendTeamInviteEmail } from '../services/email.js';
import { getUserPlan, getUserEffectiveLimits } from './billing.js';
import type { TeamMemberRow } from '../types/index.js';
import { validate, teamInviteSchema, teamRoleSchema, teamAcceptSchema, idParamSchema } from '../validation/schemas.js';


export async function teamRoutes(app: FastifyInstance) {
  /* ------------------------------------------------------------------ */
  /*  GET /team/members — list team members + pending invites            */
  /* ------------------------------------------------------------------ */
  app.get('/members', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDbAdapter();
    const userId = request.user.id;

    const rows = await db.all<TeamMemberRow & { member_name?: string; member_email?: string }>(`
      SELECT tm.*, u.name as member_name, u.email as member_email
      FROM team_members tm
      LEFT JOIN users u ON u.id = tm.member_user_id
      WHERE tm.owner_user_id = ?
      ORDER BY tm.invited_at DESC
    `, [userId]);

    const members = rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.member_name || r.name || r.email.split('@')[0],
      role: r.role,
      status: r.status,
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
    }));

    // Get current user info for the "Owner" row
    const owner = await db.get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [userId]);

    return {
      success: true,
      members: [
        { id: userId, email: owner?.email || '', name: owner?.name || 'You', role: 'owner', status: 'active', invitedAt: null, acceptedAt: null },
        ...members,
      ],
    };
  });

  /* ------------------------------------------------------------------ */
  /*  POST /team/invite — send team invitation                          */
  /* ------------------------------------------------------------------ */
  app.post('/invite', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDbAdapter();
    const userId = request.user.id;
    const parsed = validate(teamInviteSchema, request.body, reply);
    if (!parsed) return;
    const { email, role: memberRole, name } = parsed;

    // Check plan limits
    const limits = getUserEffectiveLimits(userId);
    const currentCount = (await db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM team_members WHERE owner_user_id = ? AND status != 'revoked'",
      [userId],
    ))!.c;

    if (limits.team_members !== -1 && currentCount + 1 >= limits.team_members) {
      return reply.status(403).send({
        success: false,
        error: `Your plan allows ${limits.team_members} team members (including yourself). Upgrade to add more.`,
      });
    }

    // Check if already invited
    const existing = await db.get<{ id: string; status: string }>(
      "SELECT id, status FROM team_members WHERE owner_user_id = ? AND email = ?",
      [userId, email.toLowerCase()],
    );

    if (existing && existing.status !== 'revoked') {
      return reply.status(409).send({ success: false, error: 'This email has already been invited' });
    }

    // Check if inviting self
    const owner = await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId]);
    if (owner && owner.email.toLowerCase() === email.toLowerCase()) {
      return reply.status(400).send({ success: false, error: 'You cannot invite yourself' });
    }

    // Create or reactivate team member
    const memberId = existing?.id || uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.transaction(async (tx) => {
      if (existing) {
        // Reactivate revoked member
        await tx.run(`
          UPDATE team_members SET role = ?, status = 'pending', name = ?, invited_at = datetime('now'), revoked_at = NULL
          WHERE id = ?
        `, [memberRole, name || null, memberId]);
      } else {
        await tx.run(`
          INSERT INTO team_members (id, owner_user_id, email, name, role, status)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `, [memberId, userId, email.toLowerCase(), name || null, memberRole]);
      }

      // Create invitation token
      await tx.run(`
        INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at)
        VALUES (?, ?, ?, datetime('now', '+7 days'))
      `, [uuidv4(), memberId, tokenHash]);
    });

    // Send invite email
    const ownerName = owner?.email ? (await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]))?.name : 'Someone';
    await sendTeamInviteEmail(email.toLowerCase(), name || email.split('@')[0], ownerName || 'Your team lead', token);

    // Log activity
    try {
      await db.run('INSERT INTO activity_log (user_id, action, category, details) VALUES (?, ?, ?, ?)', [
        userId, 'Invited team member', 'team', email,
      ]);
    } catch { /* best-effort */ }

    return {
      success: true,
      id: memberId,
      message: `Invitation sent to ${email}`,
    };
  });

  /* ------------------------------------------------------------------ */
  /*  PUT /team/members/:id/role — change member role                   */
  /* ------------------------------------------------------------------ */
  app.put('/members/:id/role', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDbAdapter();
    const userId = request.user.id;
    const params = validate(idParamSchema, request.params, reply);
    if (!params) return;
    const body = validate(teamRoleSchema, request.body, reply);
    if (!body) return;

    const result = await db.run(
      "UPDATE team_members SET role = ? WHERE id = ? AND owner_user_id = ? AND status != 'revoked'",
      [body.role, params.id, userId],
    );

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Member not found' });
    }

    return { success: true };
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /team/members/:id — revoke member access                   */
  /* ------------------------------------------------------------------ */
  app.delete('/members/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDbAdapter();
    const userId = request.user.id;
    const params = validate(idParamSchema, request.params, reply);
    if (!params) return;
    const { id } = params;

    const result = await db.run(
      "UPDATE team_members SET status = 'revoked', revoked_at = datetime('now') WHERE id = ? AND owner_user_id = ?",
      [id, userId],
    );

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Member not found' });
    }

    return { success: true };
  });

  /* ------------------------------------------------------------------ */
  /*  POST /team/accept — accept an invitation (authenticated)          */
  /* ------------------------------------------------------------------ */
  app.post('/accept', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDbAdapter();
    const parsed = validate(teamAcceptSchema, request.body, reply);
    if (!parsed) return;
    const { token } = parsed;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await db.get<{ member_id: string; owner_user_id: string; email: string }>(`
      SELECT ti.*, tm.owner_user_id, tm.email, tm.id as member_id
      FROM team_invitations ti
      JOIN team_members tm ON tm.id = ti.team_member_id
      WHERE ti.token_hash = ? AND ti.used = 0 AND ti.expires_at > datetime('now')
    `, [tokenHash]);

    if (!invite) {
      return reply.status(400).send({ success: false, error: 'Invalid or expired invitation' });
    }

    await db.transaction(async (tx) => {
      await tx.run(`
        UPDATE team_members SET member_user_id = ?, status = 'active', accepted_at = datetime('now')
        WHERE id = ?
      `, [request.user.id, invite.member_id]);

      await tx.run("UPDATE team_invitations SET used = 1 WHERE token_hash = ?", [tokenHash]);
    });

    return { success: true, message: 'You have joined the team' };
  });

  /* ------------------------------------------------------------------ */
  /*  POST /team/resend/:id — resend invitation email                   */
  /* ------------------------------------------------------------------ */
  app.post('/resend/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDbAdapter();
    const userId = request.user.id;
    const params = validate(idParamSchema, request.params, reply);
    if (!params) return;

    const member = await db.get<TeamMemberRow>(
      "SELECT * FROM team_members WHERE id = ? AND owner_user_id = ? AND status = 'pending'",
      [params.id, userId],
    );

    if (!member) {
      return reply.status(404).send({ success: false, error: 'Pending invite not found' });
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.run(`
      INSERT INTO team_invitations (id, team_member_id, token_hash, expires_at)
      VALUES (?, ?, ?, datetime('now', '+7 days'))
    `, [uuidv4(), params.id, tokenHash]);

    const ownerName = (await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]))?.name || 'Your team lead';
    await sendTeamInviteEmail(member.email, member.name || member.email.split('@')[0], ownerName, token);

    return { success: true, message: `Invitation resent to ${member.email}` };
  });
}
