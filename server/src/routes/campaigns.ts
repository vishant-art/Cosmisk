import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { round, fmt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence, computeTrend, qualifyMetric } from '../services/trend-analyzer.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import type { MetaTokenRow } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

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

  // POST /campaigns/launch — Create real Meta campaign + ad set, then mark launched
  app.post('/launch', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { campaign_id } = request.body as { campaign_id: string };

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

    if (!campaign.account_id) {
      return reply.status(400).send({ success: false, error: 'No ad account linked to this campaign' });
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(400).send({ success: false, error: 'Meta account not connected' });
    }

    const audience = campaign.audience ? JSON.parse(campaign.audience) : {};
    const budgetCents = campaign.budget ? Math.round(parseFloat(campaign.budget) * 100) : 500000; // default ₹5000/day

    // Map objective to Meta API format
    const objectiveMap: Record<string, string> = {
      'Conversions': 'OUTCOME_SALES',
      'Traffic': 'OUTCOME_TRAFFIC',
      'Leads': 'OUTCOME_LEADS',
      'Awareness': 'OUTCOME_AWARENESS',
      'App Installs': 'OUTCOME_APP_PROMOTION',
    };
    const metaObjective = objectiveMap[campaign.objective || ''] || campaign.objective || 'OUTCOME_SALES';

    // Map gender
    const genderMap: Record<string, number[]> = { 'Male': [1], 'Female': [2], 'All': [] };
    const genders = genderMap[audience.gender || 'All'] || [];

    try {
      // Step 1: Create Campaign on Meta
      const campaignResp = await safeFetch(`${config.graphApiBase}/${campaign.account_id}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          name: campaign.name,
          objective: metaObjective,
          status: 'PAUSED',
          special_ad_categories: [],
        }),
        service: 'Meta Marketing API',
      });

      if (!campaignResp.ok) {
        const err = await safeJson(campaignResp);
        throw new Error(err?.error?.message || 'Failed to create Meta campaign');
      }

      const metaCampaign = await safeJson(campaignResp);
      const metaCampaignId = metaCampaign.id;

      // Step 2: Create Ad Set
      const adSetResp = await safeFetch(`${config.graphApiBase}/${campaign.account_id}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          campaign_id: metaCampaignId,
          name: `${campaign.name} — Ad Set`,
          optimization_goal: metaObjective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget: budgetCents,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: {
            age_min: audience.age_min || 18,
            age_max: audience.age_max || 65,
            genders,
            geo_locations: { countries: [audience.location === 'India' ? 'IN' : 'US'] },
          },
          status: 'PAUSED',
        }),
        service: 'Meta Marketing API',
      });

      if (!adSetResp.ok) {
        const err = await safeJson(adSetResp);
        throw new Error(err?.error?.message || 'Failed to create Ad Set');
      }

      const metaAdSet = await safeJson(adSetResp);

      // Update campaign in DB with Meta IDs and mark as launched
      db.prepare(
        "UPDATE campaigns SET status = 'launched', placements = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
      ).run(JSON.stringify({ meta_campaign_id: metaCampaignId, meta_adset_id: metaAdSet.id }), campaign_id, request.user.id);

      return {
        success: true,
        message: `Campaign "${campaign.name}" created on Meta (PAUSED). Review in Ads Manager and activate when ready.`,
        meta: {
          campaign_id: metaCampaignId,
          adset_id: metaAdSet.id,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /campaigns/suggest — AI suggestion based on real account data
  app.get('/suggest', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id } = request.query as { account_id?: string };

    if (!account_id) {
      return { success: true, suggestion: 'Select an ad account to get a data-driven campaign recommendation.' };
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return { success: true, suggestion: 'Connect your Meta account to get personalized campaign suggestions.' };
      }
      const meta = new MetaApiService(token);

      // Detect currency
      try {
        const accInfo = await meta.get<any>(`/${account_id}`, { fields: 'currency' });
        if (accInfo?.currency) setCurrency(accInfo.currency);
      } catch { /* keep default */ }

      // Fetch 30d aggregate + 7d daily for trend analysis (2 calls in parallel)
      const [campaignData, recentDailyData] = await Promise.all([
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'campaign_name,campaign_id,spend,impressions,clicks,actions,action_values,purchase_roas,objective',
          level: 'campaign',
          date_preset: 'last_30d',
          limit: '50',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'campaign_name,spend,actions,action_values,purchase_roas',
          level: 'campaign',
          date_preset: 'last_7d',
          time_increment: '1',
          limit: '200',
        }),
      ]);

      const campaigns = (campaignData.data || []).map((c: any) => {
        const m = parseInsightMetrics(c);
        return { name: c.campaign_name, objective: c.objective || 'CONVERSIONS', ...m };
      });

      if (campaigns.length === 0) {
        return { success: true, suggestion: 'No active campaign data found. Start with a Conversions campaign using CBO at your average daily budget to establish baseline performance.' };
      }

      const totalAccountSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);

      // Build daily ROAS map for trend detection
      const dailyRoasMap = new Map<string, number[]>();
      for (const row of (recentDailyData.data || [])) {
        const name = row.campaign_name;
        if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
        const m = parseInsightMetrics(row);
        dailyRoasMap.get(name)!.push(m.roas);
      }

      // Assess confidence and trend for each campaign
      const assessed = campaigns.map((c: any) => {
        const conf = assessConfidence({
          spend: c.spend,
          totalAccountSpend,
          conversions: c.conversions,
          impressions: c.impressions,
        });
        const dailyRoas = dailyRoasMap.get(c.name) || [];
        const trend = computeTrend(dailyRoas);
        return { ...c, confidence: conf, trend };
      });

      // Group by objective — only count campaigns with enough data for objective recommendation
      const byObjective = new Map<string, { spend: number; revenue: number; count: number }>();
      for (const c of assessed) {
        if (c.confidence.level === 'insufficient') continue; // skip noise
        const obj = c.objective;
        const current = byObjective.get(obj) || { spend: 0, revenue: 0, count: 0 };
        current.spend += c.spend;
        current.revenue += c.revenue;
        current.count++;
        byObjective.set(obj, current);
      }

      let bestObjective = 'OUTCOME_SALES';
      let bestRoas = 0;
      for (const [obj, data] of byObjective) {
        const roas = data.spend > 0 ? data.revenue / data.spend : 0;
        if (roas > bestRoas) { bestRoas = roas; bestObjective = obj; }
      }

      // Find top campaign — prefer campaigns the system can confidently recommend
      const credible = assessed.filter((c: any) => c.confidence.shouldRecommendAction);
      const bestPool = credible.length > 0 ? credible : assessed;
      const sorted = [...bestPool].sort((a: any, b: any) => b.roas - a.roas);
      const topCampaign = sorted[0];

      // Compute recommended budget from profitable campaigns with reasonable data
      const profitable = assessed.filter((c: any) => c.roas >= 1 && c.spend > 0 && c.confidence.level !== 'insufficient');
      const spends = profitable.map((c: any) => c.spend / 30).sort((a: number, b: number) => a - b);
      const medianDailySpend = spends.length > 0 ? spends[Math.floor(spends.length / 2)] : 1000;
      const recommendedBudget = round(medianDailySpend * 1.2, 0);

      const objNames: Record<string, string> = {
        OUTCOME_SALES: 'Conversions', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_AWARENESS: 'Awareness',
        OUTCOME_ENGAGEMENT: 'Engagement', OUTCOME_LEADS: 'Leads', CONVERSIONS: 'Conversions',
      };
      const objName = objNames[bestObjective] || bestObjective;

      // Build suggestion with contextual reasoning
      let suggestion = '';
      if (topCampaign) {
        const conf = topCampaign.confidence;
        const trendNote = topCampaign.trend.direction !== 'stable'
          ? ` Trend: ${topCampaign.trend.label} over the last 7 days.`
          : '';

        if (conf.shouldRecommendAction) {
          suggestion = `Your best performer '${topCampaign.name}' runs at ${topCampaign.roas.toFixed(2)}x ROAS on ${fmt(topCampaign.spend)} spend (${topCampaign.conversions} conversions).${trendNote} Launch a new ${objName} campaign with CBO at ${fmt(recommendedBudget)}/day — modeled on your profitable campaigns' median spend. Use similar targeting and creative DNA from '${topCampaign.name}'.`;
        } else {
          // Data exists but isn't conclusive — acknowledge it honestly
          const qualifier = qualifyMetric({
            metricName: 'ROAS', metricValue: `${topCampaign.roas.toFixed(2)}x`,
            spend: topCampaign.spend, totalAccountSpend, conversions: topCampaign.conversions, fmtFn: fmt,
          });
          suggestion = `'${topCampaign.name}' shows ${topCampaign.roas.toFixed(2)}x ROAS. ${qualifier}${trendNote} Start a ${objName} campaign with CBO at ${fmt(recommendedBudget)}/day to gather more data. Keep daily budgets moderate until you have 20+ conversions to validate performance.`;
        }
      } else {
        suggestion = `Start with a ${objName} campaign using CBO at ${fmt(recommendedBudget)}/day.`;
      }

      return {
        success: true,
        suggestion,
        recommended: {
          objective: bestObjective === 'OUTCOME_SALES' ? 'conversions' : bestObjective.toLowerCase().replace('outcome_', ''),
          budget: recommendedBudget,
          campaign_type: 'cbo',
          reference_campaign: topCampaign?.name || null,
        },
      };
    } catch (err: any) {
      return { success: true, suggestion: 'Could not analyze account data. Try "Conversions" with CBO for best results.' };
    }
  });
}
