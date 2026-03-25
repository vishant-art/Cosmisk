import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseCampaignBreakdown, parseAudienceBreakdown, parseInsightMetrics } from '../services/insights-parser.js';
import { computeTrend } from '../services/trend-analyzer.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, accountQuerySchema } from '../validation/schemas.js';
import { internalError } from '../utils/error-response.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function analyticsRoutes(app: FastifyInstance) {

  // GET /analytics/full
  app.get('/full', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id, date_preset } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, campaignBreakdown: [], audienceBreakdown: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      const [campaignData, audienceData, dailyCampaignData] = await Promise.all([
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
          level: 'campaign',
          date_preset,
          limit: '100',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
          breakdowns: 'age,gender',
          date_preset,
          limit: '100',
        }),
        // Daily campaign data for trend arrows
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'campaign_name,spend,purchase_roas',
          level: 'campaign',
          date_preset,
          time_increment: '1',
          limit: '500',
        }),
      ]);

      // Build daily ROAS map per campaign for trend detection
      const dailyRoasMap = new Map<string, number[]>();
      for (const row of (dailyCampaignData.data || [])) {
        const name = row.campaign_name;
        if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
        const m = parseInsightMetrics(row);
        dailyRoasMap.get(name)!.push(m.roas);
      }

      const campaignBreakdown = parseCampaignBreakdown(campaignData.data || []).map(c => {
        const dailyRoas = dailyRoasMap.get(c.label) || [];
        const trend = computeTrend(dailyRoas);
        return {
          ...c,
          trend: trend.direction === 'improving' ? 'up' : trend.direction === 'declining' ? 'down' : 'stable',
        };
      });
      const audienceBreakdown = parseAudienceBreakdown(audienceData.data || []);

      return { success: true, campaignBreakdown, audienceBreakdown };
    } catch (err: any) {
      return internalError(reply, err, 'analytics/full failed');
    }
  });
}
