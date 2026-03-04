import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import type { MetaTokenRow } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function analyticsRoutes(app: FastifyInstance) {

  // GET /analytics/full
  app.get('/full', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, date_preset = 'last_7d' } = request.query as {
      account_id: string; credential_group?: string; date_preset?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, campaignBreakdown: [], audienceBreakdown: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      const [campaignData, audienceData] = await Promise.all([
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
      ]);

      const campaignBreakdown = parseCampaignBreakdown(campaignData.data || []);
      const audienceBreakdown = parseAudienceBreakdown(audienceData.data || []);

      return { success: true, campaignBreakdown, audienceBreakdown };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
