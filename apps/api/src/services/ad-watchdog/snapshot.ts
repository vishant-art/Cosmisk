import { getDbAdapter } from '../../db/adapter.js';
import { MetaApiService } from '../meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown } from '../insights-parser.js';
import { assessConfidence, computeTrend } from '../trend-analyzer.js';
import type { AgentDecisionRow } from '../../types/index.js';
import type { AccountSnapshot } from './types.js';

/* ------------------------------------------------------------------ */
/*  Gather account snapshot                                            */
/* ------------------------------------------------------------------ */

export async function gatherAccountSnapshot(
  meta: MetaApiService,
  accountId: string,
): Promise<AccountSnapshot> {
  // Parallel fetch: 7d account, 30d account, 7d daily, 7d campaigns, 7d daily campaigns
  const [weekData, monthData, dailyData, campaignData, dailyCampaignData, accountInfo] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
      date_preset: 'last_7d',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
      date_preset: 'last_30d',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
      date_preset: 'last_7d',
      time_increment: '1',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,campaign_id,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
      level: 'campaign',
      date_preset: 'last_7d',
      limit: '50',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,purchase_roas,actions,ctr',
      level: 'campaign',
      date_preset: 'last_7d',
      time_increment: '1',
      limit: '200',
    }),
    meta.get<any>(`/${accountId}`, { fields: 'name' }),
  ]);

  const weekMetrics = parseInsightMetrics(weekData.data?.[0] || {});
  const monthMetrics = parseInsightMetrics(monthData.data?.[0] || {});
  const dailyRows = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  // Build daily trends per campaign
  const dailyRoasMap = new Map<string, number[]>();
  const dailyCpaMap = new Map<string, number[]>();
  const dailyCtrMap = new Map<string, number[]>();
  for (const row of (dailyCampaignData.data || [])) {
    const name = row.campaign_name;
    const m = parseInsightMetrics(row);
    if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
    if (!dailyCpaMap.has(name)) dailyCpaMap.set(name, []);
    if (!dailyCtrMap.has(name)) dailyCtrMap.set(name, []);
    dailyRoasMap.get(name)!.push(m.roas);
    if (m.cpa > 0) dailyCpaMap.get(name)!.push(m.cpa);
    dailyCtrMap.get(name)!.push(m.ctr);
  }

  return {
    accountId,
    accountName: accountInfo.name || accountId,
    week: {
      spend: weekMetrics.spend, roas: weekMetrics.roas, cpa: weekMetrics.cpa,
      ctr: weekMetrics.ctr, impressions: weekMetrics.impressions,
      conversions: weekMetrics.conversions, revenue: weekMetrics.revenue,
    },
    month: {
      spend: monthMetrics.spend, roas: monthMetrics.roas, cpa: monthMetrics.cpa,
      ctr: monthMetrics.ctr, impressions: monthMetrics.impressions,
      conversions: monthMetrics.conversions, revenue: monthMetrics.revenue,
    },
    campaigns: campaigns.map(c => {
      const conf = assessConfidence({
        spend: c.spend, totalAccountSpend: totalSpend,
        conversions: c.conversions, impressions: c.impressions,
      });
      return {
        name: c.label, spend: c.spend, roas: c.roas, cpa: c.cpa,
        ctr: c.ctr, conversions: c.conversions, impressions: c.impressions,
        roasTrend: computeTrend(dailyRoasMap.get(c.label) || []).label,
        cpaTrend: computeTrend(dailyCpaMap.get(c.label) || []).label,
        ctrTrend: computeTrend(dailyCtrMap.get(c.label) || []).label,
        confidence: conf.level,
      };
    }),
    dailyRoas: dailyRows.map((d: any) => d.roas),
    dailySpend: dailyRows.map((d: any) => d.spend),
  };
}

/* ------------------------------------------------------------------ */
/*  Compare to past decisions for learning context                     */
/* ------------------------------------------------------------------ */

export async function getPastDecisions(userId: string, accountId: string): Promise<AgentDecisionRow[]> {
  return await getDbAdapter().all<AgentDecisionRow>(`
    SELECT * FROM agent_decisions
    WHERE user_id = ? AND account_id = ?
    ORDER BY created_at DESC LIMIT 20
  `, [userId, accountId]);
}
