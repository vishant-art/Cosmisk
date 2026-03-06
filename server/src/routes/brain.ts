import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { round, fmt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence, computeTrend } from '../services/trend-analyzer.js';
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

      // Analyze patterns from campaign-level data
      const targetAccountId = account_id || accounts[0]?.id;
      if (targetAccountId) {
        // Detect currency
        try {
          const accInfo = await meta.get<any>(`/${targetAccountId}`, { fields: 'currency' });
          if (accInfo?.currency) setCurrency(accInfo.currency);
        } catch { /* keep default */ }

        try {
          // Fetch 30d aggregate + 7d daily for trend/momentum detection
          const [campaignData, recentDailyData] = await Promise.all([
            meta.get<any>(`/${targetAccountId}/insights`, {
              fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
              level: 'campaign',
              date_preset: 'last_30d',
              limit: '50',
            }),
            meta.get<any>(`/${targetAccountId}/insights`, {
              fields: 'campaign_name,spend,actions,action_values,purchase_roas',
              level: 'campaign',
              date_preset: 'last_7d',
              time_increment: '1',
              limit: '200',
            }),
          ]);

          const campaigns = (campaignData.data || []).map((c: any) => ({
            name: c.campaign_name,
            ...parseInsightMetrics(c),
          }));

          const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);
          const avgAccountRoas = totalSpend > 0 ? campaigns.reduce((s: number, c: any) => s + c.revenue, 0) / totalSpend : 0;
          const avgAccountCpa = campaigns.filter((c: any) => c.cpa > 0).length > 0
            ? campaigns.filter((c: any) => c.cpa > 0).reduce((s: number, c: any) => s + c.cpa, 0) / campaigns.filter((c: any) => c.cpa > 0).length
            : 0;

          // Build daily ROAS map for trend per campaign
          const dailyRoasMap = new Map<string, number[]>();
          for (const row of (recentDailyData.data || [])) {
            const name = row.campaign_name;
            if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
            const m = parseInsightMetrics(row);
            dailyRoasMap.get(name)!.push(m.roas);
          }

          // Assess confidence and trend for each campaign
          const assessed = campaigns.map((c: any) => {
            const conf = assessConfidence({ spend: c.spend, totalAccountSpend: totalSpend, conversions: c.conversions, impressions: c.impressions });
            const trend = computeTrend(dailyRoasMap.get(c.name) || []);
            return { ...c, confidence: conf, trend };
          });

          // Pattern 1: High ROAS Campaigns — with confidence + trend context
          const highRoas = assessed.filter((c: any) => c.roas > 2);
          if (highRoas.length > 0) {
            const avgRoas = highRoas.reduce((sum: number, c: any) => sum + c.roas, 0) / highRoas.length;
            const topNames = highRoas.sort((a: any, b: any) => b.roas - a.roas).slice(0, 3);
            const insightLines: string[] = [];

            for (const c of topNames) {
              if (c.confidence.shouldRecommendAction) {
                const trendNote = c.trend.direction !== 'stable' ? ` (${c.trend.label})` : '';
                if (c.trend.direction === 'declining') {
                  insightLines.push(`'${c.name}' at ${c.roas.toFixed(2)}x but ${c.trend.label} — hold off on scaling until trend stabilizes.`);
                } else {
                  insightLines.push(`Scale '${c.name}' by 15-20% — ${c.roas.toFixed(2)}x ROAS on ${fmt(c.spend)}${trendNote}.`);
                }
              } else {
                insightLines.push(`'${c.name}' shows ${c.roas.toFixed(2)}x but on limited data (${c.conversions} conversions, ${fmt(c.spend)}). Let it run before scaling.`);
              }
            }

            patterns.push({
              id: 'high-roas-campaigns',
              name: 'High ROAS Campaigns',
              description: `${highRoas.length} campaigns averaging ${avgRoas.toFixed(2)}x ROAS. Leaders: ${topNames.map((c: any) => `'${c.name}' (${c.roas.toFixed(2)}x)`).join(', ')}.`,
              brands,
              confidence: Math.min(0.95, 0.5 + highRoas.length * 0.05),
              sampleSize: highRoas.length,
              avgRoas: round(avgRoas, 2),
              type: 'performance',
              insights: insightLines,
            });
          }

          // Pattern 2: Winner-Loser Gap — with trend awareness
          const sorted = [...assessed].sort((a: any, b: any) => b.roas - a.roas);
          if (sorted.length >= 2) {
            const winner = sorted[0];
            const loser = sorted[sorted.length - 1];
            if (winner.roas > 0 && loser.spend > 0) {
              const gap = winner.roas - loser.roas;
              if (gap > 1) {
                const loserInsight = loser.trend.direction === 'improving'
                  ? `'${loser.name}' is ${loser.trend.label} — it may be recovering. Monitor before cutting budget.`
                  : loser.roas < 1 ? `'${loser.name}' is losing money${loser.trend.direction === 'declining' ? ' and getting worse' : ''}. Pause or restructure.`
                  : `'${loser.name}' is profitable but underperforming — test new creatives.`;

                const winnerInsight = !winner.confidence.shouldRecommendAction
                  ? `'${winner.name}' leads at ${winner.roas.toFixed(2)}x but has limited data (${winner.conversions} conversions). Validate before large budget shifts.`
                  : `Shift budget from '${loser.name}' (${loser.roas.toFixed(2)}x) to '${winner.name}' (${winner.roas.toFixed(2)}x) — estimated ${fmt(loser.spend * (winner.roas - loser.roas))} additional revenue.`;

                patterns.push({
                  id: 'winner-loser-gap',
                  name: 'Winner vs Loser Gap',
                  description: `'${winner.name}' at ${winner.roas.toFixed(2)}x vs '${loser.name}' at ${loser.roas.toFixed(2)}x — a ${gap.toFixed(1)}x gap. ${fmt(loser.spend)} going to your worst performer.`,
                  brands,
                  confidence: 0.9,
                  sampleSize: 2,
                  avgRoas: round((winner.roas + loser.roas) / 2, 2),
                  type: 'efficiency',
                  insights: [winnerInsight, loserInsight],
                });
              }
            }
          }

          // Pattern 3: Efficient Acquisition — with confidence context
          const lowCpa = assessed.filter((c: any) => c.cpa > 0 && c.cpa < avgAccountCpa * 0.7);
          if (lowCpa.length > 0) {
            const bestCpa = lowCpa.sort((a: any, b: any) => a.cpa - b.cpa)[0];
            const scaleAdvice = bestCpa.confidence.shouldRecommendAction
              ? `'${bestCpa.name}' acquires at ${fmt(bestCpa.cpa)} — ${((1 - bestCpa.cpa / avgAccountCpa) * 100).toFixed(0)}% below average. Scale this targeting.`
              : `'${bestCpa.name}' acquires at ${fmt(bestCpa.cpa)} but with only ${bestCpa.conversions} conversions. Needs more volume to confirm efficiency.`;
            patterns.push({
              id: 'efficient-acquisition',
              name: 'Efficient Acquisition',
              description: `${lowCpa.length} campaigns with CPA 30%+ below account average (${fmt(avgAccountCpa)}). Best: '${bestCpa.name}' at ${fmt(bestCpa.cpa)}.`,
              brands,
              confidence: Math.min(0.9, 0.4 + lowCpa.length * 0.05),
              sampleSize: lowCpa.length,
              avgRoas: 0,
              type: 'efficiency',
              insights: [
                scaleAdvice,
                `Account average CPA is ${fmt(avgAccountCpa)} — use this as your cost cap target for new campaigns.`,
              ],
            });
          }

          // Pattern 4: Budget Misallocation — with confidence check
          if (sorted.length >= 2 && totalSpend > 0) {
            const topByRoas = sorted[0];
            const topBySpend = [...assessed].sort((a: any, b: any) => b.spend - a.spend)[0];
            if (topByRoas.name !== topBySpend.name && topByRoas.roas > topBySpend.roas * 1.5) {
              const shiftAdvice = topByRoas.confidence.shouldRecommendAction
                ? `Increase '${topByRoas.name}' budget by ${fmt(topBySpend.spend * 0.2)} — redirect from '${topBySpend.name}'.`
                : `'${topByRoas.name}' has better ROAS but limited data (${topByRoas.conversions} conversions). Test with a small budget increase first before major reallocation.`;

              patterns.push({
                id: 'budget-misallocation',
                name: 'Budget Misallocation',
                description: `Your highest ROAS campaign '${topByRoas.name}' (${topByRoas.roas.toFixed(2)}x) only gets ${((topByRoas.spend / totalSpend) * 100).toFixed(0)}% of budget, while '${topBySpend.name}' (${topBySpend.roas.toFixed(2)}x) gets ${((topBySpend.spend / totalSpend) * 100).toFixed(0)}%.`,
                brands,
                confidence: 0.85,
                sampleSize: campaigns.length,
                avgRoas: round(avgAccountRoas, 2),
                type: 'spend',
                insights: [
                  shiftAdvice,
                  topByRoas.confidence.shouldRecommendAction
                    ? `If '${topByRoas.name}' maintains ${topByRoas.roas.toFixed(2)}x ROAS at higher spend, estimated ${fmt(topBySpend.spend * 0.2 * topByRoas.roas)} additional revenue.`
                    : `Monitor '${topByRoas.name}' closely — high ROAS on small spend doesn't always hold at scale.`,
                ],
              });
            }
          }

          // Pattern 5: Top Spenders — with trend + confidence
          const topSpenders = [...assessed].sort((a: any, b: any) => b.spend - a.spend).slice(0, 3);
          if (topSpenders.length > 0 && topSpenders[0].spend > 0) {
            const combinedSpend = topSpenders.reduce((sum: number, s: any) => sum + s.spend, 0);
            patterns.push({
              id: 'top-spenders',
              name: 'Top Spending Campaigns',
              description: `Top 3 by spend: ${topSpenders.map((s: any) => `'${s.name}' (${fmt(s.spend)}, ${s.roas.toFixed(2)}x)`).join(', ')}. Combined: ${fmt(combinedSpend)} (${((combinedSpend / totalSpend) * 100).toFixed(0)}% of total).`,
              brands,
              confidence: 0.99,
              sampleSize: topSpenders.length,
              avgRoas: round(topSpenders.reduce((sum: number, s: any) => sum + s.roas, 0) / topSpenders.length, 2),
              type: 'spend',
              insights: topSpenders.map((s: any) => {
                const trendNote = s.trend.direction !== 'stable' ? ` (${s.trend.label})` : '';
                if (s.roas >= 3 && s.confidence.shouldRecommendAction) return `'${s.name}' is efficient at ${s.roas.toFixed(2)}x${trendNote} — safe to scale.`;
                if (s.roas >= 3 && !s.confidence.shouldRecommendAction) return `'${s.name}' shows ${s.roas.toFixed(2)}x but on ${s.conversions} conversions — promising, needs more data.`;
                if (s.roas >= 1) return `'${s.name}' is marginal at ${s.roas.toFixed(2)}x${trendNote} — optimize creatives before scaling.`;
                return `'${s.name}' is unprofitable at ${s.roas.toFixed(2)}x${trendNote} — ${s.trend.direction === 'improving' ? 'improving but still losing money, monitor closely' : 'reduce spend or pause'}.`;
              }),
            });
          }

          // Pattern 6: Momentum Shifts — campaigns changing direction
          const momentum = assessed.filter((c: any) => c.trend.direction !== 'stable' && c.spend > 0);
          const improving = momentum.filter((c: any) => c.trend.direction === 'improving');
          const declining = momentum.filter((c: any) => c.trend.direction === 'declining');
          if (improving.length > 0 || declining.length > 0) {
            const parts: string[] = [];
            if (improving.length > 0) {
              parts.push(`Gaining momentum: ${improving.slice(0, 2).map((c: any) => `'${c.name}' (${c.trend.label})`).join(', ')}.`);
            }
            if (declining.length > 0) {
              parts.push(`Losing steam: ${declining.slice(0, 2).map((c: any) => `'${c.name}' (${c.trend.label})`).join(', ')}.`);
            }
            const insightLines: string[] = [];
            for (const c of improving.slice(0, 2)) {
              insightLines.push(`'${c.name}' is ${c.trend.label} — ${c.roas >= 1 ? 'consider increasing budget to ride the momentum' : 'watch if it crosses breakeven before scaling'}.`);
            }
            for (const c of declining.slice(0, 2)) {
              insightLines.push(`'${c.name}' is ${c.trend.label} — ${c.roas >= 2 ? 'still profitable, but refresh creatives to reverse the trend' : 'prepare to pause if decline continues'}.`);
            }

            patterns.push({
              id: 'momentum-shifts',
              name: 'Momentum Shifts',
              description: `${momentum.length} campaign${momentum.length !== 1 ? 's' : ''} with directional changes this week. ${parts.join(' ')}`,
              brands,
              confidence: 0.75,
              sampleSize: momentum.length,
              avgRoas: 0,
              type: 'performance',
              insights: insightLines,
            });
          }
        } catch {
          // Campaign data not available
        }
      }

      // Always provide something useful — even with minimal data
      if (patterns.length === 0) {
        const totalAccounts = accounts.length;
        const activeBrands = brands.length;
        const anyMetrics = Object.values(brandMetrics).find(m => m['spend'] > 0);
        if (anyMetrics) {
          patterns.push({
            id: 'account-overview',
            name: 'Account Overview',
            description: `${totalAccounts} ad account${totalAccounts !== 1 ? 's' : ''} across ${activeBrands} brand${activeBrands !== 1 ? 's' : ''}. Campaign-level data unavailable — patterns will appear as campaigns run.`,
            brands,
            confidence: 0.3,
            sampleSize: totalAccounts,
            avgRoas: 0,
            type: 'info',
            insights: ['Run campaigns for at least 7 days to unlock performance patterns and optimization insights.'],
          });
        } else {
          patterns.push({
            id: 'getting-started',
            name: 'Getting Started',
            description: `${totalAccounts} ad account${totalAccounts !== 1 ? 's' : ''} connected but no spend data detected. Launch your first campaign to start tracking patterns.`,
            brands,
            confidence: 0,
            sampleSize: 0,
            avgRoas: 0,
            type: 'info',
            insights: ['Create a Conversions campaign with CBO to establish baseline performance data.'],
          });
        }
      }

      return { success: true, patterns, brands, brandMetrics };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

