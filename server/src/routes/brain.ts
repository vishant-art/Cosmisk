import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import type { MetaTokenRow, PatternItem } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function brainRoutes(app: FastifyInstance) {

  // GET /brain/patterns
  app.get('/patterns', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id } = request.query as { account_id?: string; credential_group?: string };

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, patterns: [], brands: [], brandMetrics: {}, meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Get all ad accounts for cross-brand analysis
      const accounts = await meta.getAllPages<any>('/me/adaccounts', {
        fields: 'name,account_id,business_name,account_status',
        limit: '500',
      });

      // Group accounts by business_name
      const brandAccountMap = new Map<string, any[]>();
      for (const acc of accounts) {
        const brand = acc.business_name || 'Unknown';
        if (!brandAccountMap.has(brand)) brandAccountMap.set(brand, []);
        brandAccountMap.get(brand)!.push(acc);
      }

      const brands = [...brandAccountMap.keys()].filter(b => b !== 'Unknown');
      const brandMetrics: Record<string, Record<string, number>> = {};
      const patterns: PatternItem[] = [];

      // Fetch insights for each brand (use first active account per brand, limit to top 20 brands)
      const brandInsightPromises = brands.slice(0, 20).map(async (brand) => {
        const brandAccounts = brandAccountMap.get(brand) || [];
        const activeAcc = brandAccounts.find((a: any) => a.account_status === 1) || brandAccounts[0];
        if (!activeAcc) return;

        try {
          const data = await meta.get<any>(`/${activeAcc.id}/insights`, {
            fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
            date_preset: 'last_30d',
            level: 'account',
          });

          if (data.data?.[0]) {
            const m = parseInsightMetrics(data.data[0]);
            brandMetrics[brand] = {
              roas: round(m.roas, 2),
              spend: round(m.spend, 2),
              cpa: round(m.cpa, 2),
              ctr: round(m.ctr, 2),
              impressions: m.impressions,
              clicks: m.clicks,
              conversions: m.conversions,
              revenue: round(m.revenue, 2),
              accounts: brandAccounts.length,
            };
          } else {
            brandMetrics[brand] = { roas: 0, spend: 0, cpa: 0, ctr: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, accounts: brandAccounts.length };
          }
        } catch {
          brandMetrics[brand] = { roas: 0, spend: 0, cpa: 0, ctr: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, accounts: brandAccounts.length };
        }
      });

      await Promise.all(brandInsightPromises);

      // Analyze patterns from brand metrics
      const targetAccountId = account_id || accounts[0]?.id;
      if (targetAccountId) {
        try {
          const campaignData = await meta.get<any>(`/${targetAccountId}/insights`, {
            fields: 'campaign_name,spend,impressions,clicks,actions,action_values,purchase_roas',
            level: 'campaign',
            date_preset: 'last_30d',
            limit: '50',
          });

          const campaigns = campaignData.data || [];
          const highRoas = campaigns.filter((c: any) => parseInsightMetrics(c).roas > 2);

          if (highRoas.length > 0) {
            const avgRoas = highRoas.reduce((sum: number, c: any) => sum + parseInsightMetrics(c).roas, 0) / highRoas.length;
            patterns.push({
              id: 'high-roas-campaigns',
              name: 'High ROAS Campaigns',
              description: `${highRoas.length} campaigns averaging ${avgRoas.toFixed(2)}x ROAS in the last 30 days.`,
              brands,
              confidence: Math.min(0.95, 0.5 + highRoas.length * 0.05),
              sampleSize: highRoas.length,
              avgRoas: round(avgRoas, 2),
              type: 'performance',
            });
          }

          const lowCpa = campaigns.filter((c: any) => {
            const m = parseInsightMetrics(c);
            return m.cpa > 0 && m.cpa < 30;
          });

          if (lowCpa.length > 0) {
            patterns.push({
              id: 'efficient-acquisition',
              name: 'Efficient Acquisition Campaigns',
              description: `${lowCpa.length} campaigns with CPA under $30.`,
              brands,
              confidence: Math.min(0.9, 0.4 + lowCpa.length * 0.05),
              sampleSize: lowCpa.length,
              avgRoas: 0,
              type: 'efficiency',
            });
          }

          // Top spender pattern
          const topSpenders = campaigns
            .map((c: any) => ({ name: c.campaign_name, ...parseInsightMetrics(c) }))
            .sort((a: any, b: any) => b.spend - a.spend)
            .slice(0, 3);

          if (topSpenders.length > 0 && topSpenders[0].spend > 0) {
            patterns.push({
              id: 'top-spenders',
              name: 'Top Spending Campaigns',
              description: `Your top 3 campaigns by spend: ${topSpenders.map((s: any) => s.name).join(', ')}. Combined spend: $${topSpenders.reduce((sum: number, s: any) => sum + s.spend, 0).toFixed(0)}.`,
              brands,
              confidence: 0.99,
              sampleSize: topSpenders.length,
              avgRoas: round(topSpenders.reduce((sum: number, s: any) => sum + s.roas, 0) / topSpenders.length, 2),
              type: 'spend',
            });
          }
        } catch {
          // Campaign data not available
        }
      }

      if (patterns.length === 0) {
        patterns.push({
          id: 'getting-started',
          name: 'Gathering Data',
          description: 'We need more campaign data to identify patterns. Keep running ads and check back soon.',
          brands,
          confidence: 0,
          sampleSize: 0,
          avgRoas: 0,
          type: 'info',
        });
      }

      return { success: true, patterns, brands, brandMetrics };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
