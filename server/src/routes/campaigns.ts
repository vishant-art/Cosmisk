import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';

interface CampaignRow {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  objective: string | null;
  budget: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  audience: string | null;
  placements: string | null;
  creative_ids: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function campaignRoutes(app: FastifyInstance) {

  // GET /campaigns/list — List user's campaigns
  app.get('/list', { preHandler: [app.authenticate] }, async (request) => {
    const { account_id } = request.query as { account_id?: string };

    const db = getDb();
    let campaigns: CampaignRow[];

    if (account_id) {
      campaigns = db.prepare(
        'SELECT * FROM campaigns WHERE user_id = ? AND account_id = ? ORDER BY updated_at DESC'
      ).all(request.user.id, account_id) as CampaignRow[];
    } else {
      campaigns = db.prepare(
        'SELECT * FROM campaigns WHERE user_id = ? ORDER BY updated_at DESC'
      ).all(request.user.id) as CampaignRow[];
    }

    return {
      success: true,
      campaigns: campaigns.map(c => ({
        id: c.id,
        account_id: c.account_id,
        name: c.name,
        objective: c.objective,
        budget: c.budget,
        schedule_start: c.schedule_start,
        schedule_end: c.schedule_end,
        audience: c.audience ? JSON.parse(c.audience) : null,
        placements: c.placements,
        creative_ids: c.creative_ids ? JSON.parse(c.creative_ids) : [],
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    };
  });

  // GET /campaigns/detail — Get single campaign
  app.get('/detail', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { campaign_id } = request.query as { campaign_id: string };

    if (!campaign_id) {
      return reply.status(400).send({ success: false, error: 'campaign_id required' });
    }

    const db = getDb();
    const campaign = db.prepare(
      'SELECT * FROM campaigns WHERE id = ? AND user_id = ?'
    ).get(campaign_id, request.user.id) as CampaignRow | undefined;

    if (!campaign) {
      return reply.status(404).send({ success: false, error: 'Campaign not found' });
    }

    return {
      success: true,
      campaign: {
        id: campaign.id,
        account_id: campaign.account_id,
        name: campaign.name,
        objective: campaign.objective,
        budget: campaign.budget,
        schedule_start: campaign.schedule_start,
        schedule_end: campaign.schedule_end,
        audience: campaign.audience ? JSON.parse(campaign.audience) : null,
        placements: campaign.placements,
        creative_ids: campaign.creative_ids ? JSON.parse(campaign.creative_ids) : [],
        status: campaign.status,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at,
      },
    };
  });

  // POST /campaigns/create — Create new campaign
  app.post('/create', { preHandler: [app.authenticate] }, async (request) => {
    const body = request.body as {
      account_id?: string;
      name: string;
      objective?: string;
      budget?: string;
      schedule_start?: string;
      schedule_end?: string;
      audience?: any;
      placements?: string;
      creative_ids?: string[];
      status?: string;
    };

    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO campaigns (id, user_id, account_id, name, objective, budget, schedule_start, schedule_end, audience, placements, creative_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      request.user.id,
      body.account_id || null,
      body.name || 'Untitled Campaign',
      body.objective || null,
      body.budget || null,
      body.schedule_start || null,
      body.schedule_end || null,
      body.audience ? JSON.stringify(body.audience) : null,
      body.placements || null,
      body.creative_ids ? JSON.stringify(body.creative_ids) : null,
      body.status || 'draft',
    );

    return { success: true, campaign_id: id };
  });

  // POST /campaigns/update — Update existing campaign
  app.post('/update', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body as {
      campaign_id: string;
      name?: string;
      objective?: string;
      budget?: string;
      schedule_start?: string;
      schedule_end?: string;
      audience?: any;
      placements?: string;
      creative_ids?: string[];
      status?: string;
    };

    if (!body.campaign_id) {
      return reply.status(400).send({ success: false, error: 'campaign_id required' });
    }

    const db = getDb();

    // Verify ownership
    const existing = db.prepare(
      'SELECT id FROM campaigns WHERE id = ? AND user_id = ?'
    ).get(body.campaign_id, request.user.id);

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Campaign not found' });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.objective !== undefined) { updates.push('objective = ?'); values.push(body.objective); }
    if (body.budget !== undefined) { updates.push('budget = ?'); values.push(body.budget); }
    if (body.schedule_start !== undefined) { updates.push('schedule_start = ?'); values.push(body.schedule_start); }
    if (body.schedule_end !== undefined) { updates.push('schedule_end = ?'); values.push(body.schedule_end); }
    if (body.audience !== undefined) { updates.push('audience = ?'); values.push(JSON.stringify(body.audience)); }
    if (body.placements !== undefined) { updates.push('placements = ?'); values.push(body.placements); }
    if (body.creative_ids !== undefined) { updates.push('creative_ids = ?'); values.push(JSON.stringify(body.creative_ids)); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }

    if (updates.length === 0) {
      return { success: true, message: 'Nothing to update' };
    }

    updates.push("updated_at = datetime('now')");
    values.push(body.campaign_id, request.user.id);

    db.prepare(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...values);

    return { success: true };
  });

  // POST /campaigns/launch — Mark campaign as launched
  app.post('/launch', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { campaign_id } = request.body as { campaign_id: string };

    if (!campaign_id) {
      return reply.status(400).send({ success: false, error: 'campaign_id required' });
    }

    const db = getDb();

    const existing = db.prepare(
      'SELECT id, name FROM campaigns WHERE id = ? AND user_id = ?'
    ).get(campaign_id, request.user.id) as CampaignRow | undefined;

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Campaign not found' });
    }

    db.prepare(
      "UPDATE campaigns SET status = 'launched', updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(campaign_id, request.user.id);

    return { success: true, message: `Campaign "${existing.name}" marked as launched` };
  });
}
